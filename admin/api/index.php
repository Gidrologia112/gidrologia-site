<?php
/**
 * Посредник между кабинетом (Decap CMS) и GitHub.
 * Сотрудник входит логином и паролем сайта; ключ GitHub хранится только на хостинге (config.php рядом)
 * и в браузер не попадает. Пропускаются запросы только к репозиторию сайта.
 */
declare(strict_types=1);
require_once __DIR__ . '/../../lib/staff.php';

const REPO = 'Gidrologia112/gidrologia-site';
const REPO_ID = '1443000386'; // так GitHub называет репозиторий в постраничных ссылках
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');

function out(int $code, array $data): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

$me = staff_user();
session_write_close(); // не держим сессию: кабинет шлёт много запросов параллельно
if (!$me) out(401, ['message' => 'Войдите в кабинет: /admin/vhod/']);

$method = $_SERVER['REQUEST_METHOD'];
if (!in_array($method, ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'], true)) out(405, ['message' => 'Метод не поддерживается']);
// Изменения — только со своих страниц
if ($method !== 'GET' && $method !== 'HEAD') {
  $site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  $host = $_SERVER['HTTP_HOST'] ?? '';
  $oh = $origin !== '' ? (string) parse_url($origin, PHP_URL_HOST) . (parse_url($origin, PHP_URL_PORT) ? ':' . parse_url($origin, PHP_URL_PORT) : '') : '';
  if (($site !== '' && $site !== 'same-origin') || ($origin !== '' && strcasecmp($oh, $host) !== 0)) out(403, ['message' => 'Запрос отклонён']);
}

$cfg = is_file(__DIR__ . '/config.php') ? (include __DIR__ . '/config.php') : [];
$token = is_array($cfg) ? (string) ($cfg['token'] ?? '') : '';
if ($token === '') out(503, ['message' => 'Кабинет не настроен: нет ключа GitHub на хостинге (github_token в ~/deploy/config.php).']);

// Путь после /admin/api/
$uri = (string) ($_SERVER['REQUEST_URI'] ?? '');
$path = (string) preg_replace('~^/admin/api/?~', '', (string) parse_url($uri, PHP_URL_PATH));
$query = (string) parse_url($uri, PHP_URL_QUERY);
$path = rawurldecode($path);
if (preg_match('~(^|/)\.\.(/|$)~', $path)) out(400, ['message' => 'Неверный адрес']);

// Кто вошёл: отвечаем сами — так в кабинете и в истории правок видно имя сотрудника
if ($path === 'user') {
  out(200, ['login' => $me['login'], 'name' => $me['name'], 'id' => crc32($me['login']), 'avatar_url' => '/favicon.svg',
    'email' => $me['login'] . '@staff.gidrologia.ru', 'type' => 'User']);
}
$path = (string) preg_replace('~^repositories/' . REPO_ID . '(?=/|$)~', 'repos/' . REPO, $path);
if (!preg_match('~^repos/' . preg_quote(REPO, '~') . '(/.*)?$~i', $path)) out(403, ['message' => 'Доступ только к репозиторию сайта']);
// Настройки репозитория, ключи, доступы и сценарии сборки не трогаем
if (preg_match('~^repos/[^/]+/[^/]+/(hooks|keys|collaborators|invitations|actions|environments|secrets|settings|pages|transfer|rulesets|branches/[^/]+/protection)~i', $path)) out(403, ['message' => 'Недоступно из кабинета']);
if ($method === 'DELETE' && preg_match('~^repos/[^/]+/[^/]+/?$~', $path)) out(403, ['message' => 'Недоступно из кабинета']);
// Запись в ветку main и в служебные папки — как через обычный кабинет; сценарии сборки менять нельзя
$body = in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true) ? (string) file_get_contents('php://input') : '';
if ($body !== '' && preg_match('~"path"\s*:\s*"\.github/~', $body)) out(403, ['message' => 'Недоступно из кабинета']);

$headers = ['Authorization: Bearer ' . $token, 'User-Agent: gidrologia-cms', 'X-GitHub-Api-Version: 2022-11-28',
  'Accept: ' . ($_SERVER['HTTP_ACCEPT'] ?? 'application/vnd.github+json')];
if ($body !== '') $headers[] = 'Content-Type: application/json';
if (!empty($_SERVER['HTTP_IF_NONE_MATCH'])) $headers[] = 'If-None-Match: ' . $_SERVER['HTTP_IF_NONE_MATCH'];

$respHeaders = [];
$ch = curl_init('https://api.github.com/' . implode('/', array_map('rawurlencode', explode('/', $path))) . ($query !== '' ? '?' . $query : ''));
curl_setopt_array($ch, [
  CURLOPT_CUSTOMREQUEST => $method,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 60,
  CURLOPT_HTTPHEADER => $headers,
  CURLOPT_HEADERFUNCTION => function ($c, $line) use (&$respHeaders) {
    $p = explode(':', $line, 2);
    if (count($p) === 2) $respHeaders[strtolower(trim($p[0]))] = trim($p[1]);
    return strlen($line);
  },
]);
if ($body !== '') curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
if ($method === 'HEAD') curl_setopt($ch, CURLOPT_NOBODY, true);
$res = curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);
if ($res === false) out(502, ['message' => 'GitHub не отвечает, попробуйте ещё раз.']);

http_response_code($code ?: 502);
header('Content-Type: ' . ($respHeaders['content-type'] ?? 'application/json; charset=utf-8'));
foreach (['etag', 'last-modified'] as $k) if (isset($respHeaders[$k])) header(ucwords($k, '-') . ': ' . $respHeaders[$k]);
// Постраничные ссылки GitHub → через этот же посредник
if (isset($respHeaders['link'])) header('Link: ' . str_replace('https://api.github.com/', (staff_https() ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'gidrologia.ru') . '/admin/api/', $respHeaders['link']));
echo $res;
