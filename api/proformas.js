const { requireUser, send, methodNotAllowed } = require('./_supabase');

function item(value, index) {
  return {
    hsn: value.hsn || null,
    description: String(value.description ?? value.desc ?? '').trim(),
    details: value.details ?? value.note ?? null,
    unit_price: Number(value.unit_price ?? value.rate ?? 0),
    quantity: Number(value.quantity ?? value.qty ?? 0),
    amount: Number(value.amount ?? value.amt ?? 0),
    sort_order: index
  };
}

async function list(supabase, userId) {
  const { data, error } = await supabase.from('proformas')
    .select('*, proforma_items(*)').eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(row => ({
    ...row,
    products: (row.proforma_items || []).sort((a, b) => a.sort_order - b.sort_order)
  }));
}

async function save(supabase, userId, body) {
  const d = body.data || body;
  const number = String(d.proforma_no ?? d.profNo ?? '').trim();
  if (!number) throw new Error('Proforma number is required.');
  const record = {
    user_id: userId,
    proforma_no: number,
    proforma_date: d.proforma_date ?? d.date,
    buyer_name: d.buyer_name ?? d.bname,
    buyer_address: d.buyer_address ?? d.baddr ?? null,
    buyer_phone: d.buyer_phone ?? d.bphone ?? null,
    buyer_email: d.buyer_email ?? d.bemail ?? null,
    buyer_tax_id: d.buyer_tax_id ?? d.btax ?? null,
    shipment_mode: d.shipment_mode ?? d.mode ?? null,
    port_of_loading: d.port_of_loading ?? d.pol ?? null,
    port_of_discharge: d.port_of_discharge ?? d.pod ?? null,
    fob_total: Number(d.fob_total ?? d.fob ?? 0),
    freight: Number(d.freight ?? 0),
    insurance: Number(d.insurance ?? d.ins ?? 0),
    cif_total: Number(d.cif_total ?? d.cif ?? 0),
    amount_words: d.amount_words ?? d.amtWords ?? null,
    payment_clause: d.payment_clause ?? d.pay ?? null,
    incoterms_clause: d.incoterms_clause ?? d.inco ?? null,
    guarantee_clause: d.guarantee_clause ?? d.guar ?? null,
    updated_at: new Date().toISOString()
  };
  const { data: proforma, error } = await supabase.from('proformas')
    .upsert(record, { onConflict: 'user_id,proforma_no' }).select('id').single();
  if (error) throw error;
  await supabase.from('proforma_items').delete().eq('proforma_id', proforma.id);
  const items = (d.products || d.items || []).map(item).filter(x => x.description);
  if (items.length) {
    const { error: itemError } = await supabase.from('proforma_items')
      .insert(items.map(x => ({ ...x, proforma_id: proforma.id })));
    if (itemError) throw itemError;
  }
}

async function remove(supabase, userId, body) {
  const number = String(body.proforma_no ?? body.profNo ?? '').trim();
  if (!number) throw new Error('Proforma number is required.');
  const { error } = await supabase.from('proformas').delete()
    .eq('user_id', userId).eq('proforma_no', number);
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
