import { describe, expect, it } from 'vitest'
import { calculateImportProjection, matchImportProduct, parseReportRows } from './importParser'
import type { Product } from './types'

const products: Product[] = [
  { id: 'p-1', name: 'Protecocho 200', sku: 'PD00001', imageUrl: '', category: 'Protecocho', description: '', unit: 'un', quantity: 10, minStock: 2, stockKnown: true, location: '', active: true, createdAt: '', updatedAt: '' },
  { id: 'p-2', name: 'Protecocho 250', sku: 'PD00002', imageUrl: '', category: 'Protecocho', description: '', unit: 'un', quantity: 4, minStock: 1, stockKnown: true, location: '', active: true, createdAt: '', updatedAt: '' },
]

describe('importParser', () => {
  it('prioriza SKU exato antes do nome', () => {
    expect(matchImportProduct({ externalCode: 'PD00002', barcode: '', productName: 'Protecocho 200' }, products).productId).toBe('p-2')
  })

  it('reconhece nome normalizado e não associa nomes ambíguos', () => {
    expect(matchImportProduct({ externalCode: '', barcode: '', productName: ' PROTECOCHO   200 ' }, products).productId).toBe('p-1')
    expect(matchImportProduct({ externalCode: '', barcode: '', productName: 'Protecocho' }, products).productMatch).toBe('ambiguous')
  })

  it('mantém operação sem regra como pendente', () => {
    const result = parseReportRows([{ Data: '15/10/2026', Código: 'PD00001', Produto: 'Protecocho 200', Tipo: 'Movimento especial', Quantidade: '2', Unidade: 'un' }], products)
    expect(result.rows[0].status).toBe('pending')
    expect(result.rows[0].errors).toContain('Tipo de operação pendente de classificação.')
  })

  it('calcula saldo projetado acumulando entradas e saídas em ordem', () => {
    const result = parseReportRows([
      { Data: '15/10/2026', Código: 'PD00001', Produto: 'Protecocho 200', Tipo: 'Saída por venda', Quantidade: '3', Unidade: 'un' },
      { Data: '14/10/2026', Código: 'PD00001', Produto: 'Protecocho 200', Tipo: 'Entrada por recebimento', Quantidade: '5', Unidade: 'un' },
    ], products)
    const projected = calculateImportProjection(result.rows, products)
    expect(projected.find((row) => row.type === 'entrada')?.projectedStock).toBe(15)
    expect(projected.find((row) => row.type === 'saida')?.projectedStock).toBe(12)
  })

  it('sinaliza saída que gera estoque negativo', () => {
    const result = parseReportRows([{ Data: '15/10/2026', Codigo: 'PD00002', Produto: 'Protecocho 250', Tipo: 'Saida', Quantidade: '9', Unidade: 'un' }], products)
    const projected = calculateImportProjection(result.rows, products)
    expect(projected[0].status).toBe('pending')
    expect(projected[0].errors).toContain('A operação deixará o estoque negativo.')
  })

  it('separa produto não encontrado e quantidade inválida', () => {
    const result = parseReportRows([{ Data: '15/10/2026', Codigo: 'DESCONHECIDO', Produto: 'Produto novo', Tipo: 'Entrada', Quantidade: 'abc' }], products)
    expect(result.rows[0].status).toBe('error')
    expect(result.rows[0].errors).toEqual(expect.arrayContaining(['Produto não encontrado no cadastro.', 'Quantidade inválida ou ausente.']))
  })

  it('ignora cancelamentos como registros sem impacto físico', () => {
    const result = parseReportRows([{ Data: '15/10/2026', Codigo: 'PD00001', Produto: 'Protecocho 200', Tipo: 'Cancelamento', Quantidade: '2' }], products)
    expect(result.rows[0].status).toBe('ignored')
    expect(result.rows[0].type).toBeNull()
  })

  it('mantÃ©m pedido de venda pendente sem gerar saÃ­da de estoque', () => {
    const result = parseReportRows([{ Data: '15/10/2026', Documento: 'Pedido de venda nº 8', Codigo: 'PD00001', Produto: 'Protecocho 200', 'Tipo de documento': 'Pedido de venda', Tipo: 'Pedido de venda', Quantidade: '42', Unidade: 'un', 'Valor unitÃ¡rio': 'R$ 2.115,00', 'Valor total': 'R$ 88.830,00', 'Total do pedido': 'R$ 96.600,00' }], products)
    const projected = calculateImportProjection(result.rows, products)
    expect(result.rows[0].status).toBe('pending')
    expect(result.rows[0].type).toBeNull()
    expect(result.rows[0].quantity).toBe(42)
    expect(result.rows[0].lineTotal).toBe(88830)
    expect(result.rows[0].documentTotal).toBe(96600)
    expect(result.rows[0].document).toBe('Pedido de venda nº 8')
    expect(result.rows[0].errors).toContain('Pedido de venda nÃ£o comprova saÃ­da fÃ­sica; pendente de faturamento/validaÃ§Ã£o.')
    expect(projected[0].projectedStock).toBeUndefined()
  })

  it('bloqueia unidade incompatível antes da confirmação', () => {
    const result = parseReportRows([{ Data: '15/10/2026', Codigo: 'PD00001', Produto: 'Protecocho 200', Tipo: 'Entrada', Quantidade: '2', Unidade: 'kg' }], products)
    const projected = calculateImportProjection(result.rows, products)
    expect(projected[0].status).toBe('pending')
    expect(projected[0].errors).toContain('Unidade de medida incompatível com o produto.')
  })
})
