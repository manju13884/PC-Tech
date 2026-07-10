import { useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import { getCustomers, getCustomersError, type Customer } from './customerService'
import { getInvoiceById, getInvoicesByCustomer, getInvoicesError, type Invoice } from './invoiceService'
import { loadCocTemplate } from './lib/templateLoader'

interface MenuItem {
  key: string
  title: string
  description: string
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
      },
      {
        key: 'packing-slip',
        title: 'Packing Slip',
        description:
          'Create packing slips for shipments and documentation required during order fulfillment.',
      },
      {
        key: 'coa',
        title: 'COA (Certificate of Analysis)',
        description:
          'Access the Certificate of Analysis for quality assurance and material test results.',
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
      setPreviewTemplate(null)
      setPreviewError('')
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
          alignCocRegistrationLine(previewElement)
          applyCocPageBorder(previewElement)
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

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <img
            className="site-logo"
            src="/assets/logo.png"
            alt="PolarCanvas logo"
          />
        </div>
        <div className="dashboard-header-actions">
          <div className="portal-identity" aria-label="PolarCanvas Tech Portal">
            <span>PolarCanvas</span>
            <em>Tech Portal</em>
          </div>
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
                  <li
                    key={item.key}
                    className={`menu-item ${item.key === selectedKey ? 'active' : ''}`}
                    onClick={() => setSelectedKey(item.key)}
                  >
                    <span>{item.title}</span>
                    {item.key === selectedKey && <span>✓</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <section className="dashboard-content">
          <div className="dashboard-card">
            <h2>{selectedItem.title}</h2>
            <p>{selectedItem.description}</p>
            <div className="dashboard-details">
              {selectedItem.key === 'corrugated-box-price' && (
                <div>
                  <p>
                    Use the corrugated box calculator to check pricing on boxes of different dimensions and quantities.
                  </p>
                </div>
              )}
              {selectedItem.key === 'coc' && (
                <div>
                  <label htmlFor="customer-name" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                    Customer Name
                  </label>
                  <select
                    id="customer-name"
                    value={customerId}
                    onChange={(event) => {
                      setCustomerId(event.target.value)
                      setPreviewTemplate(null)
                      setPreviewError('')
                    }}
                    disabled={customersLoading || Boolean(customersError)}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.4rem', border: '1px solid #ccc' }}
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
                  {customersError && (
                    <p style={{ margin: '0.5rem 0 0', color: '#b42318', fontSize: '0.9rem' }}>
                      {customersError}
                    </p>
                  )}
                  <label htmlFor="invoice-number" style={{ display: 'block', marginTop: '1rem', marginBottom: '0.5rem', fontWeight: 600 }}>
                    Invoice Number
                  </label>
                  <select
                    id="invoice-number"
                    value={invoiceId}
                    onChange={(event) => {
                      setInvoiceId(event.target.value)
                      setPreviewTemplate(null)
                      setPreviewError('')
                    }}
                    disabled={!customerId || invoicesLoading || Boolean(invoicesError)}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.4rem', border: '1px solid #ccc' }}
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
                  {invoicesError && (
                    <p style={{ margin: '0.5rem 0 0', color: '#b42318', fontSize: '0.9rem' }}>
                      {invoicesError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={generateCoc}
                    disabled={!invoiceId || !templateReady}
                    style={{ marginTop: '1rem', padding: '0.65rem 1rem', borderRadius: '0.4rem', border: 0, background: '#2563eb', color: '#fff', cursor: invoiceId && templateReady ? 'pointer' : 'not-allowed', opacity: invoiceId && templateReady ? 1 : 0.55 }}
                  >
                    Generate COC
                  </button>
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
                <div>
                  <p>
                    Generate and print packing slips to accompany your shipments and help with order tracking.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
