<?php
/**
 * Защита форм от спама (без видимой капчи). Подключается из send.php; client_ip() — ещё и из staff.php.
 *
 * 1. Метка формы. Скрипт сайта при первом касании формы берёт с сервера подписанную метку времени
 *    (GET /send.php?token=1) и отправляет её в поле «ft». Метка = «время.подпись», подпись — HMAC-SHA256
 *    на секрете, который сам создаётся на хостинге рядом с журналом заявок (файл .form-key) и в git не лежит.
 *    send.php молча (ответ «ok», без записи и письма) отбрасывает отправку:
 *      — без метки или с поддельной подписью (боты, которые шлют POST напрямую);
 *      — быстрее FORM_MIN_SECONDS после выдачи метки (человек так быстро не заполнит форму);
 *      — с меткой старше FORM_MAX_AGE (бот однажды взял метку и шлёт её повторно).
 *    Отброшенные попытки пишутся коротко в blocked-ГГГГ-ММ.log рядом с журналом — чтобы видеть, работает ли защита.
 *
 * 2. Фильтр по содержанию. Заявка сохраняется в журнал со статусом «Спам» и НЕ уходит на почту, если:
 *      — в имени, сообщении или адресе есть ссылка: http(s):, www., xn--, домен вида site.ru / site.com
 *        (адреса e-mail не считаются ссылкой);
 *      — в имени и в тексте нет ни одной русской буквы, а латинские есть (боты: «Jamesfax», «Charlesdagma»);
 *      — телефон явно не российский: после 7/8 код не начинается с 3, 4, 7, 8 или 9
 *        (например, 8 666 184-76-62), или цифр больше 11 без «+». Номер с «+» и чужим кодом страны не трогаем.
 *    Ничего не теряется: такие заявки видны во вкладке «Спам» журнала, причина — в строке заявки.
 *
 * 3. Адрес посетителя для лимита частоты. За прокси хостинга REMOTE_ADDR — адрес прокси, поэтому
 *    настоящий адрес берём из X-Real-IP / X-Forwarded-For, но только если запрос пришёл от прокси
 *    (внутренний адрес или адрес из TRUSTED_PROXIES). Иначе заголовкам не верим: их может подставить кто угодно.
 */
declare(strict_types=1);

const FORM_MIN_SECONDS = 3;
const FORM_MAX_AGE     = 86400;   // 24 часа
const TRUSTED_PROXIES  = [];      // публичные адреса прокси хостинга, если понадобится (внутренние распознаются сами)

function client_ip(): string {
  $remote = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
  $isProxy = $remote !== '' && (
    in_array($remote, TRUSTED_PROXIES, true)
    || filter_var($remote, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false
  );
  if ($isProxy) {
    $cands = [(string) ($_SERVER['HTTP_X_REAL_IP'] ?? '')];
    $xff = (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
    if ($xff !== '') $cands[] = trim(explode(',', $xff)[0]);
    foreach ($cands as $c) if (filter_var($c, FILTER_VALIDATE_IP)) return $c;
  }
  return $remote !== '' ? $remote : '0';
}

/** Папка для секрета и журнала отброшенных попыток — та же, что у журнала заявок. */
function antispam_dir(): string {
  require_once __DIR__ . '/leads.php';
  return leads_dir();
}

function form_secret(): string {
  $dir = antispam_dir();
  if ($dir === '') return '';
  $f = $dir . '/.form-key';
  $k = is_file($f) ? trim((string) @file_get_contents($f)) : '';
  if (strlen($k) < 32) {
    $k = bin2hex(random_bytes(32));
    if (@file_put_contents($f, $k, LOCK_EX) === false) return '';
    @chmod($f, 0600);
  }
  return $k;
}

function form_token_issue(): string {
  $key = form_secret();
  $t = (string) time();
  return $key === '' ? '' : $t . '.' . substr(hash_hmac('sha256', 'form|' . $t, $key), 0, 32);
}

/** Возвращает '' если метка в порядке, иначе причину отказа. */
function form_token_check(string $tok): string {
  if (!preg_match('/^(\d{10})\.([0-9a-f]{32})$/', $tok, $m)) return 'нет метки';
  $key = form_secret();
  if ($key === '') return '';   // секрет не создать (нет записи на диск) — не блокируем клиентов
  if (!hash_equals(substr(hash_hmac('sha256', 'form|' . $m[1], $key), 0, 32), $m[2])) return 'поддельная метка';
  $age = time() - (int) $m[1];
  if ($age < FORM_MIN_SECONDS) return 'слишком быстро (' . $age . ' с)';
  if ($age > FORM_MAX_AGE) return 'старая метка';
  return '';
}

/** Короткая запись об отброшенной попытке (файл на месяц, не больше 1 МБ). */
function antispam_log(string $reason): void {
  $dir = antispam_dir();
  if ($dir === '') return;
  $f = $dir . '/blocked-' . date('Y-m') . '.log';
  if (is_file($f) && filesize($f) > 1024 * 1024) return;
  $page = parse_url((string) ($_SERVER['HTTP_REFERER'] ?? ''), PHP_URL_PATH) ?: '-';
  $line = date('d.m H:i:s') . "\t" . $reason . "\t" . client_ip() . "\t" . mb_substr((string) $page, 0, 120) . "\n";
  @file_put_contents($f, $line, FILE_APPEND | LOCK_EX);
}

function spam_phone_bad(string $phone): bool {
  $d = preg_replace('/\D/', '', $phone);
  if ($d === '') return true;
  if (substr(ltrim($phone), 0, 1) === '+' && $d[0] !== '7') return false; // явный чужой код страны
  if (strlen($d) === 11 && ($d[0] === '7' || $d[0] === '8')) $n = substr($d, 1);
  elseif (strlen($d) === 10) $n = $d;
  else return true;
  return strpos('34789', $n[0]) === false;
}

/** Причины считать заявку спамом (пустой массив — заявка нормальная). */
function spam_reasons(string $name, string $phone, string $text): array {
  $r = [];
  $all = $name . "\n" . $text;
  $noMail = preg_replace('/[^\s@]+@[^\s@]+/u', ' ', $all);
  if (preg_match('~https?:|www\.|xn--|\b[a-z0-9-]{2,}\.(ru|su|com|net|org|info|biz|io|me|pro|top|xyz|site|online|shop|club|store|link|click|live|space|website|ly|gl|to|cc|tk|ml|ga|cf)\b|\.рф(?!\p{L})~iu', $noMail)) {
    $r[] = 'ссылка в тексте';
  }
  if (!preg_match('/\p{Cyrillic}/u', $all) && preg_match('/[a-z]/i', $name)) $r[] = 'нет русских букв';
  if (spam_phone_bad($phone)) $r[] = 'нероссийский телефон';
  return $r;
}
