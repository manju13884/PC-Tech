-- Preserve all leads, addresses, follow-ups and audit history.
ALTER TABLE sales_leads RENAME TO sales_leads_archive_0066;
ALTER TABLE sales_lead_activities RENAME TO sales_lead_activities_archive_0066;
ALTER TABLE sales_lead_history RENAME TO sales_lead_history_archive_0066;
CREATE TABLE sales_leads (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 lead_number TEXT GENERATED ALWAYS AS ('LD-' || printf('%06d', id)) STORED UNIQUE,
 company TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '', mobile TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
 address TEXT NOT NULL DEFAULT '', city TEXT NOT NULL, source TEXT NOT NULL, product TEXT NOT NULL DEFAULT '', remarks TEXT NOT NULL DEFAULT '',
 coordinator_id INTEGER REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'New' CHECK(status IN ('New','Contacted','Qualified','Quotation','On Hold','Not Qualified','Converted','Closed')),
 status_reason TEXT NOT NULL DEFAULT '', closure_reason TEXT NOT NULL DEFAULT '', customer_id TEXT,
 last_contact_date TEXT, next_follow_up_date TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_by INTEGER NOT NULL REFERENCES users(id), updated_by INTEGER NOT NULL REFERENCES users(id),
 version INTEGER NOT NULL DEFAULT 1, mutation_token TEXT NOT NULL UNIQUE,
 CHECK(length(trim(company))>0 AND length(trim(city))>0),
 CHECK(length(trim(mobile))>0 OR length(trim(email))>0),
 CHECK(status NOT IN ('On Hold','Not Qualified') OR length(trim(status_reason))>0),
 CHECK(status!='Closed' OR length(trim(closure_reason))>0),
 CHECK((status='Converted' AND customer_id IS NOT NULL) OR (status!='Converted' AND customer_id IS NULL))
);
CREATE INDEX idx_v3_sales_leads_coordinator ON sales_leads(coordinator_id,created_at);
CREATE INDEX idx_v3_sales_leads_status ON sales_leads(status);
CREATE INDEX idx_v3_sales_leads_follow_up ON sales_leads(next_follow_up_date);
CREATE TABLE sales_lead_activities (
 id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id INTEGER NOT NULL REFERENCES sales_leads(id),
 contact_date TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('Call','Email','WhatsApp','Visit','Meeting')),
 discussion TEXT NOT NULL, next_follow_up_date TEXT, next_action TEXT NOT NULL DEFAULT '',
 created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_v3_sales_lead_activities_lead ON sales_lead_activities(lead_id,id);
CREATE TABLE sales_lead_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id INTEGER NOT NULL REFERENCES sales_leads(id),
 event TEXT NOT NULL, previous_value TEXT, new_value TEXT,
 changed_by INTEGER NOT NULL REFERENCES users(id), changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_v3_sales_lead_history_lead ON sales_lead_history(lead_id,id);
INSERT INTO sales_leads (id,company,contact,mobile,email,city,address,source,product,remarks,coordinator_id,status,closure_reason,customer_id,last_contact_date,next_follow_up_date,created_at,updated_at,created_by,updated_by,version,mutation_token,status_reason) SELECT id,company,contact,mobile,email,city,address,source,product,remarks,coordinator_id,status,closure_reason,customer_id,last_contact_date,next_follow_up_date,created_at,updated_at,created_by,updated_by,version,mutation_token,closure_reason FROM sales_leads_archive_0066;
INSERT INTO sales_lead_activities (id,lead_id,contact_date,mode,discussion,next_follow_up_date,next_action,created_by,created_at) SELECT id,lead_id,contact_date,mode,discussion,next_follow_up_date,next_action,created_by,created_at FROM sales_lead_activities_archive_0066;
INSERT INTO sales_lead_history (id,lead_id,event,previous_value,new_value,changed_by,changed_at) SELECT id,lead_id,event,previous_value,new_value,changed_by,changed_at FROM sales_lead_history_archive_0066;
CREATE TRIGGER sales_lead_v3_created AFTER INSERT ON sales_leads BEGIN
 INSERT INTO sales_lead_history(lead_id,event,new_value,changed_by) VALUES(NEW.id,'Created','New',NEW.created_by);
 INSERT INTO sales_lead_history(lead_id,event,new_value,changed_by) VALUES(NEW.id,'Assignment',CAST(NEW.coordinator_id AS TEXT),NEW.created_by);
END;
CREATE TRIGGER sales_lead_v3_changed AFTER UPDATE ON sales_leads BEGIN
 INSERT INTO sales_lead_history(lead_id,event,previous_value,new_value,changed_by)
 SELECT NEW.id,'Status',OLD.status,NEW.status || CASE WHEN NEW.status IN ('Closed','On Hold','Not Qualified') THEN ': ' || NEW.status_reason ELSE '' END,NEW.updated_by WHERE OLD.status!=NEW.status OR OLD.status_reason IS NOT NEW.status_reason;
 INSERT INTO sales_lead_history(lead_id,event,previous_value,new_value,changed_by)
 SELECT NEW.id,'Assignment',CAST(OLD.coordinator_id AS TEXT),CAST(NEW.coordinator_id AS TEXT),NEW.updated_by WHERE OLD.coordinator_id IS NOT NEW.coordinator_id;
 INSERT INTO sales_lead_history(lead_id,event,new_value,changed_by)
 SELECT NEW.id,'Conversion',NEW.customer_id,NEW.updated_by WHERE OLD.customer_id IS NULL AND NEW.customer_id IS NOT NULL;
 INSERT INTO sales_lead_history(lead_id,event,previous_value,new_value,changed_by)
 VALUES(NEW.id,'Updated',CAST(OLD.version AS TEXT),CAST(NEW.version AS TEXT),NEW.updated_by);
END;
