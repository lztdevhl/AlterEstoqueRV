# Estoque Alternativa

Sistema de controle de estoque da Alternativa Plásticos, construído em React + TypeScript + Vite.

## Estado atual

O aplicativo usa Supabase como fonte única de dados. Produtos, saldos, movimentações e usuários não são mais persistidos em `localStorage`.

O catálogo atual é reconstruído pela migration a partir dos 20 produtos encontrados exclusivamente no PDF em `tabela`. Nenhum preço, SKU, localização ou saldo é criado. A limpeza do catálogo também remove o histórico antigo de movimentações.

## Executar

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

Preencha `.env.local` com `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_ALLOWED_EMAIL` antes de abrir a aplicação. O último valor deve ser o seu único e-mail autorizado. Depois, crie esse usuário em Authentication no painel do Supabase e entre pela tela de login.

## Banco Supabase

As migrations estão em `supabase/migrations` e criam:

- produtos e catálogo oficial;
- saldos separados dos dados do produto;
- histórico imutável de movimentações;
- perfis de usuários;
- RLS para usuários autenticados;
- função transacional para entrada, saída e ajuste;
- proteção contra chamadas duplicadas por chave de idempotência.
- cadastro de clientes e vínculo obrigatório do cliente com cada saída marcada como venda.

Na aba **Clientes**, cadastre nome e, se desejar, CPF/CNPJ, telefone, e-mail e observações. Ao registrar uma saída, escolha **Venda para cliente** e selecione o cliente. As vendas aparecem no histórico, podem ser filtradas por cliente e constam no CSV de movimentações. Saídas antigas permanecem no histórico sem cliente vinculado.

Para aplicar no projeto remoto:

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

Consulte [supabase/README.md](supabase/README.md) para detalhes.

## Verificações

```bash
npm run typecheck
npm test
npm run build
```
