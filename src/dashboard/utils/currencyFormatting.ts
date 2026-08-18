const fullCurrency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })

export function formatIndianCurrency(value: number): string {
  return fullCurrency.format(Number.isFinite(value) ? value : 0)
}

export function formatCompactIndianCurrency(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0
  if (Math.abs(safeValue) >= 10_000_000) return `₹${(safeValue / 10_000_000).toFixed(2)} Cr`
  if (Math.abs(safeValue) >= 100_000) return `₹${(safeValue / 100_000).toFixed(2)} L`
  return formatIndianCurrency(safeValue)
}
