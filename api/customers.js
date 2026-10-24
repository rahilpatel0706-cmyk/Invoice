const { randomUUID } = require('crypto');
const { db, requireUser, assertOwner, bodyOf, ok, fail, allow } = require('./_upgrade');

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET', 'POST', 'DELETE'])) return;
  try {
    const user = await requireUser(req);
    if (req.method !== 'GET') assertOwner(user);
    if (req.method === 'GET') {
      const { data, error } = await db.from('customers').select('*').order('customer_name', { ascending: true });
      if (error) throw error;
      return ok(res, { rows: data || [] });
    }
    if (req.method === 'POST') {
      const d = bodyOf(req).data;
      if (!d || !String(d.name || '').trim()) {
        return res.status(400).json({ status: 'error', message: 'Customer name is required.' });
      }
      if (d.gstin && !/^[0-9A-Za-z]{15}$/.test(String(d.gstin))) {
        return res.status(400).json({ status: 'error', message: 'Customer GSTIN must be 15 letters/digits or blank.' });
      }
      const id = String(d.id || randomUUID());
      const value = Object.assign({}, d, { id });
      const row = {
        id, customer_name: String(d.name).trim(), mobile: d.mobile || '',
        contact_person: d.contactPerson || '', email: d.email || '',
        location: d.location || '', state_code: d.stateCode || '24', gstin: d.gstin || '', data: value
      };
      const { data, error } = await db.from('customers').upsert(row, { onConflict: 'id' }).select().single();
      if (error) throw error;
      return ok(res, { row: data });
    }
    const id = req.query.id || bodyOf(req).id;
    if (!id) return res.status(400).json({ status: 'error', message: 'Customer ID is required.' });
    const { error } = await db.from('customers').delete().eq('id', String(id));
    if (error) throw error;
    return ok(res);
  } catch (e) { return fail(res, e); }
};
