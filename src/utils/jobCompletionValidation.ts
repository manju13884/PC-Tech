type ProcessEntry = { process_name?: string; process_status?: string | null };

// Assignments live on the approved specification; entries use the existing
// (job_card_id, process_name) key and may not exist until a process is edited.
export function jobCompletionError(job: {
  job_number?: string | null;
  quality_name?: string | null;
  dispatch_name?: string | null;
  manufactured_quantity?: number | string | null;
  attributes_json?: string | null;
  process_entries_json?: string | null;
}): string | null {
  let stages: string[] = [];
  let entries: ProcessEntry[] = [];
  try {
    const attributes = JSON.parse(job.attributes_json || '{}');
    if (Array.isArray(attributes?.production_stages)) {
      stages = [...new Set<string>(attributes.production_stages.filter((stage: unknown) => typeof stage === 'string' && stage.trim()))];
    }
  } catch { /* Missing/invalid configuration must not permit completion. */ }
  try {
    const parsed = JSON.parse(job.process_entries_json || '[]');
    if (Array.isArray(parsed)) entries = parsed.filter((entry) => entry && typeof entry === 'object');
  } catch { /* Missing statuses are incomplete. */ }
  const missing: string[] = [];
  if (!job.quality_name?.trim()) missing.push('Quality');
  if (!job.dispatch_name?.trim()) missing.push('Dispatch');
  if (!Number.isFinite(Number(job.manufactured_quantity)) || Number(job.manufactured_quantity) <= 0) missing.push('Manufactured Qty (must be greater than 0)');
  const requirements = missing.length ? ` Please complete the following: ${missing.join('; ')}.` : '';
  if (!stages.length) return `Job Card ${job.job_number} cannot be completed because no Job Process Steps are configured (Production Processes).${requirements}`;
  const incomplete = stages.filter((stage) => entries.find((entry) => entry.process_name === stage)?.process_status !== 'COMPLETED');
  if (!incomplete.length) return missing.length ? `Job cannot be completed.${requirements}` : null;
  const labels: Record<string, string> = { NOT_STARTED: 'Not Started', IN_PROGRESS: 'In Progress', CANCELLED: 'Cancelled' };
  const details = incomplete.map((stage) => {
    const status = entries.find((entry) => entry.process_name === stage)?.process_status || 'NOT_STARTED';
    return `${stage} – ${labels[status] || status}`;
  }).join('; ');
  return `Job Card ${job.job_number} cannot be completed. Production Processes: the following process steps are still incomplete: ${details}. Complete all Job Process Steps before completing the Job Card.${requirements}`;
}
