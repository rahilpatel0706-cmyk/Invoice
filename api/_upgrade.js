// Shared server-only helpers for the new Vercel routes.
// Required environment variables (never expose the service key in index.html):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in Vercel.');
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function requireUser(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw Object.assign(new Error('Sign in required.'), { statusCode: 401 });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data || !data.user) throw Object.assign(new Error('Your session has expired.'), { statusCode: 401 });
  return data.user;
}
const OWNER_EMAIL = String(process.env.OWNER_EMAIL || 'jigarenterpries@gmail.com').toLowerCase();
function assertOwner(user) {
  if (!user || String(user.email || '').toLowerCase() !== OWNER_EMAIL) {
    throw Object.assign(new Error('Read-only login: only the owner can make changes.'), { statusCode: 403 });
  }
  return user;
}
async function requireOwner(req) { return assertOwner(await requireUser(req)); }
function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  return req.body;
}
function ok(res, payload) { return res.status(200).json(Object.assign({ status: 'ok' }, payload || {})); }
function fail(res, error) {
  const status = error.statusCode || 500;
  return res.status(status).json({ status: 'error', message: error.message || 'Server request failed.' });
}
function allow(req, res, methods) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
  if (!methods.includes(req.method)) {
    res.status(405).json({ status: 'error', message: 'Method not allowed.' }); return false;
  }
  return true;
}
module.exports = { db, requireUser, requireOwner, assertOwner, bodyOf, ok, fail, allow };
