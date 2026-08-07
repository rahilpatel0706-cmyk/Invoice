const { requireUser, send, methodNotAllowed } = require('./_supabase');

function item(item, index) {
  return {
    hsn: item.hsn || null,
    description: String(item.description ?? item.desc ?? '').trim(),
    make: item.make || null,
    unit_rate: Number(item.unit_rate ?? item.rate ?? 0),
    quantity: Number(item.quantity ?? item.qty ?? 0),
    amount: Number(item.amount ?? item.amt ?? 0),
    sort_order: index
  };
}

async function list(supabase, userId) {
  const { data, error } = await supabase.from('quotations')
    .select('*, quotation_items(*)').eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(row => ({
    ...row,
    products: (row.quotation_items || []).sort((a, b) => a.sort_order - b.sort_order)
  }));
}

async function save(supabase, userId, body) {
  const d = body.data || body;
  const number = String(d.quotation_no ?? d.quotNo ?? '').trim();
  if (!number) throw new Error('Quotation number is required.');
  const record = {
    user_id: userId,
    quotation_no: number,
    quotation_date: d.quotation_date ?? d.date,
    customer_name: d.customer_name ?? d.cname,
    customer_mobile: d.customer_mobile ?? d.cmobile ?? null,
    delivery_address: d.delivery_address ?? d.addr ?? null,
    customer_gstin: d.customer_gstin ?? d.cgstin ?? null,
    kind_attention: d.kind_attention ?? d.attn ?? null,
    rfq_ref: d.rfq_ref ?? d.rfq ?? null,
    validity: d.validity ?? null,
    gst_type: d.gst_type ?? d.gstType ?? 'cgst_sgst',
    subtotal: Number(d.subtotal ?? 0),
    pf_type: d.pf_type ?? d.pfType ?? 'included',
    pf_amount: Number(d.pf_amount ?? d.pfAmt ?? 0),
    cgst: Number(d.cgst ?? 0), sgst: Number(d.sgst ?? 0), igst: Number(d.igst ?? 0),
    grand_total: Number(d.grand_total ?? d.grand ?? 0),
    amount_words: d.amount_words ?? d.amtWords ?? null,
    terms: d.terms ?? null,
    updated_at: new Date().toISOString()
  };
  const { data: quote, error } = await supabase.from('quotations')
    .upsert(record, { onConflict: 'user_id,quotation_no' }).select('id').single();
  if (error) throw error;
  await supabase.from('quotation_items').delete().eq('quotation_id', quote.id);
  const items = (d.products || d.items || []).map(item).filter(x => x.description);
  if (items.length) {
    const { error: itemError } = await supabase.from('quotation_items')
      .insert(items.map(x => ({ ...x, quotation_id: quote.id })));
    if (itemError) throw itemError;
  }
}

async function remove(supabase, userId, body) {
  const number = String(body.quotation_no ?? body.quotNo ?? '').trim();
  if (!number) throw new Error('Quotation number is required.');
  const { error } = await supabase.from('quotations').delete()
    .eq('user_id', userId).eq('quotation_no', number);
  if (error) throw error;
}

module.exports = async function handler(req, res) {
  try {
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) return methodNotAllowed(res);
    const { supabase, user } = await requireUser(req);
    if (req.method === 'GET') return send(res, 200, { status: 'ok', rows: await list(supabase, user.id) });
    if (req.method === 'DELETE') { await remove(supabase, user.id, req.body || {}); return send(res, 200, { status: 'ok' }); }
    await save(supabase, user.id, req.body || {});
    return send(res, 200, { status: 'ok' });
  } catch (error) {
    console.error(error);
    return send(res, error.status || 500, { status: 'error', message: error.message || 'Server error.' });
  }
};
