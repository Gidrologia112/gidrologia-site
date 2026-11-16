<?php
/**
 * Вход сотрудников: логин и пароль на сайте, без GitHub.
 * Список сотрудников и сессии лежат вне папки сайта (../gidrologia-staff), выкладка их не трогает.
 * Первый владелец — «admin» с паролем журнала заявок (zayavki_password в ~/deploy/config.php).
 */
declare(strict_types=1);

const STAFF_SESSION_DAYS = 14;
const STAFF_MIN_PASSWORD = 10;

function staff_https(): bool {
  return !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function staff_dir(): string {
  static $dir = null;
  if ($dir !== null) return $dir;
  $root = rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
  $cands = [];
  if ($root !== '') $cands[] = dirname($root) . '/gidrologia-staff';
  $cands[] = __DIR__ . '/staff-data';
  foreach ($cands as $c) {
    if ((is_dir($c) || @mkdir($c, 0700, true)) && is_writable($c)) {
      if (strpos($c, __DIR__) === 0 && !is_file($c . '/.htaccess')) @file_put_contents($c . '/.htaccess', "Require all denied\n");
      @mkdir($c . '/sessions', 0700);
      return $dir = $c;
    }
  }
  return $dir = '';
}

/** Сотрудники: login => [name, hash, owner, leads, active, created] */
function staff_users(): array {
  $f = staff_dir() . '/users.json';
  $u = is_file($f) ? json_decode((string) file_get_contents($f), true) : null;
  if (!is_array($u)) $u = [];
  if (!$u) {
    // Первый запуск: владелец «admin» с паролем журнала заявок
    $z = __DIR__ . '/../admin/zayavki/config.php';
    $cfg = is_file($z) ? (include $z) : [];
    $hash = is_array($cfg) ? (string) ($cfg['password_hash'] ?? '') : '';
    if ($hash !== '') {
      $u = ['admin' => ['name' => 'Владелец', 'hash' => $hash, 'owner' => true, 'leads' => true, 'active' => true, 'created' => date('c')]];
      staff_save_users($u);
    }
  }
  return $u;
}

function staff_save_users(array $u): bool {
  $dir = staff_dir();
  if ($dir === '') return false;
  $tmp = $dir . '/users.json.' . bin2hex(random_bytes(4));
  if (@file_put_contents($tmp, json_encode($u, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX) === false) return false;
  @chmod($tmp, 0600);
  return rename($tmp, $dir . '/users.json');
}

function staff_start(): void {
  if (session_status() === PHP_SESSION_ACTIVE) return;
  $dir = staff_dir();
  if ($dir !== '') session_save_path($dir . '/sessions');
  ini_set('session.gc_maxlifetime', (string) (STAFF_SESSION_DAYS * 86400));
  ini_set('session.use_strict_mode', '1');
  session_name('gidro_sess');
  session_set_cookie_params(['lifetime' => STAFF_SESSION_DAYS * 86400, 'path' => '/', 'secure' => staff_https(), 'httponly' => true, 'samesite' => 'Lax']);
  session_start();
  if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
}

/** Текущий сотрудник или null. Отключённый или удалённый — выходит сразу. */
function staff_user(): ?array {
  staff_start();
  $login = (string) ($_SESSION['staff'] ?? '');
  if ($login === '') return null;
  $u = staff_users()[$login] ?? null;
  if (!$u || empty($u['active']) || ($_SESSION['stamp'] ?? '') !== substr(hash('sha256', $u['hash']), 0, 16)) { staff_logout(); return null; }
  return $u + ['login' => $login];
}

// Защита от подбора: не больше 8 неудачных попыток за 15 минут с одного адреса
function staff_ip(): string { return (string) ($_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '0'); }
function staff_fails(bool $add = false): int {
  $f = staff_dir() . '/fails-' . hash('sha256', staff_ip()) . '.json';
  $now = time();
  $list = is_file($f) ? array_filter((array) json_decode((string) file_get_contents($f), true), fn($t) => is_int($t) && $t > $now - 900) : [];
  if ($add) { $list[] = $now; @file_put_contents($f, json_encode(array_values($list)), LOCK_EX); }
  return count($list);
}

function staff_login(string $login, string $password): string {
  staff_start();
  if (staff_fails() >= 8) return 'Слишком много попыток. Подождите 15 минут.';
  $login = mb_strtolower(trim($login));
  $u = staff_users()[$login] ?? null;
  usleep(300000);
  if (!$u || empty($u['active']) || !password_verify($password, (string) $u['hash'])) { staff_fails(true); return 'Неверный логин или пароль.'; }
  session_regenerate_id(true);
  $_SESSION['staff'] = $login;
  $_SESSION['stamp'] = substr(hash('sha256', $u['hash']), 0, 16); // смена пароля завершает старые входы
  // Метка для сайта: показать значок кабинета (секретов в ней нет)
  setcookie('gidro_staff', '1', ['expires' => time() + STAFF_SESSION_DAYS * 86400, 'path' => '/', 'secure' => staff_https(), 'samesite' => 'Lax']);
  return '';
}

function staff_logout(): void {
  staff_start();
  $_SESSION = [];
  session_destroy();
  setcookie('gidro_staff', '', ['expires' => 1, 'path' => '/']);
}

function staff_csrf_ok(): bool {
  staff_start();
  return hash_equals((string) $_SESSION['csrf'], (string) ($_POST['csrf'] ?? $_SERVER['HTTP_X_CSRF'] ?? ''));
}
