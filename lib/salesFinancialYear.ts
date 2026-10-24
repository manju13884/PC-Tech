export function getFinancialYear(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: 'numeric',
  }).formatToParts(now)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const startYear = month >= 4 ? year : year - 1
  return { startYear, endYear: startYear + 1 }
}

export function getFinancialYearSalesTrend(
  invoices: ReadonlyArray<{ date?: string; status?: string; total?: string | number }>,
  now = new Date(),
) {
  const { startYear } = getFinancialYear(now)
  const months = Array.from({ length: 12 }, (_, offset) => {
    const date = new Date(Date.UTC(startYear, 3 + offset, 1))
    return {
      key: date.toISOString().slice(0, 7),
      month: date.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }).slice(0, 3),
      amount: 0,
    }
  })
  for (const invoice of invoices) {
    if (['void', 'draft'].includes((invoice.status ?? '').trim().toLowerCase())) continue
    const date = (invoice.date ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) continue
    const month = months.find((point) => point.key === date.slice(0, 7))
    const total = Number(invoice.total)
    if (month && Number.isFinite(total)) month.amount += total
  }
  return months.map(({ month, amount }) => ({ month, amount }))
}

export function getFinancialYearSalesToDate(
  invoices: ReadonlyArray<{ date?: string; status?: string; total?: string | number }>,
  now = new Date(),
) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const today = `${value.year}-${value.month}-${value.day}`
  return getFinancialYearSalesTrend(invoices.filter((invoice) => (invoice.date ?? '').trim() <= today), now)
    .reduce((sum, point) => sum + point.amount, 0)
}
