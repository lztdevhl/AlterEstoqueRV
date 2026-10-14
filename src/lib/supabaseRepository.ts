import type { Customer, CustomerForm, Movement, MovementForm, Product, ProductForm } from './types'
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

export async function loadSupabaseInventory(): Promise<{ products: Product[]; movements: Movement[]; customers: Customer[] }> {
  const client = requireSupabase()
  const [{ data: productRows, error: productsError }, { data: movementRows, error: movementsError }, { data: customerRows, error: customersError }] = await Promise.all([
    client
      .from('products')
      .select('*, stock_balances(quantity, updated_at)')
      .order('name', { ascending: true }),
    client.from('stock_movements').select('*').order('created_at', { ascending: false }),
    client.from('clients').select('*').order('name', { ascending: true }),
  ])

  if (productsError) throw productsError
  if (movementsError) throw movementsError
  if (customersError) throw customersError

  return {
    products: (productRows ?? []).map(toProduct),
    movements: (movementRows ?? []).map(toMovement),
    customers: (customerRows ?? []).map(toCustomer),
  }
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
    date: row.created_at,
    user: row.performed_by ?? 'Usuário do Supabase',
    reason: row.reason,
    destination: row.destination ?? '',
    reference: row.reference ?? '',
    notes: row.notes ?? '',
    customerId: row.customer_id ?? '',
    customerName: row.customer_name ?? '',
    isSale: row.is_sale,
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
