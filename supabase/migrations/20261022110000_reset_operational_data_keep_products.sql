-- Zera os dados operacionais sem remover o catálogo de produtos nem os usuários.
-- A operação é exposta como RPC para manter a limpeza atômica no banco.

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

  -- CASCADE resolve os vínculos entre importações e movimentações,
  -- mas não remove a tabela products nem seus registros.
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
      updated_at = now();
end;
$$;

revoke execute on function public.reset_operational_data() from public;
revoke execute on function public.reset_operational_data() from anon;
grant execute on function public.reset_operational_data() to authenticated;
