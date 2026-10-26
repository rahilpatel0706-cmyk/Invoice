-- ============================================================================
-- JIGAR ENTERPRISE — ADDITIVE SUPABASE MIGRATION
-- Order Book + Customer & Product Directories + Formal GST Invoice + Settings
-- ============================================================================
-- Run this whole file in Supabase SQL Editor using the existing project.
-- It is safe to run again after a previous version of this upgrade.
--
-- DATA-SAFETY RULES IN THIS FILE:
--   * No DROP TABLE, TRUNCATE, or DELETE statements.
--   * Existing invoices, quotations, proformas and their columns are not changed.
--   * New columns are added only with ADD COLUMN IF NOT EXISTS.
--   * Existing customer/product-master rows are never overwritten by backfill.
--   * Backfill reads legacy records and inserts missing customer/product names only.
--   * Original legacy documents remain in their original tables; the customer
--     directory links/displays them rather than moving or deleting them.
--
-- Take a normal Supabase backup before any production migration as good practice.
-- ============================================================================

create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- 1. New tables. IF NOT EXISTS leaves tables and all existing rows untouched.
-- --------------------------------------------------------------------------
create table if not exists public.order_book (
  id text primary key default gen_random_uuid()::text,
  order_no text not null unique,
  order_date date not null,
  customer_name text not null,
  status text not null default 'ordered'
    check (status in ('ordered','manufacturing','ready','dispatched','delivered','cancelled')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id text primary key default gen_random_uuid()::text,
  customer_name text not null,
  mobile text not null default '',
  contact_person text not null default '',
  email text not null default '',
  location text not null default '',
  state_code text not null default '24',
  gstin text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key default gen_random_uuid()::text,
  product_name text not null,
  hsn text not null default '',
  uom text not null default 'NOS',
  rate numeric(16,2) not null default 0,
  gst numeric(5,2) not null default 18,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gst_invoices (
  invoice_no text primary key,
  invoice_date date not null,
  customer_name text not null,
  order_no text,
  grand_total numeric(16,2) not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- 2. Additive column upgrades for an earlier installation of this upgrade.
--    These statements do not rebuild a table and do not remove existing data.
-- --------------------------------------------------------------------------
alter table public.order_book add column if not exists id text;
alter table public.order_book add column if not exists order_no text;
alter table public.order_book add column if not exists order_date date;
alter table public.order_book add column if not exists customer_name text;
alter table public.order_book add column if not exists status text default 'ordered';
alter table public.order_book add column if not exists data jsonb default '{}'::jsonb;
alter table public.order_book add column if not exists created_at timestamptz default now();
alter table public.order_book add column if not exists updated_at timestamptz default now();

alter table public.customers add column if not exists id text;
alter table public.customers add column if not exists customer_name text;
alter table public.customers add column if not exists mobile text default '';
alter table public.customers add column if not exists contact_person text default '';
alter table public.customers add column if not exists email text default '';
alter table public.customers add column if not exists location text default '';
alter table public.customers add column if not exists state_code text default '24';
alter table public.customers add column if not exists gstin text default '';
alter table public.customers add column if not exists data jsonb default '{}'::jsonb;
alter table public.customers add column if not exists created_at timestamptz default now();
alter table public.customers add column if not exists updated_at timestamptz default now();

alter table public.products add column if not exists id text;
alter table public.products add column if not exists product_name text;
alter table public.products add column if not exists hsn text default '';
alter table public.products add column if not exists uom text default 'NOS';
alter table public.products add column if not exists rate numeric(16,2) default 0;
alter table public.products add column if not exists gst numeric(5,2) default 18;
alter table public.products add column if not exists data jsonb default '{}'::jsonb;
alter table public.products add column if not exists created_at timestamptz default now();
alter table public.products add column if not exists updated_at timestamptz default now();

alter table public.gst_invoices add column if not exists invoice_no text;
alter table public.gst_invoices add column if not exists invoice_date date;
alter table public.gst_invoices add column if not exists customer_name text;
alter table public.gst_invoices add column if not exists order_no text;
alter table public.gst_invoices add column if not exists grand_total numeric(16,2) default 0;
alter table public.gst_invoices add column if not exists data jsonb default '{}'::jsonb;
alter table public.gst_invoices add column if not exists created_at timestamptz default now();
alter table public.gst_invoices add column if not exists updated_at timestamptz default now();

alter table public.app_settings add column if not exists key text;
alter table public.app_settings add column if not exists value jsonb default '{}'::jsonb;
alter table public.app_settings add column if not exists updated_at timestamptz default now();

-- --------------------------------------------------------------------------
-- 3. Indexes. The optional duplicate check prevents a failed migration if an
--    older customer table already contains duplicate names. No rows are removed.
-- --------------------------------------------------------------------------
create index if not exists customers_location_idx on public.customers(location);
create index if not exists customers_mobile_idx on public.customers(mobile);
create index if not exists customers_gstin_idx on public.customers(gstin);
create index if not exists products_hsn_idx on public.products(hsn);
create index if not exists products_name_lookup_idx on public.products(lower(product_name));
create index if not exists order_book_date_idx on public.order_book(order_date desc);
create index if not exists order_book_status_idx on public.order_book(status);
create index if not exists gst_invoices_date_idx on public.gst_invoices(invoice_date desc);
create index if not exists gst_invoices_order_idx on public.gst_invoices(order_no);

do $$
begin
  if to_regclass('public.customers_name_idx') is null then
    if not exists (
      select 1 from (
        select lower(btrim(customer_name)) as normalized_name
        from public.customers
        group by lower(btrim(customer_name))
        having count(*) > 1
      ) duplicates
    ) then
      create unique index customers_name_idx on public.customers(lower(customer_name));
    else
      -- Preserve duplicates for later owner review; the app will still show them.
      create index if not exists customers_name_lookup_idx
        on public.customers(lower(customer_name));
      raise notice 'Duplicate customer names were preserved. Review them in Customer Directory; no unique name index was forced.';
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.products_name_idx') is null then
    if not exists (
      select 1 from (
        select lower(btrim(product_name)) as normalized_name
        from public.products
        group by lower(btrim(product_name))
        having count(*) > 1
      ) duplicates
    ) then
      create unique index products_name_idx on public.products(lower(product_name));
    else
      raise notice 'Duplicate product names were preserved. Review them in Product Directory; no unique name index was forced.';
    end if;
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 4. Updated-at triggers. Existing triggers are left in place; no tables or
--    rows are dropped. The function is only for the new upgrade tables.
-- --------------------------------------------------------------------------
create or replace function public.je_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname='customers_updated_at' and tgrelid='public.customers'::regclass and not tgisinternal) then
    create trigger customers_updated_at before update on public.customers
      for each row execute function public.je_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname='products_updated_at' and tgrelid='public.products'::regclass and not tgisinternal) then
    create trigger products_updated_at before update on public.products
      for each row execute function public.je_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname='order_book_updated_at' and tgrelid='public.order_book'::regclass and not tgisinternal) then
    create trigger order_book_updated_at before update on public.order_book
      for each row execute function public.je_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname='gst_invoices_updated_at' and tgrelid='public.gst_invoices'::regclass and not tgisinternal) then
    create trigger gst_invoices_updated_at before update on public.gst_invoices
      for each row execute function public.je_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname='app_settings_updated_at' and tgrelid='public.app_settings'::regclass and not tgisinternal) then
    create trigger app_settings_updated_at before update on public.app_settings
      for each row execute function public.je_set_updated_at();
  end if;
end $$;

alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.order_book enable row level security;
alter table public.gst_invoices enable row level security;
alter table public.app_settings enable row level security;

-- The browser uses authenticated Vercel routes. No public table policies are
-- added here. Existing policies on other tables are not changed.

-- --------------------------------------------------------------------------
-- 5. Additive backfill from formal GST invoices (richest customer/shipping data).
--    Existing customer names are left exactly as they are.
-- --------------------------------------------------------------------------
with source as (
  select distinct on (lower(btrim(coalesce(nullif(data->>'clientName',''),customer_name))))
    btrim(coalesce(nullif(data->>'clientName',''),customer_name)) as name,
    coalesce(data->>'clientMobile','') as mobile,
    coalesce(data->>'clientLocation','') as location,
    coalesce(nullif(data->>'clientState',''),'24') as state_code,
    coalesce(data->>'clientGstin','') as gstin,
    jsonb_build_object(
      'name',btrim(coalesce(nullif(data->>'clientName',''),customer_name)),
      'mobile',coalesce(data->>'clientMobile',''),
      'location',coalesce(data->>'clientLocation',''),
      'stateCode',coalesce(nullif(data->>'clientState',''),'24'),
      'gstin',coalesce(data->>'clientGstin',''),
      'address',coalesce(data->>'clientAddress',''),
      'transport',coalesce(data->>'transport',''),
      'destination',coalesce(data->>'placeOfSupply',''),
      'shipSame',case when data->>'shipSame'='false' then false else true end,
      'shipName',coalesce(nullif(data->>'shipName',''),data->>'clientName',''),
      'shipMobile',coalesce(nullif(data->>'shipMobile',''),data->>'clientMobile',''),
      'shipLocation',coalesce(nullif(data->>'shipLocation',''),data->>'clientLocation',''),
      'shipState',coalesce(nullif(data->>'shipState',''),data->>'clientState','24'),
      'shipGstin',coalesce(nullif(data->>'shipGstin',''),data->>'clientGstin',''),
      'shipAddress',coalesce(nullif(data->>'shipAddress',''),data->>'clientAddress',''),
      'source','gst_invoices',
      'legacyRefs',jsonb_build_array(invoice_no)
    ) as customer_data
  from public.gst_invoices
  where btrim(coalesce(nullif(data->>'clientName',''),customer_name,''))<>''
  order by lower(btrim(coalesce(nullif(data->>'clientName',''),customer_name))), updated_at desc nulls last, created_at desc nulls last
)
insert into public.customers (customer_name,mobile,location,state_code,gstin,data)
select s.name,s.mobile,s.location,s.state_code,s.gstin,s.customer_data
from source s
where not exists (select 1 from public.customers c where lower(btrim(c.customer_name))=lower(btrim(s.name)))
on conflict do nothing;

-- --------------------------------------------------------------------------
-- 6. Additive backfill from the order book.
-- --------------------------------------------------------------------------
with source as (
  select distinct on (lower(btrim(coalesce(nullif(data->>'clientName',''),customer_name))))
    btrim(coalesce(nullif(data->>'clientName',''),customer_name)) as name,
    coalesce(data->>'clientMobile','') as mobile,
    coalesce(data->>'clientLocation','') as location,
    coalesce(nullif(data->>'clientState',''),'24') as state_code,
    coalesce(data->>'clientGstin','') as gstin,
    jsonb_build_object(
      'name',btrim(coalesce(nullif(data->>'clientName',''),customer_name)),
      'mobile',coalesce(data->>'clientMobile',''),
      'location',coalesce(data->>'clientLocation',''),
      'stateCode',coalesce(nullif(data->>'clientState',''),'24'),
      'gstin',coalesce(data->>'clientGstin',''),
      'address',coalesce(data->>'clientAddress',''),
      'transport',coalesce(data->>'transport',''),
      'destination',coalesce(data->>'destination',''),
      'notes',coalesce(data->>'notes',''),
      'shipSame',true,
      'source','order_book',
      'legacyRefs',jsonb_build_array(order_no)
    ) as customer_data
  from public.order_book
  where btrim(coalesce(nullif(data->>'clientName',''),customer_name,''))<>''
  order by lower(btrim(coalesce(nullif(data->>'clientName',''),customer_name))), updated_at desc nulls last, created_at desc nulls last
)
insert into public.customers (customer_name,mobile,location,state_code,gstin,data)
select s.name,s.mobile,s.location,s.state_code,s.gstin,s.customer_data
from source s
where not exists (select 1 from public.customers c where lower(btrim(c.customer_name))=lower(btrim(s.name)))
on conflict do nothing;

-- --------------------------------------------------------------------------
-- 7. Optional legacy backfill from the original transport-invoice table.
--    The uploaded app's expected columns are used. The table is only read.
-- --------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.invoices') is not null then
    execute $sql$
      with source as (
        select distinct on (lower(btrim(customer_name)))
          btrim(customer_name) as name,
          coalesce(customer_mobile,'') as mobile,
          coalesce(customer_location,'') as location,
          case when customer_gstin ~ '^[0-9]{2}' then left(customer_gstin,2) else '24' end as state_code,
          coalesce(customer_gstin,'') as gstin,
          jsonb_build_object(
            'name',btrim(customer_name),'mobile',coalesce(customer_mobile,''),
            'location',coalesce(customer_location,''),
            'stateCode',case when customer_gstin ~ '^[0-9]{2}' then left(customer_gstin,2) else '24' end,
            'gstin',coalesce(customer_gstin,''),'address',coalesce(client_address,''),
            'transport',coalesce(transport,''),'destination',coalesce(destination,''),
            'shipSame',true,'source','invoices','legacyRefs',jsonb_build_array(invoice_no)
          ) as customer_data
        from public.invoices
        where customer_name is not null and btrim(customer_name)<>''
        order by lower(btrim(customer_name)), created_at desc nulls last, invoice_date desc nulls last
      )
      insert into public.customers (customer_name,mobile,location,state_code,gstin,data)
      select s.name,s.mobile,s.location,s.state_code,s.gstin,s.customer_data
      from source s
      where not exists (select 1 from public.customers c where lower(btrim(c.customer_name))=lower(btrim(s.name)))
      on conflict do nothing;
    $sql$;
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 8. Optional legacy backfill from quotations. Names already present from any
--    source are not replaced, so richer invoice details remain authoritative.
-- --------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.quotations') is not null then
    execute $sql$
      with source as (
        select distinct on (lower(btrim(customer_name)))
          btrim(customer_name) as name,
          coalesce(customer_mobile,'') as mobile,
          coalesce(kind_attention,'') as contact_person,
          coalesce(customer_gstin,'') as gstin,
          jsonb_build_object(
            'name',btrim(customer_name),'mobile',coalesce(customer_mobile,''),
            'contactPerson',coalesce(kind_attention,''),
            'gstin',coalesce(customer_gstin,''),'address',coalesce(delivery_address,''),
            'stateCode',case when customer_gstin ~ '^[0-9]{2}' then left(customer_gstin,2) else '24' end,
            'shipSame',true,'source','quotations','legacyRefs',jsonb_build_array(quotation_no)
          ) as customer_data
        from public.quotations
        where customer_name is not null and btrim(customer_name)<>''
        order by lower(btrim(customer_name)), created_at desc nulls last, quotation_date desc nulls last
      )
      insert into public.customers (customer_name,mobile,contact_person,gstin,data)
      select s.name,s.mobile,s.contact_person,s.gstin,s.customer_data
      from source s
      where not exists (select 1 from public.customers c where lower(btrim(c.customer_name))=lower(btrim(s.name)))
      on conflict do nothing;
    $sql$;
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 9. Optional legacy backfill from proformas, including email when available.
-- --------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.proformas') is not null then
    execute $sql$
      with source as (
        select distinct on (lower(btrim(buyer_name)))
          btrim(buyer_name) as name,
          coalesce(buyer_phone,'') as mobile,
          coalesce(buyer_email,'') as email,
          coalesce(buyer_tax_id,'') as gstin,
          jsonb_build_object(
            'name',btrim(buyer_name),'mobile',coalesce(buyer_phone,''),
            'email',coalesce(buyer_email,''),'gstin',coalesce(buyer_tax_id,''),
            'address',coalesce(buyer_address,''),
            'stateCode',case when buyer_tax_id ~ '^[0-9]{2}' then left(buyer_tax_id,2) else '24' end,
            'destination',coalesce(port_of_discharge,''),
            'shipSame',true,'source','proformas','legacyRefs',jsonb_build_array(proforma_no)
          ) as customer_data
        from public.proformas
        where buyer_name is not null and btrim(buyer_name)<>''
        order by lower(btrim(buyer_name)), created_at desc nulls last, proforma_date desc nulls last
      )
      insert into public.customers (customer_name,mobile,email,gstin,data)
      select s.name,s.mobile,s.email,s.gstin,s.customer_data
      from source s
      where not exists (select 1 from public.customers c where lower(btrim(c.customer_name))=lower(btrim(s.name)))
      on conflict do nothing;
    $sql$;
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 10. Additive product backfill from surviving formal GST invoices and orders.
--     Existing product-master rows are never overwritten. Older document
--     formats can also be rebuilt from the app's Product Directory action.
-- --------------------------------------------------------------------------
with source as (
  select distinct on (lower(btrim(product->>'desc')))
    btrim(product->>'desc') as name,
    coalesce(product->>'hsn','') as hsn,
    coalesce(nullif(product->>'uom',''),'NOS') as uom,
    case when coalesce(product->>'rate','') ~ '^[0-9]+([.][0-9]+)?$' then (product->>'rate')::numeric else 0 end as rate,
    case when coalesce(product->>'gst','') ~ '^[0-9]+([.][0-9]+)?$' then (product->>'gst')::numeric else 18 end as gst,
    jsonb_build_object(
      'name',btrim(product->>'desc'),'details',coalesce(product->>'details',''),
      'hsn',coalesce(product->>'hsn',''),'uom',coalesce(nullif(product->>'uom',''),'NOS'),
      'rate',coalesce(product->>'rate',''),'gst',coalesce(product->>'gst','18'),
      'source','gst_invoices','legacyRefs',jsonb_build_array(invoice_no)
    ) as product_data
  from public.gst_invoices
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(data->'products')='array' then data->'products' else '[]'::jsonb end
  ) as item(product)
  where btrim(coalesce(product->>'desc',''))<>''
  order by lower(btrim(product->>'desc')), updated_at desc nulls last, invoice_date desc nulls last
)
insert into public.products (product_name,hsn,uom,rate,gst,data)
select s.name,s.hsn,s.uom,s.rate,s.gst,s.product_data
from source s
where not exists (select 1 from public.products p where lower(btrim(p.product_name))=lower(btrim(s.name)))
on conflict do nothing;

with source as (
  select distinct on (lower(btrim(product->>'desc')))
    btrim(product->>'desc') as name,
    coalesce(product->>'hsn','') as hsn,
    coalesce(nullif(product->>'uom',''),'NOS') as uom,
    case when coalesce(product->>'rate','') ~ '^[0-9]+([.][0-9]+)?$' then (product->>'rate')::numeric else 0 end as rate,
    case when coalesce(product->>'gst','') ~ '^[0-9]+([.][0-9]+)?$' then (product->>'gst')::numeric else 18 end as gst,
    jsonb_build_object(
      'name',btrim(product->>'desc'),'details',coalesce(product->>'details',''),
      'hsn',coalesce(product->>'hsn',''),'uom',coalesce(nullif(product->>'uom',''),'NOS'),
      'rate',coalesce(product->>'rate',''),'gst',coalesce(product->>'gst','18'),
      'source','order_book','legacyRefs',jsonb_build_array(order_no)
    ) as product_data
  from public.order_book
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(data->'products')='array' then data->'products' else '[]'::jsonb end
  ) as item(product)
  where btrim(coalesce(product->>'desc',''))<>''
  order by lower(btrim(product->>'desc')), updated_at desc nulls last, order_date desc nulls last
)
insert into public.products (product_name,hsn,uom,rate,gst,data)
select s.name,s.hsn,s.uom,s.rate,s.gst,s.product_data
from source s
where not exists (select 1 from public.products p where lower(btrim(p.product_name))=lower(btrim(s.name)))
on conflict do nothing;

-- --------------------------------------------------------------------------
-- 11. Read-only verification notices. These do not modify any table.
-- --------------------------------------------------------------------------
do $$
declare n bigint;
begin
  select count(*) into n from public.customers;
  raise notice 'Customer Directory rows available: %',n;
  select count(*) into n from public.products;
  raise notice 'Product Directory rows available: %',n;
  select count(*) into n from public.order_book;
  raise notice 'Order Book rows preserved: %',n;
  select count(*) into n from public.gst_invoices;
  raise notice 'GST invoice rows preserved: %',n;
  if to_regclass('public.invoices') is not null then
    execute 'select count(*) from public.invoices' into n;
    raise notice 'Legacy transport invoice rows preserved: %',n;
  end if;
  if to_regclass('public.quotations') is not null then
    execute 'select count(*) from public.quotations' into n;
    raise notice 'Legacy quotation rows preserved: %',n;
  end if;
  if to_regclass('public.proformas') is not null then
    execute 'select count(*) from public.proformas' into n;
    raise notice 'Legacy proforma rows preserved: %',n;
  end if;
end $$;

-- Optional manual checks after running:
-- select customer_name, mobile, email, gstin, data->>'source' as source
-- from public.customers order by customer_name;
-- select count(*) from public.invoices;       -- original rows remain
-- select count(*) from public.quotations;     -- original rows remain
-- select count(*) from public.proformas;      -- original rows remain
