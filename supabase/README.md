# Supabase

Esta pasta contém a configuração e as migrations do banco de dados da aplicação.

## Configuração remota

1. Crie um projeto no Supabase.
2. Na raiz do projeto, execute `npx supabase login`.
3. Vincule o projeto com `npx supabase link --project-ref SEU_PROJECT_REF`.
4. Revise as migrations e execute `npx supabase db push`.
5. No painel do Supabase, crie o primeiro usuário em Authentication > Users.
6. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

O frontend usa somente a chave pública/publishable ou anon. Nunca coloque `service_role` no `.env.local`.

## Migrations

- `20261012000000_initial_schema.sql`: tabelas, índices, triggers, RLS e RPC inicial.
- `20261012010000_add_stock_known_and_fix_movements.sql`: controle de saldo informado e ajuste transacional completo.
- `20261012020000_seed_catalog.sql`: catálogo oficial sem preços, SKUs, localizações ou saldos.
- `20261012030000_restrict_to_single_admin.sql`: cria perfis e a regra de autorização original.
- `20261022100000_allow_multiple_users.sql`: libera múltiplos usuários com perfil no banco e remove o bloqueio prático ao primeiro administrador.
- `20261012040000_replace_catalog_with_pdf_products.sql`: remove o catálogo e o histórico antigos e insere somente os produtos do PDF.
- `20261014100000_import_lunet_catalog.sql`: substitui o catálogo pelos 53 produtos da planilha em `ex`, preservando códigos, descrições e 38 fotos incorporadas.

Movimentações são gravadas pela função `register_stock_movement`, com validação no banco, atualização atômica do saldo e chave de idempotência.

## Tipos

`src/lib/supabase.types.ts` contém os tipos iniciais do schema. Depois de aplicar as migrations, eles podem ser regenerados com:

```bash
npx supabase gen types typescript --project-id "SEU_PROJECT_REF" --schema public > src/lib/supabase.types.ts
```

## Aplicação

O cliente está em `src/lib/supabase.ts`, o carregamento e as gravações estão em `src/lib/supabaseRepository.ts`, e o `App` já usa essas funções em vez de `localStorage`.

## Importações

A migration `20261015100000_import_batches.sql` adiciona lotes e linhas de origem, mapeamentos persistentes de identificadores externos e os vínculos de auditoria nas movimentações. A função `confirm_import_batch` bloqueia os saldos envolvidos, processa as linhas pela data efetiva e aplica o lote em uma única transação; qualquer falha desfaz o lote inteiro.

A migration `20261015110000_universal_import_metadata.sql` amplia os formatos do lote e adiciona metadados fiscais e o arquivo de origem nas linhas importadas. Aplique as duas migrations depois das migrations de schema base.

A migration `20261015120000_guard_non_stock_imports.sql` impede no backend que pedidos de venda sejam confirmados como movimentações de estoque, mesmo que uma linha seja alterada manualmente.
