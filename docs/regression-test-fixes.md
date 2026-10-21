# Baseline regression failures fixed

The previous full suite had seven failures on both the release and unchanged HEAD. They were outside the Lead Management release. All are now resolved.

| Area | Cause | Fix |
| --- | --- | --- |
| Job Tracking | Older assertions expected literal second-quantity labels and cancellation without working-record cleanup. | Verify current dynamic labels and guarded cancellation; archive a complete snapshot before resetting tracking. |
| Paper/GSM columns | Header checks rejected compact `<br />` markup despite the same visible labels. | Normalize header line breaks; retain per-layer GSM checks. |
| Product Specifications | Test required Promise.allSettled even though loaders now run independently with error handling. | Verify each loader and its failure handler. |
| Production Planned | Empty-row test expected 33 columns; the grid now has 34. | Match the current grid span. |
| Reel reservations | Test required JOB_CANCELLED in the API after cancellation moved to reset behavior. Released reservation history could also be lost during reset. | Preserve all original reservations and process fields in job_tracking_cancellation_snapshots with a JOB_CANCELLED reason and actor/timestamp. |
| Stock Report | Legacy Windows encoding produced invalid UTF-8 punctuation in labels. | Normalize affected punctuation to valid UTF-8. |
| 2 Ply Rolls | A broad regular expression mistook reading paper_layers inside INSERT ... SELECT for changing paper-layer definitions. | Check insert targets and columns instead of read references. |

Cancellation still returns an unproduced job to Job Cards. Migration 0068 creates the audit snapshot table. Snapshot creation, working-record cleanup, cancellation history and job/plan reset occur in one transaction. A fresh guard blocks cancellation if production transactions or job status changed; audit errors roll back all changes. Snapshot fields are generated from schema metadata so future working-record columns are retained too. Snapshot job identifiers intentionally remain independent of job deletion, preserving history after a later unplan.

Validation: 323 tests passed, zero failed; TypeScript, application build, Pages Functions compilation and migration audit passed. Apply migration 0068 through the existing guarded deployment workflow before serving the updated cancellation API.
