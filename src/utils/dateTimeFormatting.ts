const IST_TIME_ZONE = 'Asia/Kolkata'
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function asDate(value: string | number | Date): Date {
  if (value instanceof Date) return value
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)) {
    return new Date(`${value.replace(' ', 'T')}Z`)
  }
  return new Date(value)
}

function istParts(value: string | number | Date) {
  const date = asDate(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).formatToParts(date)
  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

export function formatIstDateTime(value: string | number | Date | null | undefined, fallback = '—'): string {
  if (value == null || value === '') return fallback
  const parts = istParts(value)
  if (!parts) return fallback
  const month = MONTH_NAMES[Number(parts.month) - 1]
  return `${parts.day}-${month}-${parts.year}, ${parts.hour}:${parts.minute} ${parts.dayPeriod.toLowerCase()}`
}

export function formatIstDate(value: string | number | Date | null | undefined, fallback = '—'): string {
  if (value == null || value === '') return fallback
  const parts = istParts(value)
  if (!parts) return fallback
  return `${parts.day}-${MONTH_NAMES[Number(parts.month) - 1]}-${parts.year}`
}

export function formatIstTime(value: string | number | Date | null | undefined, fallback = '—'): string {
  if (value == null || value === '') return fallback
  const parts = istParts(value)
  if (!parts) return fallback
  return `${parts.hour}:${parts.minute} ${parts.dayPeriod.toLowerCase()}`
}

export { IST_TIME_ZONE }
