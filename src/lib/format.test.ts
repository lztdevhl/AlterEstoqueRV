import { describe, expect, it } from 'vitest'
import { stockByUnit } from './format'
import type { Product } from './types'

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'product-1',
  name: 'Produto',
  sku: 'SKU-1',
  imageUrl: '',
  category: 'Protecocho',
  description: '',
  unit: '',
  quantity: 0,
  minStock: 0,
  stockKnown: true,
  location: '',
  active: true,
  createdAt: '',
  updatedAt: '',
  ...overrides,
})

describe('stockByUnit', () => {
  it('mantém no total os saldos cuja unidade não foi informada', () => {
    expect(stockByUnit([
      product({ quantity: 558 }),
      product({ id: 'product-2', quantity: 19 }),
    ])).toEqual({ itens: 577 })
  })

  it('continua separando os saldos quando a unidade está preenchida', () => {
    expect(stockByUnit([
      product({ quantity: 10, unit: 'un' }),
      product({ id: 'product-2', quantity: 2, unit: 'kg' }),
    ])).toEqual({ un: 10, kg: 2 })
  })
})
