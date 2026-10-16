create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_format text not null check (file_format in ('csv', 'xlsx')),
  reference_start date,
  reference_end date,
  status text not null default 'review' check (status in ('review', 'confirmed', 'failed', 'reversed')),
  processed_at timestamptz not null default now(),
  confirmed_at timestamptz,
  created_by uuid not null references auth.users(id),
  total_rows integer not null default 0 check (total_rows >= 0),
  imported_rows integer not null default 0 check (imported_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  ignored_rows integer not null default 0 check (ignored_rows >= 0),
  pending_rows integer not null default 0 check (pending_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  warnings jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete restrict,
  row_number integer not null check (row_number > 0),
  source_record_key text not null,
  source_data jsonb not null default '{}'::jsonb,
  external_code text,
  barcode text,
  product_name text,
  document_number text,
  operation_text text,
  movement_type text check (movement_type in ('entrada', 'saida', 'ajuste')),
  quantity numeric(14, 3),
  unit text,
  effective_at timestamptz,
  product_id uuid references public.products(id),
  product_match text,
  validation_status text not null default 'pending' check (validation_status in ('valid', 'pending', 'error', 'duplicate', 'ignored', 'imported')),
  validation_errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  idempotency_key uuid not null,
  duplicate_of uuid references public.stock_movements(id),
  movement_id uuid references public.stock_movements(id),
  created_at timestamptz not null default now(),
  unique (batch_id, row_number)
);

create table if not exists public.product_external_mappings (
  id uuid primary key default gen_random_uuid(),
  external_system text not null default 'relatorio',
  identifier_type text not null check (identifier_type in ('sku', 'barcode', 'external_code', 'name')),
  external_identifier text not null,
  product_id uuid not null references public.products(id) on delete restrict,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_system, identifier_type, external_identifier)
);

alter table public.stock_movements
  add column if not exists batch_id uuid references public.import_batches(id) on delete restrict,
  add column if not exists import_row_id uuid references public.import_rows(id) on delete restrict,
  add column if not exists source_operation_key text,
  add column if not exists effective_at timestamptz;

create unique index if not exists stock_movements_source_operation_key_idx
  on public.stock_movements(source_operation_key)
  where source_operation_key is not null;
create index if not exists import_rows_batch_idx on public.import_rows(batch_id, row_number);
create index if not exists import_batches_processed_idx on public.import_batches(processed_at desc);
create index if not exists product_external_mappings_lookup_idx
  on public.product_external_mappings(external_system, identifier_type, external_identifier);

alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.product_external_mappings enable row level security;

drop policy if exists import_batches_select_admin on public.import_batches;
create policy import_batches_select_admin on public.import_batches for select to authenticated
using (public.is_authorized_user());
drop policy if exists import_batches_insert_admin on public.import_batches;
create policy import_batches_insert_admin on public.import_batches for insert to authenticated
with check (public.is_authorized_user() and created_by = auth.uid());
drop policy if exists import_batches_update_admin on public.import_batches;
create policy import_batches_update_admin on public.import_batches for update to authenticated
using (public.is_authorized_user()) with check (public.is_authorized_user());

drop policy if exists import_rows_select_admin on public.import_rows;
create policy import_rows_select_admin on public.import_rows for select to authenticated
using (public.is_authorized_user());
drop policy if exists import_rows_insert_admin on public.import_rows;
create policy import_rows_insert_admin on public.import_rows for insert to authenticated
with check (public.is_authorized_user());
drop policy if exists import_rows_update_admin on public.import_rows;
create policy import_rows_update_admin on public.import_rows for update to authenticated
using (public.is_authorized_user()) with check (public.is_authorized_user());

drop policy if exists product_external_mappings_select_admin on public.product_external_mappings;
create policy product_external_mappings_select_admin on public.product_external_mappings for select to authenticated
using (public.is_authorized_user());
drop policy if exists product_external_mappings_insert_admin on public.product_external_mappings;
create policy product_external_mappings_insert_admin on public.product_external_mappings for insert to authenticated
with check (public.is_authorized_user());
drop policy if exists product_external_mappings_update_admin on public.product_external_mappings;
create policy product_external_mappings_update_admin on public.product_external_mappings for update to authenticated
using (public.is_authorized_user()) with check (public.is_authorized_user());

create or replace function public.confirm_import_batch(p_batch_id uuid)
returns table (batch_id uuid, imported_count integer, duplicate_count integer, ignored_count integer, confirmed_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.import_batches;
  v_row public.import_rows;
  v_current numeric;
  v_next numeric;
  v_product_unit text;
  v_movement_id uuid;
  v_imported integer := 0;
  v_duplicates integer := 0;
  v_ignored integer := 0;
  v_confirmed_at timestamptz := now();
begin
  if not public.is_authorized_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_batch from public.import_batches where id = p_batch_id for update;
  if v_batch.id is null then raise exception 'import_batch_not_found'; end if;
  if v_batch.status <> 'review' then raise exception 'import_batch_already_processed'; end if;
  if exists (select 1 from public.import_rows where batch_id = p_batch_id and validation_status not in ('valid', 'duplicate', 'ignored')) then
    raise exception 'import_batch_has_pending_rows';
  end if;
  select count(*) into v_ignored from public.import_rows where batch_id = p_batch_id and validation_status = 'ignored';

  for v_row in
    select * from public.import_rows
    where batch_id = p_batch_id and validation_status = 'valid'
    order by effective_at nulls last, row_number
  loop
    if exists (
      select 1 from public.stock_movements existing
      where existing.idempotency_key = v_row.idempotency_key
         or (v_row.source_record_key is not null and existing.source_operation_key = v_row.source_record_key)
    ) then
      select existing.id into v_movement_id
      from public.stock_movements existing
      where existing.idempotency_key = v_row.idempotency_key
         or (v_row.source_record_key is not null and existing.source_operation_key = v_row.source_record_key)
      limit 1;
      update public.import_rows
      set validation_status = 'duplicate', duplicate_of = v_movement_id
      where id = v_row.id;
      v_duplicates := v_duplicates + 1;
      continue;
    end if;

    if v_row.product_id is null or not exists (select 1 from public.products where id = v_row.product_id and active) then
      raise exception 'import_product_not_found';
    end if;
    select unit into v_product_unit from public.products where id = v_row.product_id;
    if nullif(trim(v_row.unit), '') is not null and nullif(trim(v_product_unit), '') is not null and lower(trim(v_row.unit)) <> lower(trim(v_product_unit)) then
      raise exception 'import_unit_mismatch';
    end if;
    if v_row.quantity is null or v_row.quantity <= 0 then raise exception 'import_invalid_quantity'; end if;
    if v_row.movement_type not in ('entrada', 'saida', 'ajuste') then raise exception 'import_invalid_movement_type'; end if;

    insert into public.stock_balances (product_id, quantity) values (v_row.product_id, 0) on conflict do nothing;
    select quantity into v_current from public.stock_balances where product_id = v_row.product_id for update;
    if v_row.movement_type = 'entrada' then
      v_next := v_current + v_row.quantity;
    elsif v_row.movement_type = 'saida' then
      if v_row.quantity > v_current then raise exception 'import_insufficient_stock'; end if;
      v_next := v_current - v_row.quantity;
    else
      v_next := v_row.quantity;
      if v_next = v_current then raise exception 'import_adjustment_no_change'; end if;
    end if;

    insert into public.stock_movements (
      product_id, movement_type, quantity, previous_quantity, next_quantity,
      reason, reference, notes, performed_by, idempotency_key,
      batch_id, import_row_id, source_operation_key, effective_at
    ) values (
      v_row.product_id, v_row.movement_type, case when v_row.movement_type = 'ajuste' then abs(v_next - v_current) else v_row.quantity end,
      v_current, v_next, coalesce(nullif(trim(v_row.operation_text), ''), 'Importação de relatório'),
      nullif(trim(v_row.document_number), ''), nullif(trim(v_row.unit), ''), auth.uid(), v_row.idempotency_key,
      p_batch_id, v_row.id, v_row.source_record_key, v_row.effective_at
    ) returning id into v_movement_id;

    update public.stock_balances set quantity = v_next where product_id = v_row.product_id;
    update public.products set stock_known = true where id = v_row.product_id;
    update public.import_rows set validation_status = 'imported', movement_id = v_movement_id where id = v_row.id;
    v_imported := v_imported + 1;
  end loop;

  update public.import_batches set
    status = 'confirmed', confirmed_at = v_confirmed_at,
    imported_rows = v_imported, duplicate_rows = v_duplicates, ignored_rows = v_ignored,
    pending_rows = 0
  where id = p_batch_id;

  batch_id := p_batch_id;
  imported_count := v_imported;
  duplicate_count := v_duplicates;
  ignored_count := v_ignored;
  confirmed_at := v_confirmed_at;
  return next;
end;
$$;

revoke execute on function public.confirm_import_batch(uuid) from public;
revoke execute on function public.confirm_import_batch(uuid) from anon;
grant execute on function public.confirm_import_batch(uuid) to authenticated;
