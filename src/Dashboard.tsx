import { useEffect, useState } from 'react'
import { getCustomers, getCustomersError, type Customer } from './customerService'
import { getInvoicesByCustomer, getInvoicesError, type Invoice } from './invoiceService'

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
        key: 'coa',
        title: 'COA (Certificate of Analysis)',
        description:
          'Access the Certificate of Analysis for quality assurance and material test results.',
      },
      {
        key: 'packing-slip',
        title: 'Packing Slip',
        description:
          'Create packing slips for shipments and documentation required during order fulfillment.',
      },
    ],
  },
]

function formatCustomerOption(customer: Customer): string {
  return `${customer.customer_name} - ${customer.gst_number || 'GST not available'}`
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

  const selectedItem = menuGroups
    .flatMap((group) => group.items)
    .find((item) => item.key === selectedKey) ?? menuGroups[0].items[0]

  useEffect(() => {
    if (selectedKey !== 'coc') {
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
                    onChange={(event) => setCustomerId(event.target.value)}
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
                    onChange={(event) => setInvoiceId(event.target.value)}
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
