export const productionSummarySql = `
  SELECT COUNT(*) AS pendingProduction,
    COALESCE(SUM(CASE WHEN date(line.delivery_date) = ? THEN 1 ELSE 0 END), 0) AS dueToday,
    COALESCE(SUM(CASE WHEN date(line.delivery_date) < ? THEN 1 ELSE 0 END), 0) AS overdue
  FROM production_plan_lines line
  INNER JOIN production_plans plan ON plan.id = line.production_plan_id
  LEFT JOIN job_cards card ON card.production_plan_line_id = line.id
  WHERE plan.deleted_at IS NULL
    AND plan.status IN ('PLANNED', 'TAKEN_FOR_PRODUCTION', 'PARTIALLY_COMPLETED', 'ON_HOLD')
    AND plan.closure_status = 'OPEN'
    AND (card.id IS NULL OR card.status IN ('CREATED', 'IN_PROGRESS'))
`

export function productionSummaryDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}
