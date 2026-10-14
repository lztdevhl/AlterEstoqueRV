import { describe, expect, it } from 'vitest'
import { applyMovement, InventoryError } from './inventory'
import type { MovementForm, Product } from './types'

const product: Product = {
  id: 'p1', name: 'Produto', sku: 'SKU-1', imageUrl: '', category: 'Protecocho', description: '', unit: 'un',
  quantity: 10, minStock: 2, stockKnown: true, location: 'A-01', active: true, createdAt: '', updatedAt: '',
}
const form = (overrides: Partial<MovementForm>): MovementForm => ({
  type: 'entrada', productId: 'p1', quantity: '5', reason: 'Conferência', destination: '', reference: '', notes: '', customerId: '', isSale: false, ...overrides,
})

describe('regras de estoque', () => {
  it('aumenta o saldo ao registrar uma entrada', () => expect(applyMovement([product], [], form({})).products[0].quantity).toBe(15))
  it('diminui o saldo ao registrar uma saída', () => expect(applyMovement([product], [], form({ type: 'saida', quantity: '4' })).products[0].quantity).toBe(6))
  it('bloqueia saída acima do saldo', () => expect(() => applyMovement([product], [], form({ type: 'saida', quantity: '11' }))).toThrow(InventoryError))
  it('registra ajuste com saldo anterior e posterior', () => {
    const result = applyMovement([product], [], form({ type: 'ajuste', quantity: '7' }))
    expect(result.products[0].quantity).toBe(7)
    expect(result.movements[0]).toMatchObject({ previousStock: 10, nextStock: 7, quantity: 3 })
  })
  it('valida quantidade positiva e motivo', () => {
    expect(() => applyMovement([product], [], form({ quantity: '0' }))).toThrow('maior que zero')
    expect(() => applyMovement([product], [], form({ reason: ' ' }))).toThrow('motivo')
  })
})
