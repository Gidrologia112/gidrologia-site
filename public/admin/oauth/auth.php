<?php
/**
 * Вход в кабинет редактора через GitHub (OAuth) для Decap CMS.
 * Ключи приложения GitHub лежат в config.php рядом (создаётся при сборке из секретов GitHub Actions,
 * в репозиторий не попадает). Права на редактирование даёт сам GitHub: войти может только тот,
 * у кого есть доступ на запись к репозиторию сайта.
 */
declare(strict_types=1);
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');

$cfg = is_file(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : [];
$clientId = $cfg['client_id'] ?? '';
$secret   = $cfg['client_secret'] ?? '';
$origin   = 'https://gidrologia.ru';
$self     = $origin . '/admin/oauth/auth.php';

function done(string $status, array $content, string $origin): void {
  $msg = 'authorization:github:' . $status . ':' . json_encode($content, JSON_UNESCAPED_SLASHES);
  $msgJs = json_encode($msg);
  $originJs = json_encode($origin);
  header('Content-Type: text/html; charset=utf-8');
  echo "<!doctype html><meta charset=utf-8><title>Вход…</title><p>Вход в кабинет…</p><script>
  (function () {
    if (!window.opener) { document.body.textContent = 'Откройте кабинет по адресу gidrologia.ru/admin'; return; }
    function receive(e) {
      if (e.origin !== $originJs) return;
      window.opener.postMessage($msgJs, e.origin);
      window.removeEventListener('message', receive, false);
      setTimeout(function () { window.close(); }, 300);
    }
    window.addEventListener('message', receive, false);
    window.opener.postMessage('authorizing:github', $originJs);
  })();
  </script>";
  exit;
}

if ($clientId === '' || $secret === '') {
  done('error', ['message' => 'Вход не настроен: нет ключей GitHub (config.php).'], $origin);
}

session_name('gidro_oauth');
session_set_cookie_params(['lifetime' => 600, 'path' => '/admin/oauth/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
session_start();

// Шаг 1: отправляем на GitHub
if (!isset($_GET['code'])) {
  $state = bin2hex(random_bytes(16));
  $_SESSION['state'] = $state;
  $q = http_build_query(['client_id' => $clientId, 'redirect_uri' => $self, 'scope' => 'repo,user', 'state' => $state]);
  header('Location: https://github.com/login/oauth/authorize?' . $q, true, 302);
  exit;
}

// Шаг 2: GitHub вернул код — меняем его на токен
$state = (string) ($_GET['state'] ?? '');
if (!isset($_SESSION['state']) || !hash_equals($_SESSION['state'], $state)) {
  done('error', ['message' => 'Сессия входа устарела, попробуйте ещё раз.'], $origin);
}
unset($_SESSION['state']);

$ch = curl_init('https://github.com/login/oauth/access_token');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 20,
  CURLOPT_HTTPHEADER => ['Accept: application/json'],
  CURLOPT_POSTFIELDS => http_build_query([
    'client_id' => $clientId, 'client_secret' => $secret,
    'code' => (string) $_GET['code'], 'redirect_uri' => $self,
  ]),
]);
$res = curl_exec($ch);
curl_close($ch);
$data = is_string($res) ? json_decode($res, true) : null;
if (!is_array($data) || empty($data['access_token'])) {
  done('error', ['message' => 'GitHub не выдал доступ: ' . ($data['error_description'] ?? 'нет ответа')], $origin);
}
done('success', ['token' => $data['access_token'], 'provider' => 'github'], $origin);
