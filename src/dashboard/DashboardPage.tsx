import type { ReactNode } from 'react'
import { AlertTriangle, BarChart3, Calculator, ChevronRight, CircleDollarSign, ClipboardCheck, ClipboardList, Clock3, FileText, PackageCheck, ShoppingCart, TrendingUp, Users, Zap, type LucideIcon } from 'lucide-react'
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

function Panel({ title, icon: Icon, children, className = '' }: { title: string; icon: LucideIcon; children: ReactNode; className?: string }) {
  return <section className={`erp-dashboard-panel ${className}`}><header><span className="erp-panel-icon" aria-hidden="true"><Icon size={15} /></span><h3>{title}</h3></header>{children}</section>
}

export default function DashboardPage({ menuAccess, actions, onNavigate }: DashboardPageProps) {
  const canViewPurchases = ['paper-purchase-request', 'paper-purchase-request-approvals', 'paper-po-calculation'].some((key) => menuAccess.includes(key))
  const canViewLeads = menuAccess.includes('lead-management')
  const { summary, purchases, purchaseError, leads, leadError, loading, refreshedAt } = useDashboardData(canViewPurchases, canViewLeads)
  const sales = summary.salesOrders
  const finance = summary.invoices
  const financialYearStart = finance?.salesFinancialYearStartYear ?? getFinancialYear().startYear

  return (
    <div className="erp-dashboard">
      <header className="erp-dashboard-header">
        <div><h2>Dashboard</h2><p>Operational overview across sales, finance and purchases.</p></div>
        <div className="erp-dashboard-header-actions">
          <span>As of {formatIstDateTime(refreshedAt)}</span>
        </div>
      </header>

      <div className="erp-overview-grid">
        <Panel title="Sales Overview" icon={ShoppingCart} className="erp-summary-panel erp-summary-sales">
          {summary.errors.sales && <p className="erp-section-error">{summary.errors.sales}</p>}
          <div className="erp-kpi-grid">
            <KpiCard icon={ClipboardList} title="Open SO" value={sales ? String(sales.totals.openSalesOrderCount) : '—'} tone="info" loading={loading && !sales} />
            <KpiCard icon={BarChart3} title="Total SO Value" value={sales ? formatCompactIndianCurrency(sales.totals.totalSalesOrderAmount) : '—'} valueTitle={sales ? formatIndianCurrency(sales.totals.totalSalesOrderAmount) : undefined} tone="finance" loading={loading && !sales} />
            <KpiCard icon={CircleDollarSign} title="Open SO Value" value={sales ? formatCompactIndianCurrency(sales.totals.openSalesOrderValue) : '—'} valueTitle={sales ? formatIndianCurrency(sales.totals.openSalesOrderValue) : undefined} subtitle="Yet to be billed" tone="success" loading={loading && !sales} />
            <KpiCard icon={AlertTriangle} title="Overdue Delivery" value="—" subtitle="Data not available" tone="warning" loading={false} />
          </div>
        </Panel>

        <Panel title="Finance & Invoices" icon={CircleDollarSign} className="erp-summary-panel erp-summary-finance">
          {summary.errors.finance && <p className="erp-section-error">{summary.errors.finance}</p>}
          <div className="erp-kpi-grid">
            <KpiCard icon={AlertTriangle} title="Overdue Invoices" value={finance ? String(finance.overdueInvoiceCount) : '—'} tone="critical" loading={loading && !finance} />
            <KpiCard icon={CircleDollarSign} title="Overdue Amount" value={finance ? formatCompactIndianCurrency(finance.overdueInvoiceAmount) : '—'} tone="critical" loading={loading && !finance} />
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

        <Panel title="Production" icon={PackageCheck} className="erp-production-placeholder erp-summary-panel erp-summary-production">
          <div className="erp-kpi-grid"><KpiCard icon={PackageCheck} title="Pending Production" value="—" loading={false} /><KpiCard icon={ClipboardCheck} title="Due Today" value="—" loading={false} /><KpiCard icon={AlertTriangle} title="Production Overdue" value="—" loading={false} /></div>
        </Panel>
      </div>

      <div className="erp-analytics-grid">
        <Panel title={`Sales – FY ${financialYearStart}–${String(financialYearStart + 1).slice(-2)} (${finance ? formatIndianCurrency(finance.salesToDate) : '—'})`} icon={BarChart3}>
          <FinancialYearSalesChart points={finance?.salesTrend ?? []} loading={loading} />
        </Panel>
        <Panel title="Top Customers" icon={Users}>
          <ol className="erp-top-customers">{(finance?.topCustomers ?? []).map((customer) => <li key={customer.customerId}><span title={customer.customerName}>{customer.customerName.length > 8 ? `${customer.customerName.slice(0, 8)}...` : customer.customerName}</span><strong title={formatIndianCurrency(customer.amount)}>{formatCompactIndianCurrency(customer.amount)}</strong></li>)}</ol>
        </Panel>
      </div>

      <div className={`erp-secondary-grid${canViewLeads ? ' erp-secondary-grid-with-leads' : ''}`}>
        <Panel title="Sales Order Status" icon={ClipboardList}>
          <dl className="erp-status-list"><div><dt>Open</dt><dd>{sales?.statusCounts.open ?? '—'}</dd></div><div><dt>Partially Billed</dt><dd>{sales?.statusCounts.partiallyBilled ?? '—'}</dd></div><div><dt>Pending Dispatch</dt><dd>—</dd></div><div><dt>Overdue</dt><dd>—</dd></div></dl>
        </Panel>
        <Panel title="Receivable Ageing" icon={Clock3}>
          <dl className="erp-status-list">{(finance?.ageing ?? []).map((bucket) => <div key={bucket.label}><dt>{bucket.label}</dt><dd title={formatIndianCurrency(bucket.amount)}>{formatCompactIndianCurrency(bucket.amount)}</dd></div>)}{!finance && <div><dt>Ageing data</dt><dd>—</dd></div>}</dl>
        </Panel>
        {canViewLeads && (
          <Panel title="Lead Management" icon={Users}>
            {leadError && <p className="erp-section-error" role="alert">{leadError}</p>}
            <dl className="erp-status-list" aria-busy={loading}>
              <div><dt>Total Leads</dt><dd>{leads?.total ?? '—'}</dd></div>
              <div><dt>Active Leads</dt><dd>{leads?.active ?? '—'}</dd></div>
              <div><dt>Follow-ups Due Today</dt><dd>{leads?.dueToday ?? '—'}</dd></div>
              <div><dt>Overdue Follow-ups</dt><dd className={leads?.overdue ? 'erp-lead-overdue' : undefined}>{leads?.overdue ?? '—'}</dd></div>
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

export const dashboardActionIcons = { Calculator, ClipboardCheck, ClipboardList, FileText, PackageCheck, ShoppingCart, TrendingUp, CircleDollarSign, BarChart3 }
