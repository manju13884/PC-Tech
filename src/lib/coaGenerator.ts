import PizZip from 'pizzip'
import { generateCoaBaseTemplate } from './coaBaseGenerator'

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
  refNumber: string
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
    `<w:r><w:rPr>${isHeader ? '<w:b/><w:bCs/>' : ''}` +
    '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>' +
    `<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`
  )).join('')

  return '<w:tc>' +
    `<w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
    '<w:vAlign w:val="center"/></w:tcPr>' +
    `<w:p><w:pPr><w:jc w:val="${alignment}"/><w:spacing w:before="0" w:after="0"/></w:pPr>${runs}</w:p>` +
    '</w:tc>'
}

function createAnalysisTable(items: CoaAnalysisItem[]): string {
  const columns = [
    { heading: 'Sl\nNo', width: 400 },
    { heading: 'Product', width: 2970 },
    { heading: 'Board\nGSM', width: 635 },
    { heading: 'GSM', width: 1998 },
    { heading: 'Bursting\nStrength', width: 833 },
    { heading: 'Moisture', width: 940 },
    { heading: 'Ply', width: 472 },
  ]
  const borders = '<w:tblBorders>' +
    '<w:top w:val="single" w:sz="2" w:space="0" w:color="000000"/>' +
    '<w:left w:val="single" w:sz="2" w:space="0" w:color="000000"/>' +
    '<w:bottom w:val="single" w:sz="2" w:space="0" w:color="000000"/>' +
    '<w:right w:val="single" w:sz="2" w:space="0" w:color="000000"/>' +
    '<w:insideH w:val="single" w:sz="2" w:space="0" w:color="000000"/>' +
    '<w:insideV w:val="single" w:sz="2" w:space="0" w:color="000000"/>' +
    '</w:tblBorders>'
  const headerRow = '<w:tr><w:trPr><w:trHeight w:val="540" w:hRule="exact"/></w:trPr>' +
    `${columns.map((column) => createCell(column.heading, column.width, true, 'left')).join('')}</w:tr>`
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
      createCell(value, columns[columnIndex].width, false, 'left')
    )).join('')}</w:tr>`
  }).join('')

  return '<w:tbl>' +
    `<w:tblPr><w:tblW w:w="5500" w:type="pct"/><w:tblLayout w:type="fixed"/>${borders}</w:tblPr>` +
    `<w:tblGrid>${columns.map((column) => `<w:gridCol w:w="${column.width}"/>`).join('')}</w:tblGrid>` +
    headerRow + itemRows +
    '</w:tbl>'
}

function formatInvoiceDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (!match) {
    return date
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = monthNames[Number(match[2]) - 1]

  return month ? `${match[3]}-${month}-${match[1]}` : date
}

function createDetailParagraph(label: string, value: string, isLast = false): string {
  const afterSpacing = isLast ? '116' : '144'

  return '<w:p><w:pPr>' +
    `<w:spacing w:before="0" w:after="${afterSpacing}" w:line="330" w:lineRule="auto"/>` +
    '<w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:pPr>' +
    '<w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>' +
    `<w:t>${escapeXml(label)}</w:t></w:r>` +
    '<w:r><w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>' +
    `<w:t xml:space="preserve"> ${escapeXml(value)}</w:t></w:r></w:p>`
}

function setParagraphFontSize(
  paragraph: string,
  halfPoints: number,
  beforeSpacing?: number,
  afterSpacing = 0,
): string {
  const resizedParagraph = paragraph
    .replace(/<w:sz w:val="\d+"\/>/g, `<w:sz w:val="${halfPoints}"/>`)
    .replace(/<w:szCs w:val="\d+"\/>/g, `<w:szCs w:val="${halfPoints}"/>`)

  if (beforeSpacing === undefined) {
    return resizedParagraph
  }

  return resizedParagraph
    .replace(/<w:spacing\b[^>]*\/>/g, '')
    .replace('<w:pPr>', `<w:pPr><w:spacing w:before="${beforeSpacing}" w:after="${afterSpacing}"/>`)
}

function compactCoaLayout(documentXml: string): string {
  const compactFontSizes: Record<string, string> = {
    '20': '19',
    '24': '22',
  }

  return documentXml
    .replace(/<w:pgMar\b[^>]*\/>/, (pageMargins) => pageMargins
      .replace(/w:top="[^"]*"/, 'w:top="2070"')
      .replace(/w:right="[^"]*"/, 'w:right="1440"')
      .replace(/w:left="[^"]*"/, 'w:left="1440"'))
    .replace(/(<w:sz(?:Cs)?\s+w:val=")(20|24)("\/>)/g, (_match, prefix: string, size: string, suffix: string) => (
      `${prefix}${compactFontSizes[size]}${suffix}`
    ))
}

export function generateCoaTemplate(template: ArrayBuffer, values: CoaInvoiceValues): ArrayBuffer {
  const coaDocument = generateCoaBaseTemplate(template, {
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
  const zip = new PizZip(coaDocument)
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

      if (/^This is to certify that we have complied with all requirements/i.test(plainText)) {
        return ''
      }

      if (/^The above information is based on process controls and evaluations\.?$/i.test(plainText)) {
        return setParagraphFontSize(paragraph, 28, 360, 200)
      }

      if (/^COMPANY SEAL & SIGNATURE$/i.test(plainText)) {
        return setParagraphFontSize(paragraph, 24)
      }

      if (/ROHS directive|2011\/65\/EC|FALCO|Hazardous substances/i.test(plainText)) {
        return ''
      }

      if (/^DATE:/.test(plainText)) {
        return createDetailParagraph('DATE:', formatInvoiceDate(values.invoiceDate))
      }

      if (/^CUSTOMER:/.test(plainText)) {
        return createDetailParagraph('CUSTOMER:', values.customer)
      }

      if (/^PO#:/.test(plainText)) {
        return createDetailParagraph('PO#:', values.poNumber)
      }

      if (/^Invoice\(s\):/.test(plainText)) {
        return createDetailParagraph('Invoice#:', values.invoiceNumber) +
          createDetailParagraph('Ref#:', values.refNumber, true)
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

  zip.file('word/document.xml', compactCoaLayout(updatedXml))
  return zip.generate({ type: 'arraybuffer' })
}
