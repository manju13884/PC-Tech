ALTER TABLE finished_goods_dispatches ADD COLUMN document_type TEXT NOT NULL DEFAULT 'INVOICE' CHECK (document_type IN ('INVOICE', 'DELIVERY_CHALLAN'));
ALTER TABLE finished_goods_dispatches ADD COLUMN zoho_delivery_challan_id TEXT NOT NULL DEFAULT '';
ALTER TABLE finished_goods_dispatches ADD COLUMN delivery_challan_number TEXT NOT NULL DEFAULT '';
