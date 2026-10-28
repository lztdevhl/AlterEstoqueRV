-- Permite guardar lotes originados de prints/imagens processados por OCR.
alter table public.import_batches
  drop constraint if exists import_batches_file_format_check;

alter table public.import_batches
  add constraint import_batches_file_format_check
  check (file_format in ('xml', 'zip', 'pdf', 'image', 'csv', 'xlsx', 'xls', 'txt', 'json', 'mixed'));
