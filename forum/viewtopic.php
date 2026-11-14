<?php
// Старые адреса тем форума phpBB → страницы архива. Понимает ?t=ТЕМА и ?p=СООБЩЕНИЕ.
$t = (int) ($_GET['t'] ?? 0);
if (!$t && isset($_GET['p'])) {
  $map = json_decode((string) @file_get_contents(__DIR__ . '/posts.json'), true) ?: [];
  $t = (int) ($map[(string) (int) $_GET['p']] ?? 0);
}
$to = $t ? "/arhiv-foruma/tema-$t/" : '/arhiv-foruma/';
if ($t && !is_dir(dirname(__DIR__) . "/arhiv-foruma/tema-$t")) $to = '/arhiv-foruma/';
header('Location: ' . $to, true, 301);
