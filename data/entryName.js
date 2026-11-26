// An entry's name: "<marketplace>_<category>" — e.g. "flipkart_cotton-kurti".
// Shared by the server (lib/research/entries.js, the real check) and the
// admin's form (live preview + "already exists"), so both always agree.
export const slugify = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
export const entryName = (platform, category) => `${platform}_${slugify(category) || 'items'}`;
