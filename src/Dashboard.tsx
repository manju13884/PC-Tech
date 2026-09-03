import { type FormEvent, useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import { Ban, BarChart3, Calculator, ChevronRight, CircleCheck, ClipboardList, Database, FileCheck2, FileDown, FlaskConical, Home, KeyRound, PackageCheck, Pencil, Printer, RefreshCw, Save, Settings, ShieldCheck, ShoppingCart, SlidersHorizontal, UserPlus, Users, X, type LucideIcon } from 'lucide-react'
import { getAdminAccess, getAdminAccessError, updateRoleMenuAccess, type AdminAccessPermission } from './adminAccessService'
import { createAdminRole, deactivateAdminRole, getAdminRoles, getAdminRolesError, updateAdminRole, type AdminRole } from './adminRolesService'
import { activateAdminUser, createAdminUser, deactivateAdminUser, getAdminUsers, getAdminUsersError, resetAdminUserPassword, updateAdminUser, type AdminUser } from './adminUsersService'
import { getCustomers, getCustomersError, refreshCustomers, type Customer } from './customerService'
import { getItemsError, refreshItems } from './itemService'
import { getSavedCoa, regenerateCoa, saveCoa, type CoaRecord } from './coaService'
import { getDeliveryChallanById, getDeliveryChallansByCustomer, type DeliveryChallan, type DeliveryChallanDetail } from './deliveryChallanService'
import { getInvoiceById, getInvoicesByCustomer, getInvoicesError, type Invoice, type InvoiceDetail } from './invoiceService'
import { getCustomerOpenSalesOrderSummary } from './homeDashboardService'
import DashboardPage from './dashboard/DashboardPage'
import AdvancedCorrugatedBoxCalculatorPage from './features/advanced-corrugated-box-calculator/AdvancedCorrugatedBoxCalculatorPage'
import {
  ADVANCED_BOX_CALCULATOR_DESCRIPTION,
  ADVANCED_BOX_CALCULATOR_MENU_TITLE,
  ADVANCED_BOX_CALCULATOR_ROUTE_KEY,
  ADVANCED_BOX_CALCULATOR_TITLE,
} from './features/advanced-corrugated-box-calculator/constants/advancedBoxCalculatorConstants'
import CardBoxCalculator from './features/corrugated-box-price-calculator/CardBoxCalculator'
import './features/corrugated-box-price-calculator-compat.css'
import CorrugatedBoardPriceCalculator from './features/corrugated-board-price-calculator/CorrugatedBoardPriceCalculator'
import PaperPurchaseRequest from './features/paper-purchase-request/PaperPurchaseRequest'
import PaperPurchaseRequestApprovals from './features/paper-purchase-request-approvals/PaperPurchaseRequestApprovals'
import PaperPoCalculation from './features/paper-po-calculation/PaperPoCalculation'
import ProductSpecifications from './features/product-specifications/ProductSpecifications'
import { loadCoaTemplate } from './lib/coaTemplateLoader'
import type { CoaAnalysisItem, CoaInvoiceValues } from './lib/coaGenerator'
import { loadCocTemplate } from './lib/templateLoader'
import { loadPackingSlipLogo, loadPackingSlipTemplate } from './lib/packingSlipTemplateLoader'

interface MenuItem {
  key: string
  title: string
  menuTitle?: string
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
        menuTitle: 'Box Price Calculator',
        description:
          'Estimate the cost of corrugated boxes based on size, material, and quantity for your packaging needs.',
        icon: Calculator,
      },
      {
        key: ADVANCED_BOX_CALCULATOR_ROUTE_KEY,
        title: ADVANCED_BOX_CALCULATOR_TITLE,
        menuTitle: ADVANCED_BOX_CALCULATOR_MENU_TITLE,
        description: ADVANCED_BOX_CALCULATOR_DESCRIPTION,
        icon: SlidersHorizontal,
      },
      {
        key: 'corrugated-board-price',
        title: 'Corrugated Board Price Calculator',
        menuTitle: 'Board Price Calculator',
        description: 'Calculate the weight, manufacturing cost and selling price of 3-ply, 5-ply and 7-ply corrugated boards.',
        icon: Calculator,
      },
    ],
  },
  {
    title: 'Sales',
    items: [
      {
        key: 'sales-orders',
        title: 'Sales Orders',
        description: 'View and manage customer sales orders.',
        icon: ShoppingCart,
      },
      {
        key: 'so-specification-mapping',
        title: 'SO Specification Mapping',
        description: 'Map sales-order lines to the required product and production specifications.',
        icon: SlidersHorizontal,
      },
      {
        key: 'product-specifications',
        title: 'Product Specifications',
        description: 'Maintain controlled product specification records.',
        icon: PackageCheck,
      },
      {
        key: 'production-specifications',
        title: 'Production Specifications',
        description: 'Maintain specifications used by production workflows.',
        icon: FileCheck2,
      },
    ],
  },
  {
    title: 'Purchases',
    items: [
      {
        key: 'paper-purchase-request',
        title: 'Paper Purchase Request',
        description: 'Create and manage paper purchase requests.',
        icon: ShoppingCart,
      },
      {
        key: 'paper-purchase-request-approvals',
        title: 'Paper Purchase Request Approvals',
        menuTitle: 'Approvals',
        description: 'Review, approve or reject submitted Paper Purchase Requests.',
        icon: ShieldCheck,
      },
      {
        key: 'paper-po-calculation',
        title: 'Paper PO Calculation',
        description: 'Consolidate approved Paper Purchase Requests by procurement specification.',
        icon: ClipboardList,
      },
      {
        key: 'purchase-reports',
        title: 'Purchase Reports',
        menuTitle: 'Reports',
        description: 'View reporting and analysis for Purchase workflows.',
        icon: BarChart3,
      },
    ],
  },
  {
    title: 'Production',
    items: [
      {
        key: 'job-cards',
        title: 'Job Cards',
        description: 'Create and track production job cards.',
        icon: ClipboardList,
      },
      {
        key: 'production-planning',
        title: 'Production Planning',
        description: 'Plan production work, capacity, and schedules.',
        icon: BarChart3,
      },
      {
        key: 'job-tracking',
        title: 'Job Tracking',
        description: 'Monitor job progress through production stages.',
        icon: CircleCheck,
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
      {
        key: 'data-management',
        title: 'Data Management',
        description:
          'Manage controlled business data operations and environment-specific data utilities.',
        icon: Database,
      },
    ],
  },
]

const menuItems = menuGroups.flatMap((group) => group.items)
const homeMenuItem: MenuItem = {
  key: 'home',
  title: 'Dashboard',
  description: 'PC-Tech business dashboard.',
  icon: Home,
}
export const defaultMenuKey = 'home'
const PANEL_HEADING_MENU_KEYS = new Set([
  'corrugated-box-price',
  ADVANCED_BOX_CALCULATOR_ROUTE_KEY,
  'corrugated-board-price',
  'paper-purchase-request',
  'purchase-reports',
  'sales-orders',
  'so-specification-mapping',
  'production-specifications',
  'job-cards',
  'production-planning',
  'job-tracking',
])
const NEW_MODULE_MENU_KEYS = new Set([
  'sales-orders',
  'so-specification-mapping',
  'production-specifications',
  'job-cards',
  'production-planning',
  'job-tracking',
])
const MOBILE_NO_PATTERN = /^\d{10}$/
const coaAnalysisHeadings = ['Board GSM', 'GSM', 'Bursting Strength', 'Moisture', 'Ply'] as const
type CoaAnalysisHeading = (typeof coaAnalysisHeadings)[number]
type CoaAnalysisDefaults = Record<CoaAnalysisHeading, string>

const coaAnalysisFieldByHeading: Record<CoaAnalysisHeading, keyof Pick<
  CoaAnalysisItem,
  'boardGsm' | 'gsm' | 'burstingStrength' | 'moisture' | 'ply'
>> = {
  'Board GSM': 'boardGsm',
  GSM: 'gsm',
  'Bursting Strength': 'burstingStrength',
  Moisture: 'moisture',
  Ply: 'ply',
}

function formatCoaAuditDate(value: string): string {
  const date = new Date(value.endsWith('Z') || value.includes('+') ? value : `${value.replace(' ', 'T')}Z`)
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value
}

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
    subMenu: item.menuTitle ?? item.title,
  }))
))
const accessRoleOrder = ['SUPERADMIN', 'ADMIN', 'SALES', 'ACCOUNTS', 'OPS']

export function getDefaultPermittedMenuKey(_menuAccess: string[]): string | undefined {
  return defaultMenuKey
}

function getMenuGroupTitleForKey(key: string): string | undefined {
  return menuGroups.find((group) => group.items.some((item) => item.key === key))?.title
}

function getInitialMenuKey(menuAccess: string[]): string {
  const hashKey = window.location.hash.replace(/^#/, '')

  return hashKey === defaultMenuKey || menuItems.some((item) => item.key === hashKey)
    ? hashKey
    : getDefaultPermittedMenuKey(menuAccess) ?? defaultMenuKey
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
    return text.includes('Sl No') && text.includes('ITEM & DESCRIPTION') && text.includes('QUANTITY')
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

function ensureCocDocumentFooter(previewElement: HTMLElement) {
  const pages = Array.from(previewElement.querySelectorAll<HTMLElement>('section.docx'))
  const totalPages = pages.length

  pages.forEach((page, index) => {
    let footer = page.querySelector<HTMLElement>(':scope > footer')

    if (!footer) {
      footer = document.createElement('footer')
      page.appendChild(footer)
    }

    const footerLine = document.createElement('p')
    const currentPage = document.createElement('span')
    const totalPageCount = document.createElement('span')

    currentPage.className = 'coc-current-page'
    currentPage.textContent = String(index + 1)
    totalPageCount.className = 'coc-total-pages'
    totalPageCount.textContent = String(totalPages)
    footerLine.append(
      'Polar Canvas Technologies Private Limited | Page ',
      currentPage,
      ' of ',
      totalPageCount,
    )
    footer.replaceChildren(footerLine)
    footer.classList.add('coc-document-footer')
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
  userRole,
  menuAccess,
  onLogout,
}: {
  username: string
  userRole: string
  menuAccess: string[]
  onLogout: () => void
}) {
  const [selectedKey, setSelectedKey] = useState(() => getInitialMenuKey(menuAccess))
  const [expandedMenuGroups, setExpandedMenuGroups] = useState<Set<string>>(() => {
    const activeGroupTitle = getMenuGroupTitleForKey(getInitialMenuKey(menuAccess))
    return new Set(activeGroupTitle ? [activeGroupTitle] : [])
  })
  const [customerId, setCustomerId] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [cocDocumentType, setCocDocumentType] = useState<'' | 'invoice' | 'delivery-challan'>('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customersLoading, setCustomersLoading] = useState(false)
  const [customersError, setCustomersError] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [invoicesError, setInvoicesError] = useState<string | null>(null)
  const [deliveryChallanId, setDeliveryChallanId] = useState('')
  const [deliveryChallans, setDeliveryChallans] = useState<DeliveryChallan[]>([])
  const [deliveryChallansLoading, setDeliveryChallansLoading] = useState(false)
  const [deliveryChallansError, setDeliveryChallansError] = useState<string | null>(null)
  const [packingCustomerId, setPackingCustomerId] = useState('')
  const [packingDocumentType, setPackingDocumentType] = useState<'' | 'invoice' | 'delivery-challan'>('')
  const [packingInvoiceId, setPackingInvoiceId] = useState('')
  const [packingInvoices, setPackingInvoices] = useState<Invoice[]>([])
  const [packingInvoicesLoading, setPackingInvoicesLoading] = useState(false)
  const [packingInvoicesError, setPackingInvoicesError] = useState<string | null>(null)
  const [packingDeliveryChallanId, setPackingDeliveryChallanId] = useState('')
  const [packingDeliveryChallans, setPackingDeliveryChallans] = useState<DeliveryChallan[]>([])
  const [packingDeliveryChallansLoading, setPackingDeliveryChallansLoading] = useState(false)
  const [packingDeliveryChallansError, setPackingDeliveryChallansError] = useState<string | null>(null)
  const [packingPreviewTemplate, setPackingPreviewTemplate] = useState<ArrayBuffer | null>(null)
  const [packingPreviewLoading, setPackingPreviewLoading] = useState(false)
  const [packingPreviewError, setPackingPreviewError] = useState('')
  const packingPreviewRef = useRef<HTMLDivElement>(null)
  const [coaCustomerId, setCoaCustomerId] = useState('')
  const [coaDocumentType, setCoaDocumentType] = useState<'' | 'invoice' | 'delivery-challan'>('')
  const [coaInvoiceId, setCoaInvoiceId] = useState('')
  const [coaInvoices, setCoaInvoices] = useState<Invoice[]>([])
  const [coaInvoicesLoading, setCoaInvoicesLoading] = useState(false)
  const [coaInvoicesError, setCoaInvoicesError] = useState<string | null>(null)
  const [coaDeliveryChallanId, setCoaDeliveryChallanId] = useState('')
  const [coaDeliveryChallans, setCoaDeliveryChallans] = useState<DeliveryChallan[]>([])
  const [coaDeliveryChallansLoading, setCoaDeliveryChallansLoading] = useState(false)
  const [coaDeliveryChallansError, setCoaDeliveryChallansError] = useState<string | null>(null)
  const [coaInvoiceDetail, setCoaInvoiceDetail] = useState<InvoiceDetail | DeliveryChallanDetail | null>(null)
  const [coaInvoiceDetailLoading, setCoaInvoiceDetailLoading] = useState(false)
  const [coaInvoiceDetailError, setCoaInvoiceDetailError] = useState('')
  const [coaAnalysisItems, setCoaAnalysisItems] = useState<CoaAnalysisItem[]>([])
  const [savedCoa, setSavedCoa] = useState<CoaRecord | null>(null)
  const [coaPersistenceLoading, setCoaPersistenceLoading] = useState(false)
  const [coaPersistenceError, setCoaPersistenceError] = useState('')
  const [coaSaving, setCoaSaving] = useState(false)
  const [coaRegenerateConfirmationOpen, setCoaRegenerateConfirmationOpen] = useState(false)
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
  const [createRoleOpen, setCreateRoleOpen] = useState(false)
  const [createRoleName, setCreateRoleName] = useState('')
  const [createRoleDescription, setCreateRoleDescription] = useState('')
  const [createRoleStatus, setCreateRoleStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE')
  const [createRoleNameError, setCreateRoleNameError] = useState('')
  const [creatingRole, setCreatingRole] = useState(false)
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
  const [dashboardRefreshLoading, setDashboardRefreshLoading] = useState(false)
  const [dashboardRefreshError, setDashboardRefreshError] = useState('')
  const [dashboardRefreshedAt, setDashboardRefreshedAt] = useState<Date | null>(null)
  const [customerRefreshLoading, setCustomerRefreshLoading] = useState(false)
  const [customerRefreshError, setCustomerRefreshError] = useState('')
  const [customersRefreshedAt, setCustomersRefreshedAt] = useState<Date | null>(null)
  const [itemRefreshLoading, setItemRefreshLoading] = useState(false)
  const [itemRefreshError, setItemRefreshError] = useState('')
  const [itemsRefreshedAt, setItemsRefreshedAt] = useState<Date | null>(null)

  const visibleMenuGroups = getVisibleMenuGroups(menuAccess)
  const moduleMenuItems = visibleMenuGroups.flatMap((group) => group.items)
  const visibleMenuItems = [homeMenuItem, ...moduleMenuItems]
  const visibleMenuKeys = new Set(visibleMenuItems.map((item) => item.key))
  const visibleMenuKeyList = visibleMenuItems.map((item) => item.key).join('|')
  const selectedItem = visibleMenuItems.find((item) => item.key === selectedKey) ?? visibleMenuItems[0] ?? {
    key: 'no-access',
    title: 'No modules available',
    description: 'No application modules are assigned to your role.',
    icon: Settings,
  }
  const SelectedItemIcon = selectedItem.icon
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
      const menuKeys = accessMatrix.map((accessItem) => accessItem.key)
      const accessEntries = await Promise.all(
        activeRoles.map(async (role) => [role.id, await getAdminAccess(role.id, menuKeys)] as const),
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
          ensureCocDocumentFooter(previewElement)
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

    if (selectedKey !== 'coc' || !customerId || cocDocumentType !== 'invoice') {
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
  }, [cocDocumentType, customerId, selectedKey])

  useEffect(() => {
    setDeliveryChallanId('')
    setDeliveryChallans([])
    setDeliveryChallansError(null)
    setDeliveryChallansLoading(false)

    if (selectedKey !== 'coc' || !customerId || cocDocumentType !== 'delivery-challan') return
    let isCurrent = true
    async function loadDeliveryChallans() {
      setDeliveryChallansLoading(true)
      try {
        const rows = await getDeliveryChallansByCustomer(customerId)
        if (isCurrent) setDeliveryChallans(rows)
      } catch (error) {
        if (isCurrent) setDeliveryChallansError(error instanceof Error ? error.message : 'Unable to load Delivery Challans')
      } finally {
        if (isCurrent) setDeliveryChallansLoading(false)
      }
    }
    void loadDeliveryChallans()
    return () => { isCurrent = false }
  }, [cocDocumentType, customerId, selectedKey])

  useEffect(() => {
    setPackingInvoiceId('')
    setPackingInvoices([])
    setPackingInvoicesError(null)
    setPackingInvoicesLoading(false)

    if (selectedKey !== 'packing-slip' || !packingCustomerId || packingDocumentType !== 'invoice') {
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
  }, [packingCustomerId, packingDocumentType, selectedKey])

  useEffect(() => {
    setPackingDeliveryChallanId('')
    setPackingDeliveryChallans([])
    setPackingDeliveryChallansError(null)
    setPackingDeliveryChallansLoading(false)
    if (selectedKey !== 'packing-slip' || !packingCustomerId || packingDocumentType !== 'delivery-challan') return
    let isCurrent = true
    async function loadPackingDeliveryChallans() {
      setPackingDeliveryChallansLoading(true)
      try {
        const rows = await getDeliveryChallansByCustomer(packingCustomerId)
        if (isCurrent) setPackingDeliveryChallans(rows)
      } catch (error) {
        if (isCurrent) setPackingDeliveryChallansError(error instanceof Error ? error.message : 'Unable to load Delivery Challans')
      } finally {
        if (isCurrent) setPackingDeliveryChallansLoading(false)
      }
    }
    void loadPackingDeliveryChallans()
    return () => { isCurrent = false }
  }, [packingCustomerId, packingDocumentType, selectedKey])

  useEffect(() => {
    setCoaInvoiceId('')
    setCoaInvoices([])
    setCoaInvoicesError(null)
    setCoaInvoicesLoading(false)

    if (selectedKey !== 'coa' || !coaCustomerId || coaDocumentType !== 'invoice') {
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
  }, [coaCustomerId, coaDocumentType, selectedKey])

  useEffect(() => {
    setCoaDeliveryChallanId('')
    setCoaDeliveryChallans([])
    setCoaDeliveryChallansError(null)
    setCoaDeliveryChallansLoading(false)
    if (selectedKey !== 'coa' || !coaCustomerId || coaDocumentType !== 'delivery-challan') return
    let isCurrent = true
    async function loadCoaDeliveryChallans() {
      setCoaDeliveryChallansLoading(true)
      try {
        const rows = await getDeliveryChallansByCustomer(coaCustomerId)
        if (isCurrent) setCoaDeliveryChallans(rows)
      } catch (error) {
        if (isCurrent) setCoaDeliveryChallansError(error instanceof Error ? error.message : 'Unable to load Delivery Challans')
      } finally {
        if (isCurrent) setCoaDeliveryChallansLoading(false)
      }
    }
    void loadCoaDeliveryChallans()
    return () => { isCurrent = false }
  }, [coaCustomerId, coaDocumentType, selectedKey])

  useEffect(() => {
    if (selectedKey !== 'coa') {
      return
    }

    setCoaCustomerId('')
    setCoaDocumentType('')
    setCoaInvoiceId('')
    setCoaDeliveryChallanId('')
    setCoaInvoiceDetail(null)
    setCoaPreviewTemplate(null)
    setCoaPreviewError('')
  }, [selectedKey])

  useEffect(() => {
    setCoaInvoiceDetail(null)
    setCoaAnalysisItems([])
    setSavedCoa(null)
    setCoaInvoiceDetailError('')
    setCoaPersistenceError('')
    setCoaInvoiceDetailLoading(false)
    setCoaPersistenceLoading(false)
    setCoaRegenerateConfirmationOpen(false)

    const documentId = coaDocumentType === 'invoice' ? coaInvoiceId : coaDeliveryChallanId
    if (selectedKey !== 'coa' || !coaDocumentType || !documentId) {
      return
    }

    let isCurrent = true

    async function loadCoaInvoiceDetail() {
      setCoaInvoiceDetailLoading(true)
      setCoaPersistenceLoading(true)

      try {
        const [document, storedCoa] = await Promise.all([
          coaDocumentType === 'invoice' ? getInvoiceById(documentId) : getDeliveryChallanById(documentId),
          getSavedCoa(coaCustomerId, documentId),
        ])

        if (isCurrent) {
          setCoaInvoiceDetail(document)
          setSavedCoa(storedCoa)
          setCoaAnalysisItems(storedCoa?.data.items ?? document.line_items.map((item) => {
            const defaults = getCoaAnalysisDefaults(document.customer_name, item.description)
            return {
              name: item.name,
              description: item.description,
              boardGsm: defaults?.['Board GSM'] ?? '',
              gsm: defaults?.GSM ?? '',
              burstingStrength: defaults?.['Bursting Strength'] ?? '',
              moisture: defaults?.Moisture ?? '',
              ply: defaults?.Ply ?? '',
            }
          }))

          if (storedCoa) {
            const template = await loadCoaTemplate()
            const { generateCoaTemplate } = await import('./lib/coaGenerator')
            if (isCurrent) setCoaPreviewTemplate(generateCoaTemplate(template, storedCoa.data))
          }
        }
      } catch (caughtError) {
        if (isCurrent) {
          const message = caughtError instanceof Error ? caughtError.message : 'Unable to load COA details'
          setCoaInvoiceDetailError(message)
          setCoaPersistenceError(
            message.includes('COA') ? message : 'Unable to load previously generated COA.',
          )
        }
      } finally {
        if (isCurrent) {
          setCoaInvoiceDetailLoading(false)
          setCoaPersistenceLoading(false)
        }
      }
    }

    loadCoaInvoiceDetail()

    return () => {
      isCurrent = false
    }
  }, [coaCustomerId, coaDeliveryChallanId, coaDocumentType, coaInvoiceId, selectedKey])

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
    const documentId = cocDocumentType === 'invoice' ? invoiceId : deliveryChallanId
    if (!cocDocumentType || !documentId) return

    try {
      const document = cocDocumentType === 'invoice'
        ? await getInvoiceById(documentId)
        : await getDeliveryChallanById(documentId)
      const template = await loadCocTemplate()
      const { generateCocTemplate } = await import('./lib/cocGenerator')
      setPreviewTemplate(generateCocTemplate(template, {
        invoiceDate: document.date,
        customer: document.customer_name,
        poNumber: document.po_number,
        invoiceNumber: 'invoice_number' in document ? document.invoice_number : document.delivery_challan_number,
        documentType: cocDocumentType,
        items: document.line_items,
      }))
    } catch {
      setPreviewError('Unable to generate COC preview')
    }
  }

  function updateCoaAnalysisItem(index: number, field: keyof CoaAnalysisItem, value: string) {
    setCoaAnalysisItems((currentItems) => currentItems.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )))
  }

  function buildCoaPayload(document = coaInvoiceDetail): CoaInvoiceValues | null {
    if (!document || !coaDocumentType) return null
    return {
      invoiceDate: document.date,
      customer: document.customer_name,
      poNumber: document.po_number,
      invoiceNumber: 'invoice_number' in document ? document.invoice_number : document.delivery_challan_number,
      refNumber: document.sales_order_number || '-',
      documentType: coaDocumentType,
      items: coaAnalysisItems,
    }
  }

  async function persistAndGenerateCoa(isRegeneration: boolean) {
    const documentId = coaDocumentType === 'invoice' ? coaInvoiceId : coaDeliveryChallanId
    if (!coaDocumentType || !documentId) return

    setCoaPreviewError('')
    setCoaPersistenceError('')
    setCoaSaving(true)

    try {
      // COA document data must remain live. Always retrieve the selected
      // invoice again when Generate/Re-generate is clicked; the daily cache is
      // exclusively for dashboard aggregates.
      const currentDocument = coaDocumentType === 'invoice'
        ? await getInvoiceById(documentId)
        : await getDeliveryChallanById(documentId)
      const payload = buildCoaPayload(currentDocument)
      if (!payload) throw new Error('Unable to load current document details from Zoho.')
      setCoaInvoiceDetail(currentDocument)
      const template = await loadCoaTemplate()
      const { generateCoaTemplate } = await import('./lib/coaGenerator')
      const generatedTemplate = generateCoaTemplate(template, payload)
      const recordInput = {
        customerId: coaCustomerId,
        customerName: currentDocument.customer_name,
        invoiceId: documentId,
        invoiceNumber: 'invoice_number' in currentDocument ? currentDocument.invoice_number : currentDocument.delivery_challan_number,
        data: payload,
      }
      const record = isRegeneration && savedCoa
        ? await regenerateCoa(savedCoa.id, recordInput)
        : await saveCoa(recordInput)

      setSavedCoa(record)
      setCoaAnalysisItems(record.data.items)
      setCoaPreviewTemplate(generatedTemplate)
      setCoaRegenerateConfirmationOpen(false)
    } catch (caughtError) {
      setCoaPersistenceError(
        caughtError instanceof Error ? caughtError.message : 'Unable to save COA. Please try again.',
      )
    } finally {
      setCoaSaving(false)
    }
  }

  async function generateCoa() {
    if (savedCoa) {
      if (userRole !== 'SUPERADMIN') return
      setCoaRegenerateConfirmationOpen(true)
      return
    }
    await persistAndGenerateCoa(false)
  }

  async function generatePackingSlip() {
    const documentId = packingDocumentType === 'invoice' ? packingInvoiceId : packingDeliveryChallanId
    if (!packingDocumentType || !documentId) return

    setPackingPreviewError('')

    try {
      const [document, template, logo, { generatePackingSlipPages }] = await Promise.all([
        packingDocumentType === 'invoice' ? getInvoiceById(documentId) : getDeliveryChallanById(documentId),
        loadPackingSlipTemplate(),
        loadPackingSlipLogo(),
        import('./lib/packingSlipGenerator'),
      ])
      setPackingPreviewTemplate(generatePackingSlipPages(template, logo, {
        customerName: document.customer_name,
        invoiceNumber: 'invoice_number' in document ? document.invoice_number : document.delivery_challan_number,
        invoiceDate: document.date,
        documentType: packingDocumentType,
        items: document.line_items,
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
        : previewElement.classList.contains('coc-certificate-preview-document')
          ? 'coc-preview-document coc-certificate-preview-document'
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
    const groupTitle = getMenuGroupTitleForKey(key)
    if (groupTitle) {
      setExpandedMenuGroups((current) => new Set(current).add(groupTitle))
    }
  }

  function toggleMenuGroup(groupTitle: string) {
    setExpandedMenuGroups((current) => {
      const next = new Set(current)
      if (next.has(groupTitle)) {
        next.delete(groupTitle)
      } else {
        next.add(groupTitle)
      }
      return next
    })
  }

  function goToDashboardHome() {
    const homeKey = getDefaultPermittedMenuKey(menuAccess)

    if (homeKey) {
      selectMenuItem(homeKey)
    }
  }

  async function refreshDashboardData() {
    if (dashboardRefreshLoading || userRole !== 'SUPERADMIN') return

    setDashboardRefreshLoading(true)
    setDashboardRefreshError('')

    try {
      const result = await getCustomerOpenSalesOrderSummary(true)
      const errors = [result.errors.sales, result.errors.finance].filter(Boolean)

      if (errors.length > 0) {
        setDashboardRefreshError(errors.join(' '))
        return
      }

      const refreshedAt = result.refreshedAt ? new Date(result.refreshedAt) : new Date()
      setDashboardRefreshedAt(refreshedAt)
    } catch {
      setDashboardRefreshError('Unable to refresh dashboard data. Please try again.')
    } finally {
      setDashboardRefreshLoading(false)
    }
  }

  async function refreshCustomerDetails() {
    if (customerRefreshLoading || userRole !== 'SUPERADMIN') return

    setCustomerRefreshLoading(true)
    setCustomerRefreshError('')

    try {
      const result = await refreshCustomers()
      setCustomers(result.customers)
      setCustomersError(null)
      setCustomersRefreshedAt(result.refreshedAt)
    } catch {
      setCustomerRefreshError(getCustomersError() ?? 'Unable to refresh customer details. Please try again.')
    } finally {
      setCustomerRefreshLoading(false)
    }
  }

  async function refreshItemDetails() {
    if (itemRefreshLoading || userRole !== 'SUPERADMIN') return
    setItemRefreshLoading(true)
    setItemRefreshError('')
    try {
      const result = await refreshItems()
      setItemsRefreshedAt(result.refreshedAt)
    } catch {
      setItemRefreshError(getItemsError() ?? 'Unable to refresh item details. Please try again.')
    } finally {
      setItemRefreshLoading(false)
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

  function openCreateRole() {
    setCreateRoleName('')
    setCreateRoleDescription('')
    setCreateRoleStatus('ACTIVE')
    setCreateRoleNameError('')
    setCreateRoleOpen(true)
    setRoleActionMessage('')
  }

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (creatingRole) return

    const normalizedName = createRoleName.trim().toUpperCase()
    if (!normalizedName) {
      setCreateRoleNameError('Role name is required')
      return
    }

    setCreatingRole(true)
    setCreateRoleNameError('')
    setRoleActionMessage('')

    try {
      const createdRole = await createAdminRole({
        name: normalizedName,
        description: createRoleDescription.trim(),
        status: createRoleStatus,
      })

      setAdminRoles((roles) => [...roles, createdRole])
      setCreateRoleOpen(false)
      setCreateRoleName('')
      setCreateRoleDescription('')
      setCreateRoleStatus('ACTIVE')
      setRoleActionMessageType('success')
      setRoleActionMessage('Role created.')
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to create role'
      if (message.toLowerCase().includes('already exists')) {
        setCreateRoleNameError('Role name already exists')
      }
      setRoleActionMessageType('error')
      setRoleActionMessage(message)
    } finally {
      setCreatingRole(false)
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
          <button
            type="button"
            className={`menu-item menu-home-item ${selectedKey === 'home' ? 'active' : ''}`}
            onClick={() => selectMenuItem('home')}
            aria-current={selectedKey === 'home' ? 'page' : undefined}
          >
            <span className="menu-item-main">
              <span className="menu-item-icon" aria-hidden="true">
                <Home size={18} strokeWidth={1.8} />
              </span>
              <span>Dashboard</span>
            </span>
          </button>
          {visibleMenuGroups.map((group) => {
            const isExpanded = expandedMenuGroups.has(group.title)
            const groupId = `menu-group-${group.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

            return (
            <div key={group.title} className={`menu-group${isExpanded ? ' expanded' : ''}`}>
              <button
                type="button"
                className="menu-group-toggle"
                onClick={() => toggleMenuGroup(group.title)}
                aria-expanded={isExpanded}
                aria-controls={groupId}
              >
                <ChevronRight className="menu-group-chevron" size={14} aria-hidden="true" />
                <span>{group.title}</span>
              </button>
              <ul id={groupId} className="menu-list" hidden={!isExpanded}>
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
                        <span>{item.menuTitle ?? item.title}</span>
                      </span>
                      <ChevronRight className="menu-item-chevron" size={16} aria-hidden="true" />
                    </button>
                    {item.key === selectedKey && <span>✓</span>}
                  </li>
                ))}
              </ul>
            </div>
            )
          })}
        </aside>

        <section className="dashboard-content">
          <div className={`dashboard-card${selectedItem.key === 'home' ? ' home-dashboard-page' : ''}${selectedItem.key === 'coc' || selectedItem.key === 'packing-slip' || selectedItem.key === 'coa' || selectedItem.key === 'data-management' || selectedItem.key === 'admin-configurations' || selectedItem.key === 'product-specifications' ? ' document-form-page' : ''}${selectedItem.key === ADVANCED_BOX_CALCULATOR_ROUTE_KEY ? ' advanced-calculator-dashboard-page' : ''}${PANEL_HEADING_MENU_KEYS.has(selectedItem.key) ? ' dashboard-panel-heading-page' : ''}`}>
            {selectedItem.key !== 'home' && (
              <header className="dashboard-page-heading">
                <h2>
                  {PANEL_HEADING_MENU_KEYS.has(selectedItem.key) && (
                    <span className="dashboard-page-heading-icon" aria-hidden="true">
                      <SelectedItemIcon size={16} />
                    </span>
                  )}
                  <span>{selectedItem.title}</span>
                </h2>
                <p>{selectedItem.description}</p>
              </header>
            )}
            <div className="dashboard-details">
              {selectedItem.key === 'home' && (
                <DashboardPage
                  menuAccess={menuAccess}
                  actions={moduleMenuItems.slice(0, 8).map((item) => ({
                    key: item.key,
                    label: item.menuTitle ?? item.title,
                    description: item.description,
                    icon: item.icon,
                  }))}
                  onNavigate={selectMenuItem}
                />
              )}
              {selectedItem.key === 'corrugated-box-price' && (
                <div className="pc-corrugated-calculator-compat">
                  <CardBoxCalculator />
                </div>
              )}
              {selectedItem.key === ADVANCED_BOX_CALCULATOR_ROUTE_KEY && (
                <AdvancedCorrugatedBoxCalculatorPage />
              )}
              {selectedItem.key === 'corrugated-board-price' && (
                <CorrugatedBoardPriceCalculator />
              )}
              {selectedItem.key === 'paper-purchase-request' && (
                <PaperPurchaseRequest />
              )}
              {selectedItem.key === 'paper-purchase-request-approvals' && (
                <PaperPurchaseRequestApprovals />
              )}
              {selectedItem.key === 'paper-po-calculation' && (
                <PaperPoCalculation />
              )}
              {selectedItem.key === 'purchase-reports' && (
                <section className="paper-request-section pc-purchase-reports">
                  <header>
                    <h3><BarChart3 size={16} /> Purchase Reports</h3>
                    <p>Purchase workflow reports and analysis will be available here.</p>
                  </header>
                  <p className="paper-request-empty">No Purchase Reports are available yet.</p>
                </section>
              )}
              {selectedItem.key === 'product-specifications' && (
                <ProductSpecifications />
              )}
              {NEW_MODULE_MENU_KEYS.has(selectedItem.key) && (
                <section className="paper-request-section pc-module-placeholder">
                  <header>
                    <h3><SelectedItemIcon size={16} /> {selectedItem.title}</h3>
                    <p>{selectedItem.description}</p>
                  </header>
                  <p className="paper-request-empty">
                    This module is ready for its workflow configuration. No existing records were changed.
                  </p>
                </section>
              )}
              {selectedItem.key === 'data-management' && (
                <div className="coc-form data-management-form">
                  <div className="data-management-utility">
                    <div>
                      <strong>Customer Details</strong>
                      <p>Refresh the shared active-customer cache used across the application.</p>
                    </div>
                    {userRole === 'SUPERADMIN' ? (
                      <div className="data-management-actions">
                        {customersRefreshedAt && (
                          <span className="data-management-refreshed-at">
                            Refreshed on {customersRefreshedAt.toLocaleString('en-IN')}
                          </span>
                        )}
                        <button type="button" onClick={() => void refreshCustomerDetails()} disabled={customerRefreshLoading}>
                          <RefreshCw size={14} className={customerRefreshLoading ? 'is-spinning' : ''} />
                          {customerRefreshLoading ? 'Refreshing...' : 'Refresh'}
                        </button>
                      </div>
                    ) : (
                      <span className="data-management-restricted">SUPERADMIN only</span>
                    )}
                  </div>
                  {customerRefreshError && (
                    <p className="data-management-message is-error" role="alert">
                      {customerRefreshError}
                    </p>
                  )}
                  <div className="data-management-utility">
                    <div>
                      <strong>Item Details</strong>
                      <p>Refresh the shared active-item cache from Zoho Books.</p>
                    </div>
                    {userRole === 'SUPERADMIN' ? (
                      <div className="data-management-actions">
                        {itemsRefreshedAt && (
                          <span className="data-management-refreshed-at">
                            Refreshed on {itemsRefreshedAt.toLocaleString('en-IN')}
                          </span>
                        )}
                        <button type="button" onClick={() => void refreshItemDetails()} disabled={itemRefreshLoading}>
                          <RefreshCw size={14} className={itemRefreshLoading ? 'is-spinning' : ''} />
                          {itemRefreshLoading ? 'Refreshing...' : 'Refresh'}
                        </button>
                      </div>
                    ) : (
                      <span className="data-management-restricted">SUPERADMIN only</span>
                    )}
                  </div>
                  {itemRefreshError && (
                    <p className="data-management-message is-error" role="alert">
                      {itemRefreshError}
                    </p>
                  )}
                  <div className="data-management-utility">
                    <div>
                      <strong>Refresh Dashboard Data</strong>
                      <p>Refresh the cached sales and finance dashboard data from Zoho.</p>
                    </div>
                    {userRole === 'SUPERADMIN' ? (
                      <div className="data-management-actions">
                        {dashboardRefreshedAt && (
                          <span className="data-management-refreshed-at">
                            Refreshed on {dashboardRefreshedAt.toLocaleString('en-IN')}
                          </span>
                        )}
                        <button type="button" onClick={() => void refreshDashboardData()} disabled={dashboardRefreshLoading}>
                          <RefreshCw size={14} className={dashboardRefreshLoading ? 'is-spinning' : ''} />
                          {dashboardRefreshLoading ? 'Refreshing...' : 'Refresh'}
                        </button>
                      </div>
                    ) : (
                      <span className="data-management-restricted">SUPERADMIN only</span>
                    )}
                  </div>
                  {dashboardRefreshError && (
                    <p className="data-management-message is-error" role="alert">
                      {dashboardRefreshError}
                    </p>
                  )}
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
                        setCocDocumentType('')
                        setInvoiceId('')
                        setDeliveryChallanId('')
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
                    <label htmlFor="coc-document-type">Document Type</label>
                    <select
                      id="coc-document-type"
                      value={cocDocumentType}
                      onChange={(event) => {
                        setCocDocumentType(event.target.value as '' | 'invoice' | 'delivery-challan')
                        setInvoiceId('')
                        setDeliveryChallanId('')
                        setPreviewTemplate(null)
                        setPreviewError('')
                      }}
                      disabled={!customerId}
                    >
                      <option value="">Select document type</option>
                      <option value="invoice">Invoice</option>
                      <option value="delivery-challan">Delivery Challan</option>
                    </select>
                  </div>
                  <div className="coc-form-field">
                    <label htmlFor="coc-document-number">{cocDocumentType === 'invoice' ? 'Invoice Number' : cocDocumentType === 'delivery-challan' ? 'Delivery Challan Number' : 'Document Number'}</label>
                    <select
                      id="coc-document-number"
                      value={cocDocumentType === 'invoice' ? invoiceId : deliveryChallanId}
                      onChange={(event) => {
                        if (cocDocumentType === 'invoice') setInvoiceId(event.target.value)
                        else setDeliveryChallanId(event.target.value)
                        setPreviewTemplate(null)
                        setPreviewError('')
                      }}
                      disabled={!customerId || (cocDocumentType === 'invoice'
                        ? invoicesLoading || Boolean(invoicesError)
                        : cocDocumentType === 'delivery-challan'
                          ? deliveryChallansLoading || Boolean(deliveryChallansError)
                          : true)}
                    >
                      <option value="">
                        {!customerId
                          ? 'Select customer first'
                          : !cocDocumentType
                            ? 'Select document type first'
                          : cocDocumentType === 'invoice'
                            ? invoicesLoading ? 'Loading invoices...' : invoicesError ? 'Unable to load invoices' : invoices.length === 0 ? 'No invoices found' : 'Select invoice'
                            : deliveryChallansLoading ? 'Loading Delivery Challans...' : deliveryChallansError ? 'Unable to load Delivery Challans' : deliveryChallans.length === 0 ? 'No Delivery Challans found' : 'Select Delivery Challan'}
                      </option>
                      {(cocDocumentType === 'invoice' ? invoices : deliveryChallans).map((document) => (
                        <option key={'invoice_id' in document ? document.invoice_id : document.delivery_challan_id} value={'invoice_id' in document ? document.invoice_id : document.delivery_challan_id}>
                          {'invoice_number' in document ? document.invoice_number : document.delivery_challan_number}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(cocDocumentType === 'invoice' ? invoicesError : deliveryChallansError) && (
                    <p style={{ margin: '0.5rem 0 0', color: '#b42318', fontSize: '0.9rem' }}>
                      {cocDocumentType === 'invoice' ? invoicesError : deliveryChallansError}
                    </p>
                  )}
                  <div className="coc-action-row packing-slip-actions">
                    <button
                      type="button"
                      className="packing-action-button packing-action-primary"
                      onClick={generateCoc}
                      disabled={!(cocDocumentType === 'invoice' ? invoiceId : deliveryChallanId) || !templateReady}
                    >
                      <FileCheck2 aria-hidden="true" />
                      <span>Generate COC</span>
                    </button>
                    {previewTemplate && !previewLoading && !previewError && (
                      <>
                      <button
                        type="button"
                        className="packing-action-button packing-action-pdf"
                        onClick={() => openDocumentPrintDialog(previewRef.current, cocDocumentType === 'invoice' ? invoices : deliveryChallans.map((row) => ({ invoice_id: row.delivery_challan_id, invoice_number: row.delivery_challan_number })), cocDocumentType === 'invoice' ? invoiceId : deliveryChallanId, 'COC')}
                      >
                        <FileDown aria-hidden="true" />
                        <span>Save As PDF</span>
                      </button>
                      <button
                        type="button"
                        className="packing-action-button packing-action-print"
                        onClick={() => openDocumentPrintDialog(previewRef.current, cocDocumentType === 'invoice' ? invoices : deliveryChallans.map((row) => ({ invoice_id: row.delivery_challan_id, invoice_number: row.delivery_challan_number })), cocDocumentType === 'invoice' ? invoiceId : deliveryChallanId, 'COC')}
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
                      <div ref={previewRef} className="coc-preview-document coc-certificate-preview-document" />
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
                      onChange={(event) => {
                        setCoaCustomerId(event.target.value)
                        setCoaDocumentType('')
                        setCoaInvoiceId('')
                        setCoaDeliveryChallanId('')
                        setCoaPreviewTemplate(null)
                        setCoaPreviewError('')
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
                    <label htmlFor="coa-document-type">Document Type</label>
                    <select
                      id="coa-document-type"
                      value={coaDocumentType}
                      onChange={(event) => {
                        setCoaDocumentType(event.target.value as '' | 'invoice' | 'delivery-challan')
                        setCoaInvoiceId('')
                        setCoaDeliveryChallanId('')
                        setCoaPreviewTemplate(null)
                        setCoaPreviewError('')
                      }}
                      disabled={!coaCustomerId}
                    >
                      <option value="">Select document type</option>
                      <option value="invoice">Invoice</option>
                      <option value="delivery-challan">Delivery Challan</option>
                    </select>
                  </div>
                  <div className="coc-form-field">
                    <label htmlFor="coa-document-number">{coaDocumentType === 'invoice' ? 'Invoice Number' : coaDocumentType === 'delivery-challan' ? 'Delivery Challan Number' : 'Document Number'}</label>
                    <select
                      id="coa-document-number"
                      value={coaDocumentType === 'invoice' ? coaInvoiceId : coaDeliveryChallanId}
                      onChange={(event) => {
                        if (coaDocumentType === 'invoice') setCoaInvoiceId(event.target.value)
                        else setCoaDeliveryChallanId(event.target.value)
                        setCoaPreviewTemplate(null)
                        setCoaPreviewError('')
                      }}
                      disabled={!coaCustomerId || (coaDocumentType === 'invoice'
                        ? coaInvoicesLoading || Boolean(coaInvoicesError)
                        : coaDocumentType === 'delivery-challan'
                          ? coaDeliveryChallansLoading || Boolean(coaDeliveryChallansError)
                          : true)}
                    >
                      <option value="">
                        {!coaCustomerId
                          ? 'Select customer first'
                          : !coaDocumentType
                            ? 'Select document type first'
                            : coaDocumentType === 'invoice'
                              ? coaInvoicesLoading ? 'Loading invoices...' : coaInvoicesError ? 'Unable to load invoices' : coaInvoices.length === 0 ? 'No invoices found' : 'Select invoice'
                              : coaDeliveryChallansLoading ? 'Loading Delivery Challans...' : coaDeliveryChallansError ? 'Unable to load Delivery Challans' : coaDeliveryChallans.length === 0 ? 'No Delivery Challans found' : 'Select Delivery Challan'}
                      </option>
                      {(coaDocumentType === 'invoice' ? coaInvoices : coaDeliveryChallans).map((document) => (
                        <option key={'invoice_id' in document ? document.invoice_id : document.delivery_challan_id} value={'invoice_id' in document ? document.invoice_id : document.delivery_challan_id}>
                          {'invoice_number' in document ? document.invoice_number : document.delivery_challan_number}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(coaDocumentType === 'invoice' ? coaInvoicesError : coaDeliveryChallansError) && (
                    <p style={{ margin: '0.5rem 0 0', color: '#b42318', fontSize: '0.9rem' }}>
                      {coaDocumentType === 'invoice' ? coaInvoicesError : coaDeliveryChallansError}
                    </p>
                  )}
                  {(coaDocumentType === 'invoice' ? coaInvoiceId : coaDeliveryChallanId) && (
                    <div className="coa-invoice-details" aria-live="polite">
                      {(coaInvoiceDetailLoading || coaPersistenceLoading) && <p>Loading COA details...</p>}
                      {coaInvoiceDetailError && <p className="coa-invoice-details-error">{coaInvoiceDetailError}</p>}
                      {coaPersistenceError && !coaInvoiceDetailError && (
                        <p className="coa-invoice-details-error">{coaPersistenceError}</p>
                      )}
                      {coaInvoiceDetail && !coaInvoiceDetailLoading && !coaPersistenceLoading && (
                        <>
                          {savedCoa && (
                            <section className="coa-status-panel" aria-label="Saved COA status">
                              <div className="coa-status-heading">
                                <CircleCheck size={16} aria-hidden="true" />
                                <strong>{savedCoa.updatedAt ? 'COA Re-generated' : 'COA Generated'}</strong>
                              </div>
                              <dl>
                                <div>
                                  <dt>{savedCoa.updatedAt ? 'Originally Generated By' : 'Generated By'}</dt>
                                  <dd>{savedCoa.generatedBy.name}</dd>
                                </div>
                                <div><dt>Generated Email</dt><dd>{savedCoa.generatedBy.email}</dd></div>
                                <div>
                                  <dt>{savedCoa.updatedAt ? 'Originally Generated On' : 'Generated On'}</dt>
                                  <dd>{formatCoaAuditDate(savedCoa.generatedAt)}</dd>
                                </div>
                                {savedCoa.updatedBy && savedCoa.updatedAt && (
                                  <>
                                    <div><dt>Last Updated By</dt><dd>{savedCoa.updatedBy.name}</dd></div>
                                    <div><dt>Updated Email</dt><dd>{savedCoa.updatedBy.email}</dd></div>
                                    <div><dt>Last Updated On</dt><dd>{formatCoaAuditDate(savedCoa.updatedAt)}</dd></div>
                                  </>
                                )}
                              </dl>
                            </section>
                          )}
                          <dl>
                            <div><dt>{coaDocumentType === 'delivery-challan' ? 'DELIVERY CHALLAN DATE:' : 'DATE:'}</dt><dd>{coaInvoiceDetail.date ? formatCoaInvoiceDate(coaInvoiceDetail.date) : '-'}</dd></div>
                            <div><dt>CUSTOMER:</dt><dd>{coaInvoiceDetail.customer_name || '-'}</dd></div>
                            <div><dt>PO#:</dt><dd>{coaInvoiceDetail.po_number || '-'}</dd></div>
                            <div><dt>{coaDocumentType === 'invoice' ? 'Invoice#:' : 'Delivery Challan#:'}</dt><dd>{'invoice_number' in coaInvoiceDetail ? coaInvoiceDetail.invoice_number || '-' : coaInvoiceDetail.delivery_challan_number || '-'}</dd></div>
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
                                {coaAnalysisItems.map((item, index) => {
                                  const existingReadOnly = Boolean(savedCoa) && userRole !== 'SUPERADMIN'
                                  return (
                                    <tr key={`${'invoice_id' in coaInvoiceDetail ? coaInvoiceDetail.invoice_id : coaInvoiceDetail.delivery_challan_id}-${item.name}-${item.description}-${index}`}>
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
                                              value={item[coaAnalysisFieldByHeading[heading]]}
                                              readOnly={existingReadOnly}
                                              onChange={(event) => updateCoaAnalysisItem(
                                                index,
                                                coaAnalysisFieldByHeading[heading],
                                                event.target.value,
                                              )}
                                            />
                                          ) : (
                                            <input
                                              type="text"
                                              aria-label={`${heading} ${index + 1}`}
                                              value={item[coaAnalysisFieldByHeading[heading]]}
                                              readOnly={existingReadOnly}
                                              onChange={(event) => updateCoaAnalysisItem(
                                                index,
                                                coaAnalysisFieldByHeading[heading],
                                                event.target.value,
                                              )}
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
                    {(!savedCoa || userRole === 'SUPERADMIN') && (
                      <button
                        type="button"
                        className="packing-action-button packing-action-primary"
                        onClick={generateCoa}
                        disabled={!coaInvoiceDetail || coaInvoiceDetailLoading || coaPersistenceLoading || coaSaving}
                      >
                        <FlaskConical aria-hidden="true" />
                        <span>{coaSaving ? 'Saving COA...' : savedCoa ? 'Re-generate COA' : 'Generate COA'}</span>
                      </button>
                    )}
                    {coaPreviewTemplate && !coaPreviewLoading && !coaPreviewError && (
                      <>
                        <button
                          type="button"
                          className="packing-action-button packing-action-pdf"
                          onClick={() => openDocumentPrintDialog(coaPreviewRef.current, coaDocumentType === 'invoice' ? coaInvoices : coaDeliveryChallans.map((row) => ({ invoice_id: row.delivery_challan_id, invoice_number: row.delivery_challan_number })), coaDocumentType === 'invoice' ? coaInvoiceId : coaDeliveryChallanId, 'COA')}
                        >
                          <FileDown aria-hidden="true" />
                          <span>Save As PDF</span>
                        </button>
                        <button
                          type="button"
                          className="packing-action-button packing-action-print"
                          onClick={() => openDocumentPrintDialog(coaPreviewRef.current, coaDocumentType === 'invoice' ? coaInvoices : coaDeliveryChallans.map((row) => ({ invoice_id: row.delivery_challan_id, invoice_number: row.delivery_challan_number })), coaDocumentType === 'invoice' ? coaInvoiceId : coaDeliveryChallanId, 'COA')}
                        >
                          <Printer aria-hidden="true" />
                          <span>Print COA</span>
                        </button>
                      </>
                    )}
                  </div>
                  {coaPersistenceError && !coaInvoiceDetailError && (
                    <p className="coa-persistence-message" role="alert">{coaPersistenceError}</p>
                  )}
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
                  {coaRegenerateConfirmationOpen && savedCoa && (
                    <div className="admin-dialog-backdrop" role="presentation">
                      <div
                        className="admin-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="coa-regenerate-title"
                      >
                        <div className="admin-dialog-icon">
                          <FlaskConical size={18} aria-hidden="true" />
                        </div>
                        <div className="admin-dialog-copy">
                          <h3 id="coa-regenerate-title">Re-generate COA?</h3>
                          <p>
                            COA has already been generated for this invoice. Re-generating will overwrite the previously saved COA values. Do you want to continue?
                          </p>
                        </div>
                        <div className="admin-dialog-actions">
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => setCoaRegenerateConfirmationOpen(false)}
                            disabled={coaSaving}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="primary"
                            onClick={() => persistAndGenerateCoa(true)}
                            disabled={coaSaving}
                          >
                            {coaSaving ? 'Re-generating...' : 'Re-generate COA'}
                          </button>
                        </div>
                      </div>
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
                        <div className="admin-panel-toolbar">
                          <button type="button" onClick={openCreateRole}>
                            <UserPlus size={15} aria-hidden="true" />
                            <span>Create Role</span>
                          </button>
                        </div>
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
                        <p
                          className="admin-user-message"
                          title="SUPERADMIN automatically has access to all menus."
                        >
                          SUPERADMIN automatically has access to all menus.
                        </p>
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
                                      const isProtectedSuperadminAccess = role.name === 'SUPERADMIN'
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
                                            title={isProtectedSuperadminAccess
                                              ? 'SUPERADMIN automatically has access to all menus.'
                                              : undefined}
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
              {createRoleOpen && (
                <div className="admin-dialog-backdrop" role="presentation">
                  <div
                    className="admin-dialog admin-create-user-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admin-create-role-title"
                  >
                    <div className="admin-dialog-copy">
                      <h3 id="admin-create-role-title">Create role</h3>
                      <p>Add a role for user assignment and menu access configuration.</p>
                    </div>
                    <form onSubmit={createRole} className="admin-create-user-form">
                      <label htmlFor="admin-create-role-name">Role Name</label>
                      <input
                        id="admin-create-role-name"
                        value={createRoleName}
                        onChange={(event) => {
                          setCreateRoleName(event.target.value.toUpperCase())
                          setCreateRoleNameError('')
                        }}
                        disabled={creatingRole}
                        maxLength={50}
                        autoFocus
                        required
                      />
                      {createRoleNameError && (
                        <p className="admin-field-error">{createRoleNameError}</p>
                      )}

                      <label htmlFor="admin-create-role-description">Description</label>
                      <input
                        id="admin-create-role-description"
                        value={createRoleDescription}
                        onChange={(event) => setCreateRoleDescription(event.target.value)}
                        disabled={creatingRole}
                        maxLength={300}
                      />

                      <label htmlFor="admin-create-role-status">Status</label>
                      <select
                        id="admin-create-role-status"
                        value={createRoleStatus}
                        onChange={(event) => setCreateRoleStatus(
                          event.target.value === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
                        )}
                        disabled={creatingRole}
                        required
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="INACTIVE">INACTIVE</option>
                      </select>

                      <div className="admin-dialog-actions">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setCreateRoleOpen(false)}
                          disabled={creatingRole}
                        >
                          Cancel
                        </button>
                        <button type="submit" className="primary" disabled={creatingRole}>
                          Create Role
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
                        setPackingDocumentType('')
                        setPackingInvoiceId('')
                        setPackingDeliveryChallanId('')
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
                    <label htmlFor="packing-document-type">Document Type</label>
                    <select
                      id="packing-document-type"
                      value={packingDocumentType}
                      onChange={(event) => {
                        setPackingDocumentType(event.target.value as '' | 'invoice' | 'delivery-challan')
                        setPackingInvoiceId('')
                        setPackingDeliveryChallanId('')
                        setPackingPreviewTemplate(null)
                        setPackingPreviewError('')
                      }}
                      disabled={!packingCustomerId}
                    >
                      <option value="">Select document type</option>
                      <option value="invoice">Invoice</option>
                      <option value="delivery-challan">Delivery Challan</option>
                    </select>
                  </div>
                  <div className="coc-form-field">
                    <label htmlFor="packing-document-number">{packingDocumentType === 'invoice' ? 'Invoice Number' : packingDocumentType === 'delivery-challan' ? 'Delivery Challan Number' : 'Document Number'}</label>
                    <select
                      id="packing-document-number"
                      value={packingDocumentType === 'invoice' ? packingInvoiceId : packingDeliveryChallanId}
                      onChange={(event) => {
                        if (packingDocumentType === 'invoice') setPackingInvoiceId(event.target.value)
                        else setPackingDeliveryChallanId(event.target.value)
                        setPackingPreviewTemplate(null)
                        setPackingPreviewError('')
                      }}
                      disabled={!packingCustomerId || (packingDocumentType === 'invoice'
                        ? packingInvoicesLoading || Boolean(packingInvoicesError)
                        : packingDocumentType === 'delivery-challan'
                          ? packingDeliveryChallansLoading || Boolean(packingDeliveryChallansError)
                          : true)}
                    >
                      <option value="">
                        {!packingCustomerId
                          ? 'Select customer first'
                          : !packingDocumentType
                            ? 'Select document type first'
                            : packingDocumentType === 'invoice'
                              ? packingInvoicesLoading ? 'Loading invoices...' : packingInvoicesError ? 'Unable to load invoices' : packingInvoices.length === 0 ? 'No invoices found' : 'Select invoice'
                              : packingDeliveryChallansLoading ? 'Loading Delivery Challans...' : packingDeliveryChallansError ? 'Unable to load Delivery Challans' : packingDeliveryChallans.length === 0 ? 'No Delivery Challans found' : 'Select Delivery Challan'}
                      </option>
                      {(packingDocumentType === 'invoice' ? packingInvoices : packingDeliveryChallans).map((document) => (
                        <option key={'invoice_id' in document ? document.invoice_id : document.delivery_challan_id} value={'invoice_id' in document ? document.invoice_id : document.delivery_challan_id}>
                          {'invoice_number' in document ? document.invoice_number : document.delivery_challan_number}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(packingDocumentType === 'invoice' ? packingInvoicesError : packingDeliveryChallansError) && (
                    <p style={{ margin: '0.5rem 0 0', color: '#b42318', fontSize: '0.9rem' }}>
                      {packingDocumentType === 'invoice' ? packingInvoicesError : packingDeliveryChallansError}
                    </p>
                  )}
                  <div className="coc-action-row packing-slip-actions">
                    <button
                      type="button"
                      className="packing-action-button packing-action-primary"
                      onClick={generatePackingSlip}
                      disabled={!(packingDocumentType === 'invoice' ? packingInvoiceId : packingDeliveryChallanId)}
                    >
                      <PackageCheck aria-hidden="true" />
                      <span>Generate Packing Slip</span>
                    </button>
                    {packingPreviewTemplate && !packingPreviewLoading && !packingPreviewError && (
                      <>
                        <button
                          type="button"
                          className="packing-action-button packing-action-pdf"
                          onClick={() => openDocumentPrintDialog(packingPreviewRef.current, packingDocumentType === 'invoice' ? packingInvoices : packingDeliveryChallans.map((row) => ({ invoice_id: row.delivery_challan_id, invoice_number: row.delivery_challan_number })), packingDocumentType === 'invoice' ? packingInvoiceId : packingDeliveryChallanId, 'PackingSlip')}
                        >
                          <FileDown aria-hidden="true" />
                          <span>Save As PDF</span>
                        </button>
                        <button
                          type="button"
                          className="packing-action-button packing-action-print"
                          onClick={() => openDocumentPrintDialog(packingPreviewRef.current, packingDocumentType === 'invoice' ? packingInvoices : packingDeliveryChallans.map((row) => ({ invoice_id: row.delivery_challan_id, invoice_number: row.delivery_challan_number })), packingDocumentType === 'invoice' ? packingInvoiceId : packingDeliveryChallanId, 'PackingSlip')}
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
