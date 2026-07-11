import { type FormEvent, useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import { Ban, Calculator, ChevronRight, ClipboardList, FileCheck2, FileDown, FlaskConical, PackageCheck, Pencil, Printer, Save, Settings, X, type LucideIcon } from 'lucide-react'
import { getAdminAccess, getAdminAccessError, updateRoleMenuAccess, type AdminAccessPermission } from './adminAccessService'
import { deactivateAdminRole, getAdminRoles, getAdminRolesError, updateAdminRole, type AdminRole } from './adminRolesService'
import { createAdminUser, deactivateAdminUser, getAdminUsers, getAdminUsersError, updateAdminUser, type AdminUser } from './adminUsersService'
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

interface AccessMatrixItem {
  key: string
  module: string
  subMenu: string
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
  {
    title: 'Configurations',
    items: [
      {
        key: 'admin-configurations',
        title: 'Access Management',
        description:
          'Manage user accounts, role access, and administrative permissions for this portal.',
        icon: Settings,
      },
    ],
  },
]

const menuItems = menuGroups.flatMap((group) => group.items)
const defaultMenuKey = 'coc'
const accessMatrix: AccessMatrixItem[] = menuGroups.flatMap((group) => (
  group.items.map((item) => ({
    key: item.key,
    module: group.title,
    subMenu: item.title,
  }))
))

function getInitialMenuKey(): string {
  const hashKey = window.location.hash.replace(/^#/, '')

  return menuItems.some((item) => item.key === hashKey) ? hashKey : defaultMenuKey
}

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

function formatAdminDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = date.toLocaleString('en-US', { month: 'short' })
  const year = date.getFullYear()

  return `${day}-${month}-${year}`
}

export default function Dashboard({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [selectedKey, setSelectedKey] = useState(getInitialMenuKey)
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
  const [adminConfigTab, setAdminConfigTab] = useState<'users' | 'roles' | 'access'>('users')
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [adminUsersLoading, setAdminUsersLoading] = useState(false)
  const [adminUsersError, setAdminUsersError] = useState<string | null>(null)
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [editUserFullName, setEditUserFullName] = useState('')
  const [editUserEmail, setEditUserEmail] = useState('')
  const [editUserRole, setEditUserRole] = useState('')
  const [savingUserId, setSavingUserId] = useState<number | null>(null)
  const [userPendingDeactivate, setUserPendingDeactivate] = useState<AdminUser | null>(null)
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [createUserFullName, setCreateUserFullName] = useState('')
  const [createUserEmail, setCreateUserEmail] = useState('')
  const [createUserRole, setCreateUserRole] = useState('')
  const [createUserEmailError, setCreateUserEmailError] = useState('')
  const [creatingUser, setCreatingUser] = useState(false)
  const [latestSetupLink, setLatestSetupLink] = useState('')
  const [adminRoles, setAdminRoles] = useState<AdminRole[]>([])
  const [adminRolesLoading, setAdminRolesLoading] = useState(false)
  const [adminRolesError, setAdminRolesError] = useState<string | null>(null)
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null)
  const [editRoleName, setEditRoleName] = useState('')
  const [editRoleDescription, setEditRoleDescription] = useState('')
  const [savingRoleId, setSavingRoleId] = useState<number | null>(null)
  const [roleActionMessage, setRoleActionMessage] = useState('')
  const [roleActionMessageType, setRoleActionMessageType] = useState<'error' | 'success'>('error')
  const [rolePendingDeactivate, setRolePendingDeactivate] = useState<AdminRole | null>(null)
  const [adminAccessByRole, setAdminAccessByRole] = useState<Record<number, AdminAccessPermission[]>>({})
  const [adminAccessLoading, setAdminAccessLoading] = useState(false)
  const [adminAccessError, setAdminAccessError] = useState<string | null>(null)
  const [savingAccessKey, setSavingAccessKey] = useState('')

  const selectedItem = menuItems.find((item) => item.key === selectedKey) ?? menuItems[0]

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
    if (selectedKey !== 'admin-configurations' || adminConfigTab !== 'users') {
      return
    }

    let isCurrent = true

    async function loadAdminUsers() {
      setAdminUsersLoading(true)
      setAdminUsersError(null)

      const users = await getAdminUsers()

      if (!isCurrent) {
        return
      }

      setAdminUsers(users)
      setAdminUsersError(getAdminUsersError())
      setAdminUsersLoading(false)
    }

    loadAdminUsers()

    return () => {
      isCurrent = false
    }
  }, [adminConfigTab, selectedKey])

  useEffect(() => {
    if (selectedKey !== 'admin-configurations' || adminRoles.length > 0) {
      return
    }

    let isCurrent = true

    async function loadAdminRoles() {
      setAdminRolesLoading(true)
      setAdminRolesError(null)

      const roles = await getAdminRoles()

      if (!isCurrent) {
        return
      }

      setAdminRoles(roles)
      setAdminRolesError(getAdminRolesError())
      setAdminRolesLoading(false)
    }

    loadAdminRoles()

    return () => {
      isCurrent = false
    }
  }, [adminRoles.length, selectedKey])

  useEffect(() => {
    if (selectedKey !== 'admin-configurations' || adminConfigTab !== 'access' || adminRoles.length === 0) {
      return
    }

    let isCurrent = true

    async function loadAdminAccess() {
      setAdminAccessLoading(true)
      setAdminAccessError(null)

      const activeRoles = adminRoles.filter((role) => role.status === 'ACTIVE')
      const accessEntries = await Promise.all(
        activeRoles.map(async (role) => [role.id, await getAdminAccess(role.id)] as const),
      )

      if (!isCurrent) {
        return
      }

      setAdminAccessByRole(Object.fromEntries(accessEntries))
      setAdminAccessError(getAdminAccessError())
      setAdminAccessLoading(false)
    }

    loadAdminAccess()

    return () => {
      isCurrent = false
    }
  }, [adminConfigTab, adminRoles, selectedKey])

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
    if (!roleActionMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setRoleActionMessage('')
    }, 2200)

    return () => window.clearTimeout(timeoutId)
  }, [roleActionMessage])

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

    window.history.replaceState(null, '', `#${key}`)
    setSelectedKey(key)
  }

  function startEditRole(role: AdminRole) {
    setEditingRoleId(role.id)
    setEditRoleName(role.name)
    setEditRoleDescription(role.description)
    setRoleActionMessage('')
  }

  function cancelEditRole() {
    setEditingRoleId(null)
    setEditRoleName('')
    setEditRoleDescription('')
    setRoleActionMessage('')
  }

  function startEditUser(user: AdminUser) {
    setEditingUserId(user.id)
    setEditUserFullName(user.fullName)
    setEditUserEmail(user.email)
    setEditUserRole(user.role)
    setRoleActionMessage('')
  }

  function cancelEditUser() {
    setEditingUserId(null)
    setEditUserFullName('')
    setEditUserEmail('')
    setEditUserRole('')
    setRoleActionMessage('')
  }

  async function saveUser(userId: number) {
    setSavingUserId(userId)
    setRoleActionMessage('')

    try {
      const updatedUser = await updateAdminUser(userId, {
        email: editUserEmail,
        fullName: editUserFullName,
        role: editUserRole,
      })

      setAdminUsers((users) => users.map((user) => (user.id === updatedUser.id ? updatedUser : user)))
      setEditingUserId(null)
      setEditUserFullName('')
      setEditUserEmail('')
      setEditUserRole('')
      setRoleActionMessageType('success')
      setRoleActionMessage('User updated.')
    } catch (caughtError) {
      setRoleActionMessageType('error')
      setRoleActionMessage(caughtError instanceof Error ? caughtError.message : 'Unable to update user')
    } finally {
      setSavingUserId(null)
    }
  }

  function openCreateUser() {
    const firstAssignableRole = adminRoles.find((role) => role.status === 'ACTIVE' && role.name !== 'SUPERADMIN')
      ?? adminRoles.find((role) => role.status === 'ACTIVE')

    setCreateUserRole(firstAssignableRole?.name ?? '')
    setCreateUserFullName('')
    setCreateUserEmail('')
    setLatestSetupLink('')
    setCreateUserEmailError('')
    setCreateUserOpen(true)
    setRoleActionMessage('')
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreatingUser(true)
    setLatestSetupLink('')
    setCreateUserEmailError('')
    setRoleActionMessage('')

    try {
      const result = await createAdminUser({
        fullName: createUserFullName,
        email: createUserEmail,
        role: createUserRole,
      })

      setAdminUsers((users) => [result.user, ...users])
      setCreateUserOpen(false)
      setCreateUserFullName('')
      setCreateUserEmail('')
      setCreateUserRole('')
      setLatestSetupLink(result.invite.setupLink ?? '')
      setRoleActionMessageType('success')
      setRoleActionMessage(result.invite.emailSent ? 'User created. Invite email sent.' : 'User created. Email not configured.')
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to create user'
      if (message.toLowerCase().includes('email') && message.toLowerCase().includes('already exists')) {
        setCreateUserEmailError('Email already exists')
      }
      setRoleActionMessageType('error')
      setRoleActionMessage(message)
    } finally {
      setCreatingUser(false)
    }
  }

  function requestDeactivateUser(user: AdminUser) {
    if (user.role === 'SUPERADMIN') {
      setRoleActionMessageType('error')
      setRoleActionMessage('SUPERADMIN user cannot be deactivated.')
      return
    }

    setUserPendingDeactivate(user)
  }

  async function deactivateUser() {
    if (!userPendingDeactivate) {
      return
    }

    setSavingUserId(userPendingDeactivate.id)
    setRoleActionMessage('')

    try {
      const updatedUser = await deactivateAdminUser(userPendingDeactivate.id)

      setAdminUsers((users) => users.map((user) => (
        user.id === updatedUser.id ? updatedUser : user
      )))
      setUserPendingDeactivate(null)
      setRoleActionMessageType('success')
      setRoleActionMessage('User deactivated.')
    } catch (caughtError) {
      setRoleActionMessageType('error')
      setRoleActionMessage(caughtError instanceof Error ? caughtError.message : 'Unable to deactivate user')
    } finally {
      setSavingUserId(null)
    }
  }

  async function saveRole(roleId: number) {
    setSavingRoleId(roleId)
    setRoleActionMessage('')

    try {
      const updatedRole = await updateAdminRole(roleId, {
        name: editRoleName,
        description: editRoleDescription,
      })

      setAdminRoles((roles) => roles.map((role) => (role.id === updatedRole.id ? updatedRole : role)))
      setEditingRoleId(null)
      setEditRoleName('')
      setEditRoleDescription('')
      setRoleActionMessageType('success')
      setRoleActionMessage('Role updated.')
    } catch (caughtError) {
      setRoleActionMessageType('error')
      setRoleActionMessage(caughtError instanceof Error ? caughtError.message : 'Unable to update role')
    } finally {
      setSavingRoleId(null)
    }
  }

  function requestDeactivateRole(role: AdminRole) {
    if (role.name === 'SUPERADMIN') {
      setRoleActionMessageType('error')
      setRoleActionMessage('SUPERADMIN role cannot be deactivated.')
      return
    }

    setRolePendingDeactivate(role)
  }

  async function deactivateRole() {
    if (!rolePendingDeactivate) {
      return
    }

    setSavingRoleId(rolePendingDeactivate.id)
    setRoleActionMessage('')

    try {
      const updatedRole = await deactivateAdminRole(rolePendingDeactivate.id)

      setAdminRoles((roles) => roles.map((currentRole) => (
        currentRole.id === updatedRole.id ? updatedRole : currentRole
      )))
      setRolePendingDeactivate(null)
      setRoleActionMessageType('success')
      setRoleActionMessage('Role deactivated.')
    } catch (caughtError) {
      setRoleActionMessageType('error')
      setRoleActionMessage(caughtError instanceof Error ? caughtError.message : 'Unable to deactivate role')
    } finally {
      setSavingRoleId(null)
    }
  }

  function getRoleMenuAccess(roleId: number, menuKey: string): boolean {
    return adminAccessByRole[roleId]?.find((access) => access.menuKey === menuKey)?.view ?? false
  }

  async function toggleRoleMenuAccess(roleId: number, menuKey: string, value: boolean) {
    const updateKey = `${roleId}:${menuKey}`
    setSavingAccessKey(updateKey)
    setRoleActionMessage('')

    try {
      const updatedAccess = await updateRoleMenuAccess(roleId, menuKey, value)

      setAdminAccessByRole((accessByRole) => {
        const roleAccess = accessByRole[roleId] ?? []
        const existing = roleAccess.some((access) => access.menuKey === updatedAccess.menuKey)
        const nextRoleAccess = existing
          ? roleAccess.map((access) => (access.menuKey === updatedAccess.menuKey ? updatedAccess : access))
          : [...roleAccess, updatedAccess]

        return {
          ...accessByRole,
          [roleId]: nextRoleAccess,
        }
      })
      setRoleActionMessageType('success')
      setRoleActionMessage('Access updated.')
    } catch (caughtError) {
      setRoleActionMessageType('error')
      setRoleActionMessage(caughtError instanceof Error ? caughtError.message : 'Unable to update access')
    } finally {
      setSavingAccessKey('')
    }
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
          <div className={`dashboard-card${selectedItem.key === 'coc' || selectedItem.key === 'packing-slip' || selectedItem.key === 'admin-configurations' ? ' document-form-page' : ''}`}>
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
              {selectedItem.key === 'admin-configurations' && (
                <div className="admin-config-page">
                  <div className="admin-config-topbar">
                    <div className="admin-config-tabs" role="tablist" aria-label="Configuration sections">
                      <button
                        type="button"
                        className={adminConfigTab === 'users' ? 'active' : ''}
                        onClick={() => setAdminConfigTab('users')}
                        role="tab"
                        aria-selected={adminConfigTab === 'users'}
                      >
                        <span>Users</span>
                      </button>
                      <button
                        type="button"
                        className={adminConfigTab === 'roles' ? 'active' : ''}
                        onClick={() => setAdminConfigTab('roles')}
                        role="tab"
                        aria-selected={adminConfigTab === 'roles'}
                      >
                        <span>Roles</span>
                      </button>
                      <button
                        type="button"
                        className={adminConfigTab === 'access' ? 'active' : ''}
                        onClick={() => setAdminConfigTab('access')}
                        role="tab"
                        aria-selected={adminConfigTab === 'access'}
                      >
                        <span>Access</span>
                      </button>
                    </div>
                  </div>
                  {adminConfigTab === 'users' && (
                    <div className="admin-config-grid">
                      <section className="admin-config-panel admin-users-panel">
                        <div className="admin-panel-toolbar">
                          <button type="button" onClick={openCreateUser}>
                            Create User
                          </button>
                        </div>
                        {latestSetupLink && (
                          <div className="admin-invite-link">
                            <span>Setup link</span>
                            <input value={latestSetupLink} readOnly />
                          </div>
                        )}
                        {adminUsersLoading && (
                          <p className="admin-user-message">Loading users...</p>
                        )}
                        {adminUsersError && (
                          <p className="admin-user-message">{adminUsersError}</p>
                        )}
                        {!adminUsersLoading && !adminUsersError && adminUsers.length === 0 && (
                          <p className="admin-user-message">No users found.</p>
                        )}
                        {!adminUsersLoading && !adminUsersError && adminUsers.length > 0 && (
                          <div className="admin-users-table-wrap">
                            <table className="admin-users-table">
                              <thead>
                                <tr>
                                  <th>ID</th>
                                  <th>Name</th>
                                  <th>Email</th>
                                  <th>Role</th>
                                  <th>Status</th>
                                  <th>Created</th>
                                  <th>Updated</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {adminUsers.map((user) => (
                                  <tr key={user.id}>
                                    <td>{user.id}</td>
                                    <td>
                                      {editingUserId === user.id ? (
                                        <input
                                          className="admin-inline-input"
                                          value={editUserFullName}
                                          onChange={(event) => setEditUserFullName(event.target.value)}
                                          disabled={savingUserId === user.id}
                                        />
                                      ) : (
                                        user.fullName
                                      )}
                                    </td>
                                    <td>
                                      {editingUserId === user.id ? (
                                        <input
                                          className="admin-inline-input admin-inline-email"
                                          type="email"
                                          value={editUserEmail}
                                          onChange={(event) => setEditUserEmail(event.target.value)}
                                          disabled={savingUserId === user.id}
                                        />
                                      ) : (
                                        user.email
                                      )}
                                    </td>
                                    <td>
                                      {editingUserId === user.id ? (
                                        <select
                                          className="admin-inline-input"
                                          value={editUserRole}
                                          onChange={(event) => setEditUserRole(event.target.value)}
                                          disabled={user.role === 'SUPERADMIN' || savingUserId === user.id}
                                        >
                                          {adminRoles
                                            .filter((role) => role.status === 'ACTIVE')
                                            .map((role) => (
                                              <option key={role.id} value={role.name}>
                                                {role.name}
                                              </option>
                                            ))}
                                        </select>
                                      ) : (
                                        user.role
                                      )}
                                    </td>
                                    <td>
                                      <span className={`admin-status-pill ${user.status.toLowerCase()}`}>
                                        {user.status}
                                      </span>
                                    </td>
                                    <td>{formatAdminDate(user.createdAt)}</td>
                                    <td>{formatAdminDate(user.updatedAt)}</td>
                                    <td>
                                      <div className="admin-row-actions">
                                        {editingUserId === user.id ? (
                                          <>
                                            <button
                                              type="button"
                                              className="primary"
                                              onClick={() => saveUser(user.id)}
                                              disabled={savingUserId === user.id}
                                            >
                                              <Save size={14} aria-hidden="true" />
                                              <span>Save</span>
                                            </button>
                                            <button
                                              type="button"
                                              className="secondary"
                                              onClick={cancelEditUser}
                                              disabled={savingUserId === user.id}
                                            >
                                              <X size={14} aria-hidden="true" />
                                              <span>Cancel</span>
                                            </button>
                                          </>
                                        ) : (
                                          <>
                                            <button
                                              type="button"
                                              className="secondary"
                                              onClick={() => startEditUser(user)}
                                              disabled={savingUserId !== null}
                                            >
                                              <Pencil size={14} aria-hidden="true" />
                                              <span>Edit</span>
                                            </button>
                                            <button
                                              type="button"
                                              className="danger"
                                              onClick={() => requestDeactivateUser(user)}
                                              disabled={
                                                savingUserId !== null ||
                                                user.status !== 'ACTIVE' ||
                                                user.role === 'SUPERADMIN'
                                              }
                                            >
                                              <Ban size={14} aria-hidden="true" />
                                              <span>{user.status === 'ACTIVE' ? 'Deactivate' : 'Deactivated'}</span>
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </section>
                    </div>
                  )}
                  {adminConfigTab === 'roles' && (
                    <div className="admin-config-grid">
                      <section className="admin-config-panel admin-users-panel">
                        {adminRolesLoading && (
                          <p className="admin-user-message">Loading roles...</p>
                        )}
                        {adminRolesError && (
                          <p className="admin-user-message">{adminRolesError}</p>
                        )}
                        {!adminRolesLoading && !adminRolesError && adminRoles.length === 0 && (
                          <p className="admin-user-message">No roles found.</p>
                        )}
                        {!adminRolesLoading && !adminRolesError && adminRoles.length > 0 && (
                          <div className="admin-users-table-wrap">
                            <table className="admin-users-table admin-roles-table">
                              <thead>
                                <tr>
                                  <th>ID</th>
                                  <th>Role</th>
                                  <th>Description</th>
                                  <th>Status</th>
                                  <th>Created</th>
                                  <th>Updated</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {adminRoles.map((role) => (
                                  <tr key={role.id}>
                                    <td>{role.id}</td>
                                    <td>
                                      {editingRoleId === role.id ? (
                                        <input
                                          className="admin-inline-input"
                                          value={editRoleName}
                                          onChange={(event) => setEditRoleName(event.target.value)}
                                          disabled={role.name === 'SUPERADMIN' || savingRoleId === role.id}
                                        />
                                      ) : (
                                        role.name
                                      )}
                                    </td>
                                    <td>
                                      {editingRoleId === role.id ? (
                                        <input
                                          className="admin-inline-input admin-inline-description"
                                          value={editRoleDescription}
                                          onChange={(event) => setEditRoleDescription(event.target.value)}
                                          disabled={savingRoleId === role.id}
                                        />
                                      ) : (
                                        role.description
                                      )}
                                    </td>
                                    <td>
                                      <span className={`admin-status-pill ${role.status.toLowerCase()}`}>
                                        {role.status}
                                      </span>
                                    </td>
                                    <td>{formatAdminDate(role.createdAt)}</td>
                                    <td>{formatAdminDate(role.updatedAt)}</td>
                                    <td>
                                      <div className="admin-row-actions">
                                        {editingRoleId === role.id ? (
                                          <>
                                            <button
                                              type="button"
                                              className="primary"
                                              onClick={() => saveRole(role.id)}
                                              disabled={savingRoleId === role.id}
                                            >
                                              <Save size={14} aria-hidden="true" />
                                              <span>Save</span>
                                            </button>
                                            <button
                                              type="button"
                                              className="secondary"
                                              onClick={cancelEditRole}
                                              disabled={savingRoleId === role.id}
                                            >
                                              <X size={14} aria-hidden="true" />
                                              <span>Cancel</span>
                                            </button>
                                          </>
                                        ) : (
                                          <>
                                            <button
                                              type="button"
                                              className="secondary"
                                              onClick={() => startEditRole(role)}
                                              disabled={savingRoleId !== null}
                                            >
                                              <Pencil size={14} aria-hidden="true" />
                                              <span>Edit</span>
                                            </button>
                                            <button
                                              type="button"
                                              className="danger"
                                              onClick={() => requestDeactivateRole(role)}
                                              disabled={
                                                savingRoleId !== null ||
                                                role.status !== 'ACTIVE' ||
                                                role.name === 'SUPERADMIN'
                                              }
                                            >
                                              <Ban size={14} aria-hidden="true" />
                                              <span>{role.status === 'ACTIVE' ? 'Deactivate' : 'Deactivated'}</span>
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </section>
                    </div>
                  )}
                  {adminConfigTab === 'access' && (
                    <div className="admin-config-grid">
                      <section className="admin-config-panel admin-users-panel">
                        {adminAccessLoading && (
                          <p className="admin-user-message">Loading access...</p>
                        )}
                        {adminAccessError && (
                          <p className="admin-user-message">{adminAccessError}</p>
                        )}
                        {!adminAccessLoading && !adminAccessError && (
                          <div className="admin-users-table-wrap">
                            <table className="admin-users-table admin-access-table">
                              <thead>
                                <tr>
                                  <th>Particulars</th>
                                  {adminRoles
                                    .filter((role) => role.status === 'ACTIVE')
                                    .map((role) => (
                                    <th key={role.id}>{role.name}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {accessMatrix.map((accessItem) => (
                                  <tr key={accessItem.key}>
                                    <td>
                                      <span className="admin-access-module">{accessItem.module}</span>
                                      <strong>{accessItem.subMenu}</strong>
                                    </td>
                                    {adminRoles
                                      .filter((role) => role.status === 'ACTIVE')
                                      .map((role) => {
                                      const checkboxKey = `${role.id}:${accessItem.key}`

                                      return (
                                        <td key={role.id}>
                                          <input
                                            className="admin-access-checkbox"
                                            type="checkbox"
                                            checked={getRoleMenuAccess(role.id, accessItem.key)}
                                            onChange={(event) => (
                                              toggleRoleMenuAccess(role.id, accessItem.key, event.target.checked)
                                            )}
                                            disabled={savingAccessKey === checkboxKey}
                                            aria-label={`${role.name} access for ${accessItem.subMenu}`}
                                          />
                                        </td>
                                      )
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </section>
                    </div>
                  )}
                </div>
              )}
              {roleActionMessage && (
                <div className={`admin-toast ${roleActionMessageType}`} role="status">
                  {roleActionMessage}
                </div>
              )}
              {rolePendingDeactivate && (
                <div className="admin-dialog-backdrop" role="presentation">
                  <div
                    className="admin-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admin-deactivate-title"
                  >
                    <div className="admin-dialog-icon">
                      <Ban size={18} aria-hidden="true" />
                    </div>
                    <div className="admin-dialog-copy">
                      <h3 id="admin-deactivate-title">Deactivate role?</h3>
                      <p>
                        {rolePendingDeactivate.name} will become inactive and cannot be assigned for active access.
                      </p>
                    </div>
                    <div className="admin-dialog-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setRolePendingDeactivate(null)}
                        disabled={savingRoleId === rolePendingDeactivate.id}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={deactivateRole}
                        disabled={savingRoleId === rolePendingDeactivate.id}
                      >
                        Deactivate
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {userPendingDeactivate && (
                <div className="admin-dialog-backdrop" role="presentation">
                  <div
                    className="admin-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admin-user-deactivate-title"
                  >
                    <div className="admin-dialog-icon">
                      <Ban size={18} aria-hidden="true" />
                    </div>
                    <div className="admin-dialog-copy">
                      <h3 id="admin-user-deactivate-title">Deactivate user?</h3>
                      <p>
                        {userPendingDeactivate.fullName} will not be able to sign in until the account is active again.
                      </p>
                    </div>
                    <div className="admin-dialog-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setUserPendingDeactivate(null)}
                        disabled={savingUserId === userPendingDeactivate.id}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={deactivateUser}
                        disabled={savingUserId === userPendingDeactivate.id}
                      >
                        Deactivate
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {createUserOpen && (
                <div className="admin-dialog-backdrop" role="presentation">
                  <div
                    className="admin-dialog admin-create-user-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admin-create-user-title"
                  >
                    <div className="admin-dialog-copy">
                      <h3 id="admin-create-user-title">Create user</h3>
                      <p>The user will receive a password setup link by email.</p>
                    </div>
                    <form onSubmit={createUser} className="admin-create-user-form">
                      <label htmlFor="admin-create-user-name">Name</label>
                      <input
                        id="admin-create-user-name"
                        value={createUserFullName}
                        onChange={(event) => setCreateUserFullName(event.target.value)}
                        disabled={creatingUser}
                        required
                      />

                      <label htmlFor="admin-create-user-email">Email</label>
                      <input
                        id="admin-create-user-email"
                        type="email"
                        value={createUserEmail}
                        onChange={(event) => {
                          setCreateUserEmail(event.target.value)
                          setCreateUserEmailError('')
                        }}
                        disabled={creatingUser}
                        required
                      />
                      {createUserEmailError && (
                        <p className="admin-field-error">{createUserEmailError}</p>
                      )}

                      <label htmlFor="admin-create-user-role">Role</label>
                      <select
                        id="admin-create-user-role"
                        value={createUserRole}
                        onChange={(event) => setCreateUserRole(event.target.value)}
                        disabled={creatingUser}
                        required
                      >
                        {adminRoles
                          .filter((role) => role.status === 'ACTIVE')
                          .map((role) => (
                            <option key={role.id} value={role.name}>
                              {role.name}
                            </option>
                          ))}
                      </select>

                      <div className="admin-dialog-actions">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setCreateUserOpen(false)}
                          disabled={creatingUser}
                        >
                          Cancel
                        </button>
                        <button type="submit" className="primary" disabled={creatingUser}>
                          Create & Send Invite
                        </button>
                      </div>
                    </form>
                  </div>
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
