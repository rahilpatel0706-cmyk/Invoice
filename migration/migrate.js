/*
  Step 13: migrate existing Google Sheets data into Supabase.

  Run locally from the project folder with:
    SUPABASE_URL="https://wtvvbhztpvunphtqsxoj.supabase.co" \
    SUPABASE_SERVICE_ROLE_KEY="PASTE_PRIVATE_KEY_LOCALLY" \
    node migration/migrate.js

  Never commit the service-role key and never paste it into chat.
*/
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOGIN_EMAIL = 'jigarenterpries@gmail.com';
const SHEET_ID = '1ZTgD57gpjDyMY0nj9-4J6qOo7wIJEsnfmmbVRSBkmB4';
const INVOICE_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Invoices`;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function csvRows(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && quoted && next === '"') { cell += '"'; i++; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { row.push(cell); cell = ''; continue; }
    if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some(value => value.trim() !== '')) rows.push(row);
  return rows;
}

function cleanDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function parseProducts(str) {
  if (!str) return [];
  return String(str).split(' ;; ').map((entry, index) => {
    const parts = {};
    const segments = entry.split(' | ');
    const description = (segments.shift() || '').trim();
    for (const segment of segments) {
      const colon = segment.indexOf(':');
      if (colon >= 0) parts[segment.slice(0, colon).trim()] = segment.slice(colon + 1).trim();
    }
    return {
      description,
      hsn: parts.HSN || null,
      quantity: Number(parts.Qty || 0),
      rate: Number(parts.Rate || 0),
      amount: Number(parts.Amt || 0),
      sort_order: index
    };
  }).filter(item => item.description);
}

function invoiceFromRow(row) {
  return {
    timestamp: row[0] || null,
    invoice_no: row[1] || '',
    invoice_date: cleanDate(row[2]),
    customer_name: row[3] || '',
    customer_mobile: row[4] || null,
    customer_location: row[5] || null,
    customer_gstin: row[6] || null,
    transport: row[7] || null,
    destination: row[8] || null,
    total_parcels: Number(row[9] || 1),
    challan_no: row[10] || null,
    buyer_po_no: row[11] || null,
    gst_type: row[12] || 'cgst_sgst',
    taxable_amount: Number(row[14] || 0),
    packing_charges: Number(row[15] || 0),
    cgst: Number(row[16] || 0),
    sgst: Number(row[17] || 0),
    igst: Number(row[18] || 0),
    grand_total: Number(row[19] || 0),
    tax_words: row[20] || null,
    notes: row[21] || null,
    products: parseProducts(row[13] || '')
  };
}

const quotations = [
  {
    timestamp: '2026-07-06T11:06:11.972Z', quotation_no: 'JE-0066/25-26', quotation_date: '2026-07-06',
    customer_name: 'Kaira Can Company Limited', customer_mobile: null, delivery_address: 'Kanjari – Gujarat',
    customer_gstin: null, kind_attention: 'Dhwanish D Gandhi', rfq_ref: null, validity: null, gst_type: 'cgst_sgst',
    subtotal: 15600, pf_type: 'included', pf_amount: 0, cgst: 1404, sgst: 1404, igst: 0, grand_total: 18408,
    amount_words: 'Rupees Eighteen Thousand Four Hundred Eight Only', terms: null,
    products: [{ hsn: '8413', description: 'SS 316 ROTARY GEAR PUMP - SXD - ½” X ½” CAPACITY : 22 LPM, HEAD : 5KG, MOTOR RATING : 0.5HP/0.37 KW 3PHASE', make: 'HITECH', quantity: 1, unit_rate: 15600, amount: 15600 }]
  },
  {
    timestamp: '2026-07-21T07:07:06.480Z', quotation_no: 'JE/26-27/124', quotation_date: '2026-07-21',
    customer_name: 'Manthena Satyanarayan Raju Charitable Trust', customer_mobile: null,
    delivery_address: '# 3-185, Amaravathi Karakatta Road\nVENKATA PALEM\nThulluru Mandal, Guntur Dist., - 522 237 Andhra Pradesh',
    customer_gstin: null, kind_attention: null, rfq_ref: null, validity: 'Firm for 10 days', gst_type: 'igst',
    subtotal: 24600, pf_type: 'extra', pf_amount: 0, cgst: 0, sgst: 0, igst: 4428, grand_total: 29028,
    amount_words: 'Rupees Twenty Nine Thousand Twenty Eight Only',
    terms: 'Payment Terms: 100% payment against the bill before dispatch\n\nWarranty Terms: 6 months warranty against any manufacturing defects\n\nDelivery: Delivery by your suggested transport.',
    products: [{ hsn: '8413', description: '3 HP Three Phase Submersible Sewage Pump with Cutter', make: 'Hitech', quantity: 1, unit_rate: 24600, amount: 24600 }]
  },
  {
    timestamp: '2026-08-01T07:35:46.009Z', quotation_no: 'JE/26-27/125', quotation_date: '2026-08-01',
    customer_name: 'Swaminarayan Engineering Works', customer_mobile: '9930544464',
    delivery_address: 'A/144, MIDC, PHASE 1, DOMBIVLI EAST, THANE 421203', customer_gstin: '27ACFFS8843L1ZF',
    kind_attention: null, rfq_ref: null, validity: 'Firm for 10 days', gst_type: 'igst', subtotal: 18300,
    pf_type: 'included', pf_amount: 0, cgst: 0, sgst: 0, igst: 3294, grand_total: 21594,
    amount_words: 'Rupees Twenty One Thousand Five Hundred Ninety Four Only', terms: null,
    products: [{ hsn: '8413', description: '1.5" X 1.5" Rotary Gear Pump with 3 HP Three Phase Motor including Base Plate and Couple', make: 'Hitech', quantity: 1, unit_rate: 18300, amount: 18300 }]
  }
];

async function getUserId() {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = (data.users || []).find(x => x.email?.toLowerCase() === LOGIN_EMAIL.toLowerCase());
    if (user) return user.id;
    if (!data.users || data.users.length < 1000) break;
    page++;
  }
  throw new Error(`Supabase Auth user not found: ${LOGIN_EMAIL}`);
}

async function migrateInvoices(userId) {
  const response = await fetch(INVOICE_CSV_URL);
  if (!response.ok) throw new Error(`Could not download invoice sheet: HTTP ${response.status}`);
  const rows = csvRows(await response.text());
  const header = rows.shift();
  if (!header || header[1] !== 'Invoice No') throw new Error('Invoice CSV header does not match the expected Invoices sheet.');

  let count = 0;
  for (const raw of rows) {
    const d = invoiceFromRow(raw);
    if (!d.invoice_no || !d.invoice_date || !d.customer_name) continue;
    const { products, timestamp, ...parentFields } = d;
    const { data: parent, error } = await supabase.from('invoices').upsert(
      { ...parentFields, user_id: userId, created_at: timestamp || undefined, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,invoice_no' }
    ).select('id').single();
    if (error) throw error;
    await supabase.from('invoice_items').delete().eq('invoice_id', parent.id);
    if (d.products.length) {
      const { error: itemError } = await supabase.from('invoice_items').insert(d.products.map(x => ({ ...x, invoice_id: parent.id })));
      if (itemError) throw itemError;
    }
    count++;
    console.log(`Invoice ${count}: ${d.invoice_no}`);
  }
  return count;
}

async function migrateQuotations(userId) {
  let count = 0;
  for (const d of quotations) {
    const { products, timestamp, ...parentFields } = d;
    const { data: parent, error } = await supabase.from('quotations').upsert(
      { ...parentFields, user_id: userId, created_at: timestamp, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,quotation_no' }
    ).select('id').single();
    if (error) throw error;
    await supabase.from('quotation_items').delete().eq('quotation_id', parent.id);
    const { error: itemError } = await supabase.from('quotation_items').insert(
      d.products.map((x, index) => ({ ...x, sort_order: index, quotation_id: parent.id }))
    );
    if (itemError) throw itemError;
    count++;
    console.log(`Quotation ${count}: ${d.quotation_no}`);
  }
  return count;
}

(async () => {
  console.log('Finding Supabase user...');
  const userId = await getUserId();
  console.log(`Using user ${userId} (${LOGIN_EMAIL})`);
  const invoices = await migrateInvoices(userId);
  const quotes = await migrateQuotations(userId);
  console.log(`\nMigration complete: ${invoices} invoices, ${quotes} quotations, 0 proformas.`);
})().catch(error => {
  console.error('\nMigration failed:', error.message || error);
  process.exit(1);
});
