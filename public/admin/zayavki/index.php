<?php
/**
 * Заявки с сайта — раздел кабинета. Вход по паролю (хеш в config.php, создаётся при выкладке
 * из секрета ZAYAVKI_PASSWORD). Показывает заявки из формы, позволяет менять статус, писать
 * заметку, скачивать вложения и выгружать всё в CSV.
 */
declare(strict_types=1);
require_once __DIR__ . '/../../lib/leads.php';

header('X-Frame-Options: DENY');
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'");

$cfg = is_file(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : [];
$hash = (string) ($cfg['password_hash'] ?? '');

session_name('gidro_admin');
session_set_cookie_params(['lifetime' => 0, 'path' => '/admin/zayavki/', 'secure' => !empty($_SERVER['HTTPS']), 'httponly' => true, 'samesite' => 'Strict']);
session_start();
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
$csrf = $_SESSION['csrf'];
$h = fn($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
$STATUS = ['new' => 'Новая', 'work' => 'В работе', 'done' => 'Закрыта', 'spam' => 'Спам'];

function check_csrf(string $csrf): void {
  if (!hash_equals($csrf, (string) ($_POST['csrf'] ?? ''))) { http_response_code(400); exit('Обновите страницу и попробуйте снова.'); }
}

// Вход / выход
$error = '';
if (isset($_POST['logout'])) { check_csrf($csrf); $_SESSION = []; session_destroy(); header('Location: ./'); exit; }
if (isset($_POST['password'])) {
  check_csrf($csrf);
  // защита от подбора: пауза растёт с числом неудачных попыток
  $fails = (int) ($_SESSION['fails'] ?? 0);
  sleep(min(8, $fails));
  if ($hash !== '' && password_verify((string) $_POST['password'], $hash)) {
    session_regenerate_id(true);
    $_SESSION['auth'] = true; $_SESSION['fails'] = 0;
    header('Location: ./'); exit;
  }
  $_SESSION['fails'] = $fails + 1;
  $error = $hash === '' ? 'Пароль ещё не настроен (нет config.php).' : 'Неверный пароль.';
}
$authed = !empty($_SESSION['auth']);

// Действия для вошедших
if ($authed && isset($_POST['id'])) {
  check_csrf($csrf);
  $st = (string) ($_POST['status'] ?? '');
  leads_update((string) $_POST['id'], [
    'status' => isset($STATUS[$st]) ? $st : 'new',
    'note' => mb_substr(trim((string) ($_POST['note'] ?? '')), 0, 2000),
    'updated' => date('c'),
  ]);
  header('Location: ./?f=' . urlencode((string) ($_GET['f'] ?? '')) . '#' . urlencode((string) $_POST['id'])); exit;
}
if ($authed && isset($_GET['file'])) {
  $lead = leads_get((string) $_GET['file']);
  if (!$lead || empty($lead['file'])) { http_response_code(404); exit('Файл не найден'); }
  $path = leads_dir() . '/' . basename($lead['file']);
  header('Content-Type: ' . ($lead['file_mime'] ?? 'application/octet-stream'));
  header('Content-Disposition: attachment; filename="' . basename($lead['file']) . '"');
  header('X-Content-Type-Options: nosniff');
  readfile($path); exit;
}
if ($authed && isset($_GET['csv'])) {
  header('Content-Type: text/csv; charset=utf-8');
  header('Content-Disposition: attachment; filename="zayavki-' . date('Y-m-d') . '.csv"');
  $out = fopen('php://output', 'w');
  fwrite($out, "\xEF\xBB\xBF");
  fputcsv($out, ['Дата', 'Тип', 'Имя', 'Телефон', 'Сообщение', 'Страница', 'Статус', 'Заметка'], ';');
  foreach (leads_all() as $l) {
    fputcsv($out, [date('d.m.Y H:i', strtotime($l['created'] ?? 'now')), ($l['type'] ?? '') === 'tz' ? 'ТЗ' : 'Проект',
      $l['name'] ?? '', $l['phone'] ?? '', $l['message'] ?? '', $l['page'] ?? '', $STATUS[$l['status'] ?? 'new'] ?? '', $l['note'] ?? ''], ';');
  }
  exit;
}
?><!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Заявки с сайта — Гидрология</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
  :root { --ink:#16130F; --paper:#F3F1EC; --line:#DAD5CC; --muted:#6B655E; --deep:#05161D; --blue:#0083C3; }
  * { box-sizing: border-box; } body { margin:0; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; background:var(--paper); color:var(--ink); }
  header { background:var(--deep); color:#fff; padding:14px 24px; display:flex; gap:20px; align-items:center; flex-wrap:wrap; }
  header img { height:26px; } header a { color:#cfe3ec; text-decoration:none; font-size:14px; } header form { margin-left:auto; }
  main { max-width:1100px; margin:0 auto; padding:28px 20px 60px; }
  h1 { font-size:28px; margin:0 0 16px; letter-spacing:-.02em; }
  .bar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:20px; }
  .chip { padding:7px 14px; border:1px solid var(--line); border-radius:999px; text-decoration:none; color:var(--ink); background:#fff; font-size:14px; }
  .chip.on { background:var(--ink); color:#fff; border-color:var(--ink); }
  .bar .csv { margin-left:auto; }
  .lead { background:#fff; border:1px solid var(--line); border-radius:14px; padding:18px 20px; margin-bottom:12px; display:grid; grid-template-columns: 1fr 300px; gap:20px; }
  .lead.new { border-left:4px solid var(--blue); }
  .lead h3 { margin:0 0 4px; font-size:18px; } .meta { color:var(--muted); font-size:13px; }
  .msg { white-space:pre-wrap; margin:10px 0 0; } .tag { display:inline-block; font-size:12px; padding:2px 8px; border-radius:6px; background:#EDE9E1; margin-right:6px; }
  form.st { display:flex; flex-direction:column; gap:8px; } select, textarea, input[type=password] { font:inherit; padding:8px 10px; border:1px solid var(--line); border-radius:8px; width:100%; background:#fff; }
  textarea { min-height:64px; resize:vertical; } button { font:inherit; padding:9px 16px; border-radius:999px; border:0; background:var(--ink); color:#fff; cursor:pointer; }
  .login { max-width:360px; margin:12vh auto; background:#fff; border:1px solid var(--line); border-radius:16px; padding:28px; }
  .login h1 { font-size:22px; } .err { color:#B42318; margin:8px 0; } .empty { color:var(--muted); padding:40px 0; text-align:center; }
  a.tel { color:var(--blue); font-weight:600; text-decoration:none; }
  @media (max-width:760px) { .lead { grid-template-columns:1fr; } }
</style></head><body>
<?php if (!$authed): ?>
  <form class="login" method="post" autocomplete="off">
    <img src="/logo.svg" alt="Гидрология" height="28">
    <h1>Заявки с сайта</h1>
    <?php if ($error): ?><p class="err"><?= $h($error) ?></p><?php endif; ?>
    <input type="hidden" name="csrf" value="<?= $h($csrf) ?>">
    <input type="password" name="password" placeholder="Пароль" required autofocus>
    <p><button type="submit">Войти</button></p>
  </form>
<?php else:
  $all = leads_all();
  $f = (string) ($_GET['f'] ?? '');
  $list = $f !== '' && isset($STATUS[$f]) ? array_values(array_filter($all, fn($l) => ($l['status'] ?? 'new') === $f)) : $all;
  $count = fn($s) => count(array_filter($all, fn($l) => ($l['status'] ?? 'new') === $s));
?>
  <header>
    <img src="/logo-light.svg" alt="Гидрология">
    <a href="/admin/">← Кабинет редактора</a>
    <a href="https://metrika.yandex.ru/dashboard?id=114014482" target="_blank" rel="noopener">Метрика ↗</a>
    <form method="post"><input type="hidden" name="csrf" value="<?= $h($csrf) ?>"><button name="logout" value="1" style="background:#ffffff1a">Выйти</button></form>
  </header>
  <main>
    <h1>Заявки с сайта</h1>
    <?php if (leads_dir() === ''): ?><p class="err">Нет папки для хранения заявок — проверьте права на запись на хостинге.</p><?php endif; ?>
    <div class="bar">
      <a class="chip <?= $f === '' ? 'on' : '' ?>" href="./">Все · <?= count($all) ?></a>
      <?php foreach ($STATUS as $k => $v): ?><a class="chip <?= $f === $k ? 'on' : '' ?>" href="?f=<?= $k ?>"><?= $h($v) ?> · <?= $count($k) ?></a><?php endforeach; ?>
      <a class="chip csv" href="?csv=1">Скачать CSV</a>
    </div>
    <?php if (!$list): ?><p class="empty">Заявок пока нет.</p><?php endif; ?>
    <?php foreach ($list as $l): $st = $l['status'] ?? 'new'; ?>
      <section class="lead <?= $st === 'new' ? 'new' : '' ?>" id="<?= $h($l['id']) ?>">
        <div>
          <h3><?= $h($l['name'] ?? '') ?> · <a class="tel" href="tel:<?= $h(preg_replace('/[^\d+]/', '', (string) ($l['phone'] ?? ''))) ?>"><?= $h($l['phone'] ?? '') ?></a></h3>
          <div class="meta">
            <span class="tag"><?= ($l['type'] ?? '') === 'tz' ? 'Техническое задание' : 'Обсудить проект' ?></span>
            <?= $h(date('d.m.Y H:i', strtotime($l['created'] ?? 'now'))) ?>
            <?php if (!empty($l['page'])): ?> · со страницы <?= $h(parse_url((string) $l['page'], PHP_URL_PATH) ?: '/') ?><?php endif; ?>
          </div>
          <?php if (!empty($l['message'])): ?><p class="msg"><?= $h($l['message']) ?></p><?php endif; ?>
          <?php if (!empty($l['file'])): ?><p><a href="?file=<?= $h($l['id']) ?>">Скачать вложение (<?= $h(pathinfo((string) $l['file'], PATHINFO_EXTENSION)) ?>)</a></p><?php endif; ?>
        </div>
        <form class="st" method="post" action="?f=<?= $h($f) ?>">
          <input type="hidden" name="csrf" value="<?= $h($csrf) ?>"><input type="hidden" name="id" value="<?= $h($l['id']) ?>">
          <select name="status"><?php foreach ($STATUS as $k => $v): ?><option value="<?= $k ?>" <?= $st === $k ? 'selected' : '' ?>><?= $h($v) ?></option><?php endforeach; ?></select>
          <textarea name="note" placeholder="Заметка: кто взял, о чём договорились"><?= $h($l['note'] ?? '') ?></textarea>
          <button type="submit">Сохранить</button>
        </form>
      </section>
    <?php endforeach; ?>
  </main>
<?php endif; ?>
</body></html>
