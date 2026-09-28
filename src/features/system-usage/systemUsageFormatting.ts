import { IST_TIME_ZONE } from '../../utils/dateTimeFormatting'

export function formatUsage(value: number | null | undefined, storage = false): string {
  if (value == null || !Number.isFinite(value) || value < 0) return 'Unavailable'
  if (!storage) return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0, useGrouping: true }).format(value)
  const units = ['Bytes', 'KB', 'MB', 'GB']
  const unit = value === 0 ? 0 : Math.min(3, Math.floor(Math.log(value) / Math.log(1000)))
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: unit === 0 ? 0 : 2 }).format(value / 1000 ** unit)} ${units[unit]}`
}

export function formatUsageTime(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Unavailable'
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  }).formatToParts(new Date(value)).map(part => [part.type, part.value]))
  return `${parts.day}-${parts.month.slice(0, 3)}-${parts.year} ${parts.hour}:${parts.minute}:${parts.second} ${parts.dayPeriod.toUpperCase()}`
}
