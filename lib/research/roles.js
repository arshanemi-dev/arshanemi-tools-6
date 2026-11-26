// The one role rule, with no framework imports (so plain-Node code and the
// tests can use it): the master admin sees everything and is never charged.
// lib/research/access.js re-exports it for the routes.
export const isAdmin = (payload) => payload?.role === 'master_admin';
