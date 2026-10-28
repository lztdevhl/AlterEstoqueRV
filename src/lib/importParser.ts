import * as XLSX from 'xlsx'
import type { Product, MovementType } from './types'
import { readUniversalFiles, type DetectedImportFormat, type ExtractedImportDocument } from './importFormats'

export type ImportValidationStatus = 'valid' | 'pending' | 'error' | 'duplicate' | 'ignored'
export type ImportFilter = 'all' | 'valid' | 'entrada' | 'saida' | 'duplicate' | 'unmatched' | 'error'

export interface OperationRule {
  label: string
  type: MovementType | 'ignorar'
  aliases: string[]
}

export interface ImportColumnMap {
  date?: string
  document?: string
  lineId?: string
  productCode?: string
  barcode?: string
  productName?: string
  operation?: string
  quantity?: string
  unit?: string
  status?: string
  balance?: string
  accessKey?: string
  series?: string
  cfop?: string
  fiscalStatus?: string
  issuer?: string
  recipient?: string
  documentType?: string
  dueDate?: string
  customer?: string
  unitPrice?: string
  lineTotal?: string
  documentTotal?: string
  sourceFile?: string
  format?: string
}

export interface ProductExternalMapping {
  id?: string
  externalSystem: string
  identifierType: 'sku' | 'barcode' | 'external_code' | 'name'
  externalIdentifier: string
  productId: string
}

export interface ImportRow {
  id?: string
  rowNumber: number
  source: Record<string, string>
  sourceRecordKey: string
  productText: string
  externalCode: string
  barcode: string
  productName: string
  productId: string
  productMatch: 'sku' | 'barcode' | 'mapping' | 'name' | 'suggestion' | 'none' | 'ambiguous'
  suggestedProductIds: string[]
  operationText: string
  type: MovementType | null
  manualClassification?: boolean
  quantity: number | null
  unit: string
  date: string
  document: string
  documentKey: string
  series: string
  cfop: string
  fiscalStatus: string
  issuer: string
  recipient: string
  documentType: string
  documentStatus: string
  dueDate: string
  customer: string
  unitPrice: number | null
  lineTotal: number | null
  documentTotal: number | null
  sourceFile: string
  detectedFormat: string
  status: ImportValidationStatus
  errors: string[]
  warnings: string[]
  duplicateOf?: string
  previousStock?: number
  projectedStock?: number
  idempotencyKey: string
}

export interface ImportParseResult {
  headers: string[]
  rows: ImportRow[]
  detectedMap: ImportColumnMap
  warnings: string[]
  documentErrors?: string[]
  sourceDocuments?: ExtractedImportDocument[]
  detectedFormat?: DetectedImportFormat | 'mixed'
}

export const DEFAULT_OPERATION_RULES: OperationRule[] = [
  { label: 'Entrada por recebimento', type: 'entrada', aliases: ['entrada', 'recebimento', 'compra', 'recebido'] },
  { label: 'Entrada por devolução', type: 'entrada', aliases: ['devolucao', 'devolução', 'retorno'] },
  { label: 'Saída por venda', type: 'saida', aliases: ['saida', 'saída', 'saida venda', 'saída venda', 'venda', 'vendido'] },
  { label: 'Saída por transferência', type: 'saida', aliases: ['transferencia', 'transferência', 'remessa'] },
  { label: 'Saída por baixa física', type: 'saida', aliases: ['baixa', 'baixas', 'baixa fisica', 'baixas fisicas', 'saida fisica', 'saida por baixa'] },
  { label: 'Ajuste de inventário', type: 'ajuste', aliases: ['ajuste', 'inventario', 'inventário', 'contagem'] },
  { label: 'Cancelamento / estorno', type: 'ignorar', aliases: ['cancelamento', 'cancelado', 'estorno', 'estornado'] },
]

const columnAliases: Partial<Record<keyof ImportColumnMap, string[]>> = {
  date: ['data', 'data operacao', 'data operação', 'data movimento', 'data movimentacao', 'data movimentação'],
  document: ['documento', 'numero documento', 'número documento', 'nf', 'nota fiscal', 'pedido', 'referencia', 'referência'],
  lineId: ['id', 'id operacao', 'id operação', 'id linha', 'linha', 'codigo movimento', 'código movimento'],
  productCode: ['sku', 'codigo', 'código', 'codigo produto', 'código produto', 'cod produto', 'cod. produto'],
  barcode: ['ean', 'gtin', 'codigo barras', 'código barras', 'barcode'],
  productName: ['produto', 'nome produto', 'descricao', 'descrição', 'item', 'material'],
  operation: ['tipo', 'tipo operacao', 'tipo operação', 'operacao', 'operação', 'movimento', 'natureza'],
  quantity: ['quantidade', 'qtd', 'qtde', 'quant'],
  unit: ['unidade', 'un', 'und', 'unidade medida'],
  status: ['status', 'situacao', 'situação', 'estado'],
  balance: ['saldo', 'saldo final', 'estoque final', 'saldo apos', 'saldo após'],
}

export function normalizeImportText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function compactIdentifier(value: unknown): string {
  return normalizeImportText(value).replace(/[^a-z0-9]/g, '')
}

function stableId(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0')
  return `${hex}-0000-4000-8000-${hex}${hex.slice(0, 4)}`
}

function parseNumber(value: string): number | null {
  const raw = value.trim().replace(/r\$\s*/i, '').replace(/\s/g, '')
  if (!raw) return null
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.lastIndexOf(',') > raw.lastIndexOf('.') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '')
    : raw.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeUnit(value: string): string {
  const unit = normalizeImportText(value)
  if (['un', 'und', 'unidade', 'unidades'].includes(unit)) return 'un'
  if (['l', 'lt', 'litro', 'litros'].includes(unit)) return 'l'
  return unit
}

function parseDate(value: string): string {
  if (!value.trim()) return ''
  const excelDate = Number(value)
  if (Number.isFinite(excelDate) && excelDate > 20000 && excelDate < 80000) {
    const date = XLSX.SSF.parse_date_code(excelDate)
    if (date) return new Date(Date.UTC(date.y, date.m - 1, date.d, date.H, date.M, Math.floor(date.S))).toISOString()
  }
  const br = value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (br) {
    const year = br[3].length === 2 ? Number(`20${br[3]}`) : Number(br[3])
    const date = new Date(Date.UTC(year, Number(br[2]) - 1, Number(br[1])))
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}
function findHeaderMap(headers: string[]): ImportColumnMap {
  const map: ImportColumnMap = {}
  for (const [field, aliases] of Object.entries(columnAliases) as [keyof ImportColumnMap, string[]][]) {
    const exact = headers.find((header) => aliases.some((alias) => normalizeImportText(header) === normalizeImportText(alias)))
    const found = exact || headers.find((header) => {
      const normalized = normalizeImportText(header)
      return aliases.some((alias) => {
        const normalizedAlias = normalizeImportText(alias)
        return normalized === normalizedAlias || (normalizedAlias.length >= 4 && normalized.includes(normalizedAlias))
      })
    })
    if (found) map[field] = found
  }
  const additionalAliases: Partial<Record<keyof ImportColumnMap, string[]>> = {
    date: ['data emissão', 'data emissao'], document: ['número nf', 'numero nf'], lineId: [], productCode: [], barcode: [], productName: [], operation: [], quantity: [], unit: [], status: [], balance: [],
    accessKey: ['chave nfe', 'chave nf-e', 'chave de acesso', 'access key'], series: ['serie', 'série'], cfop: ['cfop'], fiscalStatus: ['status fiscal', 'situação fiscal', 'situacao fiscal', 'status nf-e'], issuer: ['emitente', 'fornecedor'], recipient: ['destinatário', 'destinatario', 'cliente'], sourceFile: ['arquivo de origem'], format: ['formato detectado'],
  }
  for (const [field, aliases] of Object.entries(additionalAliases) as [keyof ImportColumnMap, string[]][]) {
    if (map[field]) continue
    const found = headers.find((header) => aliases.some((alias) => normalizeImportText(header) === normalizeImportText(alias)))
    if (found) map[field] = found
  }
  const pdfAliases: Partial<Record<keyof ImportColumnMap, string[]>> = {
    accessKey: ['chave do documento'],
    documentType: ['tipo de documento'],
    dueDate: ['previsao de faturamento', 'previsão de faturamento', 'previsao de entrega', 'previsão de entrega'],
    customer: ['cliente', 'destinatario', 'destinatário'],
    unitPrice: ['valor unitario', 'valor unitário', 'preco unitario', 'preço unitário'],
    lineTotal: ['valor total', 'total da linha'],
    documentTotal: ['total do pedido', 'valor total do pedido'],
  }
  for (const [field, aliases] of Object.entries(pdfAliases) as [keyof ImportColumnMap, string[]][]) {
    if (map[field]) continue
    const found = headers.find((header) => aliases.some((alias) => normalizeImportText(header) === normalizeImportText(alias)))
    if (found) map[field] = found
  }
  return map
}

function productWords(text: string): string[] {
  return normalizeImportText(text).replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter((word) => word && !['de', 'do', 'da', 'para', 'em'].includes(word))
}

function similarWord(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.min(a.length, b.length) < 5 || /\d/.test(a + b) || Math.abs(a.length - b.length) > 1) return false
  let i = 0; let j = 0; let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length >= b.length) i++
    if (b.length >= a.length) j++
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

function scoreProduct(product: Product, text: string): number {
  const words = productWords(text)
  const target = productWords(product.name)
  const normalized = words.join(' ')
  const productName = target.join(' ')
  if (!normalized || !productName) return 0
  if (productName === normalized) return 100
  const numbers = words.filter((word) => /^\d+$/.test(word))
  const targetNumbers = target.filter((word) => /^\d+$/.test(word))
  if (numbers.length && targetNumbers.length && numbers.join() !== targetNumbers.join()) return 0
  if (words.includes('sem') && target.includes('com') || words.includes('com') && target.includes('sem')) return 0
  const remaining = [...target]
  let matches = 0
  for (const word of words) {
    const index = remaining.findIndex((candidate) => similarWord(word, candidate))
    if (index >= 0) { matches++; remaining.splice(index, 1) }
  }
  return Math.round(100 * 2 * matches / (words.length + target.length))
}

function classifyOperation(value: string, rules: OperationRule[]): { type: MovementType | null; ignored: boolean } {
  const normalized = normalizeImportText(value)
  if (!normalized) return { type: null, ignored: false }
  const matchingRule = rules.find((rule) => rule.aliases.some((alias) => normalized === normalizeImportText(alias) || normalized.includes(normalizeImportText(alias))))
  if (!matchingRule) return { type: null, ignored: false }
  return { type: matchingRule.type === 'ignorar' ? null : matchingRule.type, ignored: matchingRule.type === 'ignorar' }
}

function cell(row: Record<string, unknown>, key?: string): string {
  return key ? String(row[key] ?? '').trim() : ''
}

export function matchImportProduct(
  values: Pick<ImportRow, 'externalCode' | 'barcode' | 'productName'>,
  products: Product[],
  mappings: ProductExternalMapping[] = [],
): Pick<ImportRow, 'productId' | 'productMatch' | 'suggestedProductIds'> {
  products = products.filter((product) => product.active)
  const code = compactIdentifier(values.externalCode)
  const barcode = compactIdentifier(values.barcode)
  const name = normalizeImportText(values.productName)
  const mappingFor = (identifierType: ProductExternalMapping['identifierType'], identifier: string) => mappings.find((item) => item.identifierType === identifierType && (identifierType === 'name' ? normalizeImportText(item.externalIdentifier) === identifier : compactIdentifier(item.externalIdentifier) === identifier))
  const skuMatches = code ? products.filter((product) => compactIdentifier(product.sku) === code) : []
  if (skuMatches.length === 1) return { productId: skuMatches[0].id, productMatch: 'sku', suggestedProductIds: [] }
  const barcodeMapping = barcode && mappingFor('barcode', barcode)
  if (barcodeMapping && products.some((product) => product.id === barcodeMapping.productId)) return { productId: barcodeMapping.productId, productMatch: 'barcode', suggestedProductIds: [] }
  const codeMapping = code && (mappingFor('external_code', code) || mappingFor('sku', code))
  if (codeMapping && products.some((product) => product.id === codeMapping.productId)) return { productId: codeMapping.productId, productMatch: 'mapping', suggestedProductIds: [] }
  const nameMapping = name && mappingFor('name', name)
  if (nameMapping && products.some((product) => product.id === nameMapping.productId)) return { productId: nameMapping.productId, productMatch: 'mapping', suggestedProductIds: [] }
  const nameMatches = name ? products.filter((product) => normalizeImportText(product.name) === name) : []
  if (nameMatches.length === 1) return { productId: nameMatches[0].id, productMatch: 'name', suggestedProductIds: [] }
  const candidates = products.map((product) => ({ product, score: scoreProduct(product, values.productName) })).filter((item) => item.score >= 60).sort((a, b) => b.score - a.score)
  if (candidates.length && candidates[0].score > (candidates[1]?.score ?? 0) + 10) return { productId: candidates[0].product.id, productMatch: 'suggestion', suggestedProductIds: candidates.slice(0, 3).map((item) => item.product.id) }
  return { productId: '', productMatch: nameMatches.length > 1 || candidates.length > 1 ? 'ambiguous' : 'none', suggestedProductIds: [...nameMatches, ...candidates.map((item) => item.product)].slice(0, 3).map((product) => product.id) }
}

export function parseReportRows(
  rawRows: Record<string, unknown>[],
  products: Product[],
  mappings: ProductExternalMapping[] = [],
  rules: OperationRule[] = DEFAULT_OPERATION_RULES,
  fileFingerprint = 'report',
): ImportParseResult {
  const headers = [...new Set(rawRows.flatMap((row) => Object.keys(row)))]
  const detectedMap = findHeaderMap(headers)
  const warnings: string[] = []
  if (!detectedMap.quantity) warnings.push('Não foi possível identificar automaticamente a coluna de quantidade.')
  if (!detectedMap.operation) warnings.push('A coluna de operação não foi identificada; as linhas ficarão pendentes até a configuração do layout.')
  const rows: ImportRow[] = rawRows.map((raw, index) => {
    const externalCode = cell(raw, detectedMap.productCode)
    const barcode = cell(raw, detectedMap.barcode)
    const productName = cell(raw, detectedMap.productName)
    const operationText = cell(raw, detectedMap.operation)
    const quantity = parseNumber(cell(raw, detectedMap.quantity))
    const date = parseDate(cell(raw, detectedMap.date))
    const document = cell(raw, detectedMap.document)
    const documentKey = cell(raw, detectedMap.accessKey)
    const fiscalStatus = cell(raw, detectedMap.fiscalStatus)
    const documentType = cell(raw, detectedMap.documentType)
    const documentStatus = cell(raw, detectedMap.status)
    const dueDate = cell(raw, detectedMap.dueDate)
    const customer = cell(raw, detectedMap.customer)
    const unitPrice = parseNumber(cell(raw, detectedMap.unitPrice))
    const lineTotal = parseNumber(cell(raw, detectedMap.lineTotal))
    const documentTotal = parseNumber(cell(raw, detectedMap.documentTotal))
    const productMatch = matchImportProduct({ externalCode, barcode, productName }, products, mappings)
    const isSalesOrder = /pedido\s+de\s+venda/.test(normalizeImportText(`${documentType} ${operationText} ${document}`))
    const isCanceled = /cancelad|estornad|denegad|invalida|inv[aá]lida/.test(normalizeImportText(`${fiscalStatus} ${documentStatus} ${operationText}`))
    const operation = isCanceled ? { type: null, ignored: true } : isSalesOrder ? { type: null, ignored: false } : classifyOperation(operationText, rules)
    const errors: string[] = []
    const warningsForRow: string[] = []
    if (isSalesOrder) errors.push('Pedido de venda nÃ£o comprova saÃ­da fÃ­sica; pendente de faturamento/validaÃ§Ã£o.')
    const hasStableLineId = Boolean(cell(raw, detectedMap.lineId))
    if (!hasStableLineId) warningsForRow.push('O relatório não trouxe identificador estável da operação; a deduplicação entre arquivos diferentes exige revisão.')
    if (!productMatch.productId) errors.push(productMatch.productMatch === 'ambiguous' ? 'Produto com correspondência ambígua.' : 'Produto não encontrado no cadastro.')
    if (quantity === null || (operation.type === 'ajuste' ? quantity < 0 : quantity <= 0)) errors.push('Quantidade inválida ou ausente.')
    if (!date) errors.push('Data da operação inválida ou ausente.')
    if (!operation.type && !operation.ignored) errors.push('Tipo de operação pendente de classificação.')
    if (operation.ignored) warningsForRow.push('Registro financeiro/cancelamento não altera o estoque e será ignorado.')
    if (fiscalStatus && /nao confirmado|nÃ£o confirmado|cancelad|invalida|invÃ¡lida|denegad/i.test(fiscalStatus) && !operation.ignored) errors.push('Status fiscal não confirmado ou inválido.')
    const sourceRecordKey = compactIdentifier(cell(raw, detectedMap.lineId)) || stableId(`${fileFingerprint}|${index + 1}|${document}|${externalCode}|${productName}|${operationText}|${cell(raw, detectedMap.date)}|${cell(raw, detectedMap.quantity)}`)
    const idempotencyKey = stableId(`${fileFingerprint}|${sourceRecordKey}`)
    const hardErrors = errors.some((item) => /quantidade|data da operação/i.test(item))
    return {
      rowNumber: index + 2,
      source: Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, String(value ?? '')])),
      sourceRecordKey,
      productText: productName || externalCode || barcode,
      externalCode,
      barcode,
      productName,
      productId: productMatch.productId,
      productMatch: productMatch.productMatch,
      suggestedProductIds: productMatch.suggestedProductIds,
      operationText,
      type: operation.type,
      manualClassification: false,
      quantity,
      unit: cell(raw, detectedMap.unit),
      date,
      document,
      documentKey,
      series: cell(raw, detectedMap.series),
      cfop: cell(raw, detectedMap.cfop),
      fiscalStatus,
      issuer: cell(raw, detectedMap.issuer),
      recipient: cell(raw, detectedMap.recipient),
      documentType,
      documentStatus,
      dueDate,
      customer,
      unitPrice,
      lineTotal,
      documentTotal,
      sourceFile: cell(raw, detectedMap.sourceFile),
      detectedFormat: cell(raw, detectedMap.format),
      status: operation.ignored ? 'ignored' : hardErrors ? 'error' : errors.length ? 'pending' : 'valid',
      errors,
      warnings: warningsForRow,
      idempotencyKey,
    }
  })
  if (rows.some((row) => row.warnings.length)) warnings.push('Há linhas sem identificador estável de origem. A reimportação do mesmo arquivo é protegida, mas períodos sobrepostos devem ser revisados.')
  return { headers, rows, detectedMap, warnings }
}

export async function readReportFile(file: File): Promise<{ rows: Record<string, unknown>[]; fingerprint: string; format: DetectedImportFormat | 'mixed' }> {
  const result = await readUniversalFiles([file])
  if (!result.rows.length) throw new Error(result.warnings.join(' ') || 'O arquivo não contém registros processáveis.')
  return { rows: result.rows, fingerprint: result.fingerprint, format: result.format }
}

export function calculateImportProjection(rows: ImportRow[], products: Product[]): ImportRow[] {
  const balances = new Map(products.map((product) => [product.id, product.quantity]))
  return [...rows].sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.rowNumber - b.rowNumber).map((row) => {
    const errorsWithoutProjection = row.errors.filter((error) => !['A operação deixará o estoque negativo.', 'Unidade de medida incompatível com o produto.'].includes(error))
    if (errorsWithoutProjection.length !== row.errors.length) row = { ...row, errors: errorsWithoutProjection, status: errorsWithoutProjection.length ? 'pending' : 'valid', previousStock: undefined, projectedStock: undefined }
    if (!row.productId || !row.type || row.quantity === null || row.status !== 'valid') return row
    const previousStock = balances.get(row.productId) ?? 0
    const product = products.find((item) => item.id === row.productId)
    const errors = [...row.errors]
    if (row.unit && product?.unit && normalizeUnit(row.unit) !== normalizeUnit(product.unit) && !errors.includes('Unidade de medida incompatível com o produto.')) {
      errors.push('Unidade de medida incompatível com o produto.')
    }
    if (errors.length && !errors.includes('A operação deixará o estoque negativo.')) {
      return { ...row, errors, status: 'pending' as const }
    }
    const projectedStock = row.type === 'entrada' ? previousStock + row.quantity : row.type === 'saida' ? previousStock - row.quantity : row.quantity
    if (projectedStock < 0 && !errors.includes('A operação deixará o estoque negativo.')) errors.push('A operação deixará o estoque negativo.')
    balances.set(row.productId, projectedStock)
    return { ...row, previousStock, projectedStock, errors, status: errors.length ? 'pending' : row.status }
  })
}
