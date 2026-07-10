import { useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import { Calculator, ChevronRight, ClipboardList, FileCheck2, FileDown, FlaskConical, PackageCheck, Printer, type LucideIcon } from 'lucide-react'
import { getCustomers, getCustomersError, type Customer } from './customerService'
import { getInvoiceById, getInvoicesByCustomer, getInvoicesError, type Invoice } from './invoiceService'
import { loadCocTemplate } from './lib/templateLoader'
import { loadPackingSlipLogo, loadPackingSlipTemplate } from './lib/packingSlipTemplateLoader'

interface MenuItem {
  key: string
  title: string
  description: string
  icon: LucideIcon
}

interface MenuGroup {
  title: string
  items: MenuItem[]
}

const menuGroups: MenuGroup[] = [
  {
    title: 'Calculators',
    items: [
      {
        key: 'corrugated-box-price',
        title: 'Corrugated Box Price Calculator',
        description:
          'Estimate the cost of corrugated boxes based on size, material, and quantity for your packaging needs.',
        icon: Calculator,
      },
    ],
  },
  {
    title: 'Documents',
    items: [
      {
        key: 'coc',
        title: 'COC (Certificate of Compliance)',
        description:
          'View or generate a Certificate of Compliance for corrugated packaging materials and manufacturing standards.',
        icon: FileCheck2,
      },
      {
        key: 'packing-slip',
        title: 'Packing Slip',
        description:
          'Create packing slips for shipments and documentation required during order fulfillment.',
        icon: ClipboardList,
      },
      {
        key: 'coa',
        title: 'COA (Certificate of Analysis)',
        description:
          'Access the Certificate of Analysis for quality assurance and material test results.',
        icon: FlaskConical,
      },
    ],
  },
]

function formatCustomerOption(customer: Customer): string {
  return `${customer.customer_name} - ${customer.gst_number || 'GST not available'}`
}

function alignCocRegistrationLine(previewElement: HTMLElement) {
  const registrationLine = Array.from(previewElement.querySelectorAll('p')).find((paragraph) => {
    const text = paragraph.textContent ?? ''
    return text.includes('CIN:') && text.includes('GST:')
  })

  if (!registrationLine) {
    return
  }

  const text = registrationLine.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  const parts = text.match(/^(CIN:.*?)(GST:.*)$/)

  if (!parts) {
    return
  }

  const cin = document.createElement('span')
  const gst = document.createElement('span')

  cin.textContent = parts[1].trim()
  gst.textContent = parts[2].trim()
  registrationLine.replaceChildren(cin, gst)
  registrationLine.classList.add('coc-registration-line')
}

function centerCocLetterhead(previewElement: HTMLElement) {
  const letterheadImage = previewElement.querySelector('header img')
  const letterheadParagraph = letterheadImage?.closest<HTMLElement>('p')

  if (letterheadParagraph) {
    letterheadParagraph.style.setProperty('text-align', 'center', 'important')
  }
}

function centerRenderedCocWatermark(previewElement: HTMLElement) {
  for (const page of previewElement.querySelectorAll<HTMLElement>('section.docx')) {
    const watermark = page.querySelector<SVGElement>('header svg')

    if (!watermark) {
      continue
    }

    page.appendChild(watermark)
    watermark.classList.add('coc-centered-watermark')
  }
}

function fitCocPreview(previewElement: HTMLElement) {
  const wrapper = previewElement.querySelector<HTMLElement>('.docx-wrapper')

  if (!wrapper) {
    return
  }

  wrapper.style.setProperty('zoom', '1')
  const availableWidth = previewElement.clientWidth
  const documentWidth = wrapper.scrollWidth
  const scale = documentWidth > availableWidth ? availableWidth / documentWidth : 1

  wrapper.style.setProperty('zoom', String(scale))
}

function applyCocPageBorder(previewElement: HTMLElement) {
  for (const page of previewElement.querySelectorAll<HTMLElement>('section.docx')) {
    page.style.setProperty('border', '0', 'important')
    page.style.setProperty('box-shadow', '0 0 10px rgba(0, 0, 0, 0.18)', 'important')
    page.style.setProperty('box-sizing', 'border-box', 'important')

    const frame = document.createElement('div')
    frame.className = 'coc-page-frame'
    frame.setAttribute('aria-hidden', 'true')
    page.appendChild(frame)
  }
}

function styleCocItemTable(previewElement: HTMLElement) {
  const itemTable = Array.from(previewElement.querySelectorAll('table')).find((table) => {
    const text = (table.textContent ?? '').replace(/\s+/g, ' ')
    return text.includes('Sl No') && text.includes('Item & Description') && text.includes('Quantity')
  })
  const headerRow = itemTable?.querySelector('tr')

  itemTable?.classList.add('coc-item-table')
  headerRow?.classList.add('coc-item-table-header')
}

function styleCocDetailLines(previewElement: HTMLElement) {
  for (const paragraph of previewElement.querySelectorAll('article p')) {
    const text = (paragraph.textContent ?? '').trim()

    if (/^(DATE:|CUSTOMER:|PO#:|Invoice\(s\):)/.test(text)) {
      paragraph.classList.add('coc-detail-line')
    }
  }
}

function removeEmptyCocPages(previewElement: HTMLElement) {
  const pages = Array.from(previewElement.querySelectorAll<HTMLElement>('section.docx'))

  for (const page of pages.slice(1)) {
    const article = page.querySelector('article')
    const hasBodyContent = Boolean(
      article?.textContent?.trim() || article?.querySelector('img, table, svg'),
    )

    if (!hasBodyContent) {
      page.remove()
    }
  }
}

export default function Dashboard({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [selectedKey, setSelectedKey] = useState('coc')
  const [customerId, setCustomerId] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customersLoading, setCustomersLoading] = useState(false)
  const [customersError, setCustomersError] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [invoicesError, setInvoicesError] = useState<string | null>(null)
  const [packingCustomerId, setPackingCustomerId] = useState('')
  const [packingInvoiceId, setPackingInvoiceId] = useState('')
  const [packingInvoices, setPackingInvoices] = useState<Invoice[]>([])
  const [packingInvoicesLoading, setPackingInvoicesLoading] = useState(false)
  const [packingInvoicesError, setPackingInvoicesError] = useState<string | null>(null)
  const [packingPreviewTemplate, setPackingPreviewTemplate] = useState<ArrayBuffer | null>(null)
  const [packingPreviewLoading, setPackingPreviewLoading] = useState(false)
  const [packingPreviewError, setPackingPreviewError] = useState('')
  const packingPreviewRef = useRef<HTMLDivElement>(null)
  const [templateReady, setTemplateReady] = useState(false)
  const [previewTemplate, setPreviewTemplate] = useState<ArrayBuffer | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const previewRef = useRef<HTMLDivElement>(null)

  const selectedItem = menuGroups
    .flatMap((group) => group.items)
    .find((item) => item.key === selectedKey) ?? menuGroups[0].items[0]

  useEffect(() => {
    if (selectedKey !== 'coc') {
      setCustomerId('')
      setInvoiceId('')
      setPreviewTemplate(null)
      setPreviewError('')
    }

    if (selectedKey !== 'coc' && selectedKey !== 'packing-slip') {
      return
    }

    let isCurrent = true

    async function loadCustomers() {
      setCustomersLoading(true)
      setCustomersError(null)

      const customerList = await getCustomers()

      if (!isCurrent) {
        return
      }

      setCustomers(customerList)
      setCustomersError(getCustomersError())
      setCustomersLoading(false)
    }

    loadCustomers()

    return () => {
      isCurrent = false
    }
  }, [selectedKey])

  useEffect(() => {
    if (!previewTemplate || !previewRef.current) {
      return
    }

    let isCurrent = true
    let previewResizeObserver: ResizeObserver | null = null
    const previewElement = previewRef.current

    previewElement.replaceChildren()
    setPreviewLoading(true)
    setPreviewError('')

    renderAsync(previewTemplate, previewElement, undefined, {
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
    })
      .then(() => {
        if (isCurrent) {
          centerCocLetterhead(previewElement)
          centerRenderedCocWatermark(previewElement)
          alignCocRegistrationLine(previewElement)
          applyCocPageBorder(previewElement)
          styleCocItemTable(previewElement)
          styleCocDetailLines(previewElement)
          removeEmptyCocPages(previewElement)
          fitCocPreview(previewElement)
          previewResizeObserver = new ResizeObserver(() => fitCocPreview(previewElement))
          previewResizeObserver.observe(previewElement)
        }
      })
      .catch(() => {
        if (isCurrent) {
          setPreviewError('Unable to preview COC template')
        }
      })
      .finally(() => {
        if (isCurrent) {
          setPreviewLoading(false)
        }
      })

    return () => {
      isCurrent = false
      previewResizeObserver?.disconnect()
    }
  }, [previewTemplate])

  useEffect(() => {
    if (!packingPreviewTemplate || !packingPreviewRef.current) {
      return
    }

    let isCurrent = true
    let previewResizeObserver: ResizeObserver | null = null
    const previewElement = packingPreviewRef.current

    previewElement.replaceChildren()
    setPackingPreviewLoading(true)
    setPackingPreviewError('')

    renderAsync(packingPreviewTemplate, previewElement, undefined, {
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
    })
      .then(() => {
        if (isCurrent) {
          fitCocPreview(previewElement)
          previewResizeObserver = new ResizeObserver(() => fitCocPreview(previewElement))
          previewResizeObserver.observe(previewElement)
        }
      })
      .catch(() => {
        if (isCurrent) {
          setPackingPreviewError('Unable to preview Packing Slip template')
        }
      })
      .finally(() => {
        if (isCurrent) {
          setPackingPreviewLoading(false)
        }
      })

    return () => {
      isCurrent = false
      previewResizeObserver?.disconnect()
    }
  }, [packingPreviewTemplate])

  useEffect(() => {
    setInvoiceId('')
    setInvoices([])
    setInvoicesError(null)
    setInvoicesLoading(false)

    if (selectedKey !== 'coc' || !customerId) {
      return
    }

    let isCurrent = true

    async function loadInvoices() {
      setInvoicesLoading(true)
      setInvoicesError(null)

      const invoiceList = await getInvoicesByCustomer(customerId)

      if (!isCurrent) {
        return
      }

      setInvoices(invoiceList)
      setInvoicesError(getInvoicesError())
      setInvoicesLoading(false)
    }

    loadInvoices()

    return () => {
      isCurrent = false
    }
  }, [customerId, selectedKey])

  useEffect(() => {
    setPackingInvoiceId('')
    setPackingInvoices([])
    setPackingInvoicesError(null)
    setPackingInvoicesLoading(false)

    if (selectedKey !== 'packing-slip' || !packingCustomerId) {
      return
    }

    let isCurrent = true

    async function loadPackingInvoices() {
      setPackingInvoicesLoading(true)
      setPackingInvoicesError(null)

      const invoiceList = await getInvoicesByCustomer(packingCustomerId)

      if (!isCurrent) {
        return
      }

      setPackingInvoices(invoiceList)
      setPackingInvoicesError(getInvoicesError())
      setPackingInvoicesLoading(false)
    }

    loadPackingInvoices()

    return () => {
      isCurrent = false
    }
  }, [packingCustomerId, selectedKey])

  useEffect(() => {
    if (selectedKey !== 'coc') {
      return
    }

    let isCurrent = true

    async function checkTemplate() {
      try {
        await loadCocTemplate()

        if (isCurrent) {
          setTemplateReady(true)
        }
      } catch {
        if (isCurrent) {
          setTemplateReady(false)
        }
      }
    }

    checkTemplate()

    return () => {
      isCurrent = false
    }
  }, [selectedKey])

  async function generateCoc() {
    const selectedInvoice = invoices.find((invoice) => invoice.invoice_id === invoiceId)

    if (!selectedInvoice) {
      return
    }

    try {
      const invoice = await getInvoiceById(selectedInvoice.invoice_id)
      const template = await loadCocTemplate()
      const { generateCocTemplate } = await import('./lib/cocGenerator')
      setPreviewTemplate(generateCocTemplate(template, {
        invoiceDate: invoice.date,
        customer: invoice.customer_name,
        poNumber: invoice.po_number,
        invoiceNumber: invoice.invoice_number,
        items: invoice.line_items,
      }))
    } catch {
      setPreviewError('Unable to generate COC preview')
    }
  }

  async function generatePackingSlip() {
    if (!packingInvoiceId) {
      return
    }

    setPackingPreviewError('')

    try {
      const [invoice, template, logo, { generatePackingSlipPages }] = await Promise.all([
        getInvoiceById(packingInvoiceId),
        loadPackingSlipTemplate(),
        loadPackingSlipLogo(),
        import('./lib/packingSlipGenerator'),
      ])
      setPackingPreviewTemplate(generatePackingSlipPages(template, logo, {
        customerName: invoice.customer_name,
        invoiceNumber: invoice.invoice_number,
        invoiceDate: invoice.date,
        items: invoice.line_items,
      }))
    } catch (error) {
      setPackingPreviewError(error instanceof Error ? error.message : 'Unable to generate Packing Slip preview')
    }
  }

  function openMobileCocPrintWindow(previewElement: HTMLElement, title: string, singlePage: boolean): boolean {
    const printWindow = window.open('', '_blank')

    if (!printWindow) {
      return false
    }

    const stylesheetLinks = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
      .map((link) => `<link rel="stylesheet" href="${link.href}">`)
      .join('')
    const docxStyles = Array.from(previewElement.querySelectorAll('style'))
      .map((style) => style.outerHTML)
      .join('')
    const singlePageClass = singlePage ? ' single-page-coc-print' : ''
    const previewClassName = previewElement.classList.contains('packing-slip-preview-document')
      ? 'coc-preview-document packing-slip-preview-document'
      : 'coc-preview-document'

    printWindow.document.open()
    printWindow.document.write(
      `<!doctype html><html class="${singlePageClass.trim()}"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<title>${title}</title>${stylesheetLinks}${docxStyles}</head>` +
        `<body class="printing-coc${singlePageClass}"><div class="${previewClassName}">` +
        `${previewElement.innerHTML}</div></body></html>`,
    )
    printWindow.document.close()

    printWindow.addEventListener('load', () => {
      printWindow.setTimeout(() => {
        printWindow.focus()
        printWindow.print()
      }, 350)
    }, { once: true })
    printWindow.addEventListener('afterprint', () => printWindow.close(), { once: true })

    return true
  }

  function openDocumentPrintDialog(
    previewElement: HTMLDivElement | null,
    documentInvoices: Invoice[],
    documentInvoiceId: string,
    suffix: string,
  ) {
    const wrapper = previewElement?.querySelector<HTMLElement>('.docx-wrapper')

    if (!previewElement || !wrapper) {
      return
    }

    const selectedInvoice = documentInvoices.find((invoice) => invoice.invoice_id === documentInvoiceId)
    const printTitle = selectedInvoice ? `${selectedInvoice.invoice_number}-${suffix}` : suffix

    wrapper.style.setProperty('zoom', '1')

    const pages = Array.from(previewElement.querySelectorAll<HTMLElement>('section.docx'))
    const firstPage = pages[0]
    const article = firstPage?.querySelector<HTMLElement>('article')
    const a4HeightInCssPixels = (297 / 25.4) * 96
    const contentFitsOnePage = pages.length === 1 && article !== null && article.scrollHeight <= a4HeightInCssPixels - 48
    const isMobileBrowser = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches

    if (isMobileBrowser && openMobileCocPrintWindow(previewElement, printTitle, contentFitsOnePage)) {
      fitCocPreview(previewElement)
      return
    }

    const previousTitle = document.title

    document.title = printTitle
    document.body.classList.add('printing-coc')

    if (contentFitsOnePage) {
      document.documentElement.classList.add('single-page-coc-print')
      document.body.classList.add('single-page-coc-print')
    }

    const cleanup = () => {
      document.body.classList.remove('printing-coc')
      document.body.classList.remove('single-page-coc-print')
      document.documentElement.classList.remove('single-page-coc-print')
      document.title = previousTitle
      fitCocPreview(previewElement)
    }

    window.addEventListener('afterprint', cleanup, { once: true })
    window.print()
  }

  function selectMenuItem(key: string) {
    if (key === 'packing-slip') {
      setPackingCustomerId('')
      setPackingInvoiceId('')
      setPackingInvoices([])
      setPackingInvoicesError(null)
      setPackingPreviewTemplate(null)
      setPackingPreviewError('')
    }

    setSelectedKey(key)
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <img
            className="site-logo"
            src="/assets/PC-Bord-Logo-only-transparent.png"
            alt="PolarCanvas bird logo"
          />
          <div className="portal-identity" aria-label="PolarCanvas Tech Portal">
            <span>Polar Canvas</span>
            <em>Tech Portal</em>
          </div>
        </div>
        <div className="dashboard-header-actions">
          <span className="dashboard-welcome">Welcome, {username}</span>
          <button className="logout-button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="dashboard-grid">
        <aside className="dashboard-menu">
          {menuGroups.map((group) => (
            <div key={group.title} className="menu-group">
              <h3>{group.title}</h3>
              <ul className="menu-list">
                {group.items.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      className={`menu-item ${item.key === selectedKey ? 'active' : ''}`}
                      onClick={() => selectMenuItem(item.key)}
                      aria-current={item.key === selectedKey ? 'page' : undefined}
                    >
                      <span className="menu-item-main">
                        <span className="menu-item-icon" aria-hidden="true">
                          <item.icon size={18} strokeWidth={1.8} />
                        </span>
                        <span>{item.title}</span>
                      </span>
                      <ChevronRight className="menu-item-chevron" size={16} aria-hidden="true" />
                    </button>
                    {item.key === selectedKey && <span>✓</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <section className="dashboard-content">
          <div className={`dashboard-card${selectedItem.key === 'coc' || selectedItem.key === 'packing-slip' ? ' document-form-page' : ''}`}>
            <header className="dashboard-page-heading">
              <h2>{selectedItem.title}</h2>
              <p>{selectedItem.description}</p>
            </header>
            <div className="dashboard-details">
              {selectedItem.key === 'corrugated-box-price' && (
                <div>
                  <p>
                    Use the corrugated box calculator to check pricing on boxes of different dimensions and quantities.
                  </p>
                </div>
              )}
              {selectedItem.key === 'coc' && (
                <div className="coc-form">
                  <div className="coc-form-field">
                    <label htmlFor="customer-name">Customer Name</label>
                    <select
                      id="customer-name"
                      value={customerId}
                      onChange={(event) => {
                        setCustomerId(event.target.value)
                        setPreviewTemplate(null)
                        setPreviewError('')
                      }}
                      disabled={customersLoading || Boolean(customersError)}
                    >
                      <option value="">
                        {customersLoading
                          ? 'Loading customers...'
                          : customersError
                            ? 'Unable to load customers'
                            : 'Select customer'}
                      </option>
                      {customers.map((customer) => (
                        <option key={customer.customer_id} value={customer.customer_id}>
                          {formatCustomerOption(customer)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {customersError && (
                    <p style={{ margin: '0.5rem 0 0', color: '#b42318', fontSize: '0.9rem' }}>
                      {customersError}
                    </p>
                  )}
                  <div className="coc-form-field">
                    <label htmlFor="invoice-number">Invoice Number</label>
                    <select
                      id="invoice-number"
                      value={invoiceId}
                      onChange={(event) => {
                        setInvoiceId(event.target.value)
                        setPreviewTemplate(null)
                        setPreviewError('')
                      }}
                      disabled={!customerId || invoicesLoading || Boolean(invoicesError)}
                    >
                      <option value="">
                        {!customerId
                          ? 'Select customer first'
                          : invoicesLoading
                            ? 'Loading invoices...'
                            : invoicesError
                              ? 'Unable to load invoices'
                              : invoices.length === 0
                                ? 'No invoices found'
                                : 'Select invoice'}
                      </option>
                      {invoices.map((invoice) => (
                        <option key={invoice.invoice_id} value={invoice.invoice_id}>
                          {invoice.invoice_number}
                        </option>
                      ))}
                    </select>
                  </div>
                  {invoicesError && (
                    <p style={{ margin: '0.5rem 0 0', color: '#b42318', fontSize: '0.9rem' }}>
                      {invoicesError}
                    </p>
                  )}
                  <div className="coc-action-row packing-slip-actions">
                    <button
                      type="button"
                      className="packing-action-button packing-action-primary"
                      onClick={generateCoc}
                      disabled={!invoiceId || !templateReady}
                    >
                      <FileCheck2 aria-hidden="true" />
                      <span>Generate COC</span>
                    </button>
                    {previewTemplate && !previewLoading && !previewError && (
                      <>
                      <button
                        type="button"
                        className="packing-action-button packing-action-pdf"
                        onClick={() => openDocumentPrintDialog(previewRef.current, invoices, invoiceId, 'COC')}
                      >
                        <FileDown aria-hidden="true" />
                        <span>Save As PDF</span>
                      </button>
                      <button
                        type="button"
                        className="packing-action-button packing-action-print"
                        onClick={() => openDocumentPrintDialog(previewRef.current, invoices, invoiceId, 'COC')}
                      >
                        <Printer aria-hidden="true" />
                        <span>Print COC</span>
                      </button>
                      </>
                    )}
                  </div>
                  {(previewTemplate || previewError) && (
                    <div className="coc-preview">
                      {previewLoading && (
                        <p style={{ margin: 0, padding: '1rem', background: '#fff' }}>Loading COC preview...</p>
                      )}
                      {previewError && (
                        <p style={{ margin: 0, padding: '1rem', color: '#b42318', background: '#fff' }}>{previewError}</p>
                      )}
                      <div ref={previewRef} className="coc-preview-document" />
                    </div>
                  )}
                </div>
              )}
              {selectedItem.key === 'coa' && (
                <div>
                  <p>
                    The Certificate of Analysis provides the quality and testing information for the packaging material.
                  </p>
                </div>
              )}
              {selectedItem.key === 'packing-slip' && (
                <div className="coc-form">
                  <div className="coc-form-field">
                    <label htmlFor="packing-customer-name">Customer Name</label>
                    <select
                      id="packing-customer-name"
                      value={packingCustomerId}
                      onChange={(event) => {
                        setPackingCustomerId(event.target.value)
                        setPackingPreviewTemplate(null)
                        setPackingPreviewError('')
                      }}
                      disabled={customersLoading || Boolean(customersError)}
                    >
                      <option value="">
                        {customersLoading
                          ? 'Loading customers...'
                          : customersError
                            ? 'Unable to load customers'
                            : 'Select customer'}
                      </option>
                      {customers.map((customer) => (
                        <option key={customer.customer_id} value={customer.customer_id}>
                          {formatCustomerOption(customer)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {customersError && (
                    <p style={{ margin: '0.5rem 0 0', color: '#b42318', fontSize: '0.9rem' }}>
                      {customersError}
                    </p>
                  )}
                  <div className="coc-form-field">
                    <label htmlFor="packing-invoice-number">Invoice Number</label>
                    <select
                      id="packing-invoice-number"
                      value={packingInvoiceId}
                      onChange={(event) => {
                        setPackingInvoiceId(event.target.value)
                        setPackingPreviewTemplate(null)
                        setPackingPreviewError('')
                      }}
                      disabled={!packingCustomerId || packingInvoicesLoading || Boolean(packingInvoicesError)}
                    >
                      <option value="">
                        {!packingCustomerId
                          ? 'Select customer first'
                          : packingInvoicesLoading
                            ? 'Loading invoices...'
                            : packingInvoicesError
                              ? 'Unable to load invoices'
                              : packingInvoices.length === 0
                                ? 'No invoices found'
                                : 'Select invoice'}
                      </option>
                      {packingInvoices.map((invoice) => (
                        <option key={invoice.invoice_id} value={invoice.invoice_id}>
                          {invoice.invoice_number}
                        </option>
                      ))}
                    </select>
                  </div>
                  {packingInvoicesError && (
                    <p style={{ margin: '0.5rem 0 0', color: '#b42318', fontSize: '0.9rem' }}>
                      {packingInvoicesError}
                    </p>
                  )}
                  <div className="coc-action-row packing-slip-actions">
                    <button
                      type="button"
                      className="packing-action-button packing-action-primary"
                      onClick={generatePackingSlip}
                      disabled={!packingInvoiceId}
                    >
                      <PackageCheck aria-hidden="true" />
                      <span>Generate Packing Slip</span>
                    </button>
                    {packingPreviewTemplate && !packingPreviewLoading && !packingPreviewError && (
                      <>
                        <button
                          type="button"
                          className="packing-action-button packing-action-pdf"
                          onClick={() => openDocumentPrintDialog(packingPreviewRef.current, packingInvoices, packingInvoiceId, 'PackingSlip')}
                        >
                          <FileDown aria-hidden="true" />
                          <span>Save As PDF</span>
                        </button>
                        <button
                          type="button"
                          className="packing-action-button packing-action-print"
                          onClick={() => openDocumentPrintDialog(packingPreviewRef.current, packingInvoices, packingInvoiceId, 'PackingSlip')}
                        >
                          <Printer aria-hidden="true" />
                          <span>Print Packing Slip</span>
                        </button>
                      </>
                    )}
                  </div>
                  {(packingPreviewTemplate || packingPreviewError) && (
                    <div className="coc-preview">
                      {packingPreviewLoading && (
                        <p style={{ margin: 0, padding: '1rem', background: '#fff' }}>Loading Packing Slip preview...</p>
                      )}
                      {packingPreviewError && (
                        <p style={{ margin: 0, padding: '1rem', color: '#b42318', background: '#fff' }}>{packingPreviewError}</p>
                      )}
                      <div ref={packingPreviewRef} className="coc-preview-document packing-slip-preview-document" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
