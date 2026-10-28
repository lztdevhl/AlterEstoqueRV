-- Importa saldos iniciais e movimentos com protecao contra reimportacao.
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
  perform pg_advisory_xact_lock(hashtext('confirm_import_batch'));

  select ib.* into v_batch
  from public.import_batches ib
  where ib.id = p_batch_id
  for update;
  if v_batch.id is null then raise exception 'import_batch_not_found'; end if;
  if v_batch.status <> 'review' then raise exception 'import_batch_already_processed'; end if;
  if exists (
    select 1
    from public.import_rows ir
    where ir.batch_id = p_batch_id
      and ir.validation_status not in ('valid', 'duplicate', 'ignored')
  ) then
    raise exception 'import_batch_has_pending_rows';
  end if;

  -- Um mesmo relatorio repetido no lote nao pode restaurar seu saldo duas vezes.
  if exists (
    select 1 from public.import_rows ir
    where ir.batch_id = p_batch_id
      and ir.source_data ->> 'Modo de importação' = 'saldo_inicial_e_movimentos'
      and ir.validation_status = 'valid'
      and ir.source_record_key is not null
    group by ir.source_record_key
    having count(*) > 1
  ) then
    raise exception 'Relatorio repetido no lote. Importe apenas uma copia de cada relatorio.';
  end if;

  -- Ignore o relatorio inteiro antes de restaurar o saldo inicial na reimportacao.
  update public.import_rows current_row
  set validation_status = 'duplicate'
  where current_row.batch_id = p_batch_id
    and current_row.source_data ->> 'Modo de importação' = 'saldo_inicial_e_movimentos'
    and exists (
      select 1 from public.import_rows previous_row
      join public.import_batches previous_batch on previous_batch.id = previous_row.batch_id
      where previous_batch.status = 'confirmed'
        and previous_row.batch_id <> p_batch_id
        and previous_row.source_data ->> 'Chave do documento' = current_row.source_data ->> 'Chave do documento'
    );
  select count(*) into v_duplicates from public.import_rows ir
    where ir.batch_id = p_batch_id and ir.validation_status = 'duplicate';

  select count(*) into v_ignored
  from public.import_rows ir
  where ir.batch_id = p_batch_id
    and ir.validation_status = 'ignored';

  for v_row in
    select ir.*
    from public.import_rows ir
    where ir.batch_id = p_batch_id
      and ir.validation_status = 'valid'
    order by ir.effective_at nulls last, ir.row_number
  loop
    if exists (
      select 1
      from public.stock_movements sm
      where sm.idempotency_key = v_row.idempotency_key
         or (v_row.source_record_key is not null and sm.source_operation_key = v_row.source_record_key)
    ) then
      select sm.id into v_movement_id
      from public.stock_movements sm
      where sm.idempotency_key = v_row.idempotency_key
         or (v_row.source_record_key is not null and sm.source_operation_key = v_row.source_record_key)
      limit 1;
      update public.import_rows ir
      set validation_status = 'duplicate', duplicate_of = v_movement_id
      where ir.id = v_row.id;
      v_duplicates := v_duplicates + 1;
      continue;
    end if;

    if v_row.product_id is null or not exists (
      select 1 from public.products p where p.id = v_row.product_id and p.active
    ) then
      raise exception 'import_product_not_found';
    end if;

    select p.unit into v_product_unit
    from public.products p
    where p.id = v_row.product_id;
    if nullif(trim(v_row.unit), '') is not null
       and nullif(trim(v_product_unit), '') is not null
       and lower(trim(v_row.unit)) <> lower(trim(v_product_unit)) then
      raise exception 'import_unit_mismatch';
    end if;
    if v_row.quantity is null or (v_row.quantity < 0 or (v_row.quantity = 0 and v_row.movement_type <> 'ajuste')) then raise exception 'import_invalid_quantity'; end if;
    if v_row.movement_type not in ('entrada', 'saida', 'ajuste') then raise exception 'import_invalid_movement_type'; end if;

    insert into public.stock_balances (product_id, quantity)
    values (v_row.product_id, 0)
    on conflict do nothing;
    select sb.quantity into v_current
    from public.stock_balances sb
    where sb.product_id = v_row.product_id
    for update;

    if v_row.movement_type = 'entrada' then
      v_next := v_current + v_row.quantity;
    elsif v_row.movement_type = 'saida' then
      if v_row.quantity > v_current then raise exception 'import_insufficient_stock'; end if;
      v_next := v_current - v_row.quantity;
    else
      v_next := v_row.quantity;
      if v_next = v_current then
        update public.products p set stock_known = true where p.id = v_row.product_id;
        update public.import_rows ir set validation_status = 'ignored' where ir.id = v_row.id;
        v_ignored := v_ignored + 1;
        continue;
      end if;
    end if;

    insert into public.stock_movements (
      product_id, movement_type, quantity, previous_quantity, next_quantity,
      reason, reference, notes, performed_by, idempotency_key,
      batch_id, import_row_id, source_operation_key, effective_at
    ) values (
      v_row.product_id,
      v_row.movement_type,
      case when v_row.movement_type = 'ajuste' then abs(v_next - v_current) else v_row.quantity end,
      v_current,
      v_next,
      coalesce(nullif(trim(v_row.operation_text), ''), 'Importação de relatório'),
      nullif(trim(v_row.document_number), ''),
      nullif(trim(v_row.unit), ''),
      auth.uid(),
      v_row.idempotency_key,
      p_batch_id,
      v_row.id,
      v_row.source_record_key,
      v_row.effective_at
    ) returning id into v_movement_id;

    update public.stock_balances sb
    set quantity = v_next
    where sb.product_id = v_row.product_id;
    update public.products p
    set stock_known = true
    where p.id = v_row.product_id;
    update public.import_rows ir
    set validation_status = 'imported', movement_id = v_movement_id
    where ir.id = v_row.id;
    v_imported := v_imported + 1;
  end loop;

  update public.import_batches ib
  set status = 'confirmed',
      confirmed_at = v_confirmed_at,
      imported_rows = v_imported,
      duplicate_rows = v_duplicates,
      ignored_rows = v_ignored,
      pending_rows = 0
  where ib.id = p_batch_id;

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

