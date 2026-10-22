# Estoque Alternativa

Sistema de controle de estoque da Alternativa Plásticos, construído em React + TypeScript + Vite.

## Estado atual

O aplicativo usa Supabase como fonte única de dados. Produtos, saldos, movimentações e usuários não são mais persistidos em `localStorage`.

O catálogo atual é reconstruído pela migration a partir dos 53 produtos da planilha `ex/catalogo_lunet_completo.xlsx`. Os códigos da planilha são mantidos como SKU, as descrições são importadas quando existem e as 38 fotos incorporadas ficam disponíveis na aba Produtos. A limpeza do catálogo também remove o histórico antigo de movimentações.

## Executar

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

Preencha `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` antes de abrir a aplicação. Depois, crie os usuários em Authentication > Users no painel do Supabase e entre pela tela de login. O acesso às tabelas é controlado pelo perfil criado automaticamente no banco.

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

## Importação inteligente de relatórios

A aba **Importar relatórios** aceita CSV e Excel (`.xlsx`). O fluxo é: selecionar/arrastar o arquivo, informar o período opcional, revisar a prévia, corrigir produtos ou tipos pendentes, salvar a prévia e confirmar o lote. O upload e o processamento da prévia não alteram o estoque.

O parser detecta cabeçalhos por aliases, valida data/quantidade, identifica produtos por SKU, código alternativo salvo, nome normalizado e apenas sugere correspondências aproximadas. As regras de operação podem ser editadas na tela no formato `tipo|nome|alias1, alias2`. Operações sem classificação, produtos ambíguos, unidades inconsistentes e saídas que gerariam estoque negativo ficam pendentes.

Após a confirmação, a RPC `confirm_import_batch` aplica todas as linhas válidas em uma única transação, respeitando a data efetiva, bloqueio do saldo e identificadores de idempotência. Lotes, linhas de origem e vínculos entre identificadores externos e produtos permanecem disponíveis para auditoria.

O projeto inclui a migration `20261015100000_import_batches.sql`. Ela deve ser aplicada ao Supabase antes de publicar a versão da interface.

Ainda é necessário confirmar com um relatório operacional real os nomes dos cabeçalhos, o identificador estável da linha, os códigos de operação, as unidades permitidas e o tratamento de estornos/cancelamentos específicos do sistema interno. Enquanto isso, os casos não reconhecidos permanecem pendentes e não são aplicados automaticamente.

### Formatos do importador universal

Além de CSV/XLSX, a central processa XML fiscal de NF-e, ZIP com XMLs e arquivos tabulares JSON/TXT. PDFs com texto selecionável passam pelo extrator nativo; PDFs compostos apenas por imagem são rejeitados informando que OCR não está configurado. A extensão não é a única fonte de decisão: assinatura binária e conteúdo são verificados, com limites de tamanho, quantidade de arquivos e caminhos internos de ZIP.

A migration `20261015110000_universal_import_metadata.sql` amplia os formatos aceitos e preserva no banco o arquivo de origem, chave fiscal, série, CFOP, status fiscal, emitente e destinatário quando disponíveis.

## Verificações

```bash
npm run typecheck
npm test
npm run build
```
