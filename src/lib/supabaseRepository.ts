import type { Customer, CustomerForm, ImportBatch, Movement, MovementForm, Product, ProductForm } from './types'
import type { ImportRow, ProductExternalMapping } from './importParser'
import { requireSupabase } from './supabase'
import { categories, type Category } from './types'
import type { Tables } from './supabase.types'

export type SupabaseProductInput = Omit<Pick<
  ProductForm,
  'name' | 'sku' | 'imageUrl' | 'category' | 'description' | 'unit' | 'minStock' | 'location' | 'active'
>, 'minStock'> & {
  quantity: number
  minStock: number
  stockKnown: boolean
}

export async function loadSupabaseInventory(): Promise<{ products: Product[]; movements: Movement[]; customers: Customer[]; importBatches: ImportBatch[]; mappings: ProductExternalMapping[] }> {
  const client = requireSupabase()
  const [{ data: productRows, error: productsError }, { data: movementRows, error: movementsError }, { data: customerRows, error: customersError }, { data: batchRows, error: batchesError }, { data: mappingRows, error: mappingsError }] = await Promise.all([
    client
      .from('products')
      .select('*, stock_balances(quantity, updated_at)')
      .order('name', { ascending: true }),
    client.from('stock_movements').select('*').order('created_at', { ascending: false }),
    client.from('clients').select('*').order('name', { ascending: true }),
    client.from('import_batches').select('*').order('processed_at', { ascending: false }),
    client.from('product_external_mappings').select('*').order('created_at', { ascending: false }),
  ])

  if (productsError) throw productsError
  if (movementsError) throw movementsError
  if (customersError) throw customersError
  if (batchesError) throw batchesError
  if (mappingsError) throw mappingsError

  return {
    products: (productRows ?? []).map(toProduct),
    movements: (movementRows ?? []).map(toMovement),
    customers: (customerRows ?? []).map(toCustomer),
    importBatches: (batchRows ?? []).map(toImportBatch),
    mappings: (mappingRows ?? []).map(toProductMapping),
  }
}

export async function resetSupabaseOperationalData() {
  const client = requireSupabase()
  const { error } = await client.rpc('reset_operational_data')
  if (error) throw error
}

export async function createSupabaseImportBatch(input: {
  fileName: string
  fileFormat: ImportBatch['fileFormat']
  referenceStart?: string
  referenceEnd?: string
  rows: ImportRow[]
  warnings: string[]
  fileCount?: number
  detectedFormats?: string[]
}) {
  const client = requireSupabase()
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError || !userData.user) throw new Error('Sua sessão expirou. Entre novamente para importar um relatório.')
  const pendingRows = input.rows.filter((row) => row.status === 'pending').length
  const invalidRows = input.rows.filter((row) => row.status === 'error').length
  const { data: batch, error: batchError } = await client.from('import_batches').insert({
    file_name: input.fileName,
    file_format: input.fileFormat,
    reference_start: input.referenceStart || null,
    reference_end: input.referenceEnd || null,
    created_by: userData.user.id,
    total_rows: input.rows.length,
    pending_rows: pendingRows,
    invalid_rows: invalidRows,
    warnings: input.warnings,
    file_count: input.fileCount ?? 1,
    detected_formats: input.detectedFormats ?? [input.fileFormat],
  }).select('id').single()
  if (batchError) throw batchError
  const rowPayload = input.rows.map((row) => ({
    batch_id: batch.id,
    row_number: row.rowNumber,
    source_record_key: row.sourceRecordKey,
    source_data: row.source,
    external_code: row.externalCode || null,
    barcode: row.barcode || null,
    product_name: row.productName || null,
    document_number: row.document || null,
    operation_text: row.operationText || null,
    movement_type: row.type,
    manual_classification: row.manualClassification ?? false,
    quantity: row.quantity,
    unit: row.unit || null,
    effective_at: row.date || null,
    product_id: row.productId || null,
    product_match: row.productMatch,
    source_file_name: row.sourceFile || null,
    document_key: row.documentKey || null,
    document_series: row.series || null,
    cfop: row.cfop || null,
    fiscal_status: row.fiscalStatus || null,
    issuer: row.issuer || null,
    recipient: row.recipient || null,
    validation_status: row.status,
    validation_errors: row.errors,
    warnings: row.warnings,
    idempotency_key: row.idempotencyKey,
  }))
  const { error: rowsError } = await client.from('import_rows').insert(rowPayload)
  if (rowsError) throw rowsError
  return batch.id as string
}

export async function saveSupabaseExternalMapping(mapping: ProductExternalMapping) {
  const client = requireSupabase()
  const { data: userData } = await client.auth.getUser()
  const { error } = await client.from('product_external_mappings').upsert({
    external_system: mapping.externalSystem,
    identifier_type: mapping.identifierType,
    external_identifier: mapping.externalIdentifier.trim(),
    product_id: mapping.productId,
    created_by: userData.user?.id ?? null,
  }, { onConflict: 'external_system,identifier_type,external_identifier' })
  if (error) throw error
}

export async function updateSupabaseImportRows(batchId: string, rows: ImportRow[]) {
  const client = requireSupabase()
  const updates = rows.map((row) => client.from('import_rows').update({
    product_id: row.productId || null,
    product_match: row.productMatch,
    movement_type: row.type,
    manual_classification: row.manualClassification ?? false,
    validation_status: row.status,
    validation_errors: row.errors,
    warnings: row.warnings,
  }).eq('batch_id', batchId).eq('row_number', row.rowNumber))
  const results = await Promise.all(updates)
  const failed = results.find((result) => result.error)
  if (failed?.error) throw failed.error
}

export async function confirmSupabaseImportBatch(batchId: string) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('confirm_import_batch', { p_batch_id: batchId })
  if (error) throw new Error(toImportErrorMessage(error.message))
  return data?.[0] ?? null
}

export async function loadSupabaseImportRows(batchId: string) {
  const client = requireSupabase()
  const { data, error } = await client.from('import_rows').select('*').eq('batch_id', batchId).order('row_number', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function saveSupabaseCustomer(input: CustomerForm, existing?: Customer) {
  const client = requireSupabase()
  const payload = {
    name: input.name.trim(),
    document: input.document.trim() || null,
    phone: input.phone.trim() || null,
    email: input.email.trim() || null,
    notes: input.notes.trim() || null,
    active: input.active,
  }
  const query = existing
    ? client.from('clients').update(payload).eq('id', existing.id)
    : client.from('clients').insert(payload)
  const { data, error } = await query.select('id').single()
  if (error) throw error
  return data.id
}

export async function deleteSupabaseCustomer(id: string) {
  const client = requireSupabase()
  const { error } = await client.from('clients').delete().eq('id', id)
  if (error) throw error
}

export async function fetchSupabaseProducts() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('products')
    .select('*, stock_balances(quantity, updated_at)')
    .order('name', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function saveSupabaseProduct(input: SupabaseProductInput, existing?: Product) {
  const client = requireSupabase()
  const payload = {
    ...toSupabaseProduct(input),
    stock_known: existing ? (input.stockKnown ? existing.stockKnown : false) : false,
  }
  let productId = existing?.id

  if (productId) {
    const { error } = await client.from('products').update(payload).eq('id', productId)
    if (error) throw error
  } else {
    const { data, error } = await client.from('products').insert(payload).select().single()
    if (error) throw error
    productId = data.id
  }

  const currentQuantity = existing?.quantity ?? 0
  const needsBalanceAdjustment = input.stockKnown && (existing?.stockKnown === false || input.quantity !== currentQuantity)

  if (needsBalanceAdjustment && (input.quantity !== 0 || currentQuantity !== 0)) {
    await registerSupabaseMovement({
      type: 'ajuste',
      productId,
      quantity: String(input.quantity),
      reason: existing ? 'Atualização do saldo pelo cadastro do produto' : 'Saldo inicial informado no cadastro',
      destination: '',
      reference: '',
      notes: '',
      customerId: '',
      isSale: false,
    })
  } else if (productId && input.stockKnown && !existing?.stockKnown) {
    const { error } = await client.from('products').update({ stock_known: true }).eq('id', productId)
    if (error) throw error
  }

  return loadSupabaseInventory()
}

export async function createSupabaseProduct(input: SupabaseProductInput) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('products')
    .insert(toSupabaseProduct(input))
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateSupabaseProduct(id: string, input: SupabaseProductInput) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('products')
    .update(toSupabaseProduct(input))
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function registerSupabaseMovement(input: MovementForm, idempotencyKey = crypto.randomUUID()) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('register_stock_movement_with_customer', {
    p_product_id: input.productId,
    p_movement_type: input.type,
    p_quantity: Number(input.quantity),
    p_reason: input.reason.trim(),
    p_destination: input.destination.trim() || null,
    p_reference: input.reference.trim() || null,
    p_notes: input.notes.trim() || null,
    p_idempotency_key: idempotencyKey,
    p_is_sale: input.type === 'saida' && input.isSale,
    p_customer_id: input.type === 'saida' && input.isSale ? input.customerId || null : null,
  })

  if (error) throw new Error(toMovementErrorMessage(error.message))
  return data?.[0] ?? null
}

function toMovementErrorMessage(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('not_authorized')) return 'Seu usuário não tem permissão para registrar movimentações.'
  if (normalized.includes('not_authenticated')) return 'Sua sessão expirou. Entre novamente para registrar a movimentação.'
  if (normalized.includes('insufficient_stock')) return 'A saída não pode ser maior que o saldo atual do produto.'
  if (normalized.includes('quantity_must_be_non_negative')) return 'A quantidade do ajuste não pode ser negativa.'
  if (normalized.includes('quantity_must_be_positive')) return 'Informe uma quantidade maior que zero.'
  if (normalized.includes('adjustment_does_not_change_stock')) return 'O ajuste precisa alterar o saldo atual.'
  if (normalized.includes('reason_is_required')) return 'Informe o motivo da movimentação.'
  if (normalized.includes('product_not_found_or_inactive')) return 'O produto selecionado está inativo ou não existe mais.'
  if (normalized.includes('customer_is_required')) return 'Selecione o cliente para registrar a venda.'
  if (normalized.includes('customer_not_found_or_inactive')) return 'O cliente selecionado está inativo ou não existe mais.'
  return 'Não foi possível registrar a movimentação no Supabase.'
}

export type SupabaseProduct = Tables<'products'>

function toSupabaseProduct(input: SupabaseProductInput) {
  return {
    name: input.name.trim(),
    sku: input.sku.trim() || null,
    image_url: input.imageUrl.trim() || null,
    category: input.category,
    description: input.description.trim() || null,
    unit: input.unit || null,
    min_stock: Number(input.minStock) || 0,
    location: input.location.trim() || null,
    stock_known: input.stockKnown,
    active: input.active,
  }
}

type ProductRow = Tables<'products'> & {
  stock_balances: { quantity: number; updated_at: string } | { quantity: number; updated_at: string }[] | null
}

function toProduct(row: ProductRow): Product {
  const balance = Array.isArray(row.stock_balances) ? row.stock_balances[0] : row.stock_balances
  return {
    id: row.id,
    name: row.name,
    sku: row.sku ?? '',
    imageUrl: row.image_url ?? '',
    category: toCategory(row.category),
    description: row.description ?? '',
    unit: row.unit === 'un' || row.unit === 'kg' || row.unit === 'm' || row.unit === 'L' ? row.unit : '',
    quantity: Number(balance?.quantity ?? 0),
    minStock: Number(row.min_stock ?? 0),
    stockKnown: row.stock_known,
    location: row.location ?? '',
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toMovement(row: Tables<'stock_movements'>): Movement {
  return {
    id: row.id,
    productId: row.product_id,
    type: row.movement_type,
    quantity: Number(row.quantity),
    previousStock: Number(row.previous_quantity),
    nextStock: Number(row.next_quantity),
    date: row.effective_at ?? row.created_at,
    user: row.performed_by ?? 'Usuário do Supabase',
    reason: row.reason,
    destination: row.destination ?? '',
    reference: row.reference ?? '',
    notes: row.notes ?? '',
    customerId: row.customer_id ?? '',
    customerName: row.customer_name ?? '',
    isSale: row.is_sale,
    batchId: row.batch_id ?? '',
    importRowId: row.import_row_id ?? '',
    sourceOperationKey: row.source_operation_key ?? '',
    effectiveAt: row.effective_at ?? '',
  }
}

function toImportBatch(row: Tables<'import_batches'>): ImportBatch {
  return {
    id: row.id,
    fileName: row.file_name,
    fileFormat: row.file_format,
    referenceStart: row.reference_start ?? '',
    referenceEnd: row.reference_end ?? '',
    status: row.status,
    processedAt: row.processed_at,
    confirmedAt: row.confirmed_at ?? '',
    createdBy: row.created_by,
    totalRows: row.total_rows,
    importedRows: row.imported_rows,
    duplicateRows: row.duplicate_rows,
    ignoredRows: row.ignored_rows,
    fileCount: row.file_count,
    detectedFormats: Array.isArray(row.detected_formats) ? row.detected_formats.map(String) : [],
    pendingRows: row.pending_rows,
    invalidRows: row.invalid_rows,
    warnings: Array.isArray(row.warnings) ? row.warnings.map(String) : [],
    errors: Array.isArray(row.errors) ? row.errors.map(String) : [],
    createdAt: row.created_at,
  }
}

function toProductMapping(row: Tables<'product_external_mappings'>): ProductExternalMapping {
  return {
    id: row.id,
    externalSystem: row.external_system,
    identifierType: row.identifier_type,
    externalIdentifier: row.external_identifier,
    productId: row.product_id,
  }
}

function toCustomer(row: Tables<'clients'>): Customer {
  return {
    id: row.id,
    name: row.name,
    document: row.document ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    notes: row.notes ?? '',
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toCategory(value: string | null): Category {
  return categories.includes(value as Category) ? value as Category : 'Protecocho'
}

function toImportErrorMessage(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('pending_rows')) return 'Corrija todos os registros pendentes antes de confirmar o lote.'
  if (normalized.includes('sales_order_not_stock_movement')) return 'O pedido de venda precisa de uma classificação manual antes de confirmar a movimentação.'
  if (normalized.includes('product_not_found')) return 'Associe o registro a um produto ativo do cadastro antes de confirmar o lote.'
  if (normalized.includes('invalid_movement_type')) return 'Selecione uma operação válida para todos os registros antes de confirmar o lote.'
  if (normalized.includes('batch_not_found')) return 'O lote de importação não foi encontrado. Gere uma nova prévia.'
  if (normalized.includes('column reference')) return 'A função de confirmação do lote está desatualizada no banco. Aplique as migrações pendentes do Supabase.'
  if (normalized.includes('insufficient_stock')) return 'O lote contém uma saída que deixaria o estoque negativo. Nenhuma linha foi aplicada.'
  if (normalized.includes('unit_mismatch')) return 'O lote contém unidade de medida incompatível com o cadastro. Nenhuma linha foi aplicada.'
  if (normalized.includes('adjustment_no_change')) return 'O lote contém um ajuste que não altera o saldo. Nenhuma linha foi aplicada.'
  if (normalized.includes('already_processed')) return 'Este lote já foi processado e não pode ser confirmado novamente.'
  if (normalized.includes('not_authorized')) return 'Seu usuário não tem permissão para confirmar importações.'
  return 'Não foi possível confirmar o lote. Nenhuma alteração parcial foi mantida.'
}
