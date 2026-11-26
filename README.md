# arshanemi-tools-6 — Product Research

Web-scraper–based e-commerce product research: search one category / keyword
across **Amazon, Flipkart, Meesho, Myntra and Snapdeal**, get every product on
the result pages **ranked** (shown 5th = rank 5, ads left out), and track it
**every day** — rank moves over 1 Week / 15 Days / 1 Month / 3 Months / All
Time, review growth, rating and price — with graphs, filters, sorting and
Excel / PDF downloads.

Login, OTP, profile, SSO handoff, theme and the coin wallet are carried over
from `tools/arshanemi-tools-5` unchanged (the admin panel is the bank).

```bash
npm install
cp .env.example .env   # fill in — JWT secrets must match the admin panel
npm run dev            # http://localhost:3006/product-research
npm test               # metrics + per-marketplace parser tests
```

## Pages

| Page | Who | What's on it |
|---|---|---|
| `/product-research` (home) | every signed-in user | Entries ▾, Date, Excel, PDF + the **Daily History** table. An entry not unlocked yet shows its Unlock card (first unlock free, then 10 coins once). |
| `/product-research/new-search` | **master admin only** (checked by the server; nothing is drawn until it says yes) | Add an entry: **1** market place → **2** category (name = `marketplace_category`, unique) → **3** the one link to read (empty = the market place's search) → **4** pages + Daily on/off → Add & search. **All entries** table: tick several → Search now / Delete; a **Daily** switch on every row (off = never read automatically). Click a name for its **Products** (cards, line chart, table, Details). Storage tools. |

Old addresses `/product-research/settings` and `/products` redirect to New Search.
The navbar has one link, Product Research; New Search is in the master admin's account menu.

## How it works

| Piece | Where |
|---|---|
| Marketplace list, search URLs | `data/marketplaces.js` |
| Fetch (browser headers, retries, robot-check detection, optional scraping API) | `lib/scraper/fetchPage.js` |
| Generic extraction: embedded app-state JSON → JSON-LD → product-link cards | `lib/scraper/extract.js` |
| One parser per marketplace (precise first, generic fallbacks) | `lib/scraper/platforms/*.js` |
| Page range (From → To) → deduped, ranked list | `lib/scraper/runSearch.js`, `lib/scraper/rank.js` |
| Storage: shared tracks + daily history, user search lists, cron index | `lib/research/store.js` (Vercel Blob, or `./.data/` locally) |
| Rank moves, review growth, status, chart series, KPIs (pure) | `lib/research/metrics.js` |
| API | `app/api/research/*`, `app/api/cron/refresh` |
| Pages | `app/product-research/{page,products/page,settings/page}.js` → `components/research/*` |

**Pages.** Each search reads a range of result pages, From page … To page
(up to page 20, at most 10 pages per search). Rank is the product's place in
the whole listing: when the range starts after page 1, the pages before it
are counted as full pages (Flipkart, 40 a page: page 3 starts at rank 81),
and the page says so.

**Tracking.** A track = marketplace + keyword + page range, shared by every
user who searches it (one scrape a day serves all). Each day's snapshot is
stored per product (`rank, page, price, MRP, rating, reviews, ad`). Vercel
Cron calls `/api/cron/refresh` daily (`vercel.json`); opening a search that
hasn't been read today also refreshes it (free).

**Billing** (`data/billing.js`). Only the master admin adds and reads
entries (never charged). Every user sees every entry; to see one's data they
unlock it once, for good: the first unlock is free, each other one is 1 ×
`pr-search` (10 coins in the Tools Catalog), never charged twice. In the admin panel run `npm run db:sync-product-research` once
to add the tool + feature to the catalog and grant it to users.

**Import Sheet.** An Excel/CSV with `Link | Date | Price | Review | Rating |
Ranking` (optional `Title`, `MRP`; header may sit under a title row) becomes a
search of its own — same tables and graphs. The Daily History export imports
back.

## Scraping services — read this

Marketplaces show robot checks to requests from cloud servers, so pages go
through scraping services, tried in order (`SCRAPER_ORDER`, default
`firecrawl,scrapedo,custom,direct`):

1. **Firecrawl** (`FIRECRAWL_API_KEY`) — runs the page's JavaScript, so it is
   the only one that reads **Meesho**. Always a fresh page (`maxAge: 0`).
2. **Scrape.do** (`SCRAPEDO_TOKEN`) — cheap datacenter proxy first, residential
   (`super`) only when blocked. Never used for Meesho (its Akamai wall makes
   Scrape.do return the page before products load, and still charge 10 credits).
3. `custom` (`SCRAPER_API_URL`) and `direct` (free, never for Meesho).

The next one is used when a service runs out of credits (it is then skipped
for an hour), fails, is blocked, or returns a page with no products (a block
page in disguise, like Myntra's "Site Maintenance" to Firecrawl).

```bash
npm run scraper:check                                 # one page per marketplace
npm run scraper:check -- "steel bottle" meesho        # one marketplace
npm run scraper:check -- "steel bottle" --via scrapedo   # one service only
```

Check each marketplace's terms before scraping at volume.
