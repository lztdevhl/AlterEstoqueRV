-- Corrige a limpeza para bancos que exigem WHERE em todo UPDATE.
-- O filtro id is not null mantém a atualização em todos os produtos.

create or replace function public.reset_operational_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_authorized_user() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  truncate table
    public.stock_movements,
    public.stock_balances,
    public.import_rows,
    public.import_batches,
    public.product_external_mappings,
    public.clients
  restart identity cascade;

  update public.products
  set stock_known = false,
      updated_at = now()
  where id is not null;
end;
$$;

revoke execute on function public.reset_operational_data() from public;
revoke execute on function public.reset_operational_data() from anon;
grant execute on function public.reset_operational_data() to authenticated;

notify pgrst, 'reload schema';
