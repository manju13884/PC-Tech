import type { ReactNode } from 'react'
import { CalendarDays, Target, Truck } from 'lucide-react'
import { AlertTriangle, BarChart3, Calculator, ChevronRight, IndianRupee, ClipboardCheck, ClipboardList, Clock3, FileText, PackageCheck, ShoppingCart, TrendingUp, Users, Zap, type LucideIcon } from 'lucide-react'
import { useDashboardData } from './hooks/useDashboardData'
import { formatCompactIndianCurrency, formatIndianCurrency } from './utils/currencyFormatting'
import { formatIstDateTime } from '../utils/dateTimeFormatting'
import { getFinancialYear } from '../../lib/salesFinancialYear'
import FinancialYearSalesChart from './FinancialYearSalesChart'

interface DashboardAction {
  key: string
  label: string
  description: string
  icon: LucideIcon
}

interface DashboardPageProps {
  menuAccess: string[]
  actions: DashboardAction[]
  onNavigate: (key: string) => void
}

function KpiCard({ title, value, valueTitle, subtitle, tone = 'info', loading, icon: Icon }: { title: string; value: string; valueTitle?: string; subtitle?: string; tone?: string; loading: boolean; icon?: LucideIcon }) {
  return (
    <article className={`erp-kpi-card tone-${tone}`}>
      <div className="erp-kpi-heading">{Icon && <span className="erp-kpi-icon" aria-hidden="true"><Icon size={15} /></span>}<span className="erp-kpi-title" title={title}>{title}</span></div>
      {loading ? <span className="erp-skeleton erp-skeleton-value" /> : <strong title={valueTitle ?? value} aria-label={valueTitle}>{value}</strong>}
      {subtitle && <em>{subtitle}</em>}
    </article>
  )
}

function Panel({ title, icon: Icon, children, className = '', subtitle, action }: { title: string; icon: LucideIcon; children: ReactNode; className?: string; subtitle?: string; action?: ReactNode }) {
  return <section className={`erp-dashboard-panel ${className}`}><header><span className="erp-panel-icon" aria-hidden="true"><Icon size={15} /></span><div className="erp-panel-heading"><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</header>{children}</section>
}

function StatusRow({ label, value, total, icon: Icon, tone }: { label: string; value?: number; total: number; icon: LucideIcon; tone: string }) {
  const share = value === undefined ? null : total > 0 ? value / total * 100 : 0
  return <div className={`erp-detail-row erp-detail-${tone}`}>
    <span className="erp-detail-icon" aria-hidden="true"><Icon size={17} /></span>
    <div className="erp-detail-metric"><dt>{label}</dt><div className="erp-detail-track" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(0, share ?? 0))}%` }} /></div></div>
    <dd className="erp-detail-count">{value ?? '—'}</dd><dd className="erp-detail-share" title={share === null ? 'Data not available' : 'Share of open sales orders'}>{share === null ? '—' : `${share.toFixed(0)}%`}</dd>
  </div>
}

export default function DashboardPage({ menuAccess, actions, onNavigate }: DashboardPageProps) {
  const canViewPurchases = ['paper-purchase-request', 'paper-purchase-request-approvals', 'paper-po-calculation'].some((key) => menuAccess.includes(key))
  const canViewLeads = menuAccess.includes('lead-management')
  const canViewProduction = ['production-planned', 'job-cards', 'job-tracking', 'so-production-status'].some((key) => menuAccess.includes(key))
  const { summary, purchases, purchaseError, leads, leadError, production, productionError, loading, refreshedAt } = useDashboardData(canViewPurchases, canViewLeads, canViewProduction)
  const sales = summary.salesOrders
  const finance = summary.invoices
  const financialYearStart = finance?.salesFinancialYearStartYear ?? getFinancialYear().startYear
  const ageingTotal = finance?.ageing.reduce((total, bucket) => total + bucket.amount, 0) ?? 0

  return (
    <div className="erp-dashboard">
      <header className="erp-dashboard-header">
        <div><h2>Dashboard</h2><p>Operational overview across sales, finance and purchases.</p></div>
        <div className="erp-dashboard-header-actions">
          <span>As of {formatIstDateTime(refreshedAt).replace(/\b(am|pm)\b/g, (period) => period.toUpperCase())}</span>
          <span className="erp-dashboard-financial-year"><CalendarDays size={14} aria-hidden="true" />Financial Year {financialYearStart}-{String(financialYearStart + 1).slice(-2)}</span>
        </div>
      </header>

      <div className="erp-overview-grid">
        <Panel title="Sales Overview" icon={BarChart3} className="erp-summary-panel erp-summary-sales">
          {summary.errors.sales && <p className="erp-section-error">{summary.errors.sales}</p>}
          <div className="erp-kpi-grid">
            <KpiCard icon={ClipboardList} title="Open SO" value={sales ? String(sales.totals.openSalesOrderCount) : '—'} tone="info" loading={loading && !sales} />
            <KpiCard icon={BarChart3} title="Total SO Value" value={sales ? formatCompactIndianCurrency(sales.totals.totalSalesOrderAmount) : '—'} valueTitle={sales ? formatIndianCurrency(sales.totals.totalSalesOrderAmount) : undefined} tone="finance" loading={loading && !sales} />
            <KpiCard icon={IndianRupee} title="Open SO Value" value={sales ? formatCompactIndianCurrency(sales.totals.openSalesOrderValue) : '—'} valueTitle={sales ? formatIndianCurrency(sales.totals.openSalesOrderValue) : undefined} subtitle="Yet to be billed" tone="success" loading={loading && !sales} />
            <KpiCard icon={AlertTriangle} title="Overdue Delivery" value="—" subtitle="Data not available" tone="warning" loading={false} />
          </div>
        </Panel>

        <Panel title="Finance & Invoices" icon={IndianRupee} className="erp-summary-panel erp-summary-finance">
          {summary.errors.finance && <p className="erp-section-error">{summary.errors.finance}</p>}
          <div className="erp-kpi-grid">
            <KpiCard icon={AlertTriangle} title="Overdue Invoices" value={finance ? String(finance.overdueInvoiceCount) : '—'} tone="critical" loading={loading && !finance} />
            <KpiCard icon={IndianRupee} title="Overdue Amount" value={finance ? formatCompactIndianCurrency(finance.overdueInvoiceAmount) : '—'} tone="critical" loading={loading && !finance} />
            <KpiCard icon={FileText} title="Draft Invoices" value={finance ? String(finance.draftInvoiceCount) : '—'} tone="warning" loading={loading && !finance} />
            <KpiCard icon={TrendingUp} title="Receivables" value={finance ? formatCompactIndianCurrency(finance.totalReceivables) : '—'} tone="finance" loading={loading && !finance} />
          </div>
        </Panel>
      </div>

      <div className="erp-operations-grid">
        {canViewPurchases && (
          <Panel title="Purchases" icon={ClipboardCheck} className="erp-summary-panel erp-summary-purchases">
            {purchaseError && <p className="erp-section-error">{purchaseError}</p>}
            <div className="erp-kpi-grid">
              <KpiCard icon={ClipboardCheck} title="Pending Approval" value={String(purchases?.pendingApproval ?? 0)} tone="warning" loading={loading && !purchases} />
              <KpiCard icon={ShoppingCart} title="Approved / Pending PO" value={String(purchases?.approvedPendingPo ?? 0)} tone="info" loading={loading && !purchases} />
              <KpiCard icon={AlertTriangle} title="Rejected / Correction" value={String(purchases?.rejected ?? 0)} tone="critical" loading={loading && !purchases} />
              <KpiCard icon={ClipboardList} title="Open Paper Requests" value={String(purchases?.openRequests ?? 0)} tone="finance" loading={loading && !purchases} />
            </div>
          </Panel>
        )}

        {canViewProduction && <Panel title="Production" icon={PackageCheck} className="erp-summary-panel erp-summary-production">
          {productionError && <p className="erp-section-error" role="alert">{productionError}</p>}
          <div className="erp-kpi-grid">
            <KpiCard icon={PackageCheck} title="Pending Production" value={production ? String(production.pendingProduction) : '—'} loading={loading && !production} />
            <KpiCard icon={ClipboardCheck} title="Due Today" value={production ? String(production.dueToday) : '—'} tone="warning" loading={loading && !production} />
            <KpiCard icon={AlertTriangle} title="Production Overdue" value={production ? String(production.overdue) : '—'} tone="critical" loading={loading && !production} />
          </div>
        </Panel>}
      </div>

      <div className="erp-analytics-grid">
        <Panel title={`Sales – FY ${financialYearStart}–${String(financialYearStart + 1).slice(-2)} (${finance ? formatIndianCurrency(finance.salesToDate) : '—'})`} icon={BarChart3}>
          <FinancialYearSalesChart points={finance?.salesTrend ?? []} loading={loading} />
        </Panel>
        <Panel title="Top Customers" icon={Users} className="erp-top-customers-panel">
          <table className="erp-customer-table" aria-label="Top customers by financial year sales">
            <colgroup><col className="erp-customer-rank-col" /><col className="erp-customer-name-col" /><col className="erp-customer-bar-col" /><col className="erp-customer-value-col" /><col className="erp-customer-share-col" /></colgroup>
            <thead><tr><th scope="col">#</th><th scope="col">Customer</th><th scope="col"><span className="erp-customer-bar-label">Sales mix</span></th><th scope="col">Sales Value</th><th scope="col">Share</th></tr></thead>
            <tbody>{(finance?.topCustomers ?? []).map((customer, index) => {
              const share = finance && finance.salesToDate > 0 ? Math.max(0, customer.amount / finance.salesToDate * 100) : 0
              return <tr key={customer.customerId} className={`erp-customer-tone-${index % 5}`}>
                <td><span className="erp-customer-rank">{index + 1}</span></td>
                <th scope="row" title={customer.customerName}><span className="erp-customer-name">{customer.customerName}</span></th>
                <td><div className="erp-customer-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, share)}%` }} /></div></td>
                <td className="erp-customer-value" title={formatIndianCurrency(customer.amount)}>{formatCompactIndianCurrency(customer.amount)}</td>
                <td><span className="erp-customer-share" title="Share of financial year sales">{share.toFixed(1)}%</span></td>
              </tr>
            })}</tbody>
          </table>
          {!finance?.topCustomers.length && <p className="erp-empty-state" role="status">{loading ? 'Loading customers…' : 'No customer sales data available.'}</p>}
        </Panel>
      </div>

      <div className={`erp-secondary-grid${canViewLeads ? ' erp-secondary-grid-with-leads' : ''}`}>
        <Panel title="Sales Order Status" icon={ClipboardList} subtitle="Current status of sales orders" className="erp-detail-panel erp-detail-sales">
          <dl className="erp-detail-list">
            <StatusRow label="Open" value={sales?.statusCounts.open} total={sales?.totals.openSalesOrderCount ?? 0} icon={FileText} tone="blue" />
            <StatusRow label="Partially Billed" value={sales?.statusCounts.partiallyBilled} total={sales?.totals.openSalesOrderCount ?? 0} icon={ClipboardList} tone="teal" />
            <StatusRow label="Pending Dispatch" total={0} icon={Truck} tone="amber" />
            <StatusRow label="Overdue" total={0} icon={AlertTriangle} tone="red" />
          </dl>
        </Panel>
        <Panel title="Receivable Ageing" icon={Clock3} subtitle="Outstanding receivables by ageing bucket" className="erp-detail-panel erp-detail-ageing">
          <dl className="erp-detail-list">{(finance?.ageing ?? []).map((bucket, index) => {
            const share = ageingTotal > 0 ? bucket.amount / ageingTotal * 100 : 0
            return <div key={bucket.label} className={`erp-detail-row erp-ageing-row erp-detail-${['teal', 'blue', 'amber', 'red'][index % 4]}`}>
              <dt className="erp-ageing-label">{bucket.label}</dt>
              <div className="erp-detail-track" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(0, share))}%` }} /></div>
              <dd className="erp-ageing-value"><strong title={formatIndianCurrency(bucket.amount)}>{formatCompactIndianCurrency(bucket.amount)}</strong><span>{share.toFixed(1)}%</span></dd>
            </div>
          })}</dl>
          {!finance && <p className="erp-empty-state">{loading ? 'Loading receivables…' : 'Ageing data is unavailable.'}</p>}
        </Panel>
        {canViewLeads && (
          <Panel title="Lead Management" icon={Users} subtitle="Lead pipeline overview" className="erp-detail-panel erp-detail-leads">
            {leadError && <p className="erp-section-error" role="alert">{leadError}</p>}
            <dl className="erp-lead-tiles" aria-busy={loading}>
              <div className="erp-lead-tile erp-detail-blue"><span className="erp-detail-icon" aria-hidden="true"><Users size={17} /></span><dt>Total Leads</dt><dd>{leads?.total ?? '—'}</dd></div>
              <div className="erp-lead-tile erp-detail-teal"><span className="erp-detail-icon" aria-hidden="true"><Target size={17} /></span><dt>Active Leads</dt><dd>{leads?.active ?? '—'}</dd></div>
              <div className="erp-lead-tile erp-detail-amber"><span className="erp-detail-icon" aria-hidden="true"><CalendarDays size={17} /></span><dt>Follow-ups Due Today</dt><dd>{leads?.dueToday ?? '—'}</dd></div>
              <div className="erp-lead-tile erp-detail-red"><span className="erp-detail-icon" aria-hidden="true"><Clock3 size={17} /></span><dt>Overdue Follow-ups</dt><dd>{leads?.overdue ?? '—'}</dd></div>
            </dl>
          </Panel>
        )}
      </div>

      <Panel title="Requires Attention" icon={AlertTriangle} className="erp-attention-panel">
        <div className="erp-attention-list">
          {(finance?.overdueInvoiceCount ?? 0) > 0 && <div className="critical"><AlertTriangle size={14} /><span><strong>{finance?.overdueInvoiceCount}</strong> overdue invoices require follow-up</span></div>}
          {canViewPurchases && (purchases?.pendingApproval ?? 0) > 0 && <button type="button" onClick={() => onNavigate('paper-purchase-request-approvals')}><AlertTriangle size={14} /><span><strong>{purchases?.pendingApproval}</strong> paper requests awaiting approval</span><em>Review <ChevronRight size={12} /></em></button>}
          {canViewPurchases && (purchases?.approvedPendingPo ?? 0) > 0 && menuAccess.includes('paper-po-calculation') && <button type="button" onClick={() => onNavigate('paper-po-calculation')}><AlertTriangle size={14} /><span><strong>{purchases?.approvedPendingPo}</strong> approved requests available for Paper PO</span><em>Create PO <ChevronRight size={12} /></em></button>}
          {(finance?.draftInvoiceCount ?? 0) > 0 && <div className="warning"><FileText size={14} /><span><strong>{finance?.draftInvoiceCount}</strong> draft invoices pending completion</span></div>}
          {!loading && !(finance?.overdueInvoiceCount || finance?.draftInvoiceCount || purchases?.pendingApproval || purchases?.approvedPendingPo) && <p className="erp-empty-state">No actions require attention.</p>}
        </div>
      </Panel>

      <Panel title="Quick Actions" icon={Zap}>
        <div className="erp-quick-actions">{actions.map((action) => <button type="button" key={action.key} onClick={() => onNavigate(action.key)}><action.icon size={15} /><span><strong>{action.label}</strong><small>{action.description}</small></span><ChevronRight size={13} /></button>)}</div>
      </Panel>
    </div>
  )
}

export const dashboardActionIcons = { Calculator, ClipboardCheck, ClipboardList, FileText, PackageCheck, ShoppingCart, TrendingUp, IndianRupee, BarChart3 }
