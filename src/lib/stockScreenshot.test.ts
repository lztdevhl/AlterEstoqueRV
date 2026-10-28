import { expect, it } from 'vitest'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { createWorker, PSM } from 'tesseract.js'
import { improveOcrContrast } from './ocrImage'
import { parseImageReportText } from './importFormats'
import { calculateImportProjection, parseReportRows } from './importParser'
import type { Product } from './types'

// Teste de integração opt-in: precisa baixar o idioma português na primeira execução.
it.skipIf(!process.env.TEST_REAL_OCR)('lê o print real e inicializa os 11 produtos antes das 9 baixas', async () => {
  const input = await loadImage('erro/Captura de tela 2026-10-28 164041.png')
  const canvas = createCanvas(input.width * 2, input.height * 2)
  const context = canvas.getContext('2d')
  context.drawImage(input, 0, 0, canvas.width, canvas.height)
  improveOcrContrast(context as unknown as CanvasRenderingContext2D, canvas.width, canvas.height)
  const worker = await createWorker('por', 1, { cachePath: 'node_modules/.cache' })
  try {
    await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
    const { data } = await worker.recognize(canvas.toBuffer('image/png'))
    const document = parseImageReportText(data.text, 'print.png')
    expect(document.errors).toEqual([])
    expect(document.rows).toHaveLength(15)
    expect(document.metadata).toMatchObject({ previousTotal: '71', physicalExitsTotal: '9', currentTotal: '62', productCount: '11' })
    const names = ['HIDRAMAX 600', 'HIDRAMAX 1300', 'NUTRISILO', 'MULTICOCHO 200', 'COCHO CONFINAMENTO', 'MULTICOCHO 250', 'PROTECOCHO BANDA (LATERAL)', 'TELHADO PROTECOCHO', 'PÉ CONFINAMENTO EM J', 'FECHAMENTO EM U', 'FECHAMENTO EM J']
    const products = names.map((name, index) => ({ id: String(index), name, sku: '', quantity: 0, active: true, unit: 'un' } as Product))
    const rows = parseReportRows(document.rows.map((row) => ({ ...row, Data: '28/10/2026' })), products).rows
    const projection = calculateImportProjection(rows, products)
    expect(projection.every((row) => row.status === 'valid')).toBe(true)
    const balances = new Map(projection.map((row) => [row.productId, row.projectedStock]))
    expect(balances.get('3')).toBe(15)
    expect(balances.get('5')).toBe(8)
    expect(balances.get('1')).toBe(0)
    expect([...balances.values()].reduce((sum, value) => sum! + value!, 0)).toBe(62)
    // Repetir a conciliação não acumula o saldo de abertura.
    const repeat = calculateImportProjection(rows, products.map((product) => ({ ...product, quantity: balances.get(product.id)! })))
    expect(new Map(repeat.map((row) => [row.productId, row.projectedStock]))).toEqual(balances)
    expect(parseImageReportText(data.text, 'renomeado.png').documentKey).toBe(document.documentKey)
  } finally { await worker.terminate() }
}, 60000)
