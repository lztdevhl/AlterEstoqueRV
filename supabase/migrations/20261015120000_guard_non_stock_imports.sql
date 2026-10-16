-- Pedidos comerciais extraídos não podem virar movimentações de estoque
-- apenas porque alguém alterou o tipo na interface.
create or replace function public.guard_non_stock_import_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document_type text := lower(coalesce(new.source_data ->> 'Tipo de documento', ''));
  v_operation text := lower(coalesce(new.source_data ->> 'Tipo', ''));
begin
  if new.validation_status in ('valid', 'imported')
     and (v_document_type like '%pedido de venda%' or v_operation like '%pedido de venda%') then
    raise exception 'import_sales_order_not_stock_movement';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_non_stock_import_row on public.import_rows;
create trigger guard_non_stock_import_row
before insert or update of validation_status, movement_type, source_data
on public.import_rows
for each row execute function public.guard_non_stock_import_row();

revoke execute on function public.guard_non_stock_import_row() from public;
grant execute on function public.guard_non_stock_import_row() to authenticated;
