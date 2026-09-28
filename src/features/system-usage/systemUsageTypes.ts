export type UsageKey = 'zohoApi' | 'd1Database' | 'totalD1' | 'd1RowsRead' | 'd1RowsWritten'
export interface UsageMetric {
  current: number | null
  limit: number | null
  remaining: number | null
  asOf: string | null
  reason?: string
  limitReason?: string
}
export interface SystemUsage {
  environment: 'LOCAL' | 'STAGING' | 'PRODUCTION' | 'UNAVAILABLE'
  refreshedAt: string
  metrics: Record<UsageKey, UsageMetric>
}
