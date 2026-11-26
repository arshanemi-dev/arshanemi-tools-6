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
| `/product-research` (home) | every signed-in user | **Entries ▾** — pick several (up to 10): ONLY the user's saved entries, nothing ticked when the page opens; the ticked ones show together in the **Daily History** table, with an Entry column when there are several. Each row's **Details** opens that product's history window: **3 Days / 1 Week / 15 Days** (a column per day — the latest + the days before), **1 Month** (Week 1 … Week 5), **All Time** (a column per month); rows Rank, Price, Reviews, Reviews gained, Rating, Bought, Days tracked with **Average** and **Total**; a chart of any of them with its straight trend line, Growth (first → last) and Trend angle (`lib/research/history.js`). **Add Entries** (to My Entries). Date, Excel, PDF. A ticked entry that's Expired shows its Renew card — or, next to others that are paid, a small Renew button above the table. |
| `/product-research/my-entries` (My Entries) | every signed-in user, their own list | Every entry in a table (market place, category, pages, plan — paid till / Expired —, on my list or not) with **Add · 5,000/mo**, **Renew** or **Remove** on each row, or tick several → Add / Renew / Remove ticked. The list shows as chips on top. See **Billing** below. |
| `/product-research/new-search` | **master admin only** (checked by the server; nothing is drawn until it says yes) | Add an entry: **1** market place → **2** category (name = `marketplace_category`, unique) → **3** the one link to read (empty = the market place's search) → **4** pages + Daily on/off → Add & search. **All entries** table: tick several → Search now / Delete; a **Daily** switch on every row (off = never read automatically). Click a name for its **Products** (cards, line chart, table, Details). Storage tools. |

Old addresses `/product-research/settings` and `/products` redirect to New Search.
The navbar has Product Research and (signed in) My Entries; New Search is in the master admin's account menu.
With the header hidden (embedded), My Entries is reached from Entries ▾ › Manage my entries.

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

**Products / Page.** Every Search records what each page gave (listed, new,
ads). The New Search table shows it on every row, filled in by the Search
itself: `p1 48 · p2 52 · p3 57 = 157` (the new products each page added, then
the total). `ended` = the results ran out there, `–` = not read, red ✕ = the
page couldn't be read, amber ⚠ = a page that listed under half of the fullest
page while a later page still had more (it probably didn't load fully).
**Tick N with a bad page** ticks just those entries, so Search reads again
only what needs it. Rules: `lib/research/pageCounts.js`.

**Tracking.** A track = marketplace + keyword + page range, shared by every
user who searches it (one scrape a day serves all). Each day's snapshot is
stored per product (`rank, page, price, MRP, rating, reviews, ad`). Vercel
Cron calls `/api/cron/refresh` daily (`vercel.json`); opening a search that
hasn't been read today also refreshes it (free).

**Billing** (`data/billing.js`). Login is required and nothing is free —
only the master admin (who adds and reads entries) is never charged. Each
entry a user adds on My Entries is paid **a month at a time**: 1 ×
`pr-entry-month` (5000 coins in the Tools Catalog; the windows show the live
price) when added, then again every month while it's on their list.

| What | Coins | Window |
|---|---|---|
| Add (on My Entries) | a month per entry not paid right now — one charge for the whole click, all or nothing | confirm → **Coins used** (paid till, wallet left) |
| Monthly renewal | a month per entry whose month ran out — charged on the user's first visit after it ends (either page), one charge per entry | **Monthly renewal — coins used** |
| Too few coins | nothing is added; a renewal that can't be paid turns the entry **Expired** (never into debt) | the hub's **Not Enough Coins → Add Now** |
| Renew (an Expired one) | a month | confirm → **Coins used** |
| Remove | stops the renewals — the month already paid isn't refunded; adding it back inside that month is free | confirm |

A charge is never made twice: Add's key = user + click + entries, a renewal's
= user + entry + the month that ran out. Per user in `research/users/<id>`:
`myEntries` (the list) + `plans` (`paidUntil`, `autoRenew` per entry) — rules
in `lib/research/plans.js` (pure) and `lib/research/subscriptions.js`
(charging). In the admin panel run `npm run db:sync-product-research` once to
add the tool + the `pr-entry-month` feature to the catalog and grant it to
users — until then every Add is refused (feature unavailable).

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
