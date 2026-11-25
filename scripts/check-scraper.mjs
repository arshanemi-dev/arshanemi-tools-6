// Scraper setup check — reads ONE results page from each marketplace with
// the current .env settings and says, in plain words, which ones work and
// which scraping service delivered each.
//
//   npm run scraper:check                                  (keyword "cotton kurti")
//   npm run scraper:check -- "steel bottle"                (your own keyword)
//   npm run scraper:check -- "steel bottle" meesho         (one marketplace)
//   npm run scraper:check -- "steel bottle" --via scrapedo (test one service only:
//                                                          firecrawl | scrapedo | custom | direct)
//
// Each marketplace read = 1 page = the credits your service charges for one
// request. Nothing is saved.
import { MARKETPLACES } from '@/data/marketplaces';
import { runSearch } from '@/lib/scraper/runSearch';
import { outOfCredits, routeName } from '@/lib/scraper/fetchPage';

const args = process.argv.slice(2);
const viaAt = args.indexOf('--via');
const only = viaAt === -1 ? null : args[viaAt + 1];
const rest = args.filter((_, i) => viaAt === -1 || (i !== viaAt && i !== viaAt + 1));
const [query = 'cotton kurti', market] = rest;
const list = MARKETPLACES.filter((m) => !market || m.id === market.toLowerCase());
if (!list.length) {
  console.error(`No marketplace "${market}". Use one of: ${MARKETPLACES.map((m) => m.id).join(', ')}`);
  process.exit(1);
}

console.log(`\nChecking page 1 of "${query}" on ${list.length} marketplace(s)${only ? ` — only through ${only}` : ''}…\n`);
let good = 0;
for (const m of list) {
  const started = Date.now();
  const r = await runSearch(m.id, { query }, { fromPage: 1, toPage: 1, only });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const ranked = r.products.filter((p) => p.rank != null);
  const has = (k) => ranked.filter((p) => p[k] != null).length;
  const route = only || routeName(m.id, { js: !!m.needsJs });
  if (r.products.length) {
    good += 1;
    console.log(`✅ ${m.name.padEnd(9)} ${String(r.products.length).padStart(3)} products (${ranked.length} ranked, ${r.products.length - ranked.length} ads) · ${secs}s · delivered by ${r.via.join(', ') || '?'}`);
    console.log(`   prices on ${has('price')}, ratings on ${has('rating')}, review counts on ${has('reviews')}, bought on ${has('bought')} · e.g. #1 ${ranked[0]?.title?.slice(0, 50) || '-'}`);
  } else {
    console.log(`❌ ${m.name.padEnd(9)} ${r.blocked ? 'BLOCKED (robot check)' : 'no products'} · ${secs}s · tried ${route}`);
    console.log(`   ${r.error}`);
  }
}
console.log(`\n${good} of ${list.length} working.`);
for (const o of outOfCredits()) console.log(`⚠ ${o.reason} — it is skipped until ${o.until} (this process only).`);
