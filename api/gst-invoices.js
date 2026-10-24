const { db, requireUser, assertOwner, bodyOf, ok, fail, allow } = require('./_upgrade');

module.exports = async function handler(req, res) {
  if (!allow(req, res, ['GET', 'POST', 'DELETE'])) return;
  try {
    const user = await requireUser(req);
    if (req.method !== 'GET') assertOwner(user);
    if (req.method === 'GET') {
      const { data, error } = await db.from('gst_invoices').select('*').order('invoice_date', { ascending: false });
      if (error) throw error;
      return ok(res, { rows: data || [] });
    }
    if (req.method === 'POST') {
      const d = bodyOf(req).data;
      if (!d || !d.invoiceNo || !d.invoiceDate || !d.clientName) {
        return res.status(400).json({ status: 'error', message: 'Invoice number, date and customer are required.' });
      }
      if (!/^[A-Za-z0-9\/-]{1,16}$/.test(String(d.invoiceNo))) {
        return res.status(400).json({ status: 'error', message: 'Invoice number must be at most 16 characters.' });
      }
      const row = {
        invoice_no: String(d.invoiceNo), invoice_date: d.invoiceDate, customer_name: d.clientName,
        order_no: d.orderNo || null, grand_total: Number(d.grand) || 0, data: d
      };
      const { data, error } = await db.from('gst_invoices').upsert(row, { onConflict: 'invoice_no' }).select().single();
      if (error) throw error;
      return ok(res, { row: data });
    }
    const invoiceNo = req.query.invoiceNo || bodyOf(req).invoiceNo;
    if (!invoiceNo) return res.status(400).json({ status: 'error', message: 'Invoice number is required.' });
    const { error } = await db.from('gst_invoices').delete().eq('invoice_no', String(invoiceNo));
    if (error) throw error;
    return ok(res);
  } catch (e) { return fail(res, e); }
};
