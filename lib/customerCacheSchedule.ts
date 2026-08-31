const DAY_MS = 24 * 60 * 60 * 1000
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const REFRESH_TIME_IST_MS = 7 * 60 * 60 * 1000

export function getLatestCustomerRefreshBoundary(now = new Date()): number {
  const istNow = now.getTime() + IST_OFFSET_MS
  const istDayStart = Math.floor(istNow / DAY_MS) * DAY_MS
  const todayBoundary = istDayStart + REFRESH_TIME_IST_MS
  const latestIstBoundary = istNow >= todayBoundary ? todayBoundary : todayBoundary - DAY_MS
  return latestIstBoundary - IST_OFFSET_MS
}

export function isCurrentDailyCustomerCache(refreshedAt: string, now = new Date()): boolean {
  const refreshedTime = Date.parse(refreshedAt)
  return Number.isFinite(refreshedTime) && refreshedTime >= getLatestCustomerRefreshBoundary(now)
}
