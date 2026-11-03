<?php
/**
 * Хранилище заявок с сайта. Каждая заявка — отдельный JSON-файл, вложение — рядом.
 * Папка лежит вне public_html, если это возможно; иначе — в public_html/lib/leads-data с запретом доступа.
 */
declare(strict_types=1);
date_default_timezone_set('Europe/Moscow');

function leads_dir(): string {
  static $dir = null;
  if ($dir !== null) return $dir;
  $root = rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
  $candidates = [];
  if ($root !== '') $candidates[] = dirname($root) . '/gidrologia-zayavki';
  $candidates[] = __DIR__ . '/leads-data';
  foreach ($candidates as $c) {
    if (is_dir($c) || @mkdir($c, 0700, true)) {
      if (is_writable($c)) {
        if (strpos($c, __DIR__) === 0 && !is_file($c . '/.htaccess')) {
          @file_put_contents($c . '/.htaccess', "Require all denied\n");
        }
        return $dir = $c;
      }
    }
  }
  return $dir = '';
}

function leads_save(array $lead, ?array $file): ?string {
  $dir = leads_dir();
  if ($dir === '') return null;
  $id = date('Ymd-His') . '-' . bin2hex(random_bytes(3));
  if ($file) {
    $fname = $id . '.' . $file['ext'];
    if (@file_put_contents($dir . '/' . $fname, $file['data']) !== false) {
      $lead['file'] = $fname;
      $lead['file_mime'] = $file['mime'];
    }
  }
  $lead['id'] = $id;
  $lead['status'] = 'new';
  $lead['note'] = '';
  @file_put_contents($dir . '/' . $id . '.json', json_encode($lead, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
  return $id;
}

function leads_all(): array {
  $dir = leads_dir();
  if ($dir === '') return [];
  $out = [];
  foreach (glob($dir . '/*.json') ?: [] as $f) {
    $d = json_decode((string) file_get_contents($f), true);
    if (is_array($d) && isset($d['id'])) $out[] = $d;
  }
  usort($out, fn($a, $b) => strcmp($b['id'], $a['id']));
  return $out;
}

function leads_get(string $id): ?array {
  if (!preg_match('/^\d{8}-\d{6}-[0-9a-f]{6}$/', $id)) return null;
  $f = leads_dir() . '/' . $id . '.json';
  if (!is_file($f)) return null;
  $d = json_decode((string) file_get_contents($f), true);
  return is_array($d) ? $d : null;
}

function leads_update(string $id, array $patch): bool {
  $d = leads_get($id);
  if (!$d) return false;
  $d = array_merge($d, $patch);
  return @file_put_contents(leads_dir() . '/' . $id . '.json', json_encode($d, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX) !== false;
}
