const { db, requireUser, assertOwner, bodyOf, ok, fail, allow } = require('./_upgrade');

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET', 'POST'])) return;
  try {
    const user = await requireUser(req);
    if (req.method !== 'GET') assertOwner(user);
    if (req.method === 'GET') {
      const key = req.query.key || 'company';
      const { data, error } = await db.from('app_settings').select('value').eq('key', key).maybeSingle();
      if (error) throw error;
      return ok(res, { value: data ? data.value : null });
    }
    const body = bodyOf(req);
    const key = body.key || 'company';
    if (!body.value || typeof body.value !== 'object') {
      return res.status(400).json({ status: 'error', message: 'A settings object is required.' });
    }
    const { data, error } = await db.from('app_settings').upsert({ key, value: body.value }, { onConflict: 'key' }).select().single();
    if (error) throw error;
    return ok(res, { row: data });
  } catch (e) { return fail(res, e); }
};
