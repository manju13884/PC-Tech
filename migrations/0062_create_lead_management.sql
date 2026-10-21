PRAGMA foreign_keys = ON;
CREATE TABLE sales_leads (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 lead_number TEXT GENERATED ALWAYS AS ('LD-' || printf('%06d', id)) STORED UNIQUE,
 company TEXT NOT NULL, contact TEXT NOT NULL, mobile TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
 city TEXT NOT NULL, source TEXT NOT NULL, product TEXT NOT NULL DEFAULT '', remarks TEXT NOT NULL DEFAULT '',
 coordinator_id INTEGER NOT NULL REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'New' CHECK(status IN ('New','Contacted','Qualified','Quotation','Converted','Closed')),
 closure_reason TEXT NOT NULL DEFAULT '', customer_id TEXT,
 last_contact_date TEXT, next_follow_up_date TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_by INTEGER NOT NULL REFERENCES users(id), updated_by INTEGER NOT NULL REFERENCES users(id),
 version INTEGER NOT NULL DEFAULT 1, mutation_token TEXT NOT NULL UNIQUE,
 CHECK(length(trim(company))>0 AND length(trim(contact))>0 AND length(trim(city))>0),
 CHECK(length(trim(mobile))>0 OR length(trim(email))>0),
 CHECK(status!='Closed' OR length(trim(closure_reason))>0),
 CHECK((status='Converted' AND customer_id IS NOT NULL) OR (status!='Converted' AND customer_id IS NULL))
);
CREATE INDEX idx_sales_leads_coordinator ON sales_leads(coordinator_id,created_at);
CREATE INDEX idx_sales_leads_status ON sales_leads(status);
CREATE INDEX idx_sales_leads_follow_up ON sales_leads(next_follow_up_date);
CREATE TABLE sales_lead_activities (
 id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id INTEGER NOT NULL REFERENCES sales_leads(id),
 contact_date TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('Call','Email','WhatsApp','Visit','Meeting')),
 discussion TEXT NOT NULL, next_follow_up_date TEXT, next_action TEXT NOT NULL DEFAULT '',
 created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sales_lead_activities_lead ON sales_lead_activities(lead_id,id);
CREATE TABLE sales_lead_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id INTEGER NOT NULL REFERENCES sales_leads(id),
 event TEXT NOT NULL, previous_value TEXT, new_value TEXT,
 changed_by INTEGER NOT NULL REFERENCES users(id), changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sales_lead_history_lead ON sales_lead_history(lead_id,id);
CREATE TRIGGER sales_lead_created AFTER INSERT ON sales_leads BEGIN
 INSERT INTO sales_lead_history(lead_id,event,new_value,changed_by) VALUES(NEW.id,'Created','New',NEW.created_by);
 INSERT INTO sales_lead_history(lead_id,event,new_value,changed_by) VALUES(NEW.id,'Assignment',CAST(NEW.coordinator_id AS TEXT),NEW.created_by);
END;
CREATE TRIGGER sales_lead_changed AFTER UPDATE ON sales_leads BEGIN
 INSERT INTO sales_lead_history(lead_id,event,previous_value,new_value,changed_by)
 SELECT NEW.id,'Status',OLD.status,NEW.status || CASE WHEN NEW.status='Closed' THEN ': ' || NEW.closure_reason ELSE '' END,NEW.updated_by WHERE OLD.status!=NEW.status;
 INSERT INTO sales_lead_history(lead_id,event,previous_value,new_value,changed_by)
 SELECT NEW.id,'Assignment',CAST(OLD.coordinator_id AS TEXT),CAST(NEW.coordinator_id AS TEXT),NEW.updated_by WHERE OLD.coordinator_id!=NEW.coordinator_id;
 INSERT INTO sales_lead_history(lead_id,event,new_value,changed_by)
 SELECT NEW.id,'Conversion',NEW.customer_id,NEW.updated_by WHERE OLD.customer_id IS NULL AND NEW.customer_id IS NOT NULL;
 INSERT INTO sales_lead_history(lead_id,event,previous_value,new_value,changed_by)
 VALUES(NEW.id,'Updated',CAST(OLD.version AS TEXT),CAST(NEW.version AS TEXT),NEW.updated_by);
END;
INSERT OR IGNORE INTO role_menu_permissions(role_id,menu_key,can_full,can_view,can_create,can_edit,can_delete,can_approve)
SELECT id,'lead-management',CASE WHEN name='SUPERADMIN' THEN 1 ELSE 0 END,CASE WHEN name='SUPERADMIN' THEN 1 ELSE 0 END,0,0,0,0 FROM roles;
