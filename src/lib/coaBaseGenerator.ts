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

interface CoaBaseInvoiceValues {
  invoiceDate: string
  customer: string
  poNumber: string
  invoiceNumber: string
  items: CoaBaseLineItem[]
}

interface CoaBaseLineItem {
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
  const updatedRowsXml = titleCaseQuantityXml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (row) => {
    const autoHeightRow = row.replace(/<w:trHeight\b[^>]*\/>/g, '')

    if (autoHeightRow.includes('<w:t>Sl No</w:t>')) {
      return autoHeightRow
        .replace('<w:trPr>', '<w:trPr><w:trHeight w:val="450" w:hRule="exact"/>')
        .replace('<w:t>Sl No</w:t>', '<w:t>Sl&#160;No</w:t>')
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

  const updatedXml = updatedRowsXml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, (table) => {
    if (!table.includes('Item &amp; Description')) {
      return table
    }

    return table
      .replace(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/, '')
      .replace(/<w:tblLayout\b[^>]*\/>/g, '')
      .replace(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/g, '')
      .replace(
        '<w:tblPr>',
        '<w:tblPr><w:tblLayout w:type="autofit"/><w:tblBorders>' +
          '<w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>' +
          '<w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>' +
          '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>' +
          '<w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>' +
          '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>' +
          '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>' +
          '</w:tblBorders>',
      )
      .replace(/<w:tblW\b[^>]*\/>/, '<w:tblW w:w="5000" w:type="pct"/>')
      .replace(/<w:tcW\b[^>]*\/>/g, '<w:tcW w:w="0" w:type="auto"/>')
  })

  zip.file('word/document.xml', updatedXml)
}

function reduceCoaBodyFontSize(zip: PizZip) {
  const documentFile = zip.file('word/document.xml')
  const documentXml = documentFile?.asText()

  if (!documentXml) {
    throw new Error('COC document content was not found')
  }

  const titleIndex = documentXml.indexOf('CERTIFICATE OF COMPLIANCE')
  const bodyStart = titleIndex >= 0 ? documentXml.indexOf('</w:p>', titleIndex) + '</w:p>'.length : -1

  if (bodyStart < '</w:p>'.length) {
    throw new Error('COC title was not found')
  }

  const bodyXml = documentXml.slice(bodyStart).replace(/<w:(sz|szCs) w:val="(\d+)"\/>/g, (_, tag, value) => (
    `<w:${tag} w:val="${Math.max(2, Number(value) - 2)}"/>`
  ))

  zip.file('word/document.xml', documentXml.slice(0, bodyStart) + bodyXml)
}

function tightenInvoiceDetailSpacing(zip: PizZip) {
  const documentFile = zip.file('word/document.xml')
  const documentXml = documentFile?.asText()

  if (!documentXml) {
    throw new Error('COC document content was not found')
  }

  const updatedXml = documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    const plainText = paragraph.replace(/<[^>]+>/g, '').trim()

    if (!/^(DATE:|CUSTOMER:|PO#:|Invoice\(s\):)/.test(plainText)) {
      return paragraph
    }

    return paragraph
      .replace(/<w:spacing\b[^>]*\/>/g, '')
      .replace('<w:pPr>', '<w:pPr><w:spacing w:before="0" w:after="0" w:line="330" w:lineRule="auto"/>')
  })

  zip.file('word/document.xml', updatedXml)
}

function scaleCoaSeal(zip: PizZip) {
  const documentFile = zip.file('word/document.xml')
  const documentXml = documentFile?.asText()

  if (!documentXml) {
    throw new Error('COC document content was not found')
  }

  let sealFound = false
  const updatedXml = documentXml.replace(/<w:drawing>[\s\S]*?<\/w:drawing>/g, (drawing) => {
    if (!drawing.includes('r:embed="rId6"')) {
      return drawing
    }

    sealFound = true
    return drawing.replace(/\b(cx|cy)="(\d+)"/g, (_, dimension, value) => (
      `${dimension}="${Math.round(Number(value) * 0.5)}"`
    ))
  })

  if (!sealFound) {
    throw new Error('COC seal image was not found')
  }

  zip.file('word/document.xml', updatedXml)
}

function setCoaTextBlack(zip: PizZip) {
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

function alignLetterheadRegistration(zip: PizZip) {
  for (const fileName of Object.keys(zip.files)) {
    if (!/^word\/header\d+\.xml$/.test(fileName)) {
      continue
    }

    const file = zip.file(fileName)
    const xml = file?.asText()

    if (!xml || !xml.includes('CIN:') || !xml.includes('GST:')) {
      continue
    }

    const pageCenteredWatermarkXml = xml.includes('WordPictureWatermark')
      ? xml
          .replace(/mso-position-horizontal-relative:margin/g, 'mso-position-horizontal-relative:page')
          .replace(/mso-position-vertical-relative:margin/g, 'mso-position-vertical-relative:page')
      : xml
    const updatedXml = pageCenteredWatermarkXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
      if (paragraph.includes('<w:drawing>')) {
        return paragraph.replace('<w:pPr>', '<w:pPr><w:jc w:val="center"/>')
      }

      if (!paragraph.includes('CIN:') || !paragraph.includes('GST:')) {
        return paragraph
      }

      return paragraph
        .replace('<w:pPr>', '<w:pPr><w:ind w:left="0" w:right="0"/><w:tabs><w:tab w:val="right" w:pos="9026"/></w:tabs>')
        .replace('<w:tab/>', '')
    })

    zip.file(fileName, updatedXml)
  }
}

function setCoaPageLayout(zip: PizZip) {
  const documentFile = zip.file('word/document.xml')
  const documentXml = documentFile?.asText()

  if (!documentXml) {
    throw new Error('COC document content was not found')
  }

  const pageBorder = [
    '<w:pgBorders w:offsetFrom="page">',
    '<w:top w:val="single" w:sz="4" w:space="21" w:color="707070"/>',
    '<w:left w:val="single" w:sz="4" w:space="15" w:color="707070"/>',
    '<w:bottom w:val="single" w:sz="4" w:space="23" w:color="707070"/>',
    '<w:right w:val="single" w:sz="4" w:space="17" w:color="707070"/>',
    '</w:pgBorders>',
  ].join('')
  const updatedXml = documentXml.replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g, (section) => {
    const withoutExistingBorder = section.replace(/<w:pgBorders\b[\s\S]*?<\/w:pgBorders>/g, '')
    const equalMargins = withoutExistingBorder.replace(/<w:pgMar\b[^>]*\/>/, (pageMargins) => (
      pageMargins
        .replace(/w:left="[^"]*"/, 'w:left="720"')
        .replace(/w:top="[^"]*"/, 'w:top="2160"')
        .replace(/w:bottom="[^"]*"/, 'w:bottom="1440"')
        .replace(/w:right="[^"]*"/, 'w:right="720"')
    ))

    return equalMargins.replace(/(<w:pgMar\b[^>]*\/>)/, `$1${pageBorder}`)
  })

  zip.file('word/document.xml', updatedXml)
}

export function generateCoaBaseTemplate(template: ArrayBuffer, values: CoaBaseInvoiceValues): ArrayBuffer {
  const zip = new PizZip(template)
  setCoaTextBlack(zip)
  alignLetterheadRegistration(zip)
  addItemRowLoop(zip)
  reduceCoaBodyFontSize(zip)
  tightenInvoiceDetailSpacing(zip)
  scaleCoaSeal(zip)
  setCoaPageLayout(zip)
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
