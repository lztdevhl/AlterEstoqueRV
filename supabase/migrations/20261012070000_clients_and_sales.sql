create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  document text,
  phone text,
  email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_name_idx on public.clients (name);

create trigger clients_set_updated_at
before update on public.clients
for each row execute procedure public.set_updated_at();

alter table public.clients enable row level security;

create policy clients_select_admin on public.clients for select to authenticated
using (public.is_authorized_user());
create policy clients_insert_admin on public.clients for insert to authenticated
with check (public.is_authorized_user());
create policy clients_update_admin on public.clients for update to authenticated
using (public.is_authorized_user()) with check (public.is_authorized_user());

alter table public.stock_movements
  add column customer_id uuid references public.clients(id) on delete restrict,
  add column is_sale boolean not null default false,
  add constraint sale_requires_customer check (
    (is_sale and movement_type = 'saida' and customer_id is not null)
    or (not is_sale and customer_id is null)
  );

create index stock_movements_customer_created_idx
  on public.stock_movements (customer_id, created_at desc)
  where customer_id is not null;

-- A nova RPC registra a venda e o vínculo ao cliente na mesma transação.
-- A função anterior continua disponível para clientes antigos e ajustes de saldo.
create function public.register_stock_movement_with_customer(
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_reason text,
  p_destination text default null,
  p_reference text default null,
  p_notes text default null,
  p_idempotency_key uuid default null,
  p_is_sale boolean default false,
  p_customer_id uuid default null
)
returns table (
  movement_id uuid,
  product_id uuid,
  movement_type text,
  quantity numeric,
  previous_quantity numeric,
  next_quantity numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current numeric;
  v_next numeric;
  v_recorded_quantity numeric;
  v_created_at timestamptz;
  v_idempotency_key uuid := coalesce(p_idempotency_key, gen_random_uuid());
  v_existing public.stock_movements;
begin
  if not public.is_authorized_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_existing
  from public.stock_movements as existing_movement
  where existing_movement.idempotency_key = v_idempotency_key;

  if v_existing.id is not null then
    if v_existing.product_id is distinct from p_product_id
      or v_existing.movement_type is distinct from p_movement_type
      or v_existing.is_sale is distinct from coalesce(p_is_sale, false)
      or v_existing.customer_id is distinct from p_customer_id then
      raise exception 'idempotency_key_reused';
    end if;
    return query
    select v_existing.id, v_existing.product_id, v_existing.movement_type,
      v_existing.quantity, v_existing.previous_quantity, v_existing.next_quantity,
      v_existing.created_at;
    return;
  end if;

  if p_movement_type not in ('entrada', 'saida', 'ajuste') then
    raise exception 'invalid_movement_type';
  end if;

  if p_movement_type = 'ajuste' then
    if p_quantity is null or p_quantity < 0 then
      raise exception 'quantity_must_be_non_negative';
    end if;
  elsif p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity_must_be_positive';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'reason_is_required';
  end if;

  if coalesce(p_is_sale, false) then
    if p_movement_type <> 'saida' then
      raise exception 'sale_must_be_outgoing';
    end if;
    if p_customer_id is null then
      raise exception 'customer_is_required';
    end if;
    if not exists (select 1 from public.clients as client_row
      where client_row.id = p_customer_id and client_row.active) then
      raise exception 'customer_not_found_or_inactive';
    end if;
  elsif p_customer_id is not null then
    raise exception 'customer_only_for_sale';
  end if;

  if not exists (select 1 from public.products as product_row
    where product_row.id = p_product_id and product_row.active) then
    raise exception 'product_not_found_or_inactive';
  end if;

  insert into public.stock_balances (product_id, quantity)
  values (p_product_id, 0)
  on conflict do nothing;

  select balance_row.quantity into v_current
  from public.stock_balances as balance_row
  where balance_row.product_id = p_product_id
  for update;

  if p_movement_type = 'entrada' then
    v_next := v_current + p_quantity;
    v_recorded_quantity := p_quantity;
  elsif p_movement_type = 'saida' then
    if p_quantity > v_current then
      raise exception 'insufficient_stock';
    end if;
    v_next := v_current - p_quantity;
    v_recorded_quantity := p_quantity;
  else
    v_next := p_quantity;
    v_recorded_quantity := abs(v_next - v_current);
    if v_recorded_quantity = 0 then
      raise exception 'adjustment_does_not_change_stock';
    end if;
  end if;

  insert into public.stock_movements as movement_row (
    product_id, movement_type, quantity, previous_quantity, next_quantity,
    reason, destination, reference, notes, performed_by, idempotency_key,
    customer_id, is_sale
  ) values (
    p_product_id, p_movement_type, v_recorded_quantity, v_current, v_next,
    trim(p_reason), nullif(trim(p_destination), ''), nullif(trim(p_reference), ''),
    nullif(trim(p_notes), ''), auth.uid(), v_idempotency_key,
    p_customer_id, coalesce(p_is_sale, false)
  )
  returning movement_row.id, movement_row.created_at into movement_id, v_created_at;

  update public.stock_balances as balance_row
  set quantity = v_next
  where balance_row.product_id = p_product_id;

  update public.products as product_row
  set stock_known = true
  where product_row.id = p_product_id;

  product_id := p_product_id;
  movement_type := p_movement_type;
  quantity := v_recorded_quantity;
  previous_quantity := v_current;
  next_quantity := v_next;
  created_at := v_created_at;
  return next;
end;
$$;

revoke execute on function public.register_stock_movement_with_customer(uuid, text, numeric, text, text, text, text, uuid, boolean, uuid) from public;
revoke execute on function public.register_stock_movement_with_customer(uuid, text, numeric, text, text, text, text, uuid, boolean, uuid) from anon;
grant execute on function public.register_stock_movement_with_customer(uuid, text, numeric, text, text, text, text, uuid, boolean, uuid) to authenticated;
