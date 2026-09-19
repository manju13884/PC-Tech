export type ProcessStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

export interface ProductionProcessStatus {
  name: string
  status: ProcessStatus
}

export interface ProductionJobStatus {
  id: number
  jobNumber: string
  status: string
  processes: ProductionProcessStatus[]
}

export interface ProductionActivityStatus {
  id: number
  soLineItemId: string
  quantity: number
  jobs: ProductionJobStatus[]
}

export type OverallProductionStatus = 'Not Planned' | 'Planned' | 'Not Started' | 'In Progress' | 'Completed'

export function deriveOverallProductionStatus(activities: ProductionActivityStatus[]): OverallProductionStatus {
  if (!activities.length) return 'Not Planned'
  const jobs = activities.flatMap((activity) => activity.jobs)
  if (!jobs.length) return 'Planned'
  const processes = jobs.flatMap((job) => job.processes)
  const everyActivityHasAJob = activities.every((activity) => activity.jobs.length > 0)
  const allJobsCompleted = everyActivityHasAJob && jobs.every((job) => job.status === 'COMPLETED')
  const allProcessesCompleted = everyActivityHasAJob && processes.length > 0 && processes.every((process) => process.status === 'COMPLETED')
  if (allJobsCompleted || allProcessesCompleted) return 'Completed'
  const hasProgress = jobs.some((job) => job.status === 'IN_PROGRESS')
    || processes.some((process) => process.status === 'IN_PROGRESS' || process.status === 'COMPLETED')
  return hasProgress ? 'In Progress' : 'Not Started'
}

interface StatusResponse {
  activities?: unknown
  error?: unknown
}

export async function getSoProductionStatus(salesOrderId: string): Promise<ProductionActivityStatus[]> {
  const params = new URLSearchParams({ sales_order_id: salesOrderId })
  const response = await fetch(`/api/so-production-status?${params.toString()}`, { credentials: 'include' })
  const payload: unknown = await response.json().catch(() => ({}))
  const value = payload && typeof payload === 'object' ? payload as StatusResponse : {}
  if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : 'Unable to load production status.')
  return Array.isArray(value.activities) ? value.activities as ProductionActivityStatus[] : []
}
