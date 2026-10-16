import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'
import * as XLSX from 'xlsx'
import { readUniversalFiles } from './importFormats'

const asFile = (content: string | Uint8Array | ArrayBuffer, name: string) => new File([typeof content === 'string' ? content : content instanceof ArrayBuffer ? content : new Uint8Array(content)], name)

describe('adaptadores de formatos de importação', () => {
  it('extrai itens individuais de XML fiscal', async () => {
    const xml = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe35202600000000000000550010000000011000000010"><ide><nNF>10</nNF><serie>1</serie><dhEmi>2026-10-15T10:00:00-04:00</dhEmi><natOp>Compra para estoque</natOp></ide><det nItem="1"><prod><cProd>PD00001</cProd><xProd>Protecocho 200</xProd><qCom>3.0000</qCom><uCom>UN</uCom><CFOP>1102</CFOP></prod></det></infNFe></NFe></nfeProc>`
    const result = await readUniversalFiles([asFile(xml, 'nota.xml')])
    expect(result.format).toBe('xml')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]['Código']).toBe('PD00001')
    expect(result.rows[0]['Quantidade']).toBe('3')
  })

  it('processa JSON tabular e ZIP com múltiplos documentos', async () => {
    const json = JSON.stringify([{ Data: '15/10/2026', Produto: 'Protecocho 200', Quantidade: 2, Tipo: 'Entrada' }])
    const zip = zipSync({ 'movimentos.json': strToU8(json), 'notas.txt': strToU8('Produto;Quantidade;Tipo\nProtecocho 250;1;Saida') })
    const result = await readUniversalFiles([asFile(zip, 'pacote.zip')])
    expect(result.format).toBe('zip')
    expect(result.documents).toHaveLength(2)
    expect(result.rows).toHaveLength(2)
  })

  it('rejeita arquivos incompatíveis pelo conteúdo', async () => {
    const result = await readUniversalFiles([asFile('conteúdo binário inválido', 'arquivo.exe')])
    expect(result.rows).toHaveLength(0)
    expect(result.warnings.join(' ')).toContain('Formato não reconhecido')
  })

  it('falha com segurança ao receber PDF inválido', async () => {
    const result = await readUniversalFiles([asFile('%PDF-1.7\nconteúdo inválido', 'danfe.pdf')])
    expect(result.documents[0].format).toBe('pdf')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('processa CSV e TXT tabulares', async () => {
    const csv = await readUniversalFiles([asFile('Produto;Quantidade;Tipo\nProtecocho 200;2;Entrada', 'movimentos.csv')])
    const txt = await readUniversalFiles([asFile('Produto\tQuantidade\tTipo\nProtecocho 250\t1\tSaida', 'movimentos.txt')])
    expect(csv.format).toBe('csv')
    expect(csv.rows[0].Quantidade).toBe('2')
    expect(txt.format).toBe('txt')
    expect(txt.rows[0].Tipo).toBe('Saida')
  })

  it('processa planilhas XLSX e XLS', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ Produto: 'Protecocho 200', Quantidade: 2, Tipo: 'Entrada' }]), 'Movimentos')
    const xlsx = await readUniversalFiles([asFile(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }), 'movimentos.xlsx')])
    const xls = await readUniversalFiles([asFile(XLSX.write(workbook, { type: 'array', bookType: 'biff8' }), 'movimentos.xls')])
    expect(xlsx.format).toBe('xlsx')
    expect(xlsx.rows[0].Quantidade).toBe('2')
    expect(xls.format).toBe('xls')
    expect(xls.rows[0].Tipo).toBe('Entrada')
  })

  it('processa PDF com texto selecionÃ¡vel', async () => {
    const stream = 'BT\n/F1 12 Tf\n72 720 Td\n(Pedido de Venda 8) Tj\n0 -20 Td\n(Data do pedido: 15/10/2026) Tj\n0 -20 Td\n(Previsao de faturamento: 29/10/2026) Tj\n0 -20 Td\n(Total dos itens: R$ 88.830,00) Tj\n0 -20 Td\n(Total do pedido: R$ 96.600,00) Tj\n0 -20 Td\n(Codigo) Tj\n100 0 Td\n(Descricao) Tj\n180 0 Td\n(Un) Tj\n50 0 Td\n(Qtd) Tj\n50 0 Td\n(Valor unitario) Tj\n100 0 Td\n(Valor total) Tj\n-480 -20 Td\n(PD00005) Tj\n100 0 Td\n(PROTECOCHO AUTOABASTECIMENTO) Tj\n180 0 Td\n(UN) Tj\n50 0 Td\n(42) Tj\n50 0 Td\n(R$ 2.115,00) Tj\n100 0 Td\n(R$ 88.830,00) Tj\nET'
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    ]
    let pdf = '%PDF-1.4\n'
    const offsets = [0]
    objects.forEach((object, index) => { offsets[index + 1] = pdf.length; pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
    const xref = pdf.length
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
    const result = await readUniversalFiles([asFile(pdf, 'movimentos.pdf')])
    expect(result.format).toBe('pdf')
    expect(result.documents[0].documentType).toBe('pedido_venda')
    expect(result.documents[0].documentNumber).toBe('8')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]['Código']).toBe('PD00005')
    expect(result.rows[0].Quantidade).toBe('42')
    expect(result.rows[0]['Valor unitário']).toBe('R$ 2.115,00')
    expect(result.rows[0]['Valor total']).toBe('R$ 88.830,00')
    expect(result.rows[0]['Total do pedido']).toBe('R$ 96.600,00')
  })

  it('processa o pedido de venda real da pasta de testes', async () => {
    const bytes = readFileSync(new URL('../../teste/pedido_de_venda_8.pdf', import.meta.url))
    const result = await readUniversalFiles([asFile(bytes, 'pedido_de_venda_8.pdf')])
    const row = result.rows[0]

    expect(result.documents[0].documentType).toBe('pedido_venda')
    expect(result.documents[0].documentNumber).toBe('8')
    expect(result.documents[0].dueDate).toBe('29/10/2026')
    expect(result.rows).toHaveLength(1)
    expect(row['C\u00f3digo']).toBe('PD00005')
    expect(row.Produto).toBe('PROTECOCHO AUTOABASTECIMENTO')
    expect(row.Quantidade).toBe('42')
    expect(row.Unidade).toBe('UN')
    expect(row['Valor unit\u00e1rio']).toBe('2.115,0000')
    expect(row['Valor total']).toBe('88.830,00')
    expect(row['Total do pedido']).toBe('96.600,00')
  })

  it('processa DANFE real e preserva o cancelamento sem classificar como estoque', async () => {
    const bytes = readFileSync(new URL('../../teste/danfe_2026-10-15_17_17_49.pdf', import.meta.url))
    const result = await readUniversalFiles([asFile(bytes, 'danfe_2026-10-15_17_17_49.pdf')])
    const row = result.rows[0]

    expect(result.documents[0].documentType).toBe('nfe')
    expect(result.documents[0].documentNumber).toBe('2')
    expect(result.documents[0].documentStatus).toMatch(/Cancelado|invÃ¡lido/)
    expect(result.rows).toHaveLength(1)
    expect(row['C\u00f3digo']).toBe('PD00152')
    expect(row.Produto).toBe('HIDRAMAX 1300')
    expect(row.Quantidade).toBe('1')
    expect(row.CFOP).toBe('6102')
  })
})
