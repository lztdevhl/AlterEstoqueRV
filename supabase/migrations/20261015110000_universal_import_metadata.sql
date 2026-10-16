-- Expande o importador para documentos fiscais, pacotes e formatos tabulares.
alter table public.import_batches
  drop constraint if exists import_batches_file_format_check;

alter table public.import_batches
  add constraint import_batches_file_format_check
  check (file_format in ('xml', 'zip', 'pdf', 'csv', 'xlsx', 'xls', 'txt', 'json', 'mixed'));

alter table public.import_batches
  add column if not exists file_count integer not null default 1 check (file_count > 0),
  add column if not exists detected_formats jsonb not null default '[]'::jsonb;

alter table public.import_rows
  add column if not exists source_file_name text,
  add column if not exists document_key text,
  add column if not exists document_series text,
  add column if not exists cfop text,
  add column if not exists fiscal_status text,
  add column if not exists issuer text,
  add column if not exists recipient text;

create index if not exists import_rows_document_key_idx
  on public.import_rows(document_key)
  where document_key is not null;
