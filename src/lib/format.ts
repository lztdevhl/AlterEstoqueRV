import type { Product, Unit } from './types'

export const formatNumber = (value: number, maximumFractionDigits = 2) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(value)

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(value))
    .replace('.', '')

export const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(new Date(value))
    .replace('.', '')

export const quantityLabel = (value: number, unit: Unit | string) => `${formatNumber(value)}${unit ? ` ${unit}` : ''}`

export const stockByUnit = (products: Product[]) =>
  products.reduce<Record<string, number>>((acc, product) => {
    const unit = product.unit || 'itens'
    acc[unit] = (acc[unit] ?? 0) + product.quantity
    return acc
  }, {})

export const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
