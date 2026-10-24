export interface LeadStatusSummary {
  status: string
  count: number
  due: number
  overdue: number
}

export function summarizeDashboardLeads(rows: LeadStatusSummary[]) {
  return rows.reduce((totals, row) => {
    totals.total += Number(row.count) || 0
    if (!['Converted', 'Closed', 'Not Qualified'].includes(row.status)) {
      totals.active += Number(row.count) || 0
      totals.dueToday += Number(row.due) || 0
      totals.overdue += Number(row.overdue) || 0
    }
    return totals
  }, { total: 0, active: 0, dueToday: 0, overdue: 0 })
}
