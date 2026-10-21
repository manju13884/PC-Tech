import type { AuthenticatedUser } from './authenticatedUser'

// Snapshot all columns before resetting working records, including released reservation history.
export async function jobTrackingCancellationStatements(
  db: D1Database, jobCardId: number, user: AuthenticatedUser,
  cancellation: { job_number: string; status: string; production_plan_id: number },
) {
  const tables = ['job_cards', 'job_card_process_entries', 'inventory_reel_reservations'] as const
  const metadata = await Promise.all(tables.map(table => db.prepare(`PRAGMA table_info(${table})`).all<{name: string}>()))
  const object = (index: number, alias: string) => {
    const columns = metadata[index].results
    if (!columns.length) throw new Error('Cancellation snapshot schema is unavailable.')
    return `json_object(${columns.map(({name}) => `'${name.replaceAll("'", "''")}',${alias}."${name.replaceAll('"', '""')}"`).join(',')})`
  }
  const token = crypto.randomUUID()
  const guard = 'EXISTS(SELECT 1 FROM job_tracking_cancellation_snapshots WHERE cancellation_token=?)'
  return [
    db.prepare(`INSERT INTO job_tracking_cancellation_snapshots
      (cancellation_token,job_card_id,job_number,previous_status,job_card_json,process_entries_json,reel_reservations_json,cancelled_by_user_id,cancelled_by_name)
      SELECT ?,card.id,card.job_number,card.status,${object(0, 'card')},
        (SELECT json_group_array(${object(1, 'entry')}) FROM job_card_process_entries entry WHERE entry.job_card_id=card.id),
        (SELECT json_group_array(${object(2, 'reservation')}) FROM inventory_reel_reservations reservation WHERE reservation.job_card_id=card.id),?,?
      FROM job_cards card WHERE card.id=? AND card.status=? AND card.status<>'COMPLETED'
        AND COALESCE(card.manufactured_quantity,0)=0
        AND NOT EXISTS(SELECT 1 FROM job_card_process_entries entry WHERE entry.job_card_id=card.id
          AND (entry.process_status='COMPLETED' OR COALESCE(entry.out_quantity,0)>0 OR COALESCE(entry.out_quantity_2,0)>0))
        AND NOT EXISTS(SELECT 1 FROM job_tracking_reel_consumptions consumption WHERE consumption.job_card_id=card.id)`)
      .bind(token, user.id, user.fullName, jobCardId, cancellation.status),
    db.prepare(`DELETE FROM inventory_reel_reservations WHERE job_card_id=? AND ${guard}`).bind(jobCardId,token),
    db.prepare(`DELETE FROM job_card_process_entries WHERE job_card_id=? AND ${guard}`).bind(jobCardId,token),
    db.prepare(`INSERT INTO job_card_status_history (job_card_id,job_number,previous_status,new_status,reason,changed_by_user_id,changed_by_name)
      SELECT job_card_id,job_number,previous_status,'CANCELLED','Job Tracking cancelled and returned to Job Cards',cancelled_by_user_id,cancelled_by_name
      FROM job_tracking_cancellation_snapshots WHERE cancellation_token=?`).bind(token),
    db.prepare(`UPDATE job_cards SET status='CREATED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND ${guard}`).bind(jobCardId,token),
    db.prepare(`UPDATE production_plans SET closure_status='OPEN',closed_at=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND closure_status='CLOSED' AND ${guard} AND (NOT EXISTS (
        SELECT 1 FROM job_cards card INNER JOIN production_plan_lines line ON line.id=card.production_plan_line_id
        WHERE line.production_plan_id=production_plans.id
      ) OR EXISTS (
        SELECT 1 FROM job_cards card INNER JOIN production_plan_lines line ON line.id=card.production_plan_line_id
        WHERE line.production_plan_id=production_plans.id AND card.status<>'COMPLETED'
      ))`).bind(cancellation.production_plan_id,token),
  ]
}
