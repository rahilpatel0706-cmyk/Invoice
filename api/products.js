const { randomUUID } = require('crypto');
const { db, requireUser, assertOwner, bodyOf, ok, fail, allow } = require('./_upgrade');

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET', 'POST', 'DELETE'])) return;
  try {
    const user = await requireUser(req);
    if (req.method !== 'GET') assertOwner(user);
    if (req.method === 'GET') {
      const { data, error } = await db.from('products').select('*').order('product_name', { ascending: true });
      if (error) throw error;
      return ok(res, { rows: data || [] });
    }
    if (req.method === 'POST') {
      const d = bodyOf(req).data;
      if (!d || !String(d.name || '').trim()) {
        return res.status(400).json({ status: 'error', message: 'Product name is required.' });
      }
      const id = String(d.id || randomUUID());
      const value = Object.assign({}, d, { id, name: String(d.name).trim() });
      const row = {
        id, product_name: String(d.name).trim(), hsn: d.hsn || '', uom: d.uom || 'NOS',
        rate: Number(d.rate) || 0, gst: d.gst === undefined || d.gst === '' ? 18 : Number(d.gst) || 0,
        data: value
      };
      const { data, error } = await db.from('products').upsert(row, { onConflict: 'id' }).select().single();
      if (error) throw error;
      return ok(res, { row: data });
    }
    const id = req.query.id || bodyOf(req).id;
    if (!id) return res.status(400).json({ status: 'error', message: 'Product ID is required.' });
    const { error } = await db.from('products').delete().eq('id', String(id));
    if (error) throw error;
    return ok(res);
  } catch (e) { return fail(res, e); }
};
