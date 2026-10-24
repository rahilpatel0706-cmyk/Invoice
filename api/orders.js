const { db, requireUser, assertOwner, bodyOf, ok, fail, allow } = require('./_upgrade');

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET', 'POST', 'DELETE'])) return;
  try {
    const user = await requireUser(req);
    if (req.method !== 'GET') assertOwner(user);
    if (req.method === 'GET') {
      const { data, error } = await db.from('order_book').select('*').order('order_date', { ascending: false });
      if (error) throw error;
      return ok(res, { rows: data || [] });
    }
    if (req.method === 'POST') {
      const d = bodyOf(req).data;
      if (!d || !d.orderNo || !d.orderDate || !d.clientName) {
        return res.status(400).json({ status: 'error', message: 'Order number, date and customer are required.' });
      }
      const row = {
        order_no: String(d.orderNo), order_date: d.orderDate, customer_name: d.clientName,
        status: d.status || 'ordered', data: d
      };
      const { data, error } = await db.from('order_book').upsert(row, { onConflict: 'order_no' }).select().single();
      if (error) throw error;
      return ok(res, { row: data });
    }
    const orderNo = req.query.orderNo || bodyOf(req).orderNo;
    if (!orderNo) return res.status(400).json({ status: 'error', message: 'Order number is required.' });
    const { error } = await db.from('order_book').delete().eq('order_no', String(orderNo));
    if (error) throw error;
    return ok(res);
  } catch (e) { return fail(res, e); }
};
