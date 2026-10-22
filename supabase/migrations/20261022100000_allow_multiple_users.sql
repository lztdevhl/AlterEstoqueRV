-- Permite que todos os usuários criados no Supabase e registrados em public.profiles
-- utilizem o sistema. O perfil padrão continua sendo "operador".
-- A autorização não depende mais de existir apenas um administrador.

create or replace function public.is_authorized_user()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'operador', 'leitura')
  );
$$;

revoke execute on function public.is_authorized_user() from public;
revoke execute on function public.is_authorized_user() from anon;
grant execute on function public.is_authorized_user() to authenticated;

-- Garante perfil para usuários que já existiam antes do trigger de perfis.
insert into public.profiles (id, display_name, role)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.email),
  'operador'
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
);
