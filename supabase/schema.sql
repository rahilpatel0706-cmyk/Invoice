-- Jigar Enterprise Invoice System
-- Step 9 database schema
-- Run this in Supabase Dashboard -> SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  invoice_no text not null,
  invoice_date date not null,
  customer_name text not null,
  customer_mobile text,
  customer_location text,
  customer_gstin text,
  transport text,
  destination text,
  total_parcels integer default 1,
  challan_no text,
  buyer_po_no text,
  gst_type text not null default 'cgst_sgst',
  taxable_amount numeric(14,2) default 0,
  packing_charges numeric(14,2) default 0,
  cgst numeric(14,2) default 0,
  sgst numeric(14,2) default 0,
  igst numeric(14,2) default 0,
  grand_total numeric(14,2) default 0,
  tax_words text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, invoice_no)
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  hsn text,
  quantity numeric(14,3) default 0,
  rate numeric(14,2) default 0,
  amount numeric(14,2) default 0,
  sort_order integer default 0
);

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  quotation_no text not null,
  quotation_date date not null,
  customer_name text not null,
  customer_mobile text,
  delivery_address text,
  customer_gstin text,
  kind_attention text,
  rfq_ref text,
  validity text,
  gst_type text not null default 'cgst_sgst',
  subtotal numeric(14,2) default 0,
  pf_type text default 'included',
  pf_amount numeric(14,2) default 0,
  cgst numeric(14,2) default 0,
  sgst numeric(14,2) default 0,
  igst numeric(14,2) default 0,
  grand_total numeric(14,2) default 0,
  amount_words text,
  terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, quotation_no)
);

create table if not exists public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  hsn text,
  description text not null,
  make text,
  unit_rate numeric(14,2) default 0,
  quantity numeric(14,3) default 0,
  amount numeric(14,2) default 0,
  sort_order integer default 0
);

create table if not exists public.proformas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  proforma_no text not null,
  proforma_date date not null,
  buyer_name text not null,
  buyer_address text,
  buyer_phone text,
  buyer_email text,
  buyer_tax_id text,
  shipment_mode text,
  port_of_loading text,
  port_of_discharge text,
  fob_total numeric(14,2) default 0,
  freight numeric(14,2) default 0,
  insurance numeric(14,2) default 0,
  cif_total numeric(14,2) default 0,
  amount_words text,
  payment_clause text,
  incoterms_clause text,
  guarantee_clause text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, proforma_no)
);

create table if not exists public.proforma_items (
  id uuid primary key default gen_random_uuid(),
  proforma_id uuid not null references public.proformas(id) on delete cascade,
  hsn text,
  description text not null,
  details text,
  unit_price numeric(14,2) default 0,
  quantity numeric(14,3) default 0,
  amount numeric(14,2) default 0,
  sort_order integer default 0
);

-- Row Level Security
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.proformas enable row level security;
alter table public.proforma_items enable row level security;

-- Parent-table policies
create policy "users manage own invoices"
on public.invoices for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users manage own quotations"
on public.quotations for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users manage own proformas"
on public.proformas for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Child-table policies
create policy "users manage own invoice items"
on public.invoice_items for all
using (exists (
  select 1 from public.invoices i
  where i.id = invoice_id and i.user_id = auth.uid()
))
with check (exists (
  select 1 from public.invoices i
  where i.id = invoice_id and i.user_id = auth.uid()
));

create policy "users manage own quotation items"
on public.quotation_items for all
using (exists (
  select 1 from public.quotations q
  where q.id = quotation_id and q.user_id = auth.uid()
))
with check (exists (
  select 1 from public.quotations q
  where q.id = quotation_id and q.user_id = auth.uid()
));

create policy "users manage own proforma items"
on public.proforma_items for all
using (exists (
  select 1 from public.proformas p
  where p.id = proforma_id and p.user_id = auth.uid()
))
with check (exists (
  select 1 from public.proformas p
  where p.id = proforma_id and p.user_id = auth.uid()
));
