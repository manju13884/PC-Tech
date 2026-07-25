PRAGMA foreign_keys = ON;

ALTER TABLE paper_purchase_requests ADD COLUMN rejected_by_user_id INTEGER;
ALTER TABLE paper_purchase_requests ADD COLUMN rejected_by_name TEXT;
ALTER TABLE paper_purchase_requests ADD COLUMN rejected_at TEXT;
ALTER TABLE paper_purchase_requests ADD COLUMN resubmitted_at TEXT;
ALTER TABLE paper_purchase_requests ADD COLUMN resubmission_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS paper_purchase_request_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_request_id INTEGER NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL
    CHECK (new_status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  action_type TEXT NOT NULL
    CHECK (action_type IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'RESUBMITTED')),
  action_reason TEXT,
  action_by_user_id INTEGER NOT NULL,
  action_by_name TEXT,
  action_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paper_request_id) REFERENCES paper_purchase_requests(id)
);

CREATE INDEX IF NOT EXISTS idx_paper_request_history_request_id
  ON paper_purchase_request_history(paper_request_id);
CREATE INDEX IF NOT EXISTS idx_paper_request_history_action_at
  ON paper_purchase_request_history(action_at);
CREATE INDEX IF NOT EXISTS idx_paper_request_history_new_status
  ON paper_purchase_request_history(new_status);

INSERT INTO paper_purchase_request_history (
  paper_request_id,
  previous_status,
  new_status,
  action_type,
  action_by_user_id,
  action_by_name,
  action_at,
  created_at
)
SELECT
  request.id,
  'DRAFT',
  request.request_status,
  'SUBMITTED',
  request.requested_by_user_id,
  request.requested_by_name,
  request.requested_at,
  request.created_at
FROM paper_purchase_requests AS request
WHERE NOT EXISTS (
  SELECT 1
  FROM paper_purchase_request_history AS history
  WHERE history.paper_request_id = request.id
    AND history.action_type = 'SUBMITTED'
);

INSERT INTO role_menu_permissions (
  role_id,
  menu_key,
  can_full,
  can_view,
  can_create,
  can_edit,
  can_delete,
  can_approve,
  created_at,
  updated_at
)
SELECT
  id,
  'paper-purchase-request-approvals',
  1,
  1,
  1,
  1,
  1,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM roles
WHERE name = 'SUPERADMIN'
ON CONFLICT(role_id, menu_key) DO UPDATE SET
  can_full = 1,
  can_view = 1,
  can_create = 1,
  can_edit = 1,
  can_delete = 1,
  can_approve = 1,
  updated_at = CURRENT_TIMESTAMP;
