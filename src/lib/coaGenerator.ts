import PizZip from 'pizzip'
import { generateCocTemplate } from './cocGenerator'

export interface CoaAnalysisItem {
  name: string
  description: string
  boardGsm: string
  gsm: string
  burstingStrength: string
  moisture: string
  ply: string
}

interface CoaInvoiceValues {
  invoiceDate: string
  customer: string
  poNumber: string
  invoiceNumber: string
  items: CoaAnalysisItem[]
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function createCell(text: string, width: number, isHeader = false, alignment: 'left' | 'center' = 'center'): string {
  const runs = text.split('\n').map((line, index) => (
    `${index > 0 ? '<w:r><w:br/></w:r>' : ''}` +
    `<w:r><w:rPr>${isHeader ? '<w:b/><w:bCs/><w:color w:val="000000"/>' : ''}` +
    '<w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>' +
    `<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`
  )).join('')

  return '<w:tc>' +
    `<w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
    `${isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="5B9BD5"/>' : ''}` +
    '<w:vAlign w:val="center"/></w:tcPr>' +
    `<w:p><w:pPr><w:jc w:val="${alignment}"/><w:spacing w:before="0" w:after="0"/></w:pPr>${runs}</w:p>` +
    '</w:tc>'
}

function createAnalysisTable(items: CoaAnalysisItem[]): string {
  const columns = [
    { heading: 'Sl No', width: 520 },
    { heading: 'Product', width: 2700 },
    { heading: 'Board\nGSM', width: 760 },
    { heading: 'GSM', width: 1900 },
    { heading: 'Bursting\nStrength', width: 1000 },
    { heading: 'Moisture', width: 900 },
    { heading: 'Ply', width: 500 },
  ]
  const borders = '<w:tblBorders>' +
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>' +
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>' +
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>' +
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>' +
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>' +
    '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>' +
    '</w:tblBorders>'
  const headerRow = `<w:tr>${columns.map((column) => createCell(column.heading, column.width, true)).join('')}</w:tr>`
  const itemRows = items.map((item, index) => {
    const values = [
      String(index + 1),
      [item.name, item.description].filter(Boolean).join('\n'),
      item.boardGsm,
      item.gsm,
      item.burstingStrength,
      item.moisture,
      item.ply,
    ]

    return `<w:tr>${values.map((value, columnIndex) => (
      createCell(value, columns[columnIndex].width, false, columnIndex === 1 || columnIndex === 3 ? 'left' : 'center')
    )).join('')}</w:tr>`
  }).join('')

  return '<w:tbl>' +
    `<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/>${borders}</w:tblPr>` +
    `<w:tblGrid>${columns.map((column) => `<w:gridCol w:w="${column.width}"/>`).join('')}</w:tblGrid>` +
    headerRow + itemRows +
    '</w:tbl>'
}

export function generateCoaTemplate(template: ArrayBuffer, values: CoaInvoiceValues): ArrayBuffer {
  const cocDocument = generateCocTemplate(template, {
    invoiceDate: values.invoiceDate,
    customer: values.customer,
    poNumber: values.poNumber,
    invoiceNumber: values.invoiceNumber,
    items: values.items.map((item) => ({
      name: item.name,
      description: item.description,
      quantity: '',
    })),
  })
  const zip = new PizZip(cocDocument)
  const documentFile = zip.file('word/document.xml')
  const documentXml = documentFile?.asText()

  if (!documentXml) {
    throw new Error('COA document content was not found')
  }

  let tableReplaced = false
  const updatedXml = documentXml
    .replace('CERTIFICATE OF COMPLIANCE', 'CERTIFICATE OF ANALYSIS')
    .replace(
      'This Material supplied by this invoice complies with the specification given in your document.',
      'The above information is based on process controls and evaluations.',
    )
    .replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
      const plainText = paragraph.replace(/<[^>]+>/g, '').trim()

      if (/ROHS directive|2011\/65\/EC|FALCO|Hazardous substances/i.test(plainText)) {
        return ''
      }

      if (/^Invoice\(s\):/.test(plainText)) {
        return paragraph
          .replace(/<w:spacing\b[^>]*\/>/g, '')
          .replace(
            '<w:pPr>',
            '<w:pPr><w:spacing w:before="0" w:after="200" w:line="330" w:lineRule="auto"/>',
          )
      }

      return paragraph
    })
    .replace(
      /<w:tbl\b[\s\S]*?<\/w:tbl>/g,
      (table) => {
        if (!table.includes('Item &amp; Description')) {
          return table
        }

        tableReplaced = true
        return createAnalysisTable(values.items)
      },
    )

  if (!updatedXml.includes('CERTIFICATE OF ANALYSIS') || !tableReplaced) {
    throw new Error('COA template structure was not found')
  }

  zip.file('word/document.xml', updatedXml)
  return zip.generate({ type: 'arraybuffer' })
}
