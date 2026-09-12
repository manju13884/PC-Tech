import { getAuthenticatedUser } from '../lib/authenticatedUser';

interface Env {
  DB?: D1Database;
}
interface Context {
  request: Request;
  env: Env;
}
const allowedProcesses = ['Paper Cutting', 'Corrugation', 'Pasting', 'Board / Sheet Cutting', 'Printing', 'Creasing', 'RS4', 'Slotting', 'Die Cutting', 'Stitching / Gluing', 'Quality Inspection', 'Bundling / Packing'];
const reelProcesses = ['Paper Cutting', 'Corrugation'];

const json = (payload: unknown, status = 200) =>
  Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

async function permission(db: D1Database, roleId: number, roleName: string, edit = false) {
  if (roleName === 'SUPERADMIN') return true;
  const row = await db
    .prepare(
      `SELECT can_full, can_view, can_edit FROM role_menu_permissions
     WHERE role_id = ? AND menu_key = 'job-tracking'`,
    )
    .bind(roleId)
    .first<{ can_full: number; can_view: number; can_edit: number }>();
  return Boolean(row && (row.can_full === 1 || (edit ? row.can_edit === 1 : row.can_view === 1)));
}

const selectTrackedJobs = `
  SELECT card.id AS job_card_id, card.job_number, card.status AS job_status, card.created_at AS job_created_at,
    card.updated_at AS job_updated_at, card.supervisor_user_id, card.supervisor_name, card.quality_name, card.dispatch_name,
    card.box_weight_kg, card.manufactured_quantity, line.id AS production_plan_line_id, plan.plan_number, plan.plan_date,
    plan.status AS plan_status, plan.remarks AS plan_remarks, line.customer_name, line.sales_order_number,
    line.delivery_date, line.item_name, line.item_description, line.customer_po_number, line.production_quantity,
    line.two_ply_quantity, line.deckle_size, line.uom, line.product_type, line.ply,
    spec.polar_canvas_item_code AS specification_code, spec.product_name, spec.length_mm, spec.width_mm,
    spec.height_mm, spec.print_required, spec.print_colors, spec.notes AS specification_notes, spec.attributes_json,
    COALESCE((SELECT json_group_array(json_object(
      'process_entry_id', entry.id, 'process_name', entry.process_name, 'start_datetime', entry.start_datetime, 'end_datetime', entry.end_datetime,
      'in_quantity', entry.in_quantity, 'out_quantity', entry.out_quantity, 'employee_name', entry.employee_name,
      'in_quantity_2', entry.in_quantity_2, 'out_quantity_2', entry.out_quantity_2, 'employee_name_2', entry.employee_name_2,
      'reel_number', entry.reel_number, 'in_reel_weight', entry.in_reel_weight, 'out_reel_weight', entry.out_reel_weight,
      'remaining_reel_weight', entry.remaining_reel_weight, 'reel_number_2', entry.reel_number_2,
      'in_reel_weight_2', entry.in_reel_weight_2, 'out_reel_weight_2', entry.out_reel_weight_2,
      'remaining_reel_weight_2', entry.remaining_reel_weight_2,
      'inventory_stock_id', entry.inventory_stock_id, 'inventory_stock_id_2', entry.inventory_stock_id_2,
      'process_status', entry.process_status, 'completed_at', entry.completed_at
    )) FROM job_card_process_entries entry WHERE entry.job_card_id = card.id), '[]') AS process_entries_json
  FROM job_cards card
  INNER JOIN production_plan_lines line ON line.id = card.production_plan_line_id
  INNER JOIN production_plans plan ON plan.id = line.production_plan_id
  LEFT JOIN product_specification_records spec ON spec.id = line.approved_specification_revision_id
  WHERE plan.deleted_at IS NULL
  ORDER BY plan.plan_date DESC, card.id DESC`;

const availableReels = `SELECT stock.id AS inventory_stock_id, stock.material_no, stock.reel_number, stock.gsm, stock.bf,
  stock.reel_size_cm, stock.reel_weight_kg AS available_weight,
  reservation.job_card_id AS reserved_job_card_id, reservation.job_number AS reserved_job_number,
  CASE WHEN reservation.id IS NOT NULL THEN 'Reserved' ELSE 'Available' END AS reel_status
  FROM material_inventory_records stock
  LEFT JOIN inventory_reel_reservations reservation
    ON reservation.inventory_stock_id=stock.id AND reservation.status='ACTIVE'
  WHERE stock.status = 'Available' AND stock.reel_weight_kg > 0
  ORDER BY stock.reel_number, stock.material_no`;

async function trackedJobsAndReels(db: D1Database, user?: { id: number; fullName: string }) {
  const [jobs, reels] = await Promise.all([db.prepare(selectTrackedJobs).all(), db.prepare(availableReels).all()]);
  return { jobs: jobs.results ?? [], reels: reels.results ?? [], ...(user ? { currentUser: { id: user.id, fullName: user.fullName } } : {}) };
}

interface ProvisionalReel {
  process_entry_id: number;
  process_name: string;
  inventory_stock_id: number | null;
  reel_number: string | null;
  in_reel_weight: number | null;
  out_reel_weight: number | null;
  inventory_stock_id_2: number | null;
  reel_number_2: string | null;
  in_reel_weight_2: number | null;
  out_reel_weight_2: number | null;
}

async function completeProcess(db: D1Database, jobCardId: number, processName: string, userId: number) {
  const job = await db.prepare('SELECT job_number, status FROM job_cards WHERE id = ?').bind(jobCardId).first<{ job_number: string; status: string }>();
  if (!job) return { error: 'Job Card was not found.', status: 404 };
  if (job.status === 'COMPLETED' || job.status === 'CANCELLED') return { error: 'This Job no longer allows Process changes.', status: 409 };
  const entry = await db
    .prepare(
      `SELECT id AS process_entry_id, process_name, inventory_stock_id, reel_number, in_reel_weight, out_reel_weight,
      inventory_stock_id_2, reel_number_2, in_reel_weight_2, out_reel_weight_2, process_status
     FROM job_card_process_entries WHERE job_card_id = ? AND process_name = ?`,
    )
    .bind(jobCardId, processName)
    .first<ProvisionalReel & { process_status: string }>();
  if (entry?.process_status === 'COMPLETED') return { success: true, movements: [] };
  const selected = entry
    ? [
        entry.inventory_stock_id
          ? {
              entry,
              slot: 1 as const,
              stockId: entry.inventory_stock_id,
              reelNumber: entry.reel_number ?? '',
              previous: Number(entry.in_reel_weight),
              out: entry.out_reel_weight,
            }
          : null,
        entry.inventory_stock_id_2
          ? {
              entry,
              slot: 2 as const,
              stockId: entry.inventory_stock_id_2,
              reelNumber: entry.reel_number_2 ?? '',
              previous: Number(entry.in_reel_weight_2),
              out: entry.out_reel_weight_2,
            }
          : null,
      ].filter((value): value is NonNullable<typeof value> => value !== null)
    : [];
  if (reelProcesses.includes(processName) && !selected.length)
    return {
      error: `Select Reel No. for ${processName} before completing the Process.`,
      status: 400,
    };
  if (new Set(selected.map((value) => value.stockId)).size !== selected.length) {
    return {
      error: 'The same Inventory Reel cannot be finalized more than once in a Process. Review the selected reels.',
      status: 409,
    };
  }
  const statements: D1PreparedStatement[] = [];
  const movements: Array<{
    reelNumber: string;
    consumedWeight: number;
    remainingWeight: number;
  }> = [];
  const restoredReels: string[] = [];
  for (const value of selected) {
    const existing = await db
      .prepare('SELECT reel_number, consumed_weight, remaining_weight FROM job_tracking_reel_consumptions WHERE job_card_id=? AND process_name=? AND reel_slot=?')
      .bind(jobCardId, value.entry.process_name, value.slot)
      .first<{ reel_number: string; consumed_weight: number; remaining_weight: number }>();
    if (existing) {
      movements.push({ reelNumber: existing.reel_number, consumedWeight: Number(existing.consumed_weight), remainingWeight: Number(existing.remaining_weight) });
      continue;
    }
    if (value.out == null)
      return {
        error: `Enter Out Reel Weight for ${value.entry.process_name} Reel ${value.slot}.`,
        status: 400,
      };
    const reservation = await db
      .prepare(
        `SELECT id, job_card_id, job_number, process_entry_id, process_name, reel_slot FROM inventory_reel_reservations
       WHERE inventory_stock_id=? AND status='ACTIVE'`,
      )
      .bind(value.stockId)
      .first<{
        id: number;
        job_card_id: number;
        job_number: string;
        process_entry_id: number;
        process_name: string;
        reel_slot: number;
      }>();
    if (reservation && (reservation.job_card_id !== jobCardId || reservation.process_name !== value.entry.process_name || reservation.reel_slot !== value.slot)) {
      return {
        error: `Reel ${value.reelNumber} is already reserved for Job ${reservation.job_number} / ${reservation.process_name}. Please select another Reel.`,
        status: 409,
      };
    }
    if (reservation && reservation.process_entry_id !== value.entry.process_entry_id) {
      statements.push(
        db.prepare(`UPDATE inventory_reel_reservations SET process_entry_id=?,updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND status='ACTIVE'`).bind(value.entry.process_entry_id,reservation.id),
      );
      restoredReels.push(value.reelNumber);
    } else if (!reservation) {
      statements.push(
        db.prepare(`INSERT INTO inventory_reel_reservations
          (inventory_stock_id,reel_number,job_card_id,job_number,process_entry_id,process_name,reel_slot,status,reserved_by_user_id)
          VALUES (?,?,?,?,?,?,?,'ACTIVE',?)`)
          .bind(value.stockId,value.reelNumber,jobCardId,job.job_number,value.entry.process_entry_id,value.entry.process_name,value.slot,userId),
      );
      restoredReels.push(value.reelNumber);
    }
    const stock = await db
      .prepare(
        `SELECT id, material_type, reel_number, reel_weight_kg FROM material_inventory_records
       WHERE id=? AND status='Available'`,
      )
      .bind(value.stockId)
      .first<{
        id: number;
        material_type: string;
        reel_number: string;
        reel_weight_kg: number;
      }>();
    if (!stock || stock.reel_weight_kg <= 0)
      return {
        error: `Reel ${value.reelNumber} has no available stock. Please select another Reel.`,
        status: 409,
      };
    if (Math.abs(Number(stock.reel_weight_kg) - value.previous) > 0.000001)
      return {
        error: `Available weight for Reel ${value.reelNumber} has changed. Please review the Reel Weight and Out Reel Weight before completing the Process.`,
        status: 409,
      };
    const out = Number(value.out);
    if (!Number.isFinite(out) || out < 0) return { error: 'Enter a valid Out Reel Weight.', status: 400 };
    if (out > stock.reel_weight_kg)
      return {
        error: `Out Reel Weight cannot be greater than the available Reel Weight of ${stock.reel_weight_kg} KG.`,
        status: 400,
      };
    const consumed = stock.reel_weight_kg - out;
    if (consumed > 0)
      statements.push(
        db
          .prepare(
            `INSERT INTO job_tracking_reel_consumptions
        (job_card_id, process_entry_id, process_name, reel_slot, inventory_stock_id, reel_number,
         previous_weight, out_reel_weight, consumed_weight, remaining_weight, created_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(jobCardId, value.entry.process_entry_id, value.entry.process_name, value.slot, stock.id, stock.reel_number, stock.reel_weight_kg, out, consumed, out, userId),
        db
          .prepare(
            `INSERT INTO inventory_stock_ledger
        (transaction_type, reference_type, reference_id, reference_number, material_type, inventory_stock_id,
         movement, quantity, uom, previous_stock, revised_stock, reason, remarks, created_by_user_id, approved_by_user_id)
        VALUES ('PRODUCTION_CONSUMPTION', 'JOB_PROCESS',
          (SELECT id FROM job_tracking_reel_consumptions WHERE job_card_id=? AND process_name=? AND reel_slot=?),
          ?, ?, ?, 'OUT', ?, 'KG', ?, ?, 'Production reel consumption', ?, ?, ?)`,
          )
          .bind(jobCardId, value.entry.process_name, value.slot, `${job.job_number} / ${processName}`, stock.material_type, stock.id, consumed, stock.reel_weight_kg, out, `${value.entry.process_name} | ${stock.reel_number}`, userId, userId),
      );
    statements.push(
      db
        .prepare(
          `UPDATE material_inventory_records SET status=CASE WHEN ? <= 0 THEN 'Consumed' ELSE 'Available' END,
       updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        )
        .bind(out, stock.id),
    );
    movements.push({
      reelNumber: stock.reel_number,
      consumedWeight: consumed,
      remainingWeight: out,
    });
  }
  statements.push(
    db
      .prepare(
        `UPDATE inventory_reel_reservations SET status='RELEASED', released_by_user_id=?, released_at=CURRENT_TIMESTAMP,
     release_reason='PROCESS_COMPLETED', updated_at=CURRENT_TIMESTAMP
     WHERE job_card_id=? AND process_name=? AND status='ACTIVE'`,
      )
      .bind(userId, jobCardId, processName),
  );
  statements.push(
    db
      .prepare(
        `INSERT INTO job_card_process_entries
    (job_card_id, process_name, process_status, completed_by_user_id, completed_at, updated_by_user_id)
    VALUES (?, ?, 'COMPLETED', ?, CURRENT_TIMESTAMP, ?)
    ON CONFLICT(job_card_id,process_name) DO UPDATE SET process_status='COMPLETED', completed_by_user_id=excluded.completed_by_user_id,
      completed_at=CURRENT_TIMESTAMP, updated_by_user_id=excluded.updated_by_user_id, updated_at=CURRENT_TIMESTAMP`,
      )
      .bind(jobCardId, processName, userId, userId),
  );
  statements.push(db.prepare('UPDATE job_cards SET updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(jobCardId));
  try {
    await db.batch(statements);
  } catch (error) {
    if (error instanceof Error && error.message.includes('stock_balance_changed')) {
      return {
        error: 'Available Reel weight has changed. Please review the Reel Weight and Out Reel Weight before completing the Process.',
        status: 409,
      };
    }
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      const holder = await db.prepare(`SELECT job_number,process_name FROM inventory_reel_reservations
        WHERE inventory_stock_id IN (${selected.map(() => '?').join(',')}) AND status='ACTIVE' LIMIT 1`).bind(...selected.map((value) => value.stockId)).first<{job_number:string;process_name:string}>();
      if (holder) return { error: `A selected Reel is already reserved for Job ${holder.job_number} / ${holder.process_name}. Please select another Reel.`, status: 409 };
    }
    console.error('[job-tracking] Process completion consumption failed', {
      jobCardId,
      processName,
      message: error instanceof Error ? error.message : 'Unknown database error',
    });
    return {
      error: 'Process could not be completed because Inventory could not be updated. No stock changes were made.',
      status: 500,
    };
  }
  return { success: true, movements, restoredReels };
}

export async function onRequestGet(context: Context): Promise<Response> {
  const db = context.env.DB;
  if (!db) return json({ error: 'Job Tracking database is unavailable.' }, 503);
  const user = await getAuthenticatedUser(context.request, db);
  if (!user) return json({ error: 'Authentication required.' }, 401);
  if (!(await permission(db, user.roleId, user.roleName))) return json({ error: 'Job Tracking view access is required.' }, 403);
  return json(await trackedJobsAndReels(db, user));
}

export async function onRequestPatch(context: Context): Promise<Response> {
  const db = context.env.DB;
  if (!db) return json({ error: 'Job Tracking database is unavailable.' }, 503);
  const user = await getAuthenticatedUser(context.request, db);
  if (!user) return json({ error: 'Authentication required.' }, 401);
  if (!(await permission(db, user.roleId, user.roleName, true))) return json({ error: 'Job Tracking edit access is required.' }, 403);
  const body = await context.request.json<Record<string, unknown>>().catch(() => ({}));
  const jobCardId = Number(body.jobCardId);
  if (body.action === 'setProcessStatus') {
    const processName = typeof body.processName === 'string' ? body.processName.trim() : '';
    const processStatus = typeof body.processStatus === 'string' ? body.processStatus.trim().toUpperCase() : '';
    const processEntryId = body.processEntryId == null ? null : Number(body.processEntryId);
    if (!Number.isInteger(jobCardId) || jobCardId <= 0 || !allowedProcesses.includes(processName) || !['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(processStatus)) {
      return json({ error: 'Select a valid Process status.' }, 400);
    }
    const job = await db.prepare('SELECT status FROM job_cards WHERE id=?').bind(jobCardId).first<{ status: string }>();
    if (!job) return json({ error: 'Job Card was not found.' }, 404);
    if (job.status === 'COMPLETED' || job.status === 'CANCELLED') return json({ error: 'This Job no longer allows Process changes.' }, 409);
    const current = await db.prepare('SELECT process_status FROM job_card_process_entries WHERE job_card_id=? AND process_name=?').bind(jobCardId, processName).first<{ process_status: string }>();
    if (processEntryId != null) {
      if (!Number.isInteger(processEntryId) || processEntryId <= 0) return json({ error: 'Select a valid Job Process.' }, 400);
      const identified = await db.prepare('SELECT id FROM job_card_process_entries WHERE id=? AND job_card_id=? AND process_name=?').bind(processEntryId, jobCardId, processName).first();
      if (!identified) return json({ error: 'The selected Job Process could not be found. Refresh the Job Card and try again.' }, 409);
    }
    if (current?.process_status === 'COMPLETED') {
      if (processStatus === 'COMPLETED') {
        return json({ success: true, processName, movements: [], ...(await trackedJobsAndReels(db)) });
      }
      return json({ error: 'Completed Process details are locked and cannot be changed.' }, 409);
    }
    if (processStatus === 'COMPLETED') {
      const completion = await completeProcess(db, jobCardId, processName, user.id);
      if ('error' in completion) return json({ error: completion.error }, completion.status);
      return json({
        success: true,
        processName,
        movements: completion.movements,
        reservationMessage: completion.restoredReels.length ? `Reel ${completion.restoredReels.join(', ')} reservation was restored for this Process.` : undefined,
        ...(await trackedJobsAndReels(db)),
      });
    }
    const saved = await db
      .prepare(
        `INSERT INTO job_card_process_entries (job_card_id,process_name,process_status,updated_by_user_id)
      VALUES (?,?,?,?) ON CONFLICT(job_card_id,process_name) DO UPDATE SET process_status=excluded.process_status,
      updated_by_user_id=excluded.updated_by_user_id,updated_at=CURRENT_TIMESTAMP`,
      )
      .bind(jobCardId, processName, processStatus, user.id)
      .run();
    if (!saved.success) return json({ error: 'Process status could not be updated. Please try again.' }, 500);
    const persisted = await db
      .prepare('SELECT id AS process_entry_id, process_status FROM job_card_process_entries WHERE job_card_id=? AND process_name=?')
      .bind(jobCardId, processName)
      .first<{ process_entry_id: number; process_status: string }>();
    if (!persisted || persisted.process_status !== processStatus) {
      return json({ error: 'Process status could not be updated. Please try again.' }, 500);
    }
    return json({ success: true, processName, processEntryId: persisted.process_entry_id, processStatus: persisted.process_status, ...(await trackedJobsAndReels(db)) });
  }
  if (body.action === 'selectReel' || body.action === 'saveReelWeight') {
    const processName = typeof body.processName === 'string' ? body.processName.trim() : '';
    const reelSlot = Number(body.reelSlot);
    if (!Number.isInteger(jobCardId) || jobCardId <= 0 || !['Paper Cutting', 'Corrugation'].includes(processName) || ![1, 2].includes(reelSlot) || (reelSlot === 2 && processName !== 'Corrugation')) {
      return json({ error: 'Select a valid Job Card process reel.' }, 400);
    }
    const stockIdColumn = reelSlot === 2 ? 'inventory_stock_id_2' : 'inventory_stock_id';
    const reelColumn = reelSlot === 2 ? 'reel_number_2' : 'reel_number';
    const inColumn = reelSlot === 2 ? 'in_reel_weight_2' : 'in_reel_weight';
    const outColumn = reelSlot === 2 ? 'out_reel_weight_2' : 'out_reel_weight';
    const remainingColumn = reelSlot === 2 ? 'remaining_reel_weight_2' : 'remaining_reel_weight';
    const jobStatus = await db
      .prepare(
        `SELECT card.status, entry.process_status FROM job_cards card
      LEFT JOIN job_card_process_entries entry ON entry.job_card_id=card.id AND entry.process_name=? WHERE card.id=?`,
      )
      .bind(processName, jobCardId)
      .first<{ status: string; process_status: string | null }>();
    if (!jobStatus) return json({ error: 'Job Card was not found.' }, 404);
    if (jobStatus.status === 'COMPLETED') return json({ error: 'Completed Job reel details are read-only.' }, 409);
    if (jobStatus.status === 'CANCELLED') return json({ error: 'Cancelled Job reel details are read-only.' }, 409);
    if (jobStatus.process_status === 'COMPLETED') return json({ error: 'Completed Process reel details are read-only.' }, 409);

    if (body.action === 'selectReel') {
      const inventoryStockId = Number(body.inventoryStockId);
      const previousReservation = await db
        .prepare(
          `SELECT id, inventory_stock_id FROM inventory_reel_reservations
         WHERE job_card_id=? AND process_name=? AND reel_slot=? AND status='ACTIVE'`,
        )
        .bind(jobCardId, processName, reelSlot)
        .first<{ id: number; inventory_stock_id: number }>();
      if (!Number.isInteger(inventoryStockId) || inventoryStockId <= 0) {
        await db.batch([
          db
            .prepare(
              `UPDATE inventory_reel_reservations SET status='RELEASED', released_by_user_id=?, released_at=CURRENT_TIMESTAMP,
            release_reason='REEL_REMOVED', updated_at=CURRENT_TIMESTAMP
            WHERE job_card_id=? AND process_name=? AND reel_slot=? AND status='ACTIVE'`,
            )
            .bind(user.id, jobCardId, processName, reelSlot),
          db
            .prepare(
              `UPDATE job_card_process_entries SET ${stockIdColumn}=NULL, ${reelColumn}=NULL, ${inColumn}=NULL,
            ${outColumn}=NULL, ${remainingColumn}=NULL, updated_by_user_id=?, updated_at=CURRENT_TIMESTAMP
            WHERE job_card_id=? AND process_name=?`,
            )
            .bind(user.id, jobCardId, processName),
          db.prepare('UPDATE job_cards SET updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(jobCardId),
        ]);
        return json({
          success: true,
          reservationMessage: 'Reel reservation released.',
          ...(await trackedJobsAndReels(db)),
        });
      }
      const reel =
        Number.isInteger(inventoryStockId) && inventoryStockId > 0
          ? await db
              .prepare(
                `SELECT id, reel_number, reel_weight_kg, status FROM material_inventory_records
            WHERE id = ?`,
              )
              .bind(inventoryStockId)
              .first<{
                id: number;
                reel_number: string;
                reel_weight_kg: number;
                status: string;
              }>()
          : null;
      if (reel && reel.reel_weight_kg <= 0)
        return json(
          {
            error: 'This Reel has no available stock. Please select another Reel.',
          },
          409,
        );
      if (!reel || reel.status !== 'Available')
        return json(
          {
            error: 'The selected Reel is not available. Please select another Reel.',
          },
          409,
        );
      const activeReservation = await db
        .prepare(
          `SELECT job_card_id, job_number, process_name, reel_slot FROM inventory_reel_reservations
         WHERE inventory_stock_id=? AND status='ACTIVE'`,
        )
        .bind(reel.id)
        .first<{
          job_card_id: number;
          job_number: string;
          process_name: string;
          reel_slot: number;
        }>();
      if (activeReservation && (activeReservation.job_card_id !== jobCardId || activeReservation.process_name !== processName || activeReservation.reel_slot !== reelSlot)) {
        return json(
          {
            error: `Reel ${reel.reel_number} is already reserved for Job ${activeReservation.job_number}. Please select another Reel.`,
          },
          409,
        );
      }
      if (activeReservation && previousReservation?.inventory_stock_id === reel.id) {
        return json({
          success: true,
          reservationMessage: `Reel ${reel.reel_number} is reserved for this Job and will not be available to other active Jobs.`,
          ...(await trackedJobsAndReels(db)),
        });
      }
      const job = await db.prepare('SELECT job_number FROM job_cards WHERE id=?').bind(jobCardId).first<{ job_number: string }>();
      try {
        await db.batch([
          db
            .prepare(
              `INSERT INTO job_card_process_entries (job_card_id, process_name, ${stockIdColumn}, ${reelColumn}, ${inColumn}, ${outColumn}, ${remainingColumn}, updated_by_user_id)
             VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)
             ON CONFLICT(job_card_id, process_name) DO UPDATE SET
               ${stockIdColumn}=excluded.${stockIdColumn}, ${reelColumn}=excluded.${reelColumn}, ${inColumn}=excluded.${inColumn},
               ${outColumn}=NULL, ${remainingColumn}=NULL, updated_by_user_id=excluded.updated_by_user_id, updated_at=CURRENT_TIMESTAMP`,
            )
            .bind(jobCardId, processName, reel.id, reel.reel_number, reel.reel_weight_kg, user.id),
          db
            .prepare(
              `UPDATE inventory_reel_reservations SET status='RELEASED', released_by_user_id=?, released_at=CURRENT_TIMESTAMP,
            release_reason='REEL_CHANGED', updated_at=CURRENT_TIMESTAMP
            WHERE job_card_id=? AND process_name=? AND reel_slot=? AND status='ACTIVE'`,
            )
            .bind(user.id, jobCardId, processName, reelSlot),
          db
            .prepare(
              `INSERT INTO inventory_reel_reservations
            (inventory_stock_id, reel_number, job_card_id, job_number, process_entry_id, process_name, reel_slot, status, reserved_by_user_id)
            VALUES (?, ?, ?, ?, (SELECT id FROM job_card_process_entries WHERE job_card_id=? AND process_name=?), ?, ?, 'ACTIVE', ?)`,
            )
            .bind(reel.id, reel.reel_number, jobCardId, job?.job_number ?? '', jobCardId, processName, processName, reelSlot, user.id),
          db.prepare('UPDATE job_cards SET updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(jobCardId),
        ]);
      } catch (error) {
        const holder = await db.prepare(`SELECT job_number FROM inventory_reel_reservations WHERE inventory_stock_id=? AND status='ACTIVE'`).bind(reel.id).first<{ job_number: string }>();
        if (holder)
          return json(
            {
              error: `Reel ${reel.reel_number} was reserved by another Job. Please refresh and select another Reel.`,
            },
            409,
          );
        console.error('[job-tracking] Reel reservation failed', {
          jobCardId,
          processName,
          reelSlot,
          message: error instanceof Error ? error.message : 'Unknown database error',
        });
        return json(
          {
            error: 'Unable to reserve the Reel. No Inventory quantity was changed.',
          },
          500,
        );
      }
      const reservationMessage = previousReservation ? `Previous Reel released. Reel ${reel.reel_number} is now reserved for this Job.` : `Reel ${reel.reel_number} is reserved for this Job and will not be available to other active Jobs.`;
      return json({
        success: true,
        reservationMessage,
        ...(await trackedJobsAndReels(db)),
      });
    }

    const outReelWeight = Number(body.outReelWeight);
    if (!Number.isFinite(outReelWeight) || outReelWeight < 0) {
      return json({ error: 'Enter a valid Out Reel Weight.' }, 400);
    }
    const entry = await db
      .prepare(
        `SELECT id, ${stockIdColumn} AS inventory_stock_id, ${inColumn} AS selected_weight
       FROM job_card_process_entries WHERE job_card_id = ? AND process_name = ?`,
      )
      .bind(jobCardId, processName)
      .first<{
        id: number;
        inventory_stock_id: number | null;
        selected_weight: number | null;
      }>();
    if (!entry?.inventory_stock_id) return json({ error: 'Select Reel No. before entering Out Reel Weight.' }, 400);
    const reservation = await db
      .prepare(
        `SELECT id FROM inventory_reel_reservations
       WHERE inventory_stock_id=? AND job_card_id=? AND process_name=? AND reel_slot=? AND status='ACTIVE'`,
      )
      .bind(entry.inventory_stock_id, jobCardId, processName, reelSlot)
      .first();
    if (!reservation)
      return json(
        {
          error: 'This Reel is no longer reserved for this Job. Please select the Reel again.',
        },
        409,
      );
    const reel = await db
      .prepare(
        `SELECT id, reel_weight_kg
       FROM material_inventory_records WHERE id = ? AND status = 'Available'`,
      )
      .bind(entry.inventory_stock_id)
      .first<{ id: number; reel_weight_kg: number }>();
    if (!reel || reel.reel_weight_kg <= 0)
      return json(
        {
          error: 'This Reel has no available stock. Please select another Reel.',
        },
        409,
      );
    if (Math.abs(Number(reel.reel_weight_kg) - Number(entry.selected_weight)) > 0.000001)
      return json(
        {
          error: `Available Reel weight has changed from ${entry.selected_weight} KG to ${reel.reel_weight_kg} KG. Please review the Reel details before completing the Process.`,
        },
        409,
      );
    if (outReelWeight > reel.reel_weight_kg) {
      return json(
        {
          error: `Out Reel Weight cannot be greater than the available Reel Weight of ${reel.reel_weight_kg} KG.`,
        },
        400,
      );
    }
    await db.batch([db.prepare(`UPDATE job_card_process_entries SET ${outColumn}=?, ${remainingColumn}=?, updated_by_user_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(outReelWeight, outReelWeight, user.id, entry.id), db.prepare('UPDATE job_cards SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(jobCardId)]);
    return json({ success: true, ...(await trackedJobsAndReels(db)) });
  }
  if (typeof body.footerField === 'string') {
    if (body.footerField === 'supervisor_name') {
      return json({ error: 'Supervisor is assigned from the logged-in user and is read-only in Production Job Tracking.' }, 403);
    }
    const allowedFooterFields = ['supervisor_name', 'quality_name', 'dispatch_name', 'box_weight_kg', 'manufactured_quantity'] as const;
    const footerField = allowedFooterFields.includes(body.footerField as (typeof allowedFooterFields)[number]) ? body.footerField : '';
    const value = typeof body.value === 'string' ? body.value.trim() : '';
    const isNumeric = footerField === 'box_weight_kg' || footerField === 'manufactured_quantity';
    const numericValue = Number(value);
    if (!Number.isInteger(jobCardId) || jobCardId <= 0 || !footerField || (isNumeric && value !== '' && (!Number.isFinite(numericValue) || numericValue < 0)) || (!isNumeric && value.length > 120)) return json({ error: 'Enter a valid Job Card completion value.' }, 400);
    const result = footerField === 'supervisor_name'
      ? await db
          .prepare('UPDATE job_cards SET supervisor_name=?, supervisor_user_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
          .bind(value || null, value === user.fullName ? user.id : null, jobCardId)
          .run()
      : await db
          .prepare(`UPDATE job_cards SET ${footerField} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .bind(isNumeric && value !== '' ? numericValue : value || null, jobCardId)
          .run();
    if (!result.meta.changes) return json({ error: 'Job Card was not found.' }, 404);
    const jobs = await db.prepare(selectTrackedJobs).all();
    return json({ success: true, jobs: jobs.results ?? [] });
  }
  if (typeof body.processName === 'string') {
    const processName = body.processName.trim();
    const allowedFields = ['start_datetime', 'end_datetime', 'in_quantity', 'out_quantity', 'employee_name', 'in_quantity_2', 'out_quantity_2', 'employee_name_2'] as const;
    const field = typeof body.field === 'string' && allowedFields.includes(body.field as (typeof allowedFields)[number]) ? body.field : '';
    const value = typeof body.value === 'string' ? body.value.trim() : '';
    const isDateTime = field === 'start_datetime' || field === 'end_datetime';
    const isQuantity = ['in_quantity', 'out_quantity', 'in_quantity_2', 'out_quantity_2'].includes(field);
    const numericValue = Number(value);
    if (!Number.isInteger(jobCardId) || jobCardId <= 0 || !allowedProcesses.includes(processName) || !field || (isDateTime && value !== '' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) || (isQuantity && value !== '' && (!Number.isFinite(numericValue) || numericValue < 0)) || ((field === 'employee_name' || field === 'employee_name_2') && value.length > 120) || (field.endsWith('_2') && processName !== 'Corrugation')) {
      return json({ error: 'Enter a valid process value.' }, 400);
    }
    const job = await db.prepare('SELECT id FROM job_cards WHERE id = ?').bind(jobCardId).first();
    if (!job) return json({ error: 'Job Card was not found.' }, 404);
    const completed = await db.prepare("SELECT id FROM job_card_process_entries WHERE job_card_id=? AND process_name=? AND process_status='COMPLETED'").bind(jobCardId, processName).first();
    if (completed)
      return json(
        {
          error: 'Completed Process details are locked and cannot be changed.',
        },
        409,
      );
    await db
      .prepare(
        `INSERT INTO job_card_process_entries (job_card_id, process_name, ${field}, updated_by_user_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(job_card_id, process_name) DO UPDATE SET
         ${field} = excluded.${field}, updated_by_user_id = excluded.updated_by_user_id, updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(jobCardId, processName, isQuantity && value !== '' ? numericValue : value || null, user.id)
      .run();
    await db.prepare('UPDATE job_cards SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(jobCardId).run();
    const jobs = await db.prepare(selectTrackedJobs).all();
    return json({ success: true, jobs: jobs.results ?? [] });
  }
  const status = typeof body.status === 'string' ? body.status.trim().toUpperCase() : '';
  if (!Number.isInteger(jobCardId) || jobCardId <= 0 || !['CREATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status)) {
    return json({ error: 'Select a valid Job Card status.' }, 400);
  }
  const currentJob = await db.prepare('SELECT status FROM job_cards WHERE id = ?').bind(jobCardId).first<{ status: string }>();
  if (!currentJob) return json({ error: 'Job Card was not found.' }, 404);
  if (currentJob.status === 'COMPLETED' && status !== 'COMPLETED') {
    return json(
      {
        error: 'Completed Jobs cannot be reopened. An authorized Job Reopen workflow is not configured.',
      },
      409,
    );
  }
  if (status === 'COMPLETED') {
    const activeReservation = await db.prepare("SELECT process_name FROM inventory_reel_reservations WHERE job_card_id=? AND status='ACTIVE' LIMIT 1").bind(jobCardId).first<{ process_name: string }>();
    if (activeReservation)
      return json(
        {
          error: `Complete the ${activeReservation.process_name} Process before completing this Job.`,
        },
        409,
      );
    const pendingReelProcess = await db
      .prepare(
        `SELECT process_name FROM job_card_process_entries
      WHERE job_card_id=? AND (inventory_stock_id IS NOT NULL OR inventory_stock_id_2 IS NOT NULL) AND process_status<>'COMPLETED' LIMIT 1`,
      )
      .bind(jobCardId)
      .first<{ process_name: string }>();
    if (pendingReelProcess)
      return json(
        {
          error: `Complete the ${pendingReelProcess.process_name} Process before completing this Job.`,
        },
        409,
      );
    await db.prepare("UPDATE job_cards SET status='COMPLETED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status<>'COMPLETED'").bind(jobCardId).run();
    return json({ success: true, ...(await trackedJobsAndReels(db)) });
  }
  if (status === 'CANCELLED') {
    const results = await db.batch([
      db
        .prepare(
          `UPDATE inventory_reel_reservations SET status='RELEASED', released_by_user_id=?, released_at=CURRENT_TIMESTAMP,
        release_reason='JOB_CANCELLED', updated_at=CURRENT_TIMESTAMP WHERE job_card_id=? AND status='ACTIVE'`,
        )
        .bind(user.id, jobCardId),
      db.prepare("UPDATE job_cards SET status='CANCELLED', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status<>'COMPLETED'").bind(jobCardId),
    ]);
    if (!results[1].meta.changes) return json({ error: 'Job Card status could not be changed.' }, 409);
    return json({
      success: true,
      reservationMessage: 'Job cancelled. Reel reservation released.',
      ...(await trackedJobsAndReels(db)),
    });
  }
  const result = await db.prepare(`UPDATE job_cards SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(status, jobCardId).run();
  if (!result.meta.changes) return json({ error: 'Job Card was not found.' }, 404);
  const jobs = await db.prepare(selectTrackedJobs).all();
  return json({ success: true, jobs: jobs.results ?? [] });
}
