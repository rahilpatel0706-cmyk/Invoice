const { requireUser, send, methodNotAllowed } = require('./_supabase');

function itemFromPayload(item, index) {
  return {
    description: String(item.description ?? item.desc ?? '').trim(),
    hsn: item.hsn || null,
    quantity: Number(item.quantity ?? item.qty ?? 0),
    rate: Number(item.rate ?? 0),
    amount: Number(item.amount ?? item.amt ?? 0),
    sort_order: index
  };
}

async function listInvoices(supabase, userId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, invoice_items(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(row => ({
    ...row,
    products: (row.invoice_items || []).sort((a, b) => a.sort_order - b.sort_order)
  }));
}

async function saveInvoice(supabase, userId, body) {
  const d = body.data || body;
  const number = String(d.invoice_no ?? d.invoiceNo ?? '').trim();
  if (!number) throw new Error('Invoice number is required.');

  const record = {
    user_id: userId,
    invoice_no: number,
    invoice_date: d.invoice_date ?? d.invoiceDate,
    customer_name: d.customer_name ?? d.clientName,
    customer_mobile: d.customer_mobile ?? d.clientMobile ?? null,
    customer_location: d.customer_location ?? d.clientLocation ?? null,
    customer_gstin: d.customer_gstin ?? d.clientGstin ?? null,
    transport: d.transport ?? null,
    destination: d.destination ?? null,
    total_parcels: Number(d.total_parcels ?? d.parcels ?? 1),
    challan_no: d.challan_no ?? d.challan ?? null,
    buyer_po_no: d.buyer_po_no ?? d.po ?? null,
    gst_type: d.gst_type ?? d.gstType ?? 'cgst_sgst',
    taxable_amount: Number(d.taxable_amount ?? d.taxable ?? 0),
    packing_charges: Number(d.packing_charges ?? d.packing ?? 0),
    cgst: Number(d.cgst ?? 0),
    sgst: Number(d.sgst ?? 0),
    igst: Number(d.igst ?? 0),
    grand_total: Number(d.grand_total ?? d.grand ?? 0),
    tax_words: d.tax_words ?? d.taxWords ?? null,
    notes: d.notes ?? null,
    updated_at: new Date().toISOString()
  };

  const { data: invoice, error } = await supabase
    .from('invoices')
    .upsert(record, { onConflict: 'user_id,invoice_no' })
    .select('id')
    .single();
  if (error) throw error;

  await supabase.from('invoice_items').delete().eq('invoice_id', invoice.id);
  const items = (d.products || d.items || []).map(itemFromPayload)
    .filter(item => item.description);
  if (items.length) {
    const { error: itemError } = await supabase
      .from('invoice_items')
      .insert(items.map(item => ({ ...item, invoice_id: invoice.id })));
    if (itemError) throw itemError;
  }
  return invoice;
}

async function deleteInvoice(supabase, userId, body) {
  const number = String(body.invoice_no ?? body.invoiceNo ?? '').trim();
  if (!number) throw new Error('Invoice number is required.');
  const { error } = await supabase.from('invoices')
    .delete().eq('user_id', userId).eq('invoice_no', number);
  if (error) throw error;
}

module.exports = async function handler(req, res) {
  try {
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) return methodNotAllowed(res);
    const { supabase, user } = await requireUser(req);

    if (req.method === 'GET') return send(res, 200, { status: 'ok', rows: await listInvoices(supabase, user.id) });
    if (req.method === 'DELETE') {
      await deleteInvoice(supabase, user.id, req.body || {});
      return send(res, 200, { status: 'ok' });
    }
    await saveInvoice(supabase, user.id, req.body || {});
    return send(res, 200, { status: 'ok' });
  } catch (error) {
    console.error(error);
    return send(res, error.status || 500, { status: 'error', message: error.message || 'Server error.' });
  }
};
