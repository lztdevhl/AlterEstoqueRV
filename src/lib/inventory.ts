import type { MovementForm, Product, Movement } from './types'

export class InventoryError extends Error {}

export const applyMovement = (
  products: Product[],
  movements: Movement[],
  form: MovementForm,
  now = new Date().toISOString(),
): { products: Product[]; movements: Movement[] } => {
  const product = products.find((item) => item.id === form.productId)
  if (!product) throw new InventoryError('Selecione um produto válido.')
  const value = Number(form.quantity)

  if (!Number.isFinite(value) || value <= 0) {
    throw new InventoryError('Informe uma quantidade maior que zero.')
  }
  if (!form.reason.trim()) throw new InventoryError('Informe o motivo da movimentação.')

  const previousStock = product.quantity
  let nextStock = previousStock
  let recordedQuantity = value

  if (form.type === 'entrada') nextStock += value
  if (form.type === 'saida') {
    if (value > previousStock) throw new InventoryError('A saída não pode superar o saldo disponível.')
    nextStock -= value
  }
  if (form.type === 'ajuste') {
    nextStock = value
    recordedQuantity = Math.abs(nextStock - previousStock)
    if (nextStock === previousStock) throw new InventoryError('O ajuste não altera o saldo atual.')
  }

  const updatedProduct: Product = { ...product, quantity: nextStock, stockKnown: true, updatedAt: now }
  const updatedProducts = products.map((item) => (item.id === product.id ? updatedProduct : item))
  const movement: Movement = {
    id: `mov-${Date.now()}`,
    productId: product.id,
    type: form.type,
    quantity: recordedQuantity,
    previousStock,
    nextStock,
    date: now,
    user: 'Usuário local',
    reason: form.reason.trim(),
    destination: form.destination.trim(),
    reference: form.reference.trim(),
    notes: form.notes.trim(),
    customerId: form.type === 'saida' && form.isSale ? form.customerId : '',
    isSale: form.type === 'saida' && form.isSale,
  }
  return { products: updatedProducts, movements: [movement, ...movements] }
}
