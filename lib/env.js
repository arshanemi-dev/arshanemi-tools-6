import Joi from 'joi'

// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for SERVER-SIDE environment variables.
//
// Server modules import `env` from here instead of reading process.env
// directly, so the app fails fast at boot with a readable list of what's
// missing/wrong, defaults live in one place, and types are coerced once.
//
// NOT covered here (must keep reading process.env directly):
//   • proxy.js  — Edge/middleware runtime, Joi is Node-only.
//   • every NEXT_PUBLIC_* var — inlined by Next at build time; used from
//     client components and shared libs that can't import a Node module.
//   • scripts/*.mjs — standalone CLIs.
// ─────────────────────────────────────────────────────────────────────────────

const bool = () => Joi.boolean().truthy('1').falsy('0')

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

  // Auth (JWT) — shared with the root admin panel in connect mode.
  JWT_SECRET: Joi.string().min(1).required(),
  JWT_REFRESH_SECRET: Joi.string().optional(),

  // Blob storage namespace + token.
  TOOLS_NAME: Joi.string().default('barmeto-tools-dashboard'),
  BLOB_READ_WRITE_TOKEN: Joi.string().optional(),
  BLOB_STORE_ID: Joi.string().optional(),

  // Scraping services (lib/scraper/fetchPage.js), tried in SCRAPER_ORDER;
  // one without a key is skipped. FIRECRAWL_API_KEY → Firecrawl,
  // SCRAPEDO_TOKEN → Scrape.do (SCRAPEDO_SUPER: auto = residential proxies
  // only when blocked, always, never).
  FIRECRAWL_API_KEY: Joi.string().optional(),
  SCRAPEDO_TOKEN: Joi.string().optional(),
  SCRAPEDO_SUPER: Joi.string().valid('auto', 'always', 'never').default('auto'),
  SCRAPER_ORDER: Joi.string().pattern(/^[a-z]+(\s*,\s*[a-z]+)*$/).default('firecrawl,scrapedo,custom,direct'),
  // Custom service (lib/scraper/fetchPage.js). SCRAPER_API_URL = a scraping-API URL
  // template with {url} in it (ScrapingBee / ScraperAPI / Bright Data …);
  // unset = direct requests. SCRAPER_API_URL_<MARKETPLACE> overrides it for
  // one marketplace (e.g. JS rendering only for Meesho — it costs 5× more).
  // SCRAPER_TIMEOUT_MS = per page.
  SCRAPER_API_URL: Joi.string().pattern(/\{url\}/).optional(),
  SCRAPER_API_URL_AMAZON: Joi.string().pattern(/\{url\}/).optional(),
  SCRAPER_API_URL_FLIPKART: Joi.string().pattern(/\{url\}/).optional(),
  SCRAPER_API_URL_MEESHO: Joi.string().pattern(/\{url\}/).optional(),
  SCRAPER_API_URL_MYNTRA: Joi.string().pattern(/\{url\}/).optional(),
  SCRAPER_API_URL_SNAPDEAL: Joi.string().pattern(/\{url\}/).optional(),
  SCRAPER_TIMEOUT_MS: Joi.number().integer().min(5000).default(45000),
  // GET /api/cron/refresh — Vercel Cron sends "Authorization: Bearer <CRON_SECRET>".
  CRON_SECRET: Joi.string().optional(),

  // SMTP (email).
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: bool().default(false),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  COMPANY_EMAIL_TO: Joi.string().optional(),

  // MSG91 (SMS OTP).
  MSG91_AUTH_KEY: Joi.string().optional(),
  MSG91_TEMPLATE_ID: Joi.string().optional(),
  MSG91_OTP_VAR_NAME: Joi.string().default('VAR1'),
  MSG91_DEFAULT_COUNTRY_CODE: Joi.string().default('91'),

  // Consumed only by proxy.js (Edge, raw process.env) — declared here so a
  // bad value is still caught at boot.
  ALLOWED_ORIGINS: Joi.string().default('http://localhost:3001'),
})

const source = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== undefined && v !== '')
)


const { value, error } = schema.validate(source, {
  abortEarly: false,
  stripUnknown: true,
  convert: true,
})

if (error) {
  const details = error.details.map((d) => `  • ${d.message}`).join('\n')
  throw new Error(`Invalid environment configuration:\n${details}\n`)
}

export const env = Object.freeze(value)
export default env
