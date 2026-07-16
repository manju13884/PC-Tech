import { type FormEvent, useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import { Ban, Calculator, ChevronRight, CircleCheck, ClipboardList, FileCheck2, FileDown, FlaskConical, KeyRound, PackageCheck, Pencil, Printer, Save, Settings, ShieldCheck, UserPlus, Users, X, type LucideIcon } from 'lucide-react'
import { getAdminAccess, getAdminAccessError, updateRoleMenuAccess, type AdminAccessPermission } from './adminAccessService'
import { deactivateAdminRole, getAdminRoles, getAdminRolesError, updateAdminRole, type AdminRole } from './adminRolesService'
import { activateAdminUser, createAdminUser, deactivateAdminUser, getAdminUsers, getAdminUsersError, resetAdminUserPassword, updateAdminUser, type AdminUser } from './adminUsersService'
import { getCustomers, getCustomersError, type Customer } from './customerService'
import { getInvoiceById, getInvoicesByCustomer, getInvoicesError, type Invoice, type InvoiceDetail } from './invoiceService'
import CardBoxCalculator from './features/corrugated-box-price-calculator/CardBoxCalculator'
import './features/corrugated-box-price-calculator-compat.css'
import { loadCoaTemplate } from './lib/coaTemplateLoader'
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
const MOBILE_NO_PATTERN = /^\d{10}$/
const coaAnalysisHeadings = ['Board GSM', 'GSM', 'Bursting Strength', 'Moisture', 'Ply'] as const
type CoaAnalysisHeading = (typeof coaAnalysisHeadings)[number]
type CoaAnalysisDefaults = Record<CoaAnalysisHeading, string>

const coaAnalysisDefaults: Record<string, Record<string, CoaAnalysisDefaults>> = {
  NILKAMAL: {
    '206725': {
      'Board GSM': '1120',
      GSM: '202/24, 180/22, 200/24, 176/22, 206/24',
      'Bursting Strength': '17.3',
      Moisture: '8.3',
      Ply: '5',
    },
    '206726': {
      'Board GSM': '1118',
      GSM: '200/24, 180/22, 198/24, 178/22, 206/24',
      'Bursting Strength': '17.5',
      Moisture: '8.4',
      Ply: '5',
    },
    '206249': {
      'Board GSM': '1120',
      GSM: '200/24, 178/22, 200/24, 178/22, 200/24',
      'Bursting Strength': '17.4',
      Moisture: '8.5',
      Ply: '5',
    },
    '206588': {
      'Board GSM': '1120',
      GSM: '198/24, 176/22, 200/24, 177/22, 206/24',
      'Bursting Strength': '17.2',
      Moisture: '8.2',
      Ply: '5',
    },
  },
}

function randomInteger(minimum: number, maximum: number): number {
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum
}

function randomOneDecimal(minimumTenths: number, maximumTenths: number): string {
  return (randomInteger(minimumTenths, maximumTenths) / 10).toFixed(1)
}

function getCoaAnalysisDefaults(
  customerName: string,
  productDescription: string,
): CoaAnalysisDefaults | undefined {
  const normalizedCustomerName = customerName.trim().toUpperCase()
  const customerKey = Object.keys(coaAnalysisDefaults).find((key) => (
    new RegExp(`(^|[^A-Z0-9])${key}([^A-Z0-9]|$)`).test(normalizedCustomerName)
  ))
  const customerDefaults = customerKey ? coaAnalysisDefaults[customerKey] : undefined

  if (!customerDefaults) {
    return undefined
  }

  const productCode = productDescription.trim().toUpperCase().match(/^([A-Z0-9]+)/)?.[1] ?? ''
  const defaults = customerDefaults[productCode]

  if (!defaults) {
    return undefined
  }

  return {
    ...defaults,
    'Board GSM': String(randomInteger(1117, 1120)),
    'Bursting Strength': randomOneDecimal(170, 176),
    Moisture: randomOneDecimal(82, 85),
  }
}

const accessMatrix: AccessMatrixItem[] = menuGroups.flatMap((group) => (
  group.items.map((item) => ({
    key: item.key,
    module: group.title,
    subMenu: item.title,
  }))
))
const accessRoleOrder = ['SUPERADMIN', 'ADMIN', 'SALES', 'ACCOUNTS', 'OPS']

function getInitialMenuKey(): string {
  const hashKey = window.location.hash.replace(/^#/, '')

  return menuItems.some((item) => item.key === hashKey) ? hashKey : defaultMenuKey
}

function getVisibleMenuGroups(menuAccess: string[]): MenuGroup[] {
  const allowedKeys = new Set(menuAccess)

  return menuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowedKeys.has(item.key)),
    }))
    .filter((group) => group.items.length > 0)
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

function styleCoaAnalysisTable(previewElement: HTMLElement) {
  const analysisTable = Array.from(previewElement.querySelectorAll('table')).find((table) => {
    const text = (table.textContent ?? '').replace(/\s+/g, ' ')
    return text.includes('Sl No') && text.includes('Board GSM') && text.includes('Bursting Strength')
  })

  analysisTable?.classList.add('coa-preview-analysis-table')
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

function ensureCoaDocumentFooter(previewElement: HTMLElement) {
  const pages = Array.from(previewElement.querySelectorAll<HTMLElement>('section.docx'))
  const totalPages = pages.length

  pages.forEach((page, index) => {
    let footer = page.querySelector<HTMLElement>(':scope > footer')

    if (!footer) {
      footer = document.createElement('footer')
      page.appendChild(footer)
    }

    const footerLine = document.createElement('p')
    footerLine.textContent = `Polar Canvas Technologies Private Limited | Page ${index + 1} of ${totalPages}`
    footer.replaceChildren(footerLine)
    footer.classList.add('coa-document-footer')
  })
}

function formatCoaInvoiceDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (!match) {
    return value
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = monthNames[Number(match[2]) - 1]

  return month ? `${match[3]}-${month}-${match[1]}` : value
}

function sortByCreatedDateAsc<T extends { id: number; createdAt: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt)
    const rightTime = Date.parse(right.createdAt)
    const dateDifference = (Number.isFinite(leftTime) ? leftTime : 0) -
      (Number.isFinite(rightTime) ? rightTime : 0)

    return dateDifference || left.id - right.id
  })
}

function sortAccessRoles(roles: AdminRole[]): AdminRole[] {
  return [...roles].sort((left, right) => {
    const leftIndex = accessRoleOrder.indexOf(left.name)
    const rightIndex = accessRoleOrder.indexOf(right.name)
    const normalizedLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex
    const normalizedRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex

    return normalizedLeftIndex - normalizedRightIndex || left.name.localeCompare(right.name)
  })
}

export default function Dashboard({
  username,
  menuAccess,
  onLogout,
}: {
  username: string
  menuAccess: string[]
  onLogout: () => void
}) {
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
  const [coaCustomerId, setCoaCustomerId] = useState('')
  const [coaInvoiceId, setCoaInvoiceId] = useState('')
  const [coaInvoices, setCoaInvoices] = useState<Invoice[]>([])
  const [coaInvoicesLoading, setCoaInvoicesLoading] = useState(false)
  const [coaInvoicesError, setCoaInvoicesError] = useState<string | null>(null)
  const [coaInvoiceDetail, setCoaInvoiceDetail] = useState<InvoiceDetail | null>(null)
  const [coaInvoiceDetailLoading, setCoaInvoiceDetailLoading] = useState(false)
  const [coaInvoiceDetailError, setCoaInvoiceDetailError] = useState('')
  const [coaPreviewTemplate, setCoaPreviewTemplate] = useState<ArrayBuffer | null>(null)
  const [coaPreviewLoading, setCoaPreviewLoading] = useState(false)
  const [coaPreviewError, setCoaPreviewError] = useState('')
  const coaAnalysisTableRef = useRef<HTMLTableElement>(null)
  const coaPreviewRef = useRef<HTMLDivElement>(null)
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
  const [editUserMobileNo, setEditUserMobileNo] = useState('')
  const [editUserRole, setEditUserRole] = useState('')
  const [savingUserId, setSavingUserId] = useState<number | null>(null)
  const [userPendingActivate, setUserPendingActivate] = useState<AdminUser | null>(null)
  const [userPendingDeactivate, setUserPendingDeactivate] = useState<AdminUser | null>(null)
  const [userPendingPasswordReset, setUserPendingPasswordReset] = useState<AdminUser | null>(null)
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [createUserFullName, setCreateUserFullName] = useState('')
  const [createUserEmail, setCreateUserEmail] = useState('')
  const [createUserMobileNo, setCreateUserMobileNo] = useState('')
  const [createUserRole, setCreateUserRole] = useState('')
  const [createUserEmailError, setCreateUserEmailError] = useState('')
  const [creatingUser, setCreatingUser] = useState(false)
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

  const visibleMenuGroups = getVisibleMenuGroups(menuAccess)
  const visibleMenuItems = visibleMenuGroups.flatMap((group) => group.items)
  const visibleMenuKeys = new Set(visibleMenuItems.map((item) => item.key))
  const visibleMenuKeyList = visibleMenuItems.map((item) => item.key).join('|')
  const selectedItem = visibleMenuItems.find((item) => item.key === selectedKey) ?? visibleMenuItems[0] ?? {
    key: 'no-access',
    title: 'No modules available',
    description: 'No application modules are assigned to your role.',
    icon: Settings,
  }
  const sortedAdminUsers = sortByCreatedDateAsc(adminUsers)
  const sortedAdminRoles = sortByCreatedDateAsc(adminRoles)
  const activeAdminRoles = sortedAdminRoles.filter((role) => role.status === 'ACTIVE')
  const accessRoles = sortAccessRoles(activeAdminRoles)

  useEffect(() => {
    if (visibleMenuItems.length === 0 || visibleMenuKeys.has(selectedKey)) {
      return
    }

    const nextKey = visibleMenuItems[0].key
    window.history.replaceState(null, '', `#${nextKey}`)
    setSelectedKey(nextKey)
  }, [selectedKey, visibleMenuKeyList])

  useEffect(() => {
    if (selectedKey !== 'coc') {
      setCustomerId('')
      setInvoiceId('')
      setPreviewTemplate(null)
      setPreviewError('')
    }

    if (selectedKey !== 'coc' && selectedKey !== 'packing-slip' && selectedKey !== 'coa') {
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

      const activeRoles = sortAccessRoles(adminRoles.filter((role) => role.status === 'ACTIVE'))
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
    if (!coaPreviewTemplate || !coaPreviewRef.current) {
      return
    }

    let isCurrent = true
    let previewResizeObserver: ResizeObserver | null = null
    const previewElement = coaPreviewRef.current

    previewElement.replaceChildren()
    setCoaPreviewLoading(true)
    setCoaPreviewError('')

    renderAsync(coaPreviewTemplate, previewElement, undefined, {
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
          styleCocDetailLines(previewElement)
          styleCoaAnalysisTable(previewElement)
          removeEmptyCocPages(previewElement)
          ensureCoaDocumentFooter(previewElement)
          fitCocPreview(previewElement)
          previewResizeObserver = new ResizeObserver(() => fitCocPreview(previewElement))
          previewResizeObserver.observe(previewElement)
        }
      })
      .catch(() => {
        if (isCurrent) {
          setCoaPreviewError('Unable to preview COA template')
        }
      })
      .finally(() => {
        if (isCurrent) {
          setCoaPreviewLoading(false)
        }
      })

    return () => {
      isCurrent = false
      previewResizeObserver?.disconnect()
    }
  }, [coaPreviewTemplate])

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
    setCoaInvoiceId('')
    setCoaInvoices([])
    setCoaInvoicesError(null)
    setCoaInvoicesLoading(false)

    if (selectedKey !== 'coa' || !coaCustomerId) {
      return
    }

    let isCurrent = true

    async function loadCoaInvoices() {
      setCoaInvoicesLoading(true)
      setCoaInvoicesError(null)

      const invoiceList = await getInvoicesByCustomer(coaCustomerId)

      if (!isCurrent) {
        return
      }

      setCoaInvoices(invoiceList)
      setCoaInvoicesError(getInvoicesError())
      setCoaInvoicesLoading(false)
    }

    loadCoaInvoices()

    return () => {
      isCurrent = false
    }
  }, [coaCustomerId, selectedKey])

  useEffect(() => {
    if (selectedKey !== 'coa') {
      return
    }

    setCoaCustomerId('')
    setCoaInvoiceId('')
    setCoaInvoiceDetail(null)
    setCoaPreviewTemplate(null)
    setCoaPreviewError('')
  }, [selectedKey])

  useEffect(() => {
    setCoaInvoiceDetail(null)
    setCoaInvoiceDetailError('')
    setCoaInvoiceDetailLoading(false)

    if (selectedKey !== 'coa' || !coaInvoiceId) {
      return
    }

    let isCurrent = true

    async function loadCoaInvoiceDetail() {
      setCoaInvoiceDetailLoading(true)

      try {
        const invoice = await getInvoiceById(coaInvoiceId)

        if (isCurrent) {
          setCoaInvoiceDetail(invoice)
        }
      } catch (caughtError) {
        if (isCurrent) {
          setCoaInvoiceDetailError(
            caughtError instanceof Error ? caughtError.message : 'Unable to load invoice details',
          )
        }
      } finally {
        if (isCurrent) {
          setCoaInvoiceDetailLoading(false)
        }
      }
    }

    loadCoaInvoiceDetail()

    return () => {
      isCurrent = false
    }
  }, [coaInvoiceId, selectedKey])

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

  async function generateCoa() {
    if (!coaInvoiceDetail || !coaAnalysisTableRef.current) {
      return
    }

    setCoaPreviewError('')

    try {
      const tableRows = Array.from(coaAnalysisTableRef.current.tBodies[0]?.rows ?? [])
      const analysisItems = coaInvoiceDetail.line_items.map((item, index) => {
        const row = tableRows[index]
        const getFieldValue = (cellIndex: number) => (
          row?.cells[cellIndex]?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')?.value ?? ''
        )

        return {
          name: item.name,
          description: item.description,
          boardGsm: getFieldValue(2),
          gsm: getFieldValue(3),
          burstingStrength: getFieldValue(4),
          moisture: getFieldValue(5),
          ply: getFieldValue(6),
        }
      })
      const template = await loadCoaTemplate()
      const { generateCoaTemplate } = await import('./lib/coaGenerator')

      setCoaPreviewTemplate(generateCoaTemplate(template, {
        invoiceDate: coaInvoiceDetail.date,
        customer: coaInvoiceDetail.customer_name,
        poNumber: coaInvoiceDetail.po_number,
        invoiceNumber: coaInvoiceDetail.invoice_number,
        refNumber: coaInvoiceDetail.sales_order_number || '-',
        items: analysisItems,
      }))
    } catch {
      setCoaPreviewError('Unable to generate COA preview')
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
      : previewElement.classList.contains('coa-preview-document')
        ? 'coc-preview-document coa-preview-document'
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
    if (!visibleMenuKeys.has(key)) {
      return
    }

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

  function goToDashboardHome() {
    const homeKey = visibleMenuKeys.has(defaultMenuKey) ? defaultMenuKey : visibleMenuItems[0]?.key

    if (homeKey) {
      selectMenuItem(homeKey)
    }
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
    setEditUserMobileNo(user.mobileNo)
    setEditUserRole(user.role)
    setRoleActionMessage('')
  }

  function cancelEditUser() {
    setEditingUserId(null)
    setEditUserFullName('')
    setEditUserEmail('')
    setEditUserMobileNo('')
    setEditUserRole('')
    setRoleActionMessage('')
  }

  async function saveUser(userId: number) {
    const mobileNo = editUserMobileNo.trim()
    if (!mobileNo) {
      setRoleActionMessageType('error')
      setRoleActionMessage('Mobile No. is required.')
      return
    }
    if (!MOBILE_NO_PATTERN.test(mobileNo)) {
      setRoleActionMessageType('error')
      setRoleActionMessage('Mobile No. must contain exactly 10 digits.')
      return
    }

    setSavingUserId(userId)
    setRoleActionMessage('')

    try {
      const updatedUser = await updateAdminUser(userId, {
        email: editUserEmail,
        mobileNo,
        fullName: editUserFullName,
        role: editUserRole,
      })

      setAdminUsers((users) => users.map((user) => (user.id === updatedUser.id ? updatedUser : user)))
      setEditingUserId(null)
      setEditUserFullName('')
      setEditUserEmail('')
      setEditUserMobileNo('')
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
    setCreateUserMobileNo('')
    setCreateUserEmailError('')
    setCreateUserOpen(true)
    setRoleActionMessage('')
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const mobileNo = createUserMobileNo.trim()
    if (!MOBILE_NO_PATTERN.test(mobileNo)) {
      setRoleActionMessageType('error')
      setRoleActionMessage('Mobile No. must contain exactly 10 digits.')
      return
    }

    setCreatingUser(true)
    setCreateUserEmailError('')
    setRoleActionMessage('')

    try {
      const result = await createAdminUser({
        fullName: createUserFullName,
        email: createUserEmail,
        mobileNo,
        role: createUserRole,
      })

      setAdminUsers((users) => [result.user, ...users])
      setCreateUserOpen(false)
      setCreateUserFullName('')
      setCreateUserEmail('')
      setCreateUserMobileNo('')
      setCreateUserRole('')
      setRoleActionMessageType('success')
      setRoleActionMessage('User created. User must change password on first login.')
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

  function requestActivateUser(user: AdminUser) {
    setUserPendingActivate(user)
  }

  async function activateUser() {
    if (!userPendingActivate) {
      return
    }

    setSavingUserId(userPendingActivate.id)
    setRoleActionMessage('')

    try {
      const updatedUser = await activateAdminUser(userPendingActivate.id)

      setAdminUsers((users) => users.map((user) => (
        user.id === updatedUser.id ? updatedUser : user
      )))
      setUserPendingActivate(null)
      setRoleActionMessageType('success')
      setRoleActionMessage('User activated. Password reset and change required on next login.')
    } catch (caughtError) {
      setRoleActionMessageType('error')
      setRoleActionMessage(caughtError instanceof Error ? caughtError.message : 'Unable to activate user')
    } finally {
      setSavingUserId(null)
    }
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

  function requestResetUserPassword(user: AdminUser) {
    setUserPendingPasswordReset(user)
  }

  async function resetUserPassword() {
    if (!userPendingPasswordReset) {
      return
    }

    setSavingUserId(userPendingPasswordReset.id)
    setRoleActionMessage('')

    try {
      const updatedUser = await resetAdminUserPassword(userPendingPasswordReset.id)

      setAdminUsers((users) => users.map((user) => (
        user.id === updatedUser.id ? updatedUser : user
      )))
      setUserPendingPasswordReset(null)
      setRoleActionMessageType('success')
      setRoleActionMessage('Password reset. User must change it on next login.')
    } catch (caughtError) {
      setRoleActionMessageType('error')
      setRoleActionMessage(caughtError instanceof Error ? caughtError.message : 'Unable to reset password')
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
        <button
          type="button"
          className="dashboard-brand dashboard-brand-button"
          onClick={goToDashboardHome}
          title="Go to dashboard home"
          aria-label="Go to PolarCanvas dashboard home"
        >
          <img
            className="site-logo"
            src="/assets/PC-Bord-Logo-only-transparent.png"
            alt="PolarCanvas bird logo"
          />
          <div className="portal-identity" aria-label="PolarCanvas Tech Portal">
            <span>PolarCanvas</span>
            <em>Tech Portal</em>
          </div>
        </button>
        <div className="dashboard-header-actions">
          <span className="dashboard-welcome">Welcome, {username}</span>
          <button className="logout-button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="dashboard-grid">
        <aside className="dashboard-menu">
          {visibleMenuGroups.map((group) => (
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
          <div className={`dashboard-card${selectedItem.key === 'coc' || selectedItem.key === 'packing-slip' || selectedItem.key === 'coa' || selectedItem.key === 'admin-configurations' ? ' document-form-page' : ''}`}>
            <header className="dashboard-page-heading">
              <h2>{selectedItem.title}</h2>
              <p>{selectedItem.description}</p>
            </header>
            <div className="dashboard-details">
              {selectedItem.key === 'corrugated-box-price' && (
                <div className="pc-corrugated-calculator-compat">
                  <CardBoxCalculator />
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
                <div className="coc-form">
                  <div className="coc-form-field">
                    <label htmlFor="coa-customer-name">Customer Name</label>
                    <select
                      id="coa-customer-name"
                      value={coaCustomerId}
                      onChange={(event) => setCoaCustomerId(event.target.value)}
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
                    <label htmlFor="coa-invoice-number">Invoice Number</label>
                    <select
                      id="coa-invoice-number"
                      value={coaInvoiceId}
                      onChange={(event) => {
                        setCoaInvoiceId(event.target.value)
                        setCoaPreviewTemplate(null)
                        setCoaPreviewError('')
                      }}
                      disabled={!coaCustomerId || coaInvoicesLoading || Boolean(coaInvoicesError)}
                    >
                      <option value="">
                        {!coaCustomerId
                          ? 'Select customer first'
                          : coaInvoicesLoading
                            ? 'Loading invoices...'
                            : coaInvoicesError
                              ? 'Unable to load invoices'
                              : coaInvoices.length === 0
                                ? 'No invoices found'
                                : 'Select invoice'}
                      </option>
                      {coaInvoices.map((invoice) => (
                        <option key={invoice.invoice_id} value={invoice.invoice_id}>
                          {invoice.invoice_number}
                        </option>
                      ))}
                    </select>
                  </div>
                  {coaInvoicesError && (
                    <p style={{ margin: '0.5rem 0 0', color: '#b42318', fontSize: '0.9rem' }}>
                      {coaInvoicesError}
                    </p>
                  )}
                  {coaInvoiceId && (
                    <div className="coa-invoice-details" aria-live="polite">
                      {coaInvoiceDetailLoading && <p>Loading invoice details...</p>}
                      {coaInvoiceDetailError && <p className="coa-invoice-details-error">{coaInvoiceDetailError}</p>}
                      {coaInvoiceDetail && (
                        <>
                          <dl>
                            <div><dt>DATE:</dt><dd>{coaInvoiceDetail.date ? formatCoaInvoiceDate(coaInvoiceDetail.date) : '-'}</dd></div>
                            <div><dt>CUSTOMER:</dt><dd>{coaInvoiceDetail.customer_name || '-'}</dd></div>
                            <div><dt>PO#:</dt><dd>{coaInvoiceDetail.po_number || '-'}</dd></div>
                            <div><dt>Invoice#:</dt><dd>{coaInvoiceDetail.invoice_number || '-'}</dd></div>
                            <div><dt>Ref#:</dt><dd>{coaInvoiceDetail.sales_order_number || '-'}</dd></div>
                          </dl>
                          <div className="coa-analysis-table-wrap">
                            <table ref={coaAnalysisTableRef} className="coa-analysis-table">
                              <thead>
                                <tr>
                                  <th scope="col">Sl No</th>
                                  <th scope="col">Product</th>
                                  <th scope="col">Board<br />GSM</th>
                                  <th scope="col">GSM</th>
                                  <th scope="col">Bursting Strength</th>
                                  <th scope="col">Moisture</th>
                                  <th scope="col">Ply</th>
                                </tr>
                              </thead>
                              <tbody>
                                {coaInvoiceDetail.line_items.map((item, index) => {
                                  const defaults = getCoaAnalysisDefaults(
                                    coaInvoiceDetail.customer_name,
                                    item.description,
                                  )

                                  return (
                                    <tr key={`${coaInvoiceDetail.invoice_id}-${item.name}-${item.description}-${index}`}>
                                      <td>{index + 1}</td>
                                      <td>
                                        <textarea
                                          aria-label={`Product ${index + 1}`}
                                          rows={2}
                                          value={[item.name, item.description].filter(Boolean).join('\n')}
                                          readOnly
                                        />
                                      </td>
                                      {coaAnalysisHeadings.map((heading) => (
                                        <td key={heading}>
                                          {heading === 'GSM' ? (
                                            <textarea
                                              aria-label={`${heading} ${index + 1}`}
                                              rows={2}
                                              defaultValue={defaults?.[heading] ?? ''}
                                            />
                                          ) : (
                                            <input
                                              type="text"
                                              aria-label={`${heading} ${index + 1}`}
                                              defaultValue={defaults?.[heading] ?? ''}
                                            />
                                          )}
                                        </td>
                                      ))}
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <div className="coc-action-row packing-slip-actions">
                    <button
                      type="button"
                      className="packing-action-button packing-action-primary"
                      onClick={generateCoa}
                      disabled={!coaInvoiceDetail || coaInvoiceDetailLoading}
                    >
                      <FlaskConical aria-hidden="true" />
                      <span>Generate COA</span>
                    </button>
                    {coaPreviewTemplate && !coaPreviewLoading && !coaPreviewError && (
                      <>
                        <button
                          type="button"
                          className="packing-action-button packing-action-pdf"
                          onClick={() => openDocumentPrintDialog(coaPreviewRef.current, coaInvoices, coaInvoiceId, 'COA')}
                        >
                          <FileDown aria-hidden="true" />
                          <span>Save As PDF</span>
                        </button>
                        <button
                          type="button"
                          className="packing-action-button packing-action-print"
                          onClick={() => openDocumentPrintDialog(coaPreviewRef.current, coaInvoices, coaInvoiceId, 'COA')}
                        >
                          <Printer aria-hidden="true" />
                          <span>Print COA</span>
                        </button>
                      </>
                    )}
                  </div>
                  {(coaPreviewTemplate || coaPreviewError) && (
                    <div className="coc-preview">
                      {coaPreviewLoading && (
                        <p style={{ margin: 0, padding: '1rem', background: '#fff' }}>Loading COA preview...</p>
                      )}
                      {coaPreviewError && (
                        <p style={{ margin: 0, padding: '1rem', color: '#b42318', background: '#fff' }}>{coaPreviewError}</p>
                      )}
                      <div ref={coaPreviewRef} className="coc-preview-document coa-preview-document" />
                    </div>
                  )}
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
                        <Users size={15} aria-hidden="true" />
                        <span>Users</span>
                      </button>
                      <button
                        type="button"
                        className={adminConfigTab === 'roles' ? 'active' : ''}
                        onClick={() => setAdminConfigTab('roles')}
                        role="tab"
                        aria-selected={adminConfigTab === 'roles'}
                      >
                        <ShieldCheck size={15} aria-hidden="true" />
                        <span>Roles</span>
                      </button>
                      <button
                        type="button"
                        className={adminConfigTab === 'access' ? 'active' : ''}
                        onClick={() => setAdminConfigTab('access')}
                        role="tab"
                        aria-selected={adminConfigTab === 'access'}
                      >
                        <KeyRound size={15} aria-hidden="true" />
                        <span>Access</span>
                      </button>
                    </div>
                  </div>
                  {adminConfigTab === 'users' && (
                    <div className="admin-config-grid">
                      <section className="admin-config-panel admin-users-panel">
                        <div className="admin-panel-toolbar">
                          <button type="button" onClick={openCreateUser}>
                            <UserPlus size={15} aria-hidden="true" />
                            <span>Create User</span>
                          </button>
                        </div>
                        {adminUsersLoading && (
                          <p className="admin-user-message">Loading users...</p>
                        )}
                        {adminUsersError && (
                          <p className="admin-user-message">{adminUsersError}</p>
                        )}
                        {!adminUsersLoading && !adminUsersError && sortedAdminUsers.length === 0 && (
                          <p className="admin-user-message">No users found.</p>
                        )}
                        {!adminUsersLoading && !adminUsersError && sortedAdminUsers.length > 0 && (
                          <div className="admin-users-table-wrap admin-users-management-wrap">
                            <table className="admin-users-table admin-users-management-table">
                              <thead>
                                <tr>
                                  <th>ID</th>
                                  <th>Name</th>
                                  <th>Email</th>
                                  <th>Mobile No.</th>
                                  <th>Role</th>
                                  <th>Status</th>
                                  <th>Created</th>
                                  <th>Updated</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sortedAdminUsers.map((user) => (
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
                                        <input
                                          className="admin-inline-input"
                                          type="tel"
                                          value={editUserMobileNo}
                                          onChange={(event) => setEditUserMobileNo(event.target.value.replace(/\D/g, '').slice(0, 10))}
                                          disabled={savingUserId === user.id}
                                          inputMode="numeric"
                                          pattern="[0-9]{10}"
                                          maxLength={10}
                                          aria-label={`Mobile No. for ${user.fullName}`}
                                          required
                                        />
                                      ) : (
                                        user.mobileNo || '-'
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
                                          {activeAdminRoles.map((role) => (
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
                                            {user.status === 'ACTIVE' ? (
                                              <button
                                                type="button"
                                                className="danger"
                                                onClick={() => requestDeactivateUser(user)}
                                                disabled={savingUserId !== null || user.role === 'SUPERADMIN'}
                                              >
                                                <Ban size={14} aria-hidden="true" />
                                                <span>Deactivate</span>
                                              </button>
                                            ) : (
                                              <button
                                                type="button"
                                                className="primary"
                                                onClick={() => requestActivateUser(user)}
                                                disabled={savingUserId !== null}
                                              >
                                                <CircleCheck size={14} aria-hidden="true" />
                                                <span>Activate</span>
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              className="secondary"
                                              onClick={() => requestResetUserPassword(user)}
                                              disabled={savingUserId !== null}
                                            >
                                              <Settings size={14} aria-hidden="true" />
                                              <span>Password</span>
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
                        {!adminRolesLoading && !adminRolesError && sortedAdminRoles.length === 0 && (
                          <p className="admin-user-message">No roles found.</p>
                        )}
                        {!adminRolesLoading && !adminRolesError && sortedAdminRoles.length > 0 && (
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
                                {sortedAdminRoles.map((role) => (
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
                                  {accessRoles.map((role) => (
                                    <th key={role.id}>{role.name}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {accessMatrix.map((accessItem) => (
                                  <tr
                                    key={accessItem.key}
                                    className={accessItem.key === 'admin-configurations' ? 'admin-access-row-locked' : undefined}
                                  >
                                    <td>
                                      <span className="admin-access-module">{accessItem.module}</span>
                                      <strong>{accessItem.subMenu}</strong>
                                    </td>
                                    {accessRoles.map((role) => {
                                      const checkboxKey = `${role.id}:${accessItem.key}`
                                      const isAccessManagementRow = accessItem.key === 'admin-configurations'
                                      const hasRoleMenuAccess = getRoleMenuAccess(role.id, accessItem.key)
                                      const isProtectedSuperadminAccess = isAccessManagementRow && role.name === 'SUPERADMIN'
                                      const isRestrictedAccessGrant = isAccessManagementRow && role.name !== 'SUPERADMIN' && !hasRoleMenuAccess

                                      return (
                                        <td key={role.id}>
                                          <input
                                            className="admin-access-checkbox"
                                            type="checkbox"
                                            checked={hasRoleMenuAccess}
                                            onChange={(event) => (
                                              toggleRoleMenuAccess(role.id, accessItem.key, event.target.checked)
                                            )}
                                            disabled={isProtectedSuperadminAccess || isRestrictedAccessGrant || savingAccessKey === checkboxKey}
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
              {userPendingActivate && (
                <div className="admin-dialog-backdrop" role="presentation">
                  <div
                    className="admin-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admin-user-activate-title"
                  >
                    <div className="admin-dialog-icon success">
                      <CircleCheck size={18} aria-hidden="true" />
                    </div>
                    <div className="admin-dialog-copy">
                      <h3 id="admin-user-activate-title">Activate user?</h3>
                      <p>
                        {userPendingActivate.fullName} will be able to sign in again with the default password rule and must change it on next login.
                      </p>
                    </div>
                    <div className="admin-dialog-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setUserPendingActivate(null)}
                        disabled={savingUserId === userPendingActivate.id}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="primary"
                        onClick={activateUser}
                        disabled={savingUserId === userPendingActivate.id}
                      >
                        Activate
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
              {userPendingPasswordReset && (
                <div className="admin-dialog-backdrop" role="presentation">
                  <div
                    className="admin-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admin-user-reset-title"
                  >
                    <div className="admin-dialog-icon">
                      <Settings size={18} aria-hidden="true" />
                    </div>
                    <div className="admin-dialog-copy">
                      <h3 id="admin-user-reset-title">Reset password?</h3>
                      <p>
                        {userPendingPasswordReset.fullName} will use the default password rule and must change it on next login.
                      </p>
                    </div>
                    <div className="admin-dialog-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setUserPendingPasswordReset(null)}
                        disabled={savingUserId === userPendingPasswordReset.id}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="primary"
                        onClick={resetUserPassword}
                        disabled={savingUserId === userPendingPasswordReset.id}
                      >
                        Reset Password
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
                      <p>Default password is generated from the name. User must change it on first login.</p>
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

                      <label htmlFor="admin-create-user-mobile">Mobile No.</label>
                      <input
                        id="admin-create-user-mobile"
                        type="tel"
                        value={createUserMobileNo}
                        onChange={(event) => setCreateUserMobileNo(event.target.value.replace(/\D/g, '').slice(0, 10))}
                        disabled={creatingUser}
                        autoComplete="tel"
                        inputMode="numeric"
                        pattern="[0-9]{10}"
                        maxLength={10}
                        placeholder="Enter 10-digit mobile number"
                        required
                      />

                      <label htmlFor="admin-create-user-role">Role</label>
                      <select
                        id="admin-create-user-role"
                        value={createUserRole}
                        onChange={(event) => setCreateUserRole(event.target.value)}
                        disabled={creatingUser}
                        required
                      >
                        {activeAdminRoles.map((role) => (
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
                          Create User
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
