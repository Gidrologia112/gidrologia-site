<?php
/**
 * Выкладка нового сайта на Timeweb «изнутри»: хостинг сам забирает свежую сборку из GitHub.
 *
 * Как работает: GitHub Actions собирает сайт и сам отправляет его по FTP в ~/deploy/incoming/
 * (build.zip + build.sha + списки фото + свежий pull.php). Этот скрипт по расписанию (Crontab в панели
 * Timeweb, раз в 3 минуты) находит новую сборку и раскладывает её в папку сайта. Хостингу не нужно
 * ходить в GitHub (из России GitHub бывает недоступен). Запасной путь — забрать ветку `deploy`
 * с GitHub самому: php pull.php --github.
 * Удаляет только те файлы, которые сам когда-то выложил и которых больше нет в сборке;
 * фото, видео, заявки и настройки не трогает.
 *
 * Лежит вне папки сайта: ~/deploy/pull.php, рядом config.php (секреты), state.json, log.txt.
 * Запуск вручную (для проверки): php ~/deploy/pull.php --force  (или --github — забрать с GitHub)
 */
const REPO   = 'Gidrologia112/gidrologia-site';
const BRANCH = 'deploy';
// Пути, которые выкладка никогда не трогает (живут только на хостинге)
const KEEP = ['img/netcat/', 'forum/files/', 'netcat_files/', 'lib/leads-data/', 'lib/staff-data/', 'admin/oauth/config.php', 'admin/zayavki/config.php', 'admin/api/config.php', '.well-known/'];

date_default_timezone_set('Europe/Moscow');
$dir    = __DIR__;
$target = isset($argv) && in_array('--target', $argv, true) ? $argv[array_search('--target', $argv, true) + 1] : dirname($dir) . '/gidrologia-new/public_html';
$force  = isset($argv) && in_array('--force', $argv, true);
$viaGh  = isset($argv) && in_array('--github', $argv, true);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }

function logmsg($s) {
  $f = __DIR__ . '/log.txt';
  if (is_file($f) && filesize($f) > 512 * 1024) @rename($f, $f . '.1');
  file_put_contents($f, date('Y-m-d H:i:s') . '  ' . $s . "\n", FILE_APPEND);
}
function http_get($url, $headers = [], $toFile = null) {
  $ch = curl_init($url);
  $opts = [CURLOPT_RETURNTRANSFER => $toFile === null, CURLOPT_FOLLOWLOCATION => true, CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_TIMEOUT => 300,
           CURLOPT_HTTPHEADER => array_merge(['User-Agent: gidrologia-deploy'], $headers), CURLOPT_HEADER => false];
  $fh = null;
  if ($toFile !== null) { $fh = fopen($toFile, 'wb'); $opts[CURLOPT_FILE] = $fh; }
  curl_setopt_array($ch, $opts);
  $body = curl_exec($ch);
  $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err = curl_error($ch);
  curl_close($ch);
  if ($fh) fclose($fh);
  return [$code, $body, $err];
}
function rrmdir($p) {
  if (!is_dir($p)) return;
  foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($p, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $f) {
    $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
  }
  @rmdir($p);
}
function kept($rel) { foreach (KEEP as $k) if (strpos($rel, $k) === 0) return true; return false; }

// Настройки входа в кабинет и пароль заявок — из ~/deploy/config.php (в GitHub их нет).
// Применяются при каждом запуске, если config.php изменился. Незаполненные заглушки «ВСТАВЬТЕ_…» считаются пустыми.
function cfgval($cfg, $k) { $v = trim((string) ($cfg[$k] ?? '')); return (strpos($v, 'ВСТАВЬТЕ') === 0) ? '' : $v; }
function sync_config($dir, $target, &$state, $forceIt = false) {
  $cfgFile = $dir . '/config.php';
  if (!is_file($cfgFile) || !is_dir($target)) return false;
  $sig = md5_file($cfgFile);
  if (!$forceIt && ($state['cfg'] ?? '') === $sig && is_file($target . '/admin/zayavki/config.php') && is_file($target . '/admin/oauth/config.php') && is_file($target . '/admin/api/config.php')) return false;
  $cfg = include $cfgFile;
  if (!is_array($cfg)) { logmsg('config.php: ошибка в файле, настройки не применены'); return false; }
  @mkdir($target . '/admin/oauth', 0755, true);
  @mkdir($target . '/admin/zayavki', 0755, true);
  file_put_contents($target . '/admin/oauth/config.php', '<?php return ' . var_export([
    'client_id' => cfgval($cfg, 'oauth_client_id'), 'client_secret' => cfgval($cfg, 'oauth_client_secret'),
  ], true) . ";\n");
  // Ключ GitHub для входа сотрудников по логину и паролю сайта (посредник /admin/api/)
  @mkdir($target . '/admin/api', 0755, true);
  file_put_contents($target . '/admin/api/config.php', '<?php return ' . var_export(['token' => cfgval($cfg, 'github_token')], true) . ";\n");
  @chmod($target . '/admin/api/config.php', 0600);
  $pw = cfgval($cfg, 'zayavki_password');
  $old = is_file($target . '/admin/zayavki/config.php') ? (include $target . '/admin/zayavki/config.php') : [];
  $hash = ($pw !== '' && is_array($old) && !empty($old['password_hash']) && password_verify($pw, $old['password_hash'])) ? $old['password_hash'] : ($pw !== '' ? password_hash($pw, PASSWORD_DEFAULT) : '');
  file_put_contents($target . '/admin/zayavki/config.php', '<?php return ' . var_export(['password_hash' => $hash], true) . ";\n");
  $state['cfg'] = $sig;
  logmsg('Настройки кабинета обновлены' . ($hash === '' ? ' (пароль заявок не задан — вход закрыт)' : '') . (cfgval($cfg, 'github_token') === '' ? ' (ключ github_token не задан — вход сотрудников по паролю не заработает)' : ''));
  return true;
}
function save_state($f, $state) { file_put_contents($f, json_encode($state, JSON_UNESCAPED_UNICODE)); }

// Фото, видео и вложения форума старого сайта: копируются (не переносятся) из ~/public_html в новую папку
// по спискам из репозитория. Повторно — только если списки изменились. Старые файлы не трогаются.
const MEDIA_EXT = ['jpg','jpeg','png','gif','webp','bmp','mp4','flv','avi','wmv','mov','webm','pdf','doc','docx','xls','xlsx','ppt','pptx','rtf','txt'];
function copy_media($dir, $target) {
  $old = dirname($dir) . '/public_html';
  if (!is_dir($old) || !is_dir($target)) return;
  // Списки приходят вместе со сборкой (~/deploy/import/); с GitHub — только в режиме --github
  $loc = $dir . '/import/';
  if (is_file($loc . 'files-to-copy.tsv') && is_file($loc . 'media-refs.txt')) {
    $tsv = file_get_contents($loc . 'files-to-copy.tsv'); $refs = file_get_contents($loc . 'media-refs.txt');
  } else {
    global $viaGh;
    if (!$viaGh) return;
    $base = 'https://raw.githubusercontent.com/' . REPO . '/main/import/';
    [$c1, $tsv] = http_get($base . 'files-to-copy.tsv');
    [$c2, $refs] = http_get($base . 'media-refs.txt');
    if ($c1 !== 200 || $c2 !== 200) return;
  }
  $sig = md5($tsv . $refs);
  $doneFile = $dir . '/media.done';
  if (is_file($doneFile) && trim(file_get_contents($doneFile)) === $sig) return;
  $pairs = [];
  foreach (explode("\n", $tsv) as $line) {           // netcat_files/<хеш> -> img/netcat/...
    if ($line === '' || $line[0] === '#') continue;
    $p = explode("\t", rtrim($line, "\r"));
    if (count($p) === 2) $pairs[] = ['netcat_files/' . $p[0], $p[1]];
  }
  foreach (explode("\n", $refs) as $line) {          // netcat_files/... и forum/files/... — по тем же путям
    $line = trim($line);
    if ($line !== '') $pairs[] = [$line, $line];
  }
  $copied = $have = $missing = $skipped = 0; $bytes = 0;
  foreach ($pairs as [$from, $to]) {
    if (preg_match('#(^|/)\.\.(/|$)#', $from . '/' . $to) || strpos($to, '/') === 0) { $skipped++; continue; }
    $ext = strtolower(pathinfo($to, PATHINFO_EXTENSION));
    $isForum = strpos($to, 'forum/files/') === 0;
    if (!$isForum && !in_array($ext, MEDIA_EXT, true)) { $skipped++; continue; }
    if (!(strpos($to, 'img/netcat/') === 0 || strpos($to, 'netcat_files/') === 0 || $isForum)) { $skipped++; continue; }
    $s = $old . '/' . $from;
    if (!is_file($s)) {                                // регистр букв в имени мог отличаться
      $d = dirname($s); $n = strtolower(basename($s)); $alt = null;
      if (is_dir($d)) foreach (scandir($d) as $f) if (strtolower($f) === $n) { $alt = $d . '/' . $f; break; }
      if ($alt === null) { $missing++; continue; }
      $s = $alt;
    }
    $t = $target . '/' . $to;
    if (is_file($t) && filesize($t) === filesize($s)) { $have++; continue; }
    if (!is_dir(dirname($t))) mkdir(dirname($t), 0755, true);
    if (copy($s, $t . '.tmp') && rename($t . '.tmp', $t)) { $copied++; $bytes += filesize($t); }
  }
  file_put_contents($doneFile, $sig . "\n");
  logmsg(sprintf('Медиа: скопировано %d (%.0f МБ), уже было %d, нет в старом сайте %d, пропущено %d', $copied, $bytes / 1048576, $have, $missing, $skipped));
}

// Не запускаться дважды одновременно
$lock = fopen($dir . '/pull.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) exit(0);

$stateFile = $dir . '/state.json';
$state = is_file($stateFile) ? json_decode(file_get_contents($stateFile), true) : [];
if (!is_array($state)) $state = [];

// 1. Есть ли новая сборка: сначала то, что прислал GitHub по FTP, иначе (только с --github) — с самого GitHub
$inbox = $dir . '/incoming';
$zip = $dir . '/build.zip';
$tmp = $dir . '/tmp';
// Запасной путь: вместо build.zip в incoming лежит build.url — md5 архива в первой строке, дальше ссылки
// на части архива (только jsDelivr / GitHub этого репозитория). Хостинг сам скачивает и склеивает части.
if (!is_file($inbox . '/build.zip') && is_file($inbox . '/build.url') && is_file($inbox . '/build.sha')) {
  $lines = array_values(array_filter(array_map('trim', explode("\n", (string) file_get_contents($inbox . '/build.url')))));
  $md5 = strtolower(array_shift($lines) ?? '');
  $ok = preg_match('/^[0-9a-f]{32}$/', $md5) && $lines;
  foreach ($lines as $u) if (!preg_match('#^https://(cdn\.jsdelivr\.net/gh/Gidrologia112/gidrologia-site@|raw\.githubusercontent\.com/Gidrologia112/gidrologia-site/)[\w./-]+$#', $u)) $ok = false;
  if (!$ok) { logmsg('incoming/build.url оформлен неверно — пропущен'); @unlink($inbox . '/build.url'); exit(1); }
  $part = $dir . '/build.part'; $out = fopen($zip . '.dl', 'wb');
  foreach ($lines as $i => $u) {
    [$code, , $err] = http_get($u, [], $part);
    if ($code !== 200) { fclose($out); @unlink($zip . '.dl'); @unlink($part); logmsg('Не удалось скачать часть ' . ($i + 1) . " сборки: HTTP $code $err"); exit(1); }
    fwrite($out, file_get_contents($part));
  }
  fclose($out); @unlink($part);
  if (md5_file($zip . '.dl') !== $md5) { @unlink($zip . '.dl'); logmsg('Скачанная сборка не совпала по md5 — выкладка отменена'); exit(1); }
  rename($zip . '.dl', $inbox . '/build.zip');
  @unlink($inbox . '/build.url');
  logmsg('Сборка скачана по ссылкам (' . count($lines) . ' частей)');
}
if (is_file($inbox . '/build.zip') && is_file($inbox . '/build.sha')) {
  $sha = trim((string) file_get_contents($inbox . '/build.sha'));
  if (!preg_match('/^[0-9a-f]{40}$/', $sha)) { logmsg('В incoming/build.sha неверная версия — сборка пропущена'); @unlink($inbox . '/build.sha'); exit(1); }
  @unlink($zip);
  if (!rename($inbox . '/build.zip', $zip)) { logmsg('Не удалось забрать incoming/build.zip'); exit(1); }
  @unlink($inbox . '/build.sha');
  // Списки фото старого сайта для копирования
  @mkdir($dir . '/import', 0755, true);
  foreach (['files-to-copy.tsv', 'media-refs.txt'] as $f) if (is_file($inbox . '/' . $f)) rename($inbox . '/' . $f, $dir . '/import/' . $f);
  if (!$force && ($state['sha'] ?? '') === $sha) { @unlink($zip); if (sync_config($dir, $target, $state)) save_state($stateFile, $state); copy_media($dir, $target); exit(0); }
} elseif ($viaGh) {
  [$code, $body, $err] = http_get('https://api.github.com/repos/' . REPO . '/commits/' . BRANCH, ['Accept: application/vnd.github.sha']);
  if ($code !== 200 || !preg_match('/^[0-9a-f]{40}$/', trim((string) $body))) { logmsg("Не удалось узнать версию: HTTP $code $err"); exit(1); }
  $sha = trim($body);
  if (!$force && ($state['sha'] ?? '') === $sha) { if (sync_config($dir, $target, $state)) save_state($stateFile, $state); copy_media($dir, $target); exit(0); }
  [$code, , $err] = http_get('https://codeload.github.com/' . REPO . '/zip/' . $sha, [], $zip);
  if ($code !== 200 || filesize($zip) < 1000) { logmsg("Не удалось скачать сборку $sha: HTTP $code $err"); exit(1); }
} else {
  // Новой сборки нет: только применить изменения config.php и докопировать фото
  if (sync_config($dir, $target, $state)) save_state($stateFile, $state);
  copy_media($dir, $target);
  exit(0);
}

// 2. Распаковываем
rrmdir($tmp);
$za = new ZipArchive();
if ($za->open($zip) !== true || !$za->extractTo($tmp)) { logmsg('Архив сборки повреждён'); @unlink($zip); exit(1); }
$za->close();
@unlink($zip);
$roots = glob($tmp . '/*', GLOB_ONLYDIR);
if (count($roots) !== 1 || !is_file($roots[0] . '/index.html')) { logmsg('В сборке нет index.html — выкладка отменена'); rrmdir($tmp); exit(1); }
$src = $roots[0];

// 3. Раскладываем файлы
if (!is_dir($target) && !mkdir($target, 0755, true)) { logmsg("Нет папки сайта $target"); exit(1); }
$new = [];
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($src, FilesystemIterator::SKIP_DOTS));
foreach ($it as $f) {
  if ($f->isDir()) continue;
  $rel = str_replace('\\', '/', substr($f->getPathname(), strlen($src) + 1));
  if (kept($rel)) continue;
  $dst = $target . '/' . $rel;
  if (!is_dir(dirname($dst))) mkdir(dirname($dst), 0755, true);
  if (!is_file($dst) || filesize($dst) !== $f->getSize() || md5_file($dst) !== md5_file($f->getPathname())) {
    copy($f->getPathname(), $dst . '.tmp') && rename($dst . '.tmp', $dst);
  }
  $new[$rel] = true;
}
// 4. Удаляем то, что выкладывали раньше и чего больше нет в сборке
$removed = 0;
foreach (($state['files'] ?? []) as $rel) {
  if (!isset($new[$rel]) && !kept($rel) && is_file($target . '/' . $rel)) { @unlink($target . '/' . $rel); $removed++; }
}
rrmdir($tmp);

$state = array_merge($state, ['sha' => $sha, 'time' => date('c'), 'files' => array_keys($new)]);
sync_config($dir, $target, $state, true);
save_state($stateFile, $state);
@file_put_contents($target . '/admin/deploy-status.json', json_encode(['version' => substr($sha, 0, 7), 'time' => date('c')]));
logmsg('Выложена сборка ' . substr($sha, 0, 7) . ': файлов ' . count($new) . ', удалено ' . $removed);
copy_media($dir, $target);
