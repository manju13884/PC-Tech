import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'

function formatInvoiceDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (!match) {
    return date
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = monthNames[Number(match[2]) - 1]

  return month ? `${match[3]}-${month}-${match[1]}` : date
}

interface CocInvoiceValues {
  invoiceDate: string
  customer: string
  poNumber: string
  invoiceNumber: string
  items: CocLineItem[]
}

interface CocLineItem {
  name: string
  description: string
  quantity: string
}

function addItemRowLoop(zip: PizZip) {
  const documentFile = zip.file('word/document.xml')
  const documentXml = documentFile?.asText()

  if (!documentXml) {
    throw new Error('COC document content was not found')
  }

  let itemRowFound = false
  const titleCaseQuantityXml = documentXml.replace('<w:t>QUANTITY</w:t>', '<w:t>Quantity</w:t>')
  const updatedXml = titleCaseQuantityXml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (row) => {
    const autoHeightRow = row.replace(/<w:trHeight\b[^>]*\/>/g, '')

    if (autoHeightRow.includes('<w:t>Sl No</w:t>')) {
      return autoHeightRow
        .replace('<w:trPr>', '<w:trPr><w:trHeight w:val="450" w:hRule="exact"/>')
        .replace(/<w:shd\b[^>]*\/>/g, '')
        .replace(/<w:tcPr>/g, '<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="5B9BD5"/>')
        .replace(/<w:color\b[^>]*\/>/g, '')
        .replace(/<w:rPr>/g, '<w:rPr><w:color w:val="FFFFFF"/>')
        .replace(/(<w:tc\b[\s\S]*?<w:pPr>)/, '$1<w:jc w:val="center"/>')
    }

    if (!autoHeightRow.includes('{{ItemDesc}}') || !autoHeightRow.includes('{{qty}}')) {
      return autoHeightRow
    }

    itemRowFound = true

    return autoHeightRow
      .replace(/(<w:tc\b[\s\S]*?<w:pPr>)/, '$1<w:jc w:val="center"/>')
      .replace(/<w:b\/>/g, '')
      .replace(/<w:bCs\/>/g, '')
      .replace('<w:t>1</w:t>', '<w:t>{{#Items}}{{SlNo}}</w:t>')
      .replace('<w:t>{{qty}}</w:t>', '<w:t>{{qty}}{{/Items}}</w:t>')
  })

  if (!itemRowFound) {
    throw new Error('COC item row was not found')
  }

  zip.file('word/document.xml', updatedXml)
}

function setCocTextBlack(zip: PizZip) {
  const textXmlPattern = /^word\/(?:document|header\d+|footer\d+|styles)\.xml$/

  for (const fileName of Object.keys(zip.files)) {
    if (!textXmlPattern.test(fileName)) {
      continue
    }

    const file = zip.file(fileName)
    const xml = file?.asText()

    if (!xml) {
      continue
    }

    const blackTextXml = xml
      .replace(/<w:color\b[^>]*\/>/g, '')
      .replace(/<w:rPr>/g, '<w:rPr><w:color w:val="000000"/>')

    zip.file(fileName, blackTextXml)
  }
}

function setCocPageLayout(zip: PizZip) {
  const documentFile = zip.file('word/document.xml')
  const documentXml = documentFile?.asText()

  if (!documentXml) {
    throw new Error('COC document content was not found')
  }

  const pageBorder = [
    '<w:pgBorders w:offsetFrom="page">',
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="D0D0D0"/>',
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="D0D0D0"/>',
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="D0D0D0"/>',
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="D0D0D0"/>',
    '</w:pgBorders>',
  ].join('')
  const updatedXml = documentXml.replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g, (section) => {
    const withoutExistingBorder = section.replace(/<w:pgBorders\b[\s\S]*?<\/w:pgBorders>/g, '')
    const equalMargins = withoutExistingBorder.replace(/<w:pgMar\b[^>]*\/>/, (pageMargins) => (
      pageMargins
        .replace(/w:left="[^"]*"/, 'w:left="1440"')
        .replace(/w:top="[^"]*"/, 'w:top="1440"')
        .replace(/w:bottom="[^"]*"/, 'w:bottom="1440"')
        .replace(/w:right="[^"]*"/, 'w:right="1440"')
    ))

    return equalMargins.replace(/(<w:pgMar\b[^>]*\/>)/, `$1${pageBorder}`)
  })

  zip.file('word/document.xml', updatedXml)
}

export function generateCocTemplate(template: ArrayBuffer, values: CocInvoiceValues): ArrayBuffer {
  const zip = new PizZip(template)
  setCocTextBlack(zip)
  addItemRowLoop(zip)
  setCocPageLayout(zip)
  const document = new Docxtemplater(zip, {
    delimiters: {
      start: '{{',
      end: '}}',
    },
    nullGetter: (part) => `{{${part.value}}}`,
    paragraphLoop: true,
    linebreaks: true,
  })

  document.render({
    InvoiceDate: formatInvoiceDate(values.invoiceDate),
    Customer: values.customer,
    PONumber: values.poNumber,
    InvoiceNumber: values.invoiceNumber,
    Items: values.items.map((item, index) => ({
      SlNo: String(index + 1),
      ItemDesc: [item.name, item.description].filter(Boolean).join('\n'),
      qty: item.quantity,
    })),
  })

  return document.getZip().generate({ type: 'arraybuffer' })
}
