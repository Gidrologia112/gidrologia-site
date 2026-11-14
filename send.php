<?php
/**
 * Гидрология — обработчик формы заявки.
 * Отправляет письмо на MAIL_TO. Защита: honeypot, проверка полей, ограничение частоты по IP, проверка файла.
 * Работает на обычном хостинге Timeweb (PHP 7.4+), функция mail() должна быть включена в панели.
 */

const MAIL_TO     = 'info@gidrologia.ru';
const MAIL_FROM   = 'info@gidrologia.ru';     // существующий ящик на домене (Timeweb): с несуществующего адреса письма отбраковываются
const MAX_FILE    = 10 * 1024 * 1024;
const RATE_LIMIT  = 5;     // не больше 5 заявок
const RATE_WINDOW = 600;   // за 10 минут с одного IP
const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
const ALLOWED_MIME = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/png',
];

date_default_timezone_set('Europe/Moscow');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function reply(int $code, array $data): void {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') reply(405, ['ok' => false, 'error' => 'Метод не поддерживается.']);

// Принимаем запросы только со своего сайта
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && !preg_match('~^https?://(www\.|new\.)?gidrologia\.ru$~i', $origin)) {
  reply(403, ['ok' => false, 'error' => 'Запрос отклонён.']);
}

// Honeypot: боты заполняют скрытое поле
if (!empty($_POST['website'])) reply(200, ['ok' => true]);

// Ограничение частоты по IP (файлы во временной папке)
$ip = $_SERVER['REMOTE_ADDR'] ?? '0';
$rateFile = sys_get_temp_dir() . '/gidro_rate_' . hash('sha256', $ip);
$now = time();
$hits = [];
if (is_file($rateFile)) {
  $hits = array_filter((array) json_decode((string) file_get_contents($rateFile), true), fn($t) => is_int($t) && $t > $now - RATE_WINDOW);
}
if (count($hits) >= RATE_LIMIT) reply(429, ['ok' => false, 'error' => 'Слишком много заявок. Попробуйте позже или позвоните нам.']);
$hits[] = $now;
@file_put_contents($rateFile, json_encode(array_values($hits)), LOCK_EX);

// Очистка полей: убираем переводы строк из однострочных полей (защита от подмены заголовков письма)
function clean(string $key, int $max): string {
  $v = trim((string) ($_POST[$key] ?? ''));
  $v = str_replace(["\r", "\n", "\0"], ' ', $v);
  return mb_substr($v, 0, $max);
}
$name    = clean('name', 100);
$phone   = clean('phone', 30);
$type    = in_array($_POST['type'] ?? '', ['tz', 'order'], true) ? $_POST['type'] : 'project';
$message = mb_substr(str_replace("\0", '', trim((string) ($_POST['message'] ?? ''))), 0, 3000);
$consent = ($_POST['consent'] ?? '') === '1';

if ($name === '' || strlen(preg_replace('/\D/', '', $phone)) < 10) reply(422, ['ok' => false, 'error' => 'Укажите имя и телефон.']);
if (!$consent) reply(422, ['ok' => false, 'error' => 'Нужно согласие на обработку персональных данных.']);

// Заказ из магазина: состав и цены сверяем с каталогом сайта (magazin/catalog.json), а не верим браузеру
$order = null;
if ($type === 'order') {
  $catalog = json_decode((string) @file_get_contents(__DIR__ . '/magazin/catalog.json'), true) ?: [];
  $items = json_decode((string) ($_POST['items'] ?? ''), true);
  $lines = []; $total = 0; $onRequest = false;
  if (is_array($items)) foreach ($items as $id => $qty) {
    $id = (string) (int) $id; $qty = max(1, min(999, (int) $qty));
    if (!isset($catalog[$id])) continue;
    $p = $catalog[$id]; $sum = (int) $p['p'] * $qty; $total += $sum; if (!$p['p']) $onRequest = true;
    $lines[] = ['id' => (int) $id, 'title' => $p['t'], 'qty' => $qty, 'price' => (int) $p['p'], 'sum' => $sum, 'url' => 'https://gidrologia.ru/magazin/tovar/' . $p['s'] . '/'];
  }
  if (!$lines) reply(422, ['ok' => false, 'error' => 'Корзина пуста.']);
  $email = clean('email', 100);
  if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) reply(422, ['ok' => false, 'error' => 'Проверьте e-mail.']);
  $delivery = clean('delivery', 60);
  $city = clean('city', 200);
  $order = ['lines' => $lines, 'total' => $total, 'onRequest' => $onRequest, 'email' => $email, 'delivery' => $delivery, 'city' => $city];
  $txt = "Заказ из магазина:\n";
  foreach ($lines as $i => $l) $txt .= ($i + 1) . '. ' . $l['title'] . ' — ' . $l['qty'] . ' шт. × ' . ($l['price'] ? number_format($l['price'], 0, '', ' ') . ' ₽' : 'цена по запросу') . ' = ' . ($l['price'] ? number_format($l['sum'], 0, '', ' ') . ' ₽' : '—') . "\n   " . $l['url'] . "\n";
  $txt .= 'Итого: ' . number_format($total, 0, '', ' ') . ' ₽' . ($onRequest ? ' (+ позиции с ценой по запросу)' : '') . "\n";
  $txt .= 'Доставка: ' . ($delivery ?: '—') . ($city !== '' ? ', ' . $city : '') . "\n";
  if ($email !== '') $txt .= "E-mail: {$email}\n";
  $message = $txt . ($message !== '' ? "\nКомментарий покупателя:\n" . $message : '');
}

// Файл (только для ТЗ)
$attachment = null;
if ($type === 'tz' && !empty($_FILES['file']) && $_FILES['file']['error'] !== UPLOAD_ERR_NO_FILE) {
  $f = $_FILES['file'];
  if ($f['error'] !== UPLOAD_ERR_OK || $f['size'] > MAX_FILE) reply(422, ['ok' => false, 'error' => 'Файл не принят: до 10 МБ, PDF, DOC, JPG или PNG.']);
  $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
  $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
  if (!in_array($ext, ALLOWED_EXT, true) || !in_array($mime, ALLOWED_MIME, true)) {
    reply(422, ['ok' => false, 'error' => 'Файл не принят: до 10 МБ, PDF, DOC, JPG или PNG.']);
  }
  $attachment = [
    'ext'  => $ext,
    'name' => 'tz-' . date('Ymd-His') . '.' . $ext, // своё имя файла, не доверяем имени от пользователя
    'mime' => $mime,
    'data' => file_get_contents($f['tmp_name']),
  ];
}

// Письмо
$subject = $type === 'tz' ? 'Новое ТЗ с сайта gidrologia.ru' : ($type === 'order' ? 'Новый заказ из магазина gidrologia.ru' : 'Новая заявка с сайта gidrologia.ru');
$body  = ($type === 'tz' ? "Тип: техническое задание\n" : ($type === 'order' ? "Тип: заказ из магазина\n" : "Тип: обсудить проект\n"));
$body .= "Имя: {$name}\nТелефон: {$phone}\n\n";
$body .= "Сообщение:\n" . ($message !== '' ? $message : '—') . "\n\n";
$body .= 'Согласие на обработку ПДн: да, ' . date('d.m.Y H:i') . "\n";
$body .= 'Страница: ' . mb_substr((string) ($_SERVER['HTTP_REFERER'] ?? ''), 0, 200) . "\n";

$encSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
$headers = [
  'From: =?UTF-8?B?' . base64_encode('Сайт Гидрология') . '?= <' . MAIL_FROM . '>',
  'MIME-Version: 1.0',
];
if (!empty($order['email'])) $headers[] = 'Reply-To: ' . $order['email'];

if ($attachment) {
  $boundary = 'b' . bin2hex(random_bytes(12));
  $headers[] = 'Content-Type: multipart/mixed; boundary="' . $boundary . '"';
  $content  = "--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n";
  $content .= chunk_split(base64_encode($body)) . "\r\n";
  $content .= "--{$boundary}\r\nContent-Type: {$attachment['mime']}; name=\"{$attachment['name']}\"\r\n";
  $content .= "Content-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"{$attachment['name']}\"\r\n\r\n";
  $content .= chunk_split(base64_encode($attachment['data'])) . "\r\n--{$boundary}--";
} else {
  $headers[] = 'Content-Type: text/plain; charset=UTF-8';
  $headers[] = 'Content-Transfer-Encoding: base64';
  $content = chunk_split(base64_encode($body));
}

// Сохраняем заявку в журнал кабинета (/admin/zayavki/) — даже если письмо не уйдёт
require_once __DIR__ . '/lib/leads.php';
$saved = leads_save([
  'type' => $type, 'name' => $name, 'phone' => $phone, 'message' => $message,
  'page' => mb_substr((string) ($_SERVER['HTTP_REFERER'] ?? ''), 0, 200),
  'created' => date('c'), 'consent' => true, 'order' => $order, 'consent_doc' => '/soglasie/ ред. 03.11.2026', 'ip' => mb_substr((string) ($_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? ''), 0, 100),
], $attachment);

$sent = @mail(MAIL_TO, $encSubject, $content, implode("\r\n", $headers), '-f' . MAIL_FROM);
// В журнале видно, ушло ли письмо (если нет — смотреть настройки почты на хостинге)
if ($saved) leads_update($saved, ['mail' => $sent ? 'отправлено ' . date('d.m.Y H:i') : 'не отправлено: ' . (error_get_last()['message'] ?? 'mail() вернула false')]);
if (!$sent && !$saved) reply(500, ['ok' => false, 'error' => 'Не получилось отправить. Позвоните нам: +7 812 748-22-44.']);

reply(200, ['ok' => true]);
