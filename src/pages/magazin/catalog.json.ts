// Справочник для корзины, проверки заказа на сервере (send.php) и загрузки цен в кабинете:
// id → название, цена, адрес, фото, файл товара, артикул, производитель
import { products, cover } from '../../lib/shop';
export async function GET() {
  const out: Record<string, { t: string; p: number; s: string; i: string; f: string; a: string; v: string }> = {};
  for (const p of products) out[p.id] = { t: p.title, p: p.price, s: p.slug, i: cover(p), f: p.file, a: p.sku, v: p.vendor };
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
}
