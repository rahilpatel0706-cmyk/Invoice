const { createClient } = require('@supabase/supabase-js');

function getAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server environment variables are missing.');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function requireUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    const err = new Error('Missing authentication token.');
    err.status = 401;
    throw err;
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    const err = new Error('Invalid or expired authentication token.');
    err.status = 401;
    throw err;
  }

  return { supabase, user: data.user };
}

function send(res, status, body) {
  res.status(status).json(body);
}

function methodNotAllowed(res) {
  res.setHeader('Allow', 'GET,POST,DELETE');
  return send(res, 405, { status: 'error', message: 'Method not allowed.' });
}

module.exports = { getAdminClient, requireUser, send, methodNotAllowed };
