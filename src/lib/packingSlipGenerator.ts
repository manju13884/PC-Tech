import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'

interface PackingSlipValues {
  customerName: string
  invoiceNumber: string
  invoiceDate: string
  items: PackingSlipItem[]
}

interface PackingSlipItem {
  name: string
  description: string
  quantity: string
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

function embedPackingSlipLogo(zip: PizZip, logo: ArrayBuffer) {
  const relationshipId = 'rIdPackingSlipLogo'
  const mediaPath = 'word/media/PC-Bird-Logo.png'
  const documentFile = zip.file('word/document.xml')
  const relationshipsFile = zip.file('word/_rels/document.xml.rels')
  const contentTypesFile = zip.file('[Content_Types].xml')
  const documentXml = documentFile?.asText()
  const relationshipsXml = relationshipsFile?.asText()
  const contentTypesXml = contentTypesFile?.asText()

  if (!documentXml || !relationshipsXml || !contentTypesXml) {
    throw new Error('Packing Slip logo structure was not found')
  }

  const logoDrawing = [
    '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="91440">',
    '<wp:extent cx="365760" cy="365760"/>',
    '<wp:effectExtent l="0" t="0" r="0" b="0"/>',
    '<wp:docPr id="9001" name="Packing Slip Bird Logo"/>',
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>',
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">',
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">',
    '<pic:nvPicPr><pic:cNvPr id="9001" name="PC-Bird-Logo.png"/><pic:cNvPicPr/></pic:nvPicPr>',
    `<pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`,
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="365760" cy="365760"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>',
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>',
  ].join('')
  const updatedDocumentXml = documentXml.replace(
    /<w:tr\b[^>]*>(?:(?!<w:tr\b)[\s\S])*?Polar Canvas Technologies Private Limited(?:(?!<w:tr\b)[\s\S])*?Packing Slip(?:(?!<w:tr\b)[\s\S])*?<\/w:tr>/,
    (headerRow) => headerRow.replace(
      /<w:tc>(<w:tcPr>[\s\S]*?<\/w:tcPr>)([\s\S]*?)<\/w:tc>/,
      (_, cellProperties, titleParagraphs) => {
        const nestedHeader = [
          '<w:tbl><w:tblPr><w:tblW w:w="9166" w:type="dxa"/>',
          '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>',
          '</w:tblPr><w:tblGrid><w:gridCol w:w="900"/><w:gridCol w:w="8266"/></w:tblGrid><w:tr>',
          '<w:tc><w:tcPr><w:tcW w:w="900" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>',
          `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${logoDrawing}</w:p></w:tc>`,
          '<w:tc><w:tcPr><w:tcW w:w="8266" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>',
          `${titleParagraphs}</w:tc></w:tr></w:tbl>`,
          '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>',
          '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr></w:p>',
        ].join('')

        return `<w:tc>${cellProperties}${nestedHeader}</w:tc>`
      },
    ),
  )
  const updatedRelationshipsXml = relationshipsXml.replace(
    '</Relationships>',
    `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/PC-Bird-Logo.png"/></Relationships>`,
  )
  const updatedContentTypesXml = /Extension="png"/.test(contentTypesXml)
    ? contentTypesXml
    : contentTypesXml.replace(
        '</Types>',
        '<Default Extension="png" ContentType="image/png"/></Types>',
      )

  zip.file(mediaPath, logo)
  zip.file('word/document.xml', updatedDocumentXml)
  zip.file('word/_rels/document.xml.rels', updatedRelationshipsXml)
  zip.file('[Content_Types].xml', updatedContentTypesXml)
}

const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
const PAGE_PLACEHOLDERS = [
  'SlNo',
  'CustomerName',
  'ItemName',
  'InvoiceNumber',
  'InvoiceDate',
  'ItemDesciption',
]

function preparePackingSlipTemplate(zip: PizZip, itemCount: number) {
  const documentFile = zip.file('word/document.xml')
  const documentXml = documentFile?.asText()

  if (!documentXml) {
    throw new Error('Packing Slip document content was not found')
  }

  const normalizedXml = documentXml
    .replace(/<w:p\b[\s\S]*?<w:t>Sl\.No<\/w:t>[\s\S]*?<\/w:p>/, (paragraph) => (
      paragraph
        .replace('<w:t>Sl.No</w:t>', '<w:t>SlNo</w:t>')
        .replace('<w:t>)</w:t>', '<w:t>}}</w:t>')
    ))
    .replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<w:br w:type="page"\/>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g, '')
  const bodyMatch = normalizedXml.match(/<w:body>([\s\S]*?)(<w:sectPr\b[\s\S]*?<\/w:sectPr>)<\/w:body>/)

  if (!bodyMatch) {
    throw new Error('Packing Slip page structure was not found')
  }

  const pageTemplate = bodyMatch[1]
  const sectionProperties = bodyMatch[2]
  const pages = Array.from({ length: itemCount }, (_, index) => {
    let page = pageTemplate.replace(
      '<w:t>{{Quantity}}</w:t>',
      `<w:t>{{Quantity_${index}}}</w:t>`,
    )

    for (const placeholder of PAGE_PLACEHOLDERS) {
      page = page.replace(new RegExp(placeholder, 'g'), `${placeholder}_${index}`)
    }

    return page
      .replace(/\s+w14:paraId="[^"]*"/g, '')
      .replace(/\s+w14:textId="[^"]*"/g, '')
      .replace(/wp:docPr id="9001"/g, `wp:docPr id="${9001 + index}"`)
      .replace(/pic:cNvPr id="9001"/g, `pic:cNvPr id="${9001 + index}"`)
  })
  const paginatedBody = pages.join(PAGE_BREAK)
  const updatedXml = normalizedXml.replace(
    /<w:body>[\s\S]*?<\/w:body>/,
    `<w:body>${paginatedBody}${sectionProperties}</w:body>`,
  )

  zip.file('word/document.xml', updatedXml)
}

function setPackingSlipTextBlack(zip: PizZip) {
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

    zip.file(
      fileName,
      xml
        .replace(/<w:color\b[^>]*\/>/g, '')
        .replace(/<w:rPr>/g, '<w:rPr><w:color w:val="000000"/>'),
    )
  }
}

function setPackingSlipCellPadding(zip: PizZip) {
  const documentFile = zip.file('word/document.xml')
  const documentXml = documentFile?.asText()

  if (!documentXml) {
    throw new Error('Packing Slip document content was not found')
  }

  const cellMargins = [
    '<w:tcMar>',
    '<w:top w:w="90" w:type="dxa"/>',
    '<w:left w:w="120" w:type="dxa"/>',
    '<w:bottom w:w="90" w:type="dxa"/>',
    '<w:right w:w="120" w:type="dxa"/>',
    '</w:tcMar>',
  ].join('')

  zip.file(
    'word/document.xml',
    documentXml.replace(/<w:tcPr>([\s\S]*?)<\/w:tcPr>/g, (_, properties: string) => (
      `<w:tcPr>${properties.replace(/<w:tcMar>[\s\S]*?<\/w:tcMar>/g, '')}${cellMargins}</w:tcPr>`
    )),
  )
}

export function generatePackingSlipPages(template: ArrayBuffer, logo: ArrayBuffer, values: PackingSlipValues): ArrayBuffer {
  if (values.items.length === 0) {
    throw new Error('The selected invoice has no line items')
  }

  const zip = new PizZip(template)
  embedPackingSlipLogo(zip, logo)
  preparePackingSlipTemplate(zip, values.items.length)
  setPackingSlipCellPadding(zip)
  setPackingSlipTextBlack(zip)

  const document = new Docxtemplater(zip, {
    delimiters: {
      start: '{{',
      end: '}}',
    },
    paragraphLoop: true,
    linebreaks: true,
  })

  const templateData: Record<string, string> = {}
  const invoiceDate = formatInvoiceDate(values.invoiceDate)

  values.items.forEach((item, index) => {
    templateData[`SlNo_${index}`] = String(index + 1)
    templateData[`CustomerName_${index}`] = values.customerName
    templateData[`ItemName_${index}`] = item.name
    templateData[`InvoiceNumber_${index}`] = values.invoiceNumber
    templateData[`InvoiceDate_${index}`] = invoiceDate
    templateData[`ItemDesciption_${index}`] = item.description
    templateData[`Quantity_${index}`] = item.quantity
  })

  document.render(templateData)

  return document.getZip().generate({ type: 'arraybuffer' })
}
