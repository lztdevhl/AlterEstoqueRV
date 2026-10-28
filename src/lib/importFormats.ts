import * as XLSX from 'xlsx'
import { unzipSync } from 'fflate'
import { XMLParser } from 'fast-xml-parser'
import { prepareOcrImage } from './ocrImage'

export type DetectedImportFormat = 'xml' | 'zip' | 'pdf' | 'image' | 'csv' | 'xlsx' | 'xls' | 'txt' | 'json'

export interface ExtractedImportDocument {
  fileName: string
  format: DetectedImportFormat
  rows: Record<string, unknown>[]
  warnings: string[]
  errors: string[]
  documentKey?: string
  documentType?: string
  documentLabel?: string
  documentNumber?: string
  documentDate?: string
  dueDate?: string
  customer?: string
  documentStatus?: string
  metadata?: Record<string, string>
}

export interface UniversalReadResult {
  rows: Record<string, unknown>[]
  documents: ExtractedImportDocument[]
  fingerprint: string
  format: DetectedImportFormat | 'mixed'
  warnings: string[]
}

const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_TOTAL_BYTES = 60 * 1024 * 1024
const MAX_ZIP_ENTRIES = 200
const MAX_ZIP_UNCOMPRESSED_BYTES = 60 * 1024 * 1024

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^\uFEFF/, '')
}

function hashBytes(bytes: Uint8Array): string {
  let hash = 2166136261
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619)
  return (hash >>> 0).toString(16)
}

function parseDelimitedText(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const sample = lines.slice(0, 5).join('\n')
  const delimiter = sample.split('\t').length > sample.split(';').length && sample.split('\t').length > sample.split(',').length ? '\t' : sample.split(';').length >= sample.split(',').length ? ';' : ','
  const parseLine = (line: string) => {
    const values: string[] = []
    let value = ''; let quoted = false
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]
      if (char === '"') {
        if (quoted && line[index + 1] === '"') { value += '"'; index += 1 } else quoted = !quoted
      } else if (char === delimiter && !quoted) { values.push(value.trim()); value = '' } else value += char
    }
    values.push(value.trim())
    return values
  }
  const headers = parseLine(lines[0])
  if (headers.length < 2 || headers.every((header) => !header)) return []
  return lines.slice(1).map((line) => Object.fromEntries(parseLine(line).map((value, index) => [headers[index] || `Coluna ${index + 1}`, value])))
}

function valueFromElement(parent: Element, ...names: string[]): string {
  const wanted = names.map((name) => name.toLowerCase())
  const element = [parent, ...Array.from(parent.querySelectorAll('*'))].find((item) => wanted.includes(item.localName?.toLowerCase() ?? ''))
  return element?.textContent?.trim() ?? ''
}

interface PdfMetadata {
  documentKey: string
  documentType: string
  documentLabel: string
  documentNumber: string
  documentDate: string
  dueDate: string
  customer: string
  documentStatus: string
  operation: string
  itemsTotal: string
  documentTotal: string
}

interface FilialStockProductRow {
  product: string
  previousStock: number
  physicalExits: number
  currentStock: number
}

interface FilialStockReport {
  errors: string[]
  branch: string
  reportDate: string
  previousTotal: number
  physicalExitsTotal: number
  entriesTotal: number
  currentTotal: number
  orderUnitsTotal: number
  products: FilialStockProductRow[]
}

function normalizePdfText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function firstPdfMatch(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return ''
}

function pdfMoney(value: string): boolean {
  const candidate = value.trim()
  return /^(?:r\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2,4}$/i.test(candidate) || /^(?:r\$\s*)?\d+,\d{2,4}$/i.test(candidate)
}

function pdfNumber(value: string): number | null {
  const raw = value.replace(/r\$\s*/i, '').replace(/\s/g, '').trim()
  if (!/^\d+(?:[.,]\d+)?$/.test(raw)) return null
  const normalized = raw.includes(',') && raw.includes('.') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(',', '.')
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function pdfDate(value: string): string {
  const match = value.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/)
  return match?.[1] ?? ''
}

function pdfQuantity(value: string): { value: number; unit: string } | null {
  const match = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*([A-Za-zÀ-ÿ]+)?$/)
  if (!match) return null
  const number = pdfNumber(match[1])
  if (number === null || number <= 0) return null
  return { value: number, unit: match[2] ?? '' }
}

function normalizeFilialReportText(value: string): string {
  // Alguns PDFs exportados pelo sistema usam glifos de fonte como caracteres
  // de controle. Removê-los deixa o texto comparável mesmo quando o acento
  // original não está disponível na camada de texto.
  return normalizePdfText(value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ''))
}

function cleanFilialReportText(value: string): string {
  return value
    .replace(/\u0003\u0004/g, 'ção')
    .replace(/\u0005/g, 'í')
    .replace(/\u0006/g, 'é')
    .replace(/\u0007/g, 'ó')
    .replace(/relat\u0001rio/gi, 'relatório')
    .replace(/p\u0001gina/gi, 'página')
    .replace(/\u0001/g, '')
    .replace(/\u0000/g, '')
    .replace(/\u00a0/g, ' ')
    .trim()
}

function parseFilialStockNumericRow(line: string): FilialStockProductRow | null {
  const cleaned = cleanFilialReportText(line).replace(/\|?\)\s+(?=\d)/g, 'J ').replace(/\|/g, ' ').replace(/(?<=\s)[oO](?=\s|$)/g, '0')
  let parts = splitPdfLine(cleaned)
  if (parts.length < 4) {
    const fallback = cleaned.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s*$/)
    if (fallback) parts = [fallback[1], fallback[2], fallback[3], fallback[4]]
  }
  if (parts.length < 4) return null
  const tail = parts.slice(-3).map(pdfNumber)
  if (tail.some((value) => value === null)) return null
  const product = parts.slice(0, -3).join(' ').trim()
  if (!product || normalizeFilialReportText(product).startsWith('total da filial')) return null
  return {
    product,
    previousStock: tail[0] ?? 0,
    physicalExits: tail[1] ?? 0,
    currentStock: tail[2] ?? 0,
  }
}

function parseFilialStockReport(lines: string[]): FilialStockReport | null {
  const normalizedLines = lines.map(normalizeFilialReportText)
  const fullText = normalizedLines.join('\n')
  const tableHeader = normalizedLines.findIndex((line) => /produto.*saldo anterior.*baixas\s*f[i\s]*sicas.*saldo/i.test(line))
  const looksLikeFilialStockReport = tableHeader >= 0
  if (!looksLikeFilialStockReport) return null

  const branch = lines.map(cleanFilialReportText).map((line) => line.match(/filial\s+(.+)$/i)?.[1]?.trim() ?? '').find(Boolean) ?? ''
  const reportDate = pdfDate(lines.map(cleanFilialReportText).join('\n'))
  const summaryHeaderIndex = normalizedLines.findIndex((line) => /estoque anterior.*baixas\s*f[i\s]*sicas.*entradas.*estoque atual/i.test(line))
  const summary = summaryHeaderIndex >= 0 ? (normalizedLines[summaryHeaderIndex + 1] ?? '').split(/\s+/).map(pdfNumber) : []
  const summaryValues = summary.length === 4 && summary.every((value) => value !== null) ? summary as number[] : [0, 0, 0, 0]

  const productsStart = tableHeader
  const productsEnd = normalizedLines.findIndex((line, index) => index > productsStart && /total da filial/i.test(line))
  const products: FilialStockProductRow[] = []
  const errors: string[] = []
  if (productsStart >= 0) {
    for (let index = productsStart + 1; index < (productsEnd > productsStart ? productsEnd : normalizedLines.length); index += 1) {
      if (/^\d+\.\s|^(qtd|municipio|cliente)\b/.test(normalizedLines[index])) break
      const row = parseFilialStockNumericRow(lines[index])
      if (row) products.push(row)
      else errors.push(`Linha não reconhecida: ${lines[index]}. Envie um print mais nítido.`)
    }
  }

  const orderUnitsTotal = normalizedLines.map((line) => line.match(/^(\d+(?:[.,]\d+)?)\s+unidades\s+vendidas/i)?.[1] ?? '')
    .map(pdfNumber).find((value): value is number => value !== null) ?? 0
  if (!products.length) return null
  if (productsEnd >= 0) {
    const total = parseFilialStockNumericRow(lines[productsEnd].replace(/total da filial/i, 'Total'))
    if (!total || total.previousStock !== products.reduce((sum, row) => sum + row.previousStock, 0)
      || total.physicalExits !== products.reduce((sum, row) => sum + row.physicalExits, 0)
      || total.currentStock !== products.reduce((sum, row) => sum + row.currentStock, 0)) {
      errors.push('A soma dos produtos não confere com o total da tabela. Confira se o print está completo e legível.')
    }
  }
  return {
    errors,
    branch,
    reportDate,
    previousTotal: summary.length === 4 ? summaryValues[0] : products.reduce((sum, row) => sum + row.previousStock, 0),
    physicalExitsTotal: summary.length === 4 ? summaryValues[1] : products.reduce((sum, row) => sum + row.physicalExits, 0),
    entriesTotal: summary.length === 4 ? summaryValues[2] : products.reduce((sum, row) => sum + row.currentStock - row.previousStock + row.physicalExits, 0),
    currentTotal: summary.length === 4 ? summaryValues[3] : products.reduce((sum, row) => sum + row.currentStock, 0),
    orderUnitsTotal,
    products,
  }
}

function buildFilialStockDocument(report: FilialStockReport, fileName: string, format: 'pdf' | 'image', extraWarning?: string): ExtractedImportDocument {
  const tableKey = hashBytes(new TextEncoder().encode(JSON.stringify(report.products)))
  const documentKey = `relatorio_estoque_filial:${report.branch || 'filial'}:${report.reportDate || tableKey}`
  const errors: string[] = [...report.errors]
  const inferredEntries = report.products.map((product) => product.currentStock - product.previousStock + product.physicalExits)
  if (inferredEntries.some((value) => value < 0) || Math.abs(inferredEntries.reduce((a, b) => a + b, 0) - report.entriesTotal) > 0.001
    || report.products.reduce((sum, row) => sum + row.physicalExits, 0) !== report.physicalExitsTotal) {
    errors.push('Os saldos e movimentos lidos não conferem com os totais. Envie uma imagem mais nítida da tabela completa.')
  }
  const rows = report.products.flatMap((product, index) => [
    { type: 'Ajuste', quantity: product.previousStock },
    { type: 'Entrada', quantity: inferredEntries[index] },
    { type: 'Saída', quantity: product.physicalExits },
  ].filter((movement) => movement.type === 'Ajuste' || movement.quantity > 0).map((movement) => ({
      ID: `${documentKey}:${normalizePdfText(product.product)}:${movement.type}`,
      Produto: cleanFilialReportText(product.product),
      Quantidade: String(movement.quantity).replace('.', ','),
      Unidade: 'UN',
      Documento: `Relatório de estoque${report.branch ? ` - ${report.branch}` : ''}`,
      'Chave do documento': documentKey,
      Data: report.reportDate,
      'Tipo de documento': 'Relatório de estoque da filial',
      Tipo: movement.type === 'Ajuste' ? 'Ajuste ao saldo anterior do relatório' : movement.type === 'Saída' ? 'Saída por baixa física' : 'Entrada física do relatório',
      'Modo de importação': 'saldo_inicial_e_movimentos',
      Situação: 'Confirmado no relatório',
      'Saldo anterior do item': String(product.previousStock),
      'Saldo do item': String(product.currentStock),
      'Baixas físicas do item': String(product.physicalExits),
      'Entradas da filial': String(report.entriesTotal),
      'Estoque anterior da filial': String(report.previousTotal),
      'Estoque atual da filial': String(report.currentTotal),
      Cliente: '',
      'Arquivo de origem': fileName,
      'Formato detectado': format,
    })))
  const warnings = [
    'O saldo anterior será conciliado com o cadastro antes das entradas e baixas. O resultado será o saldo do item mostrado no relatório, inclusive nos produtos sem saída.',
    `Relatório de estoque da filial${report.branch ? ` ${report.branch}` : ''} detectado: ${report.physicalExitsTotal} baixa(s) física(s), ${report.entriesTotal} entrada(s) e estoque final de ${report.currentTotal} unidade(s).`,
    report.entriesTotal > 0
      ? `Entradas calculadas por produto: saldo final - saldo anterior + baixas físicas. Confira as quantidades antes de confirmar.`
      : 'A seção de entradas foi lida e informa zero entradas no período.',
  ]
  if (report.orderUnitsTotal > 0) {
    warnings.push(`A seção de pedidos informa ${report.orderUnitsTotal} unidade(s) vendida(s), mas o estoque registra ${report.physicalExitsTotal} baixa(s) física(s). Apenas baixas físicas alteram o estoque; os pedidos não foram lançados novamente.`)
  }
  if (extraWarning) warnings.unshift(extraWarning)
  return {
    fileName,
    format,
    rows,
    warnings,
    errors,
    documentKey,
    documentType: 'relatorio_estoque_filial',
    documentLabel: 'Relatório de estoque da filial',
    documentDate: report.reportDate,
    documentStatus: 'Confirmado no relatório',
    metadata: {
      branch: report.branch,
      previousTotal: String(report.previousTotal),
      physicalExitsTotal: String(report.physicalExitsTotal),
      entriesTotal: String(report.entriesTotal),
      currentTotal: String(report.currentTotal),
      orderUnitsTotal: String(report.orderUnitsTotal),
      productCount: String(report.products.length),
    },
  }
}

function isPdfClassificationCode(value: string): boolean {
  const compact = value.replace(/[.\s/-]/g, '')
  return /^\d{3,8}$/.test(compact)
}

function pdfDocumentMetadata(lines: string[], fileName: string): PdfMetadata {
  const fullText = lines.join('\n')
  const normalized = normalizePdfText(fullText)
  const isSalesOrder = /pedido\s+de\s+venda/.test(normalized) || /pedido\s+venda/.test(normalized)
  const isNfe = /nota\s+fiscal|nf-e|nfe/.test(normalized)
  const isMovementReport = /relatorio\s+de\s+moviment|movimentacoes|movimentações/.test(normalized)
  const documentType = isSalesOrder ? 'pedido_venda' : isNfe ? 'nfe' : isMovementReport ? 'relatorio_movimentacoes' : 'outro'
  const documentLabel = isSalesOrder ? 'Pedido de venda' : isNfe ? 'NF-e' : isMovementReport ? 'Relatório de movimentações' : 'Documento comercial'
  const documentNumber = firstPdfMatch(fullText, [
    /\bN(?:\u00ba|o)?\s*[:.-]?\s*(\d+)\b/i,
    /pedido(?:\s+de\s+venda)?\s*(?:n[ºo°]?|numero|número|#)?\s*[:.-]?\s*([A-Z0-9-]+)/i,
    /(?:nota\s+fiscal|nf-e|nfe)\s*(?:n[ºo°]?|numero|número|#)?\s*[:.-]?\s*([A-Z0-9-]+)/i,
    /(?:documento|pedido)\s*(?:n[ºo°]?|numero|número|#)?\s*[:.-]?\s*([A-Z0-9-]+)/i,
  ])
  const documentDate = firstPdfMatch(fullText, [
    /pedido\s+de\s+venda\s*-\s*[^\n:]*:\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    /data\s+da\s+emiss(?:ao|\u00e3o)\s*[:.-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    /(?:data\s+(?:do\s+)?(?:pedido|documento|emissao|emissão)|emitido\s+em|pedido\s+em)\s*[:.-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
  ]) || pdfDate(fullText)
  const dueDate = firstPdfMatch(fullText, [
    /(?:previsao|previsão)\s+(?:de\s+)?(?:faturamento|entrega)\s*[:.-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
  ])
  const customer = firstPdfMatch(fullText, [
    /(?:cliente|destinatario|destinatário|tomador)\s*[:.-]\s*([^\n]+)/i,
  ])
  const customerFromSection = customer || (() => {
    const index = lines.findIndex((line) => /informacoes\s+do\s+cliente/i.test(normalizePdfText(line)))
    return index >= 0 ? lines.slice(index + 1).find((line) => line && !/^(itens|contato|endereco|cpf|cnpj)/i.test(normalizePdfText(line))) ?? '' : ''
  })()
  const customerValue = customerFromSection.split(/\t+/)[0].trim()
  const amountPattern = '(?:R\\$\\s*)?[\\d.]+,\\d{2,4}'
  const itemsTotal = firstPdfMatch(fullText, [
    new RegExp(`total\\s+dos\\s+itens\\s*[:.-]?\\s*((${amountPattern}))`, 'i'),
    new RegExp(`subtotal\\s*[:.-]?\\s*((${amountPattern}))`, 'i'),
  ])
  const documentTotal = firstPdfMatch(fullText, [
    new RegExp(`total\\s+(?:do\\s+)?pedido\\s*[:.-]?\\s*((${amountPattern}))`, 'i'),
    new RegExp(`valor\\s+total\\s*[:.-]?\\s*((${amountPattern}))`, 'i'),
    new RegExp(`(?:^|\\n)\\s*total\\s*[:.-]?\\s*((${amountPattern}))`, 'i'),
  ])
  const operation = firstPdfMatch(fullText, [
    /(?:natureza\s+da\s+opera[cç][aã]o|natureza)\s*[:.-]\s*([^\n]+)/i,
    /(?:tipo\s+de\s+opera[cç][aã]o|opera[cç][aã]o)\s*[:.-]\s*([^\n]+)/i,
  ]) || (isSalesOrder ? 'Pedido de venda' : '')
  const canceled = /cancelad|estornad|denegad|invalida|inv[aá]lida/.test(normalized)
  const documentStatus = canceled ? 'Cancelado ou inválido' : isSalesOrder ? 'Pendente de faturamento/validação' : 'Não confirmado'
  const detectedOperation = operation || lines.find((line) => /venda de mercadoria|compra de mercadoria|devolu[cç][aã]o|transfer[eê]ncia/i.test(line))?.trim() || ''
  const detectedOperationClean = detectedOperation.split(/\t+/).find((part) => /venda de mercadoria|compra de mercadoria|devolucao|transferencia/.test(normalizePdfText(part)))?.trim() || detectedOperation.trim()
  const stablePart = documentNumber || fileName
  return {
    documentKey: `${documentType}:${stablePart}`,
    documentType,
    documentLabel,
    documentNumber,
    documentDate,
    dueDate,
    customer: customerValue,
    documentStatus,
    operation: detectedOperationClean,
    itemsTotal,
    documentTotal,
  }
}

const PDF_UNITS = new Set(['un', 'und', 'unidade', 'unidades', 'pc', 'peca', 'peça', 'kg', 'g', 'l', 'lt', 'ml', 'cx', 'caixa', 'sc', 'saco'])

function splitPdfLine(line: string): string[] {
  const normalized = line.replace(/\u00a0/g, ' ').trim()
  const tabParts = normalized.split('\t').map((part) => part.trim()).filter(Boolean)
  return tabParts.length > 1 ? tabParts : normalized.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean)
}

function parsePdfProductLine(line: string, metadata: PdfMetadata, fileName: string, index: number): Record<string, unknown> | null {
  const parts = splitPdfLine(line)
  const codeMatch = line.match(/\b(?:[A-Z]{1,8}[-_]?\d{3,}|\d{4,})\b/i)
  if (!codeMatch) return null
  const code = codeMatch[0]
  const codeIndex = Math.max(0, parts.findIndex((part) => part.replace(/[.:]/g, '').toLowerCase() === code.toLowerCase()))
  const candidates = parts.map((part, partIndex) => {
    const quantity = pdfQuantity(part)
    const value = quantity?.value ?? pdfNumber(part)
    if (value === null || pdfMoney(part) || partIndex <= codeIndex || isPdfClassificationCode(part)) return null
    const previous = normalizePdfText(parts[partIndex - 1] ?? '')
    const next = parts[partIndex + 1] ?? ''
    const score = (quantity?.unit ? 8 : 0) + (PDF_UNITS.has(previous) ? 6 : 0) + (pdfMoney(next) ? 4 : 0) + (Number.isInteger(value) ? 1 : 0)
    return { part, partIndex, value, unit: quantity?.unit ?? '', score }
  }).filter((candidate): candidate is { part: string; partIndex: number; value: number; unit: string; score: number } => Boolean(candidate)).sort((a, b) => b.score - a.score || a.partIndex - b.partIndex)
  let quantityCandidate = candidates[0]
  let unit = quantityCandidate?.unit || (quantityCandidate ? parts[quantityCandidate.partIndex - 1] : '')
  let prices = quantityCandidate ? parts.slice(quantityCandidate.partIndex + 1).filter(pdfMoney) : []
  let description = quantityCandidate ? parts.slice(codeIndex + 1, quantityCandidate.partIndex).filter((part) => !PDF_UNITS.has(normalizePdfText(part)) && !isPdfClassificationCode(part)).join(' ') : ''
  if (!quantityCandidate) {
    const fallback = line.match(/\b(?:[A-Z]{1,8}[-_]?\d{3,}|\d{4,})\b\s+(.+?)\s+(?:(UN|UND|UNIDADE|PC|KG|L|CX)\s+)?(\d+(?:[.,]\d+)?)\s+((?:R\$\s*)?[\d.]+,\d{2})\s+((?:R\$\s*)?[\d.]+,\d{2})/i)
    if (!fallback) return null
    quantityCandidate = { part: fallback[3], partIndex: 0, value: pdfNumber(fallback[3]) ?? 0, unit: '', score: 0 }
    unit = fallback[2] ?? ''
    description = fallback[1].trim()
    prices = [fallback[4], fallback[5]]
  }
  if (!description || !quantityCandidate.value) return null
  const documentNumber = metadata.documentNumber || ''
  const documentText = documentNumber ? `${metadata.documentLabel} nº ${documentNumber}` : metadata.documentLabel
  const headerParts = parts.slice(codeIndex + 1, quantityCandidate.partIndex)
  const cfop = metadata.documentType === 'nfe' ? headerParts.find((part) => /^\d{4}$/.test(part)) ?? '' : ''
  const ncm = headerParts.find((part) => /^\d{8}$/.test(part.replace(/[.]/g, '')) || /^\d{4}\.\d{2}\.\d{2}$/.test(part)) ?? ''
  return {
    ID: `${metadata.documentKey}:${index + 1}`,
    'Código': code,
    Produto: description,
    Quantidade: String(quantityCandidate.value).replace('.', ','),
    Unidade: unit || 'UN',
    'Valor unitário': prices[0] ?? '',
    'Valor total': prices[1] ?? '',
    NCM: ncm,
    CFOP: cfop,
    'Total dos itens': metadata.itemsTotal,
    'Total do pedido': metadata.documentTotal,
    Documento: documentText,
    'Chave do documento': metadata.documentKey,
    Data: metadata.documentDate,
    'Previsão de faturamento': metadata.dueDate,
    Cliente: metadata.customer,
    'Tipo de documento': metadata.documentLabel,
    Tipo: metadata.operation,
    Situação: metadata.documentStatus,
    'Arquivo de origem': fileName,
    'Formato detectado': 'pdf',
  }
}

function parseNfeXmlFast(text: string, fileName: string): ExtractedImportDocument {
  try {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true, processEntities: false, trimValues: true })
    const parsed = parser.parse(text) as Record<string, unknown>
    const proc = (parsed.nfeProc ?? parsed.NFe ?? parsed) as Record<string, unknown>
    const nfe = (proc.NFe ?? proc) as Record<string, unknown>
    const info = (nfe.infNFe ?? nfe) as Record<string, unknown>
    const ide = (info.ide ?? {}) as Record<string, unknown>
    const emit = (info.emit ?? {}) as Record<string, unknown>
    const dest = (info.dest ?? {}) as Record<string, unknown>
    const protocol = ((proc.protNFe as Record<string, unknown> | undefined)?.infProt ?? {}) as Record<string, unknown>
    const textValue = (value: unknown): string => typeof value === 'object' && value !== null && '#text' in value ? String((value as Record<string, unknown>)['#text'] ?? '') : String(value ?? '')
    const accessKey = textValue(info['@_Id'] ?? protocol.chNFe).replace(/^NFe/, '')
    const protocolStatus = `${textValue(protocol.cStat)} ${textValue(protocol.xMotivo)}`.trim()
    const cancelled = /(^|\D)(101|151|155)(\D|$)/.test(protocolStatus) || /cancelad/i.test(protocolStatus)
    const header = {
      Data: textValue(ide.dhEmi ?? ide.dEmi), Documento: textValue(ide.nNF ?? ide.nCFe), Série: textValue(ide.serie),
      'Chave NFe': accessKey, Emitente: textValue(emit.xNome), Destinatário: textValue(dest.xNome), 'Status fiscal': protocolStatus || 'Não confirmado',
    }
    const detailValue = info.det
    const details = (Array.isArray(detailValue) ? detailValue : detailValue ? [detailValue] : []) as Record<string, unknown>[]
    if (!details.length) return { fileName, format: 'xml', rows: [], warnings: [], errors: ['XML fiscal sem itens de produto identificáveis.'], documentKey: accessKey }
    const rows = details.map((detail, index) => {
      const product = (detail.prod ?? {}) as Record<string, unknown>
      return { ...header, ID: `${accessKey || fileName}:${textValue(detail['@_nItem']) || index + 1}`, Código: textValue(product.cProd ?? product.cEAN ?? product.cBarra), Produto: textValue(product.xProd), Quantidade: textValue(product.qCom ?? product.qTrib), Unidade: textValue(product.uCom ?? product.uTrib), CFOP: textValue(product.CFOP), Operação: cancelled ? 'Cancelamento' : `${textValue(ide.natOp)} ${textValue(product.CFOP)}`.trim() }
    })
    return { fileName, format: 'xml', rows, warnings: protocolStatus ? [] : ['Status fiscal não confirmado no XML; o documento ficará pendente.'], errors: [], documentKey: accessKey }
  } catch (error) {
    return { fileName, format: 'xml', rows: [], warnings: [], errors: [error instanceof Error ? `XML malformado ou ilegível: ${error.message}` : 'XML malformado ou ilegível.'] }
  }
}

function parseNfeXmlLegacy(text: string, fileName: string): ExtractedImportDocument {
  const xml = new DOMParser().parseFromString(text, 'application/xml')
  const parserError = xml.querySelector('parsererror')
  if (parserError) return { fileName, format: 'xml', rows: [], warnings: [], errors: ['XML malformado ou ilegível.'] }
  const root = xml.documentElement
  const accessKey = root.querySelector('[Id^="NFe"]')?.getAttribute('Id')?.replace(/^NFe/, '') || valueFromElement(root, 'chNFe', 'chave')
  const protocolStatus = valueFromElement(root, 'cStat', 'xMotivo')
  const cancelled = /(^|\D)(101|151|155)(\D|$)/.test(protocolStatus) || /cancelad/i.test(protocolStatus)
  const header = {
    Data: valueFromElement(root, 'dhEmi', 'dEmi'),
    Documento: valueFromElement(root, 'nNF', 'nCFe'),
    Série: valueFromElement(root, 'serie'),
    'Chave NFe': accessKey,
    Emitente: valueFromElement(root, 'xNome'),
    Destinatário: valueFromElement(root, 'xNome'),
    'Status fiscal': protocolStatus || 'Não confirmado',
  }
  const details = Array.from(xml.querySelectorAll('*')).filter((element) => element.localName?.toLowerCase() === 'det')
  if (!details.length) return { fileName, format: 'xml', rows: [], warnings: [], errors: ['XML fiscal sem itens de produto identificáveis.'], documentKey: accessKey }
  const rows = details.map((detail, index) => ({
    ...header,
    ID: `${accessKey || fileName}:${detail.getAttribute('nItem') || index + 1}`,
    Código: valueFromElement(detail, 'cProd', 'cEAN', 'cBarra'),
    Produto: valueFromElement(detail, 'xProd'),
    Quantidade: valueFromElement(detail, 'qCom', 'qTrib'),
    Unidade: valueFromElement(detail, 'uCom', 'uTrib'),
    CFOP: valueFromElement(detail, 'CFOP'),
    Operação: cancelled ? 'Cancelamento' : `${valueFromElement(root, 'natOp')} ${valueFromElement(detail, 'CFOP')}`.trim(),
  }))
  return { fileName, format: 'xml', rows, warnings: protocolStatus ? [] : ['Status fiscal não confirmado no XML; o documento ficará pendente.'], errors: [], documentKey: accessKey }
}

async function extractPdfTextLegacy(bytes: Uint8Array, fileName: string): Promise<ExtractedImportDocument> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    if (typeof window !== 'undefined') pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()
    const loadingTask = pdfjs.getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false })
    const pdf = await loadingTask.promise
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const lines = new Map<number, { x: number; text: string }[]>()
      for (const item of content.items) {
        if (!('str' in item) || !('transform' in item)) continue
        const transform = item.transform
        const y = Math.round(transform[5])
        const x = transform[4]
        const line = lines.get(y) ?? []
        line.push({ x, text: item.str })
        lines.set(y, line)
      }
      pages.push([...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, line]) => line.sort((a, b) => a.x - b.x).map((item) => item.text).join('\t')).join('\n'))
    }
    const text = pages.join('\n')
    if (!text.trim()) return { fileName, format: 'pdf', rows: [], warnings: [], errors: ['PDF sem texto selecionável. OCR não está habilitado nesta instalação; envie o XML, CSV/XLSX ou um PDF com texto.'] }
    const rows = parseDelimitedText(text)
    return rows.length ? { fileName, format: 'pdf', rows, warnings: ['PDF processado por texto nativo; confirme visualmente os itens antes da importação.'], errors: [] } : { fileName, format: 'pdf', rows: [], warnings: [], errors: ['PDF lido, mas não foi encontrada uma tabela estruturada. Envie CSV/XLSX ou XML para maior precisão.'] }
  } catch (error) {
    return { fileName, format: 'pdf', rows: [], warnings: [], errors: [error instanceof Error ? `Não foi possível ler o PDF: ${error.message}` : 'Não foi possível ler o PDF.'] }
  }
}

async function extractPdfText(bytes: Uint8Array, fileName: string): Promise<ExtractedImportDocument> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    if (typeof window !== 'undefined') pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()
    const loadingTask = pdfjs.getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false })
    const pdf = await loadingTask.promise
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const lines = new Map<number, { x: number; text: string }[]>()
      for (const item of content.items) {
        if (!('str' in item) || !('transform' in item)) continue
        const transform = item.transform
        const y = Math.round(transform[5])
        const x = transform[4]
        const line = lines.get(y) ?? []
        line.push({ x, text: item.str })
        lines.set(y, line)
      }
      pages.push([...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, line]) => line.sort((a, b) => a.x - b.x).map((item) => item.text).join('\t')).join('\n'))
    }
    const text = pages.join('\n')
    if (!text.trim()) return { fileName, format: 'pdf', rows: [], warnings: [], errors: ['PDF sem texto selecionável. OCR não está habilitado nesta instalação; envie o XML, CSV/XLSX ou um PDF com texto.'] }
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const filialReport = parseFilialStockReport(lines)
    if (filialReport) return buildFilialStockDocument(filialReport, fileName, 'pdf')
    const metadata = pdfDocumentMetadata(lines, fileName)
    let rows = lines.flatMap((line, index) => {
      const row = parsePdfProductLine(line, metadata, fileName, index)
      return row ? [row] : []
    })
    if (!rows.length) {
      rows = parseDelimitedText(text).map((row) => ({
        ...row,
        Documento: row.Documento || (metadata.documentNumber ? `${metadata.documentLabel} nº ${metadata.documentNumber}` : metadata.documentLabel),
        'Chave do documento': metadata.documentKey,
        Data: row.Data || metadata.documentDate,
        'Previsão de faturamento': metadata.dueDate,
        Cliente: metadata.customer,
        'Tipo de documento': metadata.documentLabel,
        Tipo: row.Tipo || metadata.operation,
        Situação: metadata.documentStatus,
        'Arquivo de origem': fileName,
        'Formato detectado': 'pdf',
      }))
    }
    const documentInfo = { documentKey: metadata.documentKey, documentType: metadata.documentType, documentLabel: metadata.documentLabel, documentNumber: metadata.documentNumber, documentDate: metadata.documentDate, dueDate: metadata.dueDate, customer: metadata.customer, documentStatus: metadata.documentStatus, metadata: { itemsTotal: metadata.itemsTotal, documentTotal: metadata.documentTotal } }
    if (!rows.length) return { fileName, format: 'pdf', rows: [], warnings: [], errors: ['PDF lido com texto, mas nenhum item de produto foi identificado. Verifique se o PDF contém uma tabela de itens ou envie o XML/CSV/XLSX correspondente.'], ...documentInfo }
    const warnings = ['PDF processado por texto nativo; confirme os itens e a classificação antes da importação.']
    if (metadata.documentType === 'outro') warnings.push('Tipo de documento não identificado automaticamente; a classificação ficará pendente.')
    return { fileName, format: 'pdf', rows, warnings, errors: [], ...documentInfo }
  } catch (error) {
    return { fileName, format: 'pdf', rows: [], warnings: [], errors: [error instanceof Error ? `Não foi possível ler o PDF: ${error.message}` : 'Não foi possível ler o PDF.'] }
  }
}

export function parseImageReportText(text: string, fileName: string): ExtractedImportDocument {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const filialReport = parseFilialStockReport(lines)
  if (filialReport) return buildFilialStockDocument(filialReport, fileName, 'image', 'Confira os nomes e as quantidades reconhecidos na imagem.')
  const rows: Record<string, unknown>[] = []
  let columns: string[] = []
  for (const line of lines) {
    const normalized = normalizePdfText(line)
    if (/produto/.test(normalized) && /entradas?/.test(normalized) && /saidas?/.test(normalized)) {
      columns = normalized.match(/entradas?|saidas?/g) ?? []
      continue
    }
    if (!columns.length || /^total|^\d+\.\s/.test(normalized)) { columns = []; continue }
    const match = line.replace(/\|/g, ' ').match(/^(.*?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s*$/)
    if (!match) continue
    columns.forEach((column, index) => {
      const quantity = pdfNumber(match[index + 2])
      if (quantity && quantity > 0) rows.push({ Produto: match[1].trim(), Quantidade: quantity, Tipo: column.startsWith('entrada') ? 'Entrada' : 'Saída', Data: pdfDate(text), Unidade: 'UN', Documento: fileName })
    })
  }
  return { fileName, format: 'image', rows, warnings: ['Confira os nomes e as quantidades reconhecidos na imagem.'], errors: rows.length ? [] : ['Nenhuma movimentação reconhecida. Inclua os cabeçalhos e as quantidades de entrada e saída no print.'] }
}

async function extractImageText(bytes: Uint8Array, fileName: string): Promise<ExtractedImportDocument> {
  try {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('por', 1, { logger: () => undefined })
    try {
      await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '6' as import('tesseract.js').PSM })
      const result = await worker.recognize(await prepareOcrImage(new Blob([new Uint8Array(bytes)])))
      const text = result.data.text.trim()
      if (!text) return { fileName, format: 'image', rows: [], warnings: [], errors: ['Não foi possível reconhecer texto na imagem. Envie um print com maior resolução e boa iluminação.'] }
      return parseImageReportText(text, fileName)
    } finally {
      await worker.terminate().catch(() => undefined)
    }
  } catch (error) {
    return { fileName, format: 'image', rows: [], warnings: [], errors: [error instanceof Error ? `Não foi possível ler a imagem: ${error.message}` : 'Não foi possível ler a imagem.'] }
  }
}

function detectFormat(fileName: string, bytes: Uint8Array): DetectedImportFormat | null {
  const lower = fileName.toLowerCase()
  const signature = bytes.length >= 4 ? String.fromCharCode(...bytes.slice(0, 4)) : ''
  if (signature === '%PDF') return 'pdf'
  if (signature === '\x89PNG' || signature === 'JFIF' || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp') || lower.endsWith('.bmp')) return 'image'
  if (signature.startsWith('PK')) return lower.endsWith('.xlsx') ? 'xlsx' : 'zip'
  const text = bytesToText(bytes).trimStart()
  if (text.startsWith('<?xml') || text.startsWith('<')) return 'xml'
  if (text.startsWith('{') || text.startsWith('[')) return 'json'
  if (lower.endsWith('.xlsx')) return 'xlsx'
  if (lower.endsWith('.xls')) return 'xls'
  if (lower.endsWith('.txt')) return 'txt'
  if (lower.endsWith('.csv')) return 'csv'
  return null
}

async function extractOne(fileName: string, bytes: Uint8Array, forcedFormat?: DetectedImportFormat): Promise<ExtractedImportDocument[]> {
  const format = forcedFormat ?? detectFormat(fileName, bytes)
  if (!format) return [{ fileName, format: 'txt', rows: [], warnings: [], errors: ['Formato não reconhecido pelo conteúdo do arquivo. Envie XML, PDF textual, CSV, XLS/XLSX, TXT ou JSON.'] }]
  if (format === 'zip') {
    let archive: Record<string, Uint8Array>
    try { archive = unzipSync(bytes) } catch { return [{ fileName, format, rows: [], warnings: [], errors: ['ZIP inválido ou corrompido.'] }] }
    const names = Object.keys(archive).filter((name) => !name.endsWith('/'))
    if (names.length > MAX_ZIP_ENTRIES) return [{ fileName, format, rows: [], warnings: [], errors: [`ZIP excede o limite de ${MAX_ZIP_ENTRIES} arquivos.`] }]
    const totalBytes = names.reduce((sum, name) => sum + archive[name].byteLength, 0)
    if (totalBytes > MAX_ZIP_UNCOMPRESSED_BYTES) return [{ fileName, format, rows: [], warnings: [], errors: ['ZIP excede o limite de dados descompactados.'] }]
    const nested: ExtractedImportDocument[] = []
    for (const name of names) {
      if (name.includes('..') || name.startsWith('/') || /^[A-Za-z]:/.test(name)) { nested.push({ fileName: name, format, rows: [], warnings: [], errors: ['Caminho inseguro dentro do ZIP.'] }); continue }
      nested.push(...await extractOne(name, archive[name]))
    }
    return nested
  }
  if (format === 'xml') return [parseNfeXmlFast(bytesToText(bytes), fileName)]
  if (format === 'pdf') return [await extractPdfText(bytes, fileName)]
  if (format === 'image') return [await extractImageText(bytes, fileName)]
  if (format === 'json') {
    try {
      const value: unknown = JSON.parse(bytesToText(bytes))
      const candidate = Array.isArray(value) ? value : (value && typeof value === 'object' ? (value as Record<string, unknown>).items ?? (value as Record<string, unknown>).movimentacoes ?? (value as Record<string, unknown>).produtos ?? value : null)
      const rows = Array.isArray(candidate) ? candidate.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object')) : []
      return [{ fileName, format, rows, warnings: [], errors: rows.length ? [] : ['JSON sem uma lista de registros estruturados.'] }]
    } catch { return [{ fileName, format, rows: [], warnings: [], errors: ['JSON inválido.'] }] }
  }
  if (format === 'txt') {
    const rows = parseDelimitedText(bytesToText(bytes))
    return [{ fileName, format, rows, warnings: [], errors: rows.length ? [] : ['TXT sem cabeçalho e linhas tabulares reconhecíveis.'] }]
  }
  try {
    const workbook = XLSX.read(bytes, { type: 'array', cellDates: true, raw: false })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false }) : []
    return [{ fileName, format, rows, warnings: [], errors: rows.length ? [] : ['Planilha sem linhas de dados.'] }]
  } catch { return [{ fileName, format, rows: [], warnings: [], errors: ['Planilha inválida ou corrompida.'] }] }
}

export async function readUniversalFiles(files: File[]): Promise<UniversalReadResult> {
  if (!files.length) throw new Error('Selecione ao menos um arquivo.')
  if (files.length > 50) throw new Error('O limite é de 50 arquivos por importação.')
  const total = files.reduce((sum, file) => sum + file.size, 0)
  if (files.some((file) => file.size > MAX_FILE_BYTES) || total > MAX_TOTAL_BYTES) throw new Error('Os arquivos excedem o limite seguro de tamanho (25 MB por arquivo e 60 MB no total).')
  const documents: ExtractedImportDocument[] = []
  const fingerprints: string[] = []
  const topLevelFormats: DetectedImportFormat[] = []
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    fingerprints.push(`${file.name}|${file.size}|${hashBytes(bytes)}`)
    topLevelFormats.push(detectFormat(file.name, bytes) ?? 'txt')
    documents.push(...await extractOne(file.name, bytes))
  }
  const warnings = documents.flatMap((document) => document.warnings)
  const errors = documents.flatMap((document) => document.errors.map((error) => `${document.fileName}: ${error}`))
  if (errors.length) warnings.push(...errors)
  const rows = documents.flatMap((document) => document.rows.map((row) => ({ ...row, 'Arquivo de origem': document.fileName, 'Formato detectado': document.format })))
  const formats = [...new Set(topLevelFormats)]
  return { rows, documents, fingerprint: fingerprints.join('|'), format: formats.length === 1 ? formats[0] : 'mixed', warnings }
}
