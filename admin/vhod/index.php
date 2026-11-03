<?php
/**
 * Вход для сотрудников и список сотрудников (для владельца).
 * ?me=1 — JSON для кабинета: вошёл ли сотрудник.
 */
declare(strict_types=1);
require_once __DIR__ . '/../../lib/staff.php';

header('X-Frame-Options: DENY');
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('Referrer-Policy: same-origin');
header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'self'");

$h = fn($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
$me = staff_user();

if (isset($_GET['me'])) {
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($me ? ['ok' => true, 'login' => $me['login'], 'name' => $me['name'], 'owner' => !empty($me['owner']), 'leads' => !empty($me['leads']), 'csrf' => $_SESSION['csrf']] : ['ok' => false], JSON_UNESCAPED_UNICODE);
  exit;
}

// Куда вернуться после входа — только внутренние адреса
$to = (string) ($_GET['to'] ?? $_POST['to'] ?? '/admin/');
if (!preg_match('~^/(?!/)[\w\-/.?=&%]*$~', $to)) $to = '/admin/';

$error = $ok = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  if (!staff_csrf_ok()) { $error = 'Страница устарела — попробуйте ещё раз.'; }
  elseif (isset($_POST['logout'])) { staff_logout(); header('Location: /admin/vhod/?out=1'); exit; }
  elseif (isset($_POST['login'])) {
    $error = staff_login((string) $_POST['login'], (string) ($_POST['password'] ?? ''));
    if ($error === '') { header('Location: ' . $to); exit; }
  }
  elseif ($me && isset($_POST['mypass'])) {
    $p = (string) $_POST['mypass'];
    $users = staff_users();
    if (!password_verify((string) ($_POST['oldpass'] ?? ''), $users[$me['login']]['hash'])) $error = 'Текущий пароль указан неверно.';
    elseif (mb_strlen($p) < STAFF_MIN_PASSWORD) $error = 'Новый пароль — не короче ' . STAFF_MIN_PASSWORD . ' символов.';
    else {
      $users[$me['login']]['hash'] = password_hash($p, PASSWORD_DEFAULT);
      staff_save_users($users);
      $_SESSION['stamp'] = substr(hash('sha256', $users[$me['login']]['hash']), 0, 16);
      $ok = 'Пароль изменён.';
    }
  }
  elseif ($me && !empty($me['owner']) && isset($_POST['act'])) {
    $users = staff_users();
    $login = mb_strtolower(trim((string) ($_POST['u'] ?? '')));
    $act = (string) $_POST['act'];
    if ($act === 'add') {
      $p = (string) ($_POST['p'] ?? '');
      if (!preg_match('~^[a-z0-9._-]{3,30}$~', $login)) $error = 'Логин — 3–30 латинских букв, цифр, точек или дефисов.';
      elseif (isset($users[$login])) $error = 'Такой логин уже есть.';
      elseif (mb_strlen($p) < STAFF_MIN_PASSWORD) $error = 'Пароль — не короче ' . STAFF_MIN_PASSWORD . ' символов.';
      else {
        $users[$login] = ['name' => mb_substr(trim((string) ($_POST['name'] ?? '')), 0, 60) ?: $login, 'hash' => password_hash($p, PASSWORD_DEFAULT),
          'owner' => false, 'leads' => !empty($_POST['leads']), 'active' => true, 'created' => date('c')];
        staff_save_users($users); $ok = 'Сотрудник добавлен. Передайте ему логин и пароль лично.';
      }
    } elseif (isset($users[$login]) && $login !== $me['login']) {
      if ($act === 'toggle') { $users[$login]['active'] = empty($users[$login]['active']); $ok = $users[$login]['active'] ? 'Доступ включён.' : 'Доступ отключён — сотрудник вышел со всех устройств.'; }
      if ($act === 'leads') { $users[$login]['leads'] = empty($users[$login]['leads']); $ok = 'Доступ к заявкам изменён.'; }
      if ($act === 'pass') {
        $p = (string) ($_POST['p'] ?? '');
        if (mb_strlen($p) < STAFF_MIN_PASSWORD) $error = 'Пароль — не короче ' . STAFF_MIN_PASSWORD . ' символов.';
        else { $users[$login]['hash'] = password_hash($p, PASSWORD_DEFAULT); $ok = 'Пароль изменён — старые входы этого сотрудника завершены.'; }
      }
      if ($error === '') staff_save_users($users);
    }
  }
  $me = staff_user();
}
$csrf = $_SESSION['csrf'];
?><!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Вход для сотрудников — Гидрология</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
  :root { --ink: #16191c; --muted: #5d6670; --line: #dcd8cf; --paper: #f4f2ed; --blue: #0a6aa1; --ok: #1f7a43; --err: #b3261e; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink); background: var(--paper); }
  main { max-width: 760px; margin: 0 auto; padding: 40px 20px 80px; }
  .narrow { max-width: 400px; margin: 8vh auto 0; }
  a { color: var(--blue); }
  h1 { font-size: 26px; margin: 0 0 6px; } h2 { font-size: 18px; margin: 0 0 12px; }
  .muted { color: var(--muted); }
  .card { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 22px 24px; margin: 18px 0; }
  label { display: block; font-size: 13px; color: var(--muted); margin: 12px 0 4px; }
  input[type=text], input[type=password] { width: 100%; font: inherit; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
  button { font: inherit; font-weight: 600; border: 0; border-radius: 999px; padding: 10px 20px; background: var(--ink); color: #fff; cursor: pointer; }
  button.line { background: #fff; color: var(--ink); border: 1px solid var(--line); padding: 6px 14px; font-weight: 500; font-size: 13px; }
  .msg { padding: 10px 14px; border-radius: 10px; margin: 14px 0; } .err { background: #fbeceb; color: var(--err); } .ok { background: #e9f5ee; color: var(--ok); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  .tile { display: block; background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 18px; text-decoration: none; color: var(--ink); }
  .tile:hover { border-color: var(--ink); } .tile b { display: block; font-size: 16px; margin-bottom: 4px; } .tile span { color: var(--muted); font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; } td, th { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  th { font-size: 12px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
  td form { display: inline; } .off { color: var(--muted); text-decoration: line-through; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: end; } .row > div { flex: 1 1 160px; }
  .check { display: flex; gap: 8px; align-items: center; color: var(--ink); font-size: 14px; margin-top: 14px; }
  .top { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  details summary { cursor: pointer; color: var(--blue); }
</style>
</head>
<body>
<?php if (!$me): ?>
<main class="narrow">
  <a href="/">← На сайт</a>
  <div class="card">
    <h1>Вход для сотрудников</h1>
    <p class="muted">Кабинет «Гидрологии»: публикации, галерея, магазин, заявки.</p>
    <?php if (isset($_GET['out'])): ?><div class="msg ok">Вы вышли из кабинета.</div><?php endif; ?>
    <?php if ($error): ?><div class="msg err"><?= $h($error) ?></div><?php endif; ?>
    <?php if (!staff_https() && ($_SERVER['HTTP_HOST'] ?? '') !== 'localhost'): ?><div class="msg err">Соединение без https — пароль передаётся незащищённым. Входите так только на время проверки.</div><?php endif; ?>
    <?php if (!staff_users()): ?><div class="msg err">Вход ещё не настроен: на хостинге не задан пароль владельца (zayavki_password в config.php).</div><?php endif; ?>
    <form method="post" autocomplete="on">
      <input type="hidden" name="csrf" value="<?= $h($csrf) ?>"><input type="hidden" name="to" value="<?= $h($to) ?>">
      <label for="l">Логин</label><input type="text" id="l" name="login" autocomplete="username" autocapitalize="none" required autofocus>
      <label for="p">Пароль</label><input type="password" id="p" name="password" autocomplete="current-password" required>
      <p style="margin:18px 0 0"><button>Войти</button></p>
    </form>
  </div>
  <p class="muted" style="font-size:13px">Забыли пароль — попросите владельца сайта задать новый.</p>
</main>
<?php else: ?>
<main>
  <div class="top">
    <div><a href="/">← На сайт</a><h1 style="margin-top:8px">Здравствуйте, <?= $h($me['name']) ?></h1></div>
    <form method="post"><input type="hidden" name="csrf" value="<?= $h($csrf) ?>"><button class="line" name="logout" value="1">Выйти</button></form>
  </div>
  <?php if ($error): ?><div class="msg err"><?= $h($error) ?></div><?php endif; ?>
  <?php if ($ok): ?><div class="msg ok"><?= $h($ok) ?></div><?php endif; ?>

  <div class="tiles" style="margin-top:18px">
    <a class="tile" href="/admin/"><b>Кабинет сайта</b><span>Публикации, события, галерея, видео, магазин</span></a>
    <?php if (!empty($me['leads'])): ?><a class="tile" href="/admin/zayavki/"><b>Заявки и заказы</b><span>Всё, что пришло с сайта</span></a><?php endif; ?>
    <a class="tile" href="/admin/ceny/"><b>Цены из Excel</b><span>Обновить цены магазина таблицей</span></a>
  </div>

  <?php if (!empty($me['owner'])): $users = staff_users(); ?>
  <div class="card">
    <h2>Сотрудники</h2>
    <table>
      <thead><tr><th>Имя</th><th>Логин</th><th>Заявки</th><th></th></tr></thead>
      <tbody>
      <?php foreach ($users as $login => $u): ?>
        <tr>
          <td class="<?= empty($u['active']) ? 'off' : '' ?>"><?= $h($u['name']) ?><?= !empty($u['owner']) ? ' <span class="muted">· владелец</span>' : '' ?></td>
          <td><?= $h($login) ?></td>
          <td><?php if ($login === $me['login']): ?>да<?php else: ?>
            <form method="post"><input type="hidden" name="csrf" value="<?= $h($csrf) ?>"><input type="hidden" name="u" value="<?= $h($login) ?>"><button class="line" name="act" value="leads"><?= !empty($u['leads']) ? 'есть' : 'нет' ?></button></form><?php endif; ?></td>
          <td style="text-align:right"><?php if ($login !== $me['login']): ?>
            <form method="post"><input type="hidden" name="csrf" value="<?= $h($csrf) ?>"><input type="hidden" name="u" value="<?= $h($login) ?>"><button class="line" name="act" value="toggle"><?= empty($u['active']) ? 'Включить' : 'Отключить' ?></button></form>
            <details style="display:inline-block;margin-left:6px"><summary>пароль</summary>
              <form method="post" style="display:flex;gap:6px;margin-top:6px"><input type="hidden" name="csrf" value="<?= $h($csrf) ?>"><input type="hidden" name="u" value="<?= $h($login) ?>"><input type="password" name="p" placeholder="новый пароль" autocomplete="new-password" minlength="<?= STAFF_MIN_PASSWORD ?>" required style="width:160px"><button class="line" name="act" value="pass">OK</button></form>
            </details><?php endif; ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
    <h2 style="margin-top:24px">Добавить сотрудника</h2>
    <form method="post">
      <input type="hidden" name="csrf" value="<?= $h($csrf) ?>"><input type="hidden" name="act" value="add">
      <div class="row">
        <div><label>Имя</label><input type="text" name="name" placeholder="Анна Иванова" required></div>
        <div><label>Логин (латиницей)</label><input type="text" name="u" placeholder="anna" pattern="[a-zA-Z0-9._\-]{3,30}" autocapitalize="none" required></div>
        <div><label>Пароль (от <?= STAFF_MIN_PASSWORD ?> символов)</label><input type="text" name="p" id="np" minlength="<?= STAFF_MIN_PASSWORD ?>" autocomplete="off" required></div>
      </div>
      <label class="check"><input type="checkbox" name="leads" value="1"> Видит заявки и заказы (там телефоны клиентов)</label>
      <p style="margin:16px 0 0" class="row"><button>Добавить</button> <button type="button" class="line" id="gen">Придумать пароль</button></p>
    </form>
  </div>
  <script>
    document.getElementById('gen').onclick = function () {
      var a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = new Uint32Array(12), s = '';
      crypto.getRandomValues(r); for (var i = 0; i < 12; i++) s += a[r[i] % a.length];
      document.getElementById('np').value = s;
    };
  </script>
  <?php endif; ?>

  <div class="card">
    <h2>Сменить свой пароль</h2>
    <form method="post" class="row">
      <input type="hidden" name="csrf" value="<?= $h($csrf) ?>">
      <div><label>Текущий пароль</label><input type="password" name="oldpass" autocomplete="current-password" required></div>
      <div><label>Новый (от <?= STAFF_MIN_PASSWORD ?> символов)</label><input type="password" name="mypass" autocomplete="new-password" minlength="<?= STAFF_MIN_PASSWORD ?>" required></div>
      <div style="flex:0 0 auto"><button>Сменить</button></div>
    </form>
  </div>
</main>
<?php endif; ?>
</body>
</html>
