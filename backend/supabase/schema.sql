-- Auto Stock Manager's tables on Supabase (Postgres). Generated from backend/schema.sql plus the columns/tables
-- server.py adds at startup, then checked against sqldb.TABLES. Safe to run more than once.
-- Text dates stay text (ISO strings) and money stays double precision, exactly as in MariaDB.
-- users.username is citext (case-insensitive), because MariaDB matched usernames case-insensitively.
begin;
create extension if not exists citext;

create table if not exists "public"."companies" (
  "id" varchar(36) not null primary key,
  "name" varchar(255) not null,
  "created_at" varchar(40)
);
alter table "public"."companies" enable row level security;  -- the public API key can read nothing; the backend connects directly

create table if not exists "public"."users" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36),
  "username" citext not null unique,
  "password_hash" varchar(255) not null,
  "name" varchar(255),
  "role" varchar(50),
  "email_verified_at" varchar(40),
  "created_at" varchar(40),
  constraint "chk_users_company_or_platform_owner" check (role = 'platform_owner' OR company_id IS NOT NULL)
);
alter table "public"."users" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_users_company_id" on "public"."users" ("company_id");

create table if not exists "public"."auth_tokens" (
  "id" varchar(36) not null primary key,
  "user_id" varchar(36) not null,
  "purpose" varchar(20) not null,
  "token_hash" varchar(64) not null,
  "expires_at" varchar(40) not null,
  "used_at" varchar(40),
  "created_at" varchar(40)
);
alter table "public"."auth_tokens" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_auth_tokens_hash" on "public"."auth_tokens" ("token_hash");
create index if not exists "idx_auth_tokens_user" on "public"."auth_tokens" ("user_id");

create table if not exists "public"."vendors" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "name" varchar(255),
  "phone" varchar(50),
  "address" varchar(500),
  "notes" text,
  "vendor_type" varchar(20) default 'both',
  "commission_amount" double precision,
  "created_at" varchar(40)
);
alter table "public"."vendors" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_vendors_company_id" on "public"."vendors" ("company_id");

create table if not exists "public"."customers" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "name" varchar(255),
  "contact_number" varchar(50),
  "address" varchar(500),
  "id_number" varchar(100),
  "occupation" varchar(255),
  "budget_min" double precision,
  "budget_max" double precision,
  "interested_brands" varchar(255),
  "notes" text,
  "created_at" varchar(40),
  "last_purchase_date" varchar(20),
  "source" varchar(20),
  "source_note" varchar(255),
  "referred_by_id" varchar(36),
  "lead_status" varchar(20),
  "interested_vehicle" varchar(255),
  "assigned_to_id" varchar(36),
  "assigned_to_name" varchar(255)
);
alter table "public"."customers" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_customers_company_id" on "public"."customers" ("company_id");
create index if not exists "idx_customers_created_at" on "public"."customers" ("created_at");

create table if not exists "public"."team_members" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "name" varchar(255),
  "role" varchar(50),
  "contact" varchar(50),
  "specialization" varchar(255),
  "commission_rate" double precision,
  "joining_date" varchar(20),
  "is_active" boolean default true,
  "created_at" varchar(40)
);
alter table "public"."team_members" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_team_members_company_id" on "public"."team_members" ("company_id");
create index if not exists "idx_team_members_role" on "public"."team_members" ("role");

create table if not exists "public"."partners" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "name" varchar(255),
  "capital_contribution" double precision,
  "stake_percentage" double precision,
  "contact" varchar(100),
  "created_at" varchar(40)
);
alter table "public"."partners" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_partners_company_id" on "public"."partners" ("company_id");

create table if not exists "public"."vehicles" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "brand" varchar(100),
  "model" varchar(100),
  "variant" varchar(100),
  "year" integer,
  "engine_cc" integer,
  "fuel_type" varchar(50),
  "vehicle_type" varchar(50),
  "ownership_number" integer,
  "chassis_number" varchar(100),
  "engine_number" varchar(100),
  "kilometer_run" integer,
  "condition" varchar(50),
  "condition_rating" integer,
  "color" varchar(50),
  "registration_number" varchar(50),
  "purchase_price" double precision,
  "accessories_cost" double precision,
  "purchase_date" varchar(20),
  "purchase_source" varchar(255),
  "vendor_id" varchar(36),
  "purchase_from" varchar(255),
  "linked_contact_type" varchar(20),
  "linked_contact_id" varchar(36),
  "linked_contact_name" varchar(255),
  "selling_price" double precision,
  "minimum_selling_price" double precision,
  "notes" text,
  "status" varchar(20),
  "bluebook_status" varchar(20),
  "insurance_status" varchar(20),
  "tax_clearance_status" varchar(20),
  "transfer_status" varchar(20),
  "ownership_termination_status" varchar(20) default 'pending',
  "ownership_transfer_status" varchar(20) default 'pending',
  "sanakhat_status" varchar(20) default 'pending',
  "sanakhat_date" varchar(20),
  "sanakhat_cost" double precision,
  "created_at" varchar(40),
  "updated_at" varchar(40),
  "sold_date" varchar(20),
  "customer_id" varchar(36),
  "salesperson_id" varchar(36),
  "salesperson_name" varchar(255),
  "discount" double precision,
  "created_by" varchar(100),
  "warranty_days" integer,
  "warranty_void" boolean default false,
  "warranty_void_reason" varchar(500),
  "warranty_voided_at" varchar(40),
  "warranty_voided_by" varchar(100),
  "purchase_due" double precision
);
alter table "public"."vehicles" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_vehicles_company_id" on "public"."vehicles" ("company_id");
create index if not exists "idx_vehicles_status" on "public"."vehicles" ("status");
create index if not exists "idx_vehicles_registration_number" on "public"."vehicles" ("registration_number");
create index if not exists "idx_vehicles_brand" on "public"."vehicles" ("brand");
create index if not exists "idx_vehicles_purchase_date" on "public"."vehicles" ("purchase_date");
create index if not exists "idx_vehicles_created_at" on "public"."vehicles" ("created_at");
create index if not exists "idx_vehicles_vendor_id" on "public"."vehicles" ("vendor_id");
create index if not exists "idx_vehicles_customer_id" on "public"."vehicles" ("customer_id");
create index if not exists "idx_vehicles_salesperson_id" on "public"."vehicles" ("salesperson_id");
create index if not exists "idx_vehicles_linked_contact" on "public"."vehicles" ("linked_contact_type", "linked_contact_id");

create table if not exists "public"."sales" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "vehicle_id" varchar(36),
  "customer_id" varchar(36),
  "sale_price" double precision,
  "extra_expenses" jsonb,
  "expenses_total" double precision,
  "total_amount" double precision,
  "payment_method" varchar(50),
  "paid_cash" double precision,
  "paid_bank" double precision,
  "advance_payment" double precision,
  "due_amount" double precision,
  "due_date" varchar(20),
  "payment_status" varchar(20),
  "sale_date" varchar(20),
  "ownership_transfer_date" varchar(20),
  "notes" text,
  "witness_name" varchar(255),
  "witness_address" varchar(500),
  "witness_phone" varchar(50),
  "witness_id_number" varchar(100),
  "witness_relation" varchar(100),
  "sold_by_id" varchar(36),
  "sold_by_name" varchar(255),
  "lead_source" varchar(20),
  "lead_note" varchar(255),
  "referred_by_id" varchar(36),
  "referred_by_name" varchar(255),
  "exchange_valuation" double precision,
  "exchange_brand" varchar(100),
  "exchange_model" varchar(100),
  "exchange_reg_no" varchar(50),
  "exchange_year" varchar(10),
  "exchange_vehicle_id" varchar(36),
  "helmet_given" boolean,
  "imported" boolean,
  "needs_review" boolean,
  "review_note" varchar(500),
  "reviewed_by" varchar(100),
  "reviewed_at" varchar(40),
  "created_by" varchar(100),
  "created_at" varchar(40),
  "updated_by" varchar(100),
  "updated_at" varchar(40),
  "returned" boolean default false,
  "returned_at" varchar(40),
  "returned_status" varchar(50),
  "refund_amount" double precision,
  "retained_amount" double precision,
  "return_notes" text,
  "cost_at_return" double precision,
  "prev_purchase_price" double precision,
  "prev_purchase_date" varchar(20),
  "prev_accessories_cost" double precision,
  "prev_sanakhat_cost" double precision
);
alter table "public"."sales" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_sales_company_id" on "public"."sales" ("company_id");
create index if not exists "idx_sales_vehicle_id" on "public"."sales" ("vehicle_id");
create index if not exists "idx_sales_customer_id" on "public"."sales" ("customer_id");
create index if not exists "idx_sales_returned" on "public"."sales" ("returned");
create index if not exists "idx_sales_sale_date" on "public"."sales" ("sale_date");
create index if not exists "idx_sales_created_at" on "public"."sales" ("created_at");

create table if not exists "public"."crm_followups" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "customer_id" varchar(36) not null,
  "due_at" varchar(40),
  "purpose" varchar(255),
  "notes" text,
  "status" varchar(12) default 'pending',
  "completed_at" varchar(40),
  "outcome" text,
  "created_by" varchar(100),
  "created_at" varchar(40),
  "updated_at" varchar(40)
);
alter table "public"."crm_followups" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_crm_followups_company_id" on "public"."crm_followups" ("company_id");
create index if not exists "idx_crm_followups_customer_id" on "public"."crm_followups" ("customer_id");
create index if not exists "idx_crm_followups_status_due" on "public"."crm_followups" ("status", "due_at");

create table if not exists "public"."crm_interactions" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "customer_id" varchar(36) not null,
  "kind" varchar(12),
  "summary" text,
  "occurred_at" varchar(40),
  "created_by" varchar(100),
  "created_at" varchar(40)
);
alter table "public"."crm_interactions" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_crm_interactions_company_id" on "public"."crm_interactions" ("company_id");
create index if not exists "idx_crm_interactions_customer_id" on "public"."crm_interactions" ("customer_id");

create table if not exists "public"."bookings" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "vehicle_id" varchar(36),
  "customer_id" varchar(36),
  "receipt_no" integer,
  "booking_amount" double precision,
  "payment_method" varchar(50),
  "booking_date" varchar(20),
  "expected_sale_date" varchar(20),
  "agreed_price" double precision,
  "status" varchar(20) default 'active',
  "notes" text,
  "sale_id" varchar(36),
  "cancelled_at" varchar(40),
  "refund_amount" double precision,
  "retained_amount" double precision,
  "cancel_notes" text,
  "created_by" varchar(100),
  "created_at" varchar(40),
  "updated_at" varchar(40)
);
alter table "public"."bookings" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_bookings_company_id" on "public"."bookings" ("company_id");
create index if not exists "idx_bookings_vehicle_id" on "public"."bookings" ("vehicle_id");
create index if not exists "idx_bookings_status" on "public"."bookings" ("status");

create table if not exists "public"."spare_parts" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "name" varchar(255),
  "category" varchar(100),
  "brand_compatibility" varchar(255),
  "part_number" varchar(100),
  "quantity" integer default 0,
  "unit_cost" double precision,
  "selling_price" double precision,
  "vendor_id" varchar(36),
  "bill_no" varchar(100),
  "entry_date" varchar(20),
  "supplier" varchar(255),
  "min_stock_alert" integer,
  "location" varchar(255),
  "notes" text,
  "is_kit" boolean default false,
  "stock_type" varchar(20),
  "created_at" varchar(40),
  "updated_at" varchar(40)
);
alter table "public"."spare_parts" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_spare_parts_company_id" on "public"."spare_parts" ("company_id");
create index if not exists "idx_spare_parts_category" on "public"."spare_parts" ("category");
create index if not exists "idx_spare_parts_vendor_id" on "public"."spare_parts" ("vendor_id");
create index if not exists "idx_spare_parts_created_at" on "public"."spare_parts" ("created_at");

create table if not exists "public"."spare_parts_set_components" (
  "id" integer generated by default as identity not null primary key,
  "part_id" varchar(36) not null,
  "name" varchar(255) not null,
  "stock" integer default 0,
  "rate" double precision default 0,
  constraint "uq_set_components" unique ("part_id", "name")
);
alter table "public"."spare_parts_set_components" enable row level security;  -- the public API key can read nothing; the backend connects directly

create table if not exists "public"."kit_components" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "kit_part_id" varchar(36) not null,
  "component_part_id" varchar(36) not null,
  "qty_per_kit" integer,
  "created_by" varchar(100),
  "created_at" varchar(40),
  constraint "uq_kit_components" unique ("kit_part_id", "component_part_id")
);
alter table "public"."kit_components" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_kit_components_company_id" on "public"."kit_components" ("company_id");
create index if not exists "idx_kit_components_component" on "public"."kit_components" ("component_part_id");

create table if not exists "public"."part_transactions" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "part_id" varchar(36),
  "part_name" varchar(500),
  "type" varchar(10),
  "quantity" integer,
  "reason" varchar(255),
  "date" varchar(20),
  "job_id" varchar(36),
  "notes" text,
  "created_by" varchar(100),
  "created_at" varchar(40)
);
alter table "public"."part_transactions" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_part_transactions_company_id" on "public"."part_transactions" ("company_id");
create index if not exists "idx_part_transactions_part_id" on "public"."part_transactions" ("part_id");
create index if not exists "idx_part_transactions_created_at" on "public"."part_transactions" ("created_at");

create table if not exists "public"."job_cards" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "vehicle_id" varchar(36),
  "is_external" boolean default false,
  "vehicle_brand" varchar(100),
  "vehicle_model" varchar(100),
  "vehicle_year" integer,
  "registration_number" varchar(50),
  "customer_name" varchar(255),
  "customer_contact" varchar(50),
  "work_description" text,
  "mechanic_id" varchar(36),
  "mechanic_name" varchar(255),
  "estimated_cost" double precision,
  "notes" text,
  "coupon_no" integer,
  "job_date" varchar(20),
  "parts" jsonb,
  "job_number" varchar(50),
  "status" varchar(20),
  "actual_cost" double precision,
  "created_at" varchar(40),
  "completed_at" varchar(40),
  "created_by" varchar(100),
  "is_warranty" boolean default false,
  "sanakhat_cost" double precision,
  "labour_charge" double precision,
  "resanakhat_cost" double precision,
  "after_sale" boolean default false,
  "updated_at" varchar(40)
);
alter table "public"."job_cards" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_job_cards_company_id" on "public"."job_cards" ("company_id");
create index if not exists "idx_job_cards_status" on "public"."job_cards" ("status");
create index if not exists "idx_job_cards_vehicle_id" on "public"."job_cards" ("vehicle_id");
create index if not exists "idx_job_cards_mechanic_id" on "public"."job_cards" ("mechanic_id");
create index if not exists "idx_job_cards_created_at" on "public"."job_cards" ("created_at");

create table if not exists "public"."expenses" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "vehicle_id" varchar(36),
  "category" varchar(100),
  "amount" double precision,
  "description" varchar(500),
  "date" varchar(20),
  "added_by" varchar(100),
  "created_at" varchar(40)
);
alter table "public"."expenses" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_expenses_company_id" on "public"."expenses" ("company_id");
create index if not exists "idx_expenses_vehicle_id" on "public"."expenses" ("vehicle_id");

create table if not exists "public"."vendor_payments" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "vendor_id" varchar(36),
  "amount" double precision,
  "vehicle_id" varchar(36),
  "payment_date" varchar(20),
  "notes" text,
  "recorded_by" varchar(100),
  "created_at" varchar(40)
);
alter table "public"."vendor_payments" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_vendor_payments_company_id" on "public"."vendor_payments" ("company_id");
create index if not exists "idx_vendor_payments_vendor_id" on "public"."vendor_payments" ("vendor_id");
create index if not exists "idx_vendor_payments_payment_date" on "public"."vendor_payments" ("payment_date");

create table if not exists "public"."emi_records" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "customer_id" varchar(36),
  "vehicle_id" varchar(36),
  "loan_amount" double precision,
  "down_payment" double precision,
  "interest_rate" double precision,
  "tenure_months" integer,
  "start_date" varchar(20),
  "financer_name" varchar(255),
  "notes" text,
  "monthly_installment" double precision,
  "total_payable" double precision,
  "total_interest" double precision,
  "status" varchar(20) default 'active',
  "created_at" varchar(40),
  "customer_name" varchar(255),
  "customer_phone" varchar(50),
  "vehicle_name" varchar(255)
);
alter table "public"."emi_records" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_emi_records_company_id" on "public"."emi_records" ("company_id");
create index if not exists "idx_emi_records_status" on "public"."emi_records" ("status");

create table if not exists "public"."emi_payments" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "emi_id" varchar(36),
  "amount" double precision,
  "payment_date" varchar(20),
  "notes" text,
  "recorded_by" varchar(100),
  "created_at" varchar(40)
);
alter table "public"."emi_payments" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_emi_payments_company_id" on "public"."emi_payments" ("company_id");
create index if not exists "idx_emi_payments_emi_id" on "public"."emi_payments" ("emi_id");

create table if not exists "public"."vehicle_photos" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "vehicle_id" varchar(36),
  "filename" varchar(500),
  "content_type" varchar(100),
  "data" text,
  "storage_path" varchar(500),
  "uploaded_at" varchar(40),
  "size" integer,
  "sort_order" integer
);
alter table "public"."vehicle_photos" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_vehicle_photos_company_id" on "public"."vehicle_photos" ("company_id");
create index if not exists "idx_vehicle_photos_vehicle_id" on "public"."vehicle_photos" ("vehicle_id");
create index if not exists "idx_vehicle_photos_uploaded_at" on "public"."vehicle_photos" ("uploaded_at");

create table if not exists "public"."legal_documents" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "vehicle_id" varchar(36),
  "filename" varchar(500),
  "content_type" varchar(100),
  "data" text,
  "storage_path" varchar(500),
  "doc_type" varchar(30),
  "original_name" varchar(500),
  "uploaded_at" varchar(40),
  "size" integer
);
alter table "public"."legal_documents" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_legal_documents_company_id" on "public"."legal_documents" ("company_id");
create index if not exists "idx_legal_documents_vehicle_id" on "public"."legal_documents" ("vehicle_id");
create index if not exists "idx_legal_documents_uploaded_at" on "public"."legal_documents" ("uploaded_at");

create table if not exists "public"."leads" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "type" varchar(20),
  "name" varchar(255),
  "phone" varchar(50),
  "message" text,
  "images" jsonb,
  "requested_service" varchar(255),
  "vehicle_type" varchar(100),
  "preferred_date" varchar(20),
  "status" varchar(20) default 'new',
  "created_at" varchar(40),
  "email" varchar(255),
  "address" varchar(500),
  "remark" text,
  "decided_by" varchar(100),
  "decided_at" varchar(40),
  "customer_id" varchar(36),
  "vehicle_id" varchar(36),
  "seen_at" varchar(40)
);
alter table "public"."leads" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_leads_company_id" on "public"."leads" ("company_id");
create index if not exists "idx_leads_created_at" on "public"."leads" ("created_at");

create table if not exists "public"."settings" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "logo_url" varchar(1000),
  "business_name" varchar(255),
  "contact_phone" varchar(50),
  "contact_email" varchar(255),
  "address" varchar(500),
  "hero_image_url" varchar(1000),
  "service_image_url" varchar(1000),
  "warranty_days_default" integer
);
alter table "public"."settings" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_settings_company_id" on "public"."settings" ("company_id");

create table if not exists "public"."sync_logs" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "pushed_at" varchar(40),
  "count" integer,
  "status" varchar(20),
  "message" varchar(500)
);
alter table "public"."sync_logs" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_sync_logs_company_id" on "public"."sync_logs" ("company_id");

create table if not exists "public"."audit_logs" (
  "id" integer generated by default as identity not null primary key,
  "company_id" varchar(36) not null,
  "action" varchar(100),
  "vehicle_id" varchar(36),
  "user" varchar(100),
  "timestamp" varchar(40),
  "details" text
);
alter table "public"."audit_logs" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_audit_logs_company_id" on "public"."audit_logs" ("company_id");
create index if not exists "idx_audit_logs_timestamp" on "public"."audit_logs" ("timestamp");
create index if not exists "idx_audit_logs_vehicle_id" on "public"."audit_logs" ("vehicle_id");

create table if not exists "public"."ai_chat_sessions" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "messages" jsonb,
  "updated_at" varchar(40)
);
alter table "public"."ai_chat_sessions" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_ai_chat_sessions_company_id" on "public"."ai_chat_sessions" ("company_id");

create table if not exists "public"."facebook_pages" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "page_id" varchar(64),
  "page_name" varchar(255),
  "access_token" text,
  "connected_by" varchar(100),
  "connected_at" varchar(40)
);
alter table "public"."facebook_pages" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_facebook_pages_company_id" on "public"."facebook_pages" ("company_id");

create table if not exists "public"."offer_prizes" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "name" varchar(100),
  "weight" integer default 0,
  "stock" integer default 0,
  "sort_order" integer default 0,
  "created_at" varchar(40)
);
alter table "public"."offer_prizes" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_offer_prizes_company_id" on "public"."offer_prizes" ("company_id");

create table if not exists "public"."offer_codes" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "code" varchar(20) not null,
  "status" varchar(10) default 'NEW',
  "customer_name" varchar(255),
  "phone" varchar(50),
  "prize" varchar(100),
  "created_by" varchar(100),
  "created_at" varchar(40),
  "used_at" varchar(40),
  constraint "uq_offer_codes_company_code" unique ("company_id", "code")
);
alter table "public"."offer_codes" enable row level security;  -- the public API key can read nothing; the backend connects directly

create table if not exists "public"."page_views" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "visitor_id" varchar(64),
  "path" varchar(300),
  "referrer" varchar(100),
  "device" varchar(10),
  "created_at" varchar(40)
);
alter table "public"."page_views" enable row level security;  -- the public API key can read nothing; the backend connects directly
create index if not exists "idx_page_views_company_id" on "public"."page_views" ("company_id");
create index if not exists "idx_page_views_created_at" on "public"."page_views" ("created_at");

-- Foreign keys (added once every table exists).
do $$ begin alter table "public"."users" add constraint "fk_users_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."auth_tokens" add constraint "fk_auth_tokens_user" foreign key ("user_id") references "public"."users" ("id") ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."vendors" add constraint "fk_vendors_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."customers" add constraint "fk_customers_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."team_members" add constraint "fk_team_members_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."partners" add constraint "fk_partners_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."vehicles" add constraint "fk_vehicles_vendor" foreign key ("vendor_id") references "public"."vendors" ("id") ON DELETE SET NULL; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."vehicles" add constraint "fk_vehicles_customer" foreign key ("customer_id") references "public"."customers" ("id") ON DELETE SET NULL; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."vehicles" add constraint "fk_vehicles_salesperson" foreign key ("salesperson_id") references "public"."team_members" ("id") ON DELETE SET NULL; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."vehicles" add constraint "fk_vehicles_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."sales" add constraint "fk_sales_vehicle" foreign key ("vehicle_id") references "public"."vehicles" ("id") ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."sales" add constraint "fk_sales_customer" foreign key ("customer_id") references "public"."customers" ("id") ON DELETE SET NULL; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."sales" add constraint "fk_sales_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."crm_followups" add constraint "fk_crm_followups_customer" foreign key ("customer_id") references "public"."customers" ("id") ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."crm_followups" add constraint "fk_crm_followups_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."crm_interactions" add constraint "fk_crm_interactions_customer" foreign key ("customer_id") references "public"."customers" ("id") ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."crm_interactions" add constraint "fk_crm_interactions_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."bookings" add constraint "fk_bookings_vehicle" foreign key ("vehicle_id") references "public"."vehicles" ("id") ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."bookings" add constraint "fk_bookings_customer" foreign key ("customer_id") references "public"."customers" ("id") ON DELETE SET NULL; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."bookings" add constraint "fk_bookings_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."spare_parts" add constraint "fk_spare_parts_vendor" foreign key ("vendor_id") references "public"."vendors" ("id") ON DELETE SET NULL; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."spare_parts" add constraint "fk_spare_parts_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."spare_parts_set_components" add constraint "fk_set_components_part" foreign key ("part_id") references "public"."spare_parts" ("id") ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."kit_components" add constraint "fk_kit_components_kit" foreign key ("kit_part_id") references "public"."spare_parts" ("id") ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."kit_components" add constraint "fk_kit_components_component" foreign key ("component_part_id") references "public"."spare_parts" ("id") ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."kit_components" add constraint "fk_kit_components_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."part_transactions" add constraint "fk_part_transactions_part" foreign key ("part_id") references "public"."spare_parts" ("id") ON DELETE SET NULL; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."part_transactions" add constraint "fk_part_transactions_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."job_cards" add constraint "fk_job_cards_vehicle" foreign key ("vehicle_id") references "public"."vehicles" ("id") ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."job_cards" add constraint "fk_job_cards_mechanic" foreign key ("mechanic_id") references "public"."team_members" ("id") ON DELETE SET NULL; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."job_cards" add constraint "fk_job_cards_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."expenses" add constraint "fk_expenses_vehicle" foreign key ("vehicle_id") references "public"."vehicles" ("id") ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."expenses" add constraint "fk_expenses_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."vendor_payments" add constraint "fk_vendor_payments_vendor" foreign key ("vendor_id") references "public"."vendors" ("id") ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."vendor_payments" add constraint "fk_vendor_payments_vehicle" foreign key ("vehicle_id") references "public"."vehicles" ("id") ON DELETE SET NULL; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."vendor_payments" add constraint "fk_vendor_payments_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."emi_records" add constraint "fk_emi_records_customer" foreign key ("customer_id") references "public"."customers" ("id") ON DELETE SET NULL; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."emi_records" add constraint "fk_emi_records_vehicle" foreign key ("vehicle_id") references "public"."vehicles" ("id") ON DELETE SET NULL; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."emi_records" add constraint "fk_emi_records_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."emi_payments" add constraint "fk_emi_payments_emi" foreign key ("emi_id") references "public"."emi_records" ("id") ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."emi_payments" add constraint "fk_emi_payments_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."vehicle_photos" add constraint "fk_vehicle_photos_vehicle" foreign key ("vehicle_id") references "public"."vehicles" ("id") ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."vehicle_photos" add constraint "fk_vehicle_photos_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."legal_documents" add constraint "fk_legal_documents_vehicle" foreign key ("vehicle_id") references "public"."vehicles" ("id") ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."legal_documents" add constraint "fk_legal_documents_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."leads" add constraint "fk_leads_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."settings" add constraint "fk_settings_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."sync_logs" add constraint "fk_sync_logs_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."audit_logs" add constraint "fk_audit_logs_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."ai_chat_sessions" add constraint "fk_ai_chat_sessions_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."facebook_pages" add constraint "fk_facebook_pages_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."offer_prizes" add constraint "fk_offer_prizes_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."offer_codes" add constraint "fk_offer_codes_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."page_views" add constraint "fk_page_views_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;

commit;

notify pgrst, 'reload schema';
