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
alter table "public"."companies" add column if not exists "id" varchar(36);
alter table "public"."companies" add column if not exists "name" varchar(255);
alter table "public"."companies" add column if not exists "created_at" varchar(40);

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
alter table "public"."users" add column if not exists "id" varchar(36);
alter table "public"."users" add column if not exists "company_id" varchar(36);
alter table "public"."users" add column if not exists "username" citext;
alter table "public"."users" add column if not exists "password_hash" varchar(255);
alter table "public"."users" add column if not exists "name" varchar(255);
alter table "public"."users" add column if not exists "role" varchar(50);
alter table "public"."users" add column if not exists "email_verified_at" varchar(40);
alter table "public"."users" add column if not exists "created_at" varchar(40);
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
alter table "public"."auth_tokens" add column if not exists "id" varchar(36);
alter table "public"."auth_tokens" add column if not exists "user_id" varchar(36);
alter table "public"."auth_tokens" add column if not exists "purpose" varchar(20);
alter table "public"."auth_tokens" add column if not exists "token_hash" varchar(64);
alter table "public"."auth_tokens" add column if not exists "expires_at" varchar(40);
alter table "public"."auth_tokens" add column if not exists "used_at" varchar(40);
alter table "public"."auth_tokens" add column if not exists "created_at" varchar(40);
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
alter table "public"."vendors" add column if not exists "id" varchar(36);
alter table "public"."vendors" add column if not exists "company_id" varchar(36);
alter table "public"."vendors" add column if not exists "name" varchar(255);
alter table "public"."vendors" add column if not exists "phone" varchar(50);
alter table "public"."vendors" add column if not exists "address" varchar(500);
alter table "public"."vendors" add column if not exists "notes" text;
alter table "public"."vendors" add column if not exists "vendor_type" varchar(20) default 'both';
alter table "public"."vendors" add column if not exists "commission_amount" double precision;
alter table "public"."vendors" add column if not exists "created_at" varchar(40);
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
alter table "public"."customers" add column if not exists "id" varchar(36);
alter table "public"."customers" add column if not exists "company_id" varchar(36);
alter table "public"."customers" add column if not exists "name" varchar(255);
alter table "public"."customers" add column if not exists "contact_number" varchar(50);
alter table "public"."customers" add column if not exists "address" varchar(500);
alter table "public"."customers" add column if not exists "id_number" varchar(100);
alter table "public"."customers" add column if not exists "occupation" varchar(255);
alter table "public"."customers" add column if not exists "budget_min" double precision;
alter table "public"."customers" add column if not exists "budget_max" double precision;
alter table "public"."customers" add column if not exists "interested_brands" varchar(255);
alter table "public"."customers" add column if not exists "notes" text;
alter table "public"."customers" add column if not exists "created_at" varchar(40);
alter table "public"."customers" add column if not exists "last_purchase_date" varchar(20);
alter table "public"."customers" add column if not exists "source" varchar(20);
alter table "public"."customers" add column if not exists "source_note" varchar(255);
alter table "public"."customers" add column if not exists "referred_by_id" varchar(36);
alter table "public"."customers" add column if not exists "lead_status" varchar(20);
alter table "public"."customers" add column if not exists "interested_vehicle" varchar(255);
alter table "public"."customers" add column if not exists "assigned_to_id" varchar(36);
alter table "public"."customers" add column if not exists "assigned_to_name" varchar(255);
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
alter table "public"."team_members" add column if not exists "id" varchar(36);
alter table "public"."team_members" add column if not exists "company_id" varchar(36);
alter table "public"."team_members" add column if not exists "name" varchar(255);
alter table "public"."team_members" add column if not exists "role" varchar(50);
alter table "public"."team_members" add column if not exists "contact" varchar(50);
alter table "public"."team_members" add column if not exists "specialization" varchar(255);
alter table "public"."team_members" add column if not exists "commission_rate" double precision;
alter table "public"."team_members" add column if not exists "joining_date" varchar(20);
alter table "public"."team_members" add column if not exists "is_active" boolean default true;
alter table "public"."team_members" add column if not exists "created_at" varchar(40);
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
alter table "public"."partners" add column if not exists "id" varchar(36);
alter table "public"."partners" add column if not exists "company_id" varchar(36);
alter table "public"."partners" add column if not exists "name" varchar(255);
alter table "public"."partners" add column if not exists "capital_contribution" double precision;
alter table "public"."partners" add column if not exists "stake_percentage" double precision;
alter table "public"."partners" add column if not exists "contact" varchar(100);
alter table "public"."partners" add column if not exists "created_at" varchar(40);
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
alter table "public"."vehicles" add column if not exists "id" varchar(36);
alter table "public"."vehicles" add column if not exists "company_id" varchar(36);
alter table "public"."vehicles" add column if not exists "brand" varchar(100);
alter table "public"."vehicles" add column if not exists "model" varchar(100);
alter table "public"."vehicles" add column if not exists "variant" varchar(100);
alter table "public"."vehicles" add column if not exists "year" integer;
alter table "public"."vehicles" add column if not exists "engine_cc" integer;
alter table "public"."vehicles" add column if not exists "fuel_type" varchar(50);
alter table "public"."vehicles" add column if not exists "vehicle_type" varchar(50);
alter table "public"."vehicles" add column if not exists "ownership_number" integer;
alter table "public"."vehicles" add column if not exists "chassis_number" varchar(100);
alter table "public"."vehicles" add column if not exists "engine_number" varchar(100);
alter table "public"."vehicles" add column if not exists "kilometer_run" integer;
alter table "public"."vehicles" add column if not exists "condition" varchar(50);
alter table "public"."vehicles" add column if not exists "condition_rating" integer;
alter table "public"."vehicles" add column if not exists "color" varchar(50);
alter table "public"."vehicles" add column if not exists "registration_number" varchar(50);
alter table "public"."vehicles" add column if not exists "purchase_price" double precision;
alter table "public"."vehicles" add column if not exists "accessories_cost" double precision;
alter table "public"."vehicles" add column if not exists "purchase_date" varchar(20);
alter table "public"."vehicles" add column if not exists "purchase_source" varchar(255);
alter table "public"."vehicles" add column if not exists "vendor_id" varchar(36);
alter table "public"."vehicles" add column if not exists "purchase_from" varchar(255);
alter table "public"."vehicles" add column if not exists "linked_contact_type" varchar(20);
alter table "public"."vehicles" add column if not exists "linked_contact_id" varchar(36);
alter table "public"."vehicles" add column if not exists "linked_contact_name" varchar(255);
alter table "public"."vehicles" add column if not exists "selling_price" double precision;
alter table "public"."vehicles" add column if not exists "minimum_selling_price" double precision;
alter table "public"."vehicles" add column if not exists "notes" text;
alter table "public"."vehicles" add column if not exists "status" varchar(20);
alter table "public"."vehicles" add column if not exists "bluebook_status" varchar(20);
alter table "public"."vehicles" add column if not exists "insurance_status" varchar(20);
alter table "public"."vehicles" add column if not exists "tax_clearance_status" varchar(20);
alter table "public"."vehicles" add column if not exists "transfer_status" varchar(20);
alter table "public"."vehicles" add column if not exists "ownership_termination_status" varchar(20) default 'pending';
alter table "public"."vehicles" add column if not exists "ownership_transfer_status" varchar(20) default 'pending';
alter table "public"."vehicles" add column if not exists "sanakhat_status" varchar(20) default 'pending';
alter table "public"."vehicles" add column if not exists "sanakhat_date" varchar(20);
alter table "public"."vehicles" add column if not exists "sanakhat_cost" double precision;
alter table "public"."vehicles" add column if not exists "created_at" varchar(40);
alter table "public"."vehicles" add column if not exists "updated_at" varchar(40);
alter table "public"."vehicles" add column if not exists "sold_date" varchar(20);
alter table "public"."vehicles" add column if not exists "customer_id" varchar(36);
alter table "public"."vehicles" add column if not exists "salesperson_id" varchar(36);
alter table "public"."vehicles" add column if not exists "salesperson_name" varchar(255);
alter table "public"."vehicles" add column if not exists "discount" double precision;
alter table "public"."vehicles" add column if not exists "created_by" varchar(100);
alter table "public"."vehicles" add column if not exists "warranty_days" integer;
alter table "public"."vehicles" add column if not exists "warranty_void" boolean default false;
alter table "public"."vehicles" add column if not exists "warranty_void_reason" varchar(500);
alter table "public"."vehicles" add column if not exists "warranty_voided_at" varchar(40);
alter table "public"."vehicles" add column if not exists "warranty_voided_by" varchar(100);
alter table "public"."vehicles" add column if not exists "purchase_due" double precision;
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
alter table "public"."sales" add column if not exists "id" varchar(36);
alter table "public"."sales" add column if not exists "company_id" varchar(36);
alter table "public"."sales" add column if not exists "vehicle_id" varchar(36);
alter table "public"."sales" add column if not exists "customer_id" varchar(36);
alter table "public"."sales" add column if not exists "sale_price" double precision;
alter table "public"."sales" add column if not exists "extra_expenses" jsonb;
alter table "public"."sales" add column if not exists "expenses_total" double precision;
alter table "public"."sales" add column if not exists "total_amount" double precision;
alter table "public"."sales" add column if not exists "payment_method" varchar(50);
alter table "public"."sales" add column if not exists "paid_cash" double precision;
alter table "public"."sales" add column if not exists "paid_bank" double precision;
alter table "public"."sales" add column if not exists "advance_payment" double precision;
alter table "public"."sales" add column if not exists "due_amount" double precision;
alter table "public"."sales" add column if not exists "due_date" varchar(20);
alter table "public"."sales" add column if not exists "payment_status" varchar(20);
alter table "public"."sales" add column if not exists "sale_date" varchar(20);
alter table "public"."sales" add column if not exists "ownership_transfer_date" varchar(20);
alter table "public"."sales" add column if not exists "notes" text;
alter table "public"."sales" add column if not exists "witness_name" varchar(255);
alter table "public"."sales" add column if not exists "witness_address" varchar(500);
alter table "public"."sales" add column if not exists "witness_phone" varchar(50);
alter table "public"."sales" add column if not exists "witness_id_number" varchar(100);
alter table "public"."sales" add column if not exists "witness_relation" varchar(100);
alter table "public"."sales" add column if not exists "sold_by_id" varchar(36);
alter table "public"."sales" add column if not exists "sold_by_name" varchar(255);
alter table "public"."sales" add column if not exists "lead_source" varchar(20);
alter table "public"."sales" add column if not exists "lead_note" varchar(255);
alter table "public"."sales" add column if not exists "referred_by_id" varchar(36);
alter table "public"."sales" add column if not exists "referred_by_name" varchar(255);
alter table "public"."sales" add column if not exists "exchange_valuation" double precision;
alter table "public"."sales" add column if not exists "exchange_brand" varchar(100);
alter table "public"."sales" add column if not exists "exchange_model" varchar(100);
alter table "public"."sales" add column if not exists "exchange_reg_no" varchar(50);
alter table "public"."sales" add column if not exists "exchange_year" varchar(10);
alter table "public"."sales" add column if not exists "exchange_vehicle_id" varchar(36);
alter table "public"."sales" add column if not exists "helmet_given" boolean;
alter table "public"."sales" add column if not exists "imported" boolean;
alter table "public"."sales" add column if not exists "needs_review" boolean;
alter table "public"."sales" add column if not exists "review_note" varchar(500);
alter table "public"."sales" add column if not exists "reviewed_by" varchar(100);
alter table "public"."sales" add column if not exists "reviewed_at" varchar(40);
alter table "public"."sales" add column if not exists "created_by" varchar(100);
alter table "public"."sales" add column if not exists "created_at" varchar(40);
alter table "public"."sales" add column if not exists "updated_by" varchar(100);
alter table "public"."sales" add column if not exists "updated_at" varchar(40);
alter table "public"."sales" add column if not exists "returned" boolean default false;
alter table "public"."sales" add column if not exists "returned_at" varchar(40);
alter table "public"."sales" add column if not exists "returned_status" varchar(50);
alter table "public"."sales" add column if not exists "refund_amount" double precision;
alter table "public"."sales" add column if not exists "retained_amount" double precision;
alter table "public"."sales" add column if not exists "return_notes" text;
alter table "public"."sales" add column if not exists "cost_at_return" double precision;
alter table "public"."sales" add column if not exists "prev_purchase_price" double precision;
alter table "public"."sales" add column if not exists "prev_purchase_date" varchar(20);
alter table "public"."sales" add column if not exists "prev_accessories_cost" double precision;
alter table "public"."sales" add column if not exists "prev_sanakhat_cost" double precision;
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
alter table "public"."crm_followups" add column if not exists "id" varchar(36);
alter table "public"."crm_followups" add column if not exists "company_id" varchar(36);
alter table "public"."crm_followups" add column if not exists "customer_id" varchar(36);
alter table "public"."crm_followups" add column if not exists "due_at" varchar(40);
alter table "public"."crm_followups" add column if not exists "purpose" varchar(255);
alter table "public"."crm_followups" add column if not exists "notes" text;
alter table "public"."crm_followups" add column if not exists "status" varchar(12) default 'pending';
alter table "public"."crm_followups" add column if not exists "completed_at" varchar(40);
alter table "public"."crm_followups" add column if not exists "outcome" text;
alter table "public"."crm_followups" add column if not exists "created_by" varchar(100);
alter table "public"."crm_followups" add column if not exists "created_at" varchar(40);
alter table "public"."crm_followups" add column if not exists "updated_at" varchar(40);
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
alter table "public"."crm_interactions" add column if not exists "id" varchar(36);
alter table "public"."crm_interactions" add column if not exists "company_id" varchar(36);
alter table "public"."crm_interactions" add column if not exists "customer_id" varchar(36);
alter table "public"."crm_interactions" add column if not exists "kind" varchar(12);
alter table "public"."crm_interactions" add column if not exists "summary" text;
alter table "public"."crm_interactions" add column if not exists "occurred_at" varchar(40);
alter table "public"."crm_interactions" add column if not exists "created_by" varchar(100);
alter table "public"."crm_interactions" add column if not exists "created_at" varchar(40);
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
alter table "public"."bookings" add column if not exists "id" varchar(36);
alter table "public"."bookings" add column if not exists "company_id" varchar(36);
alter table "public"."bookings" add column if not exists "vehicle_id" varchar(36);
alter table "public"."bookings" add column if not exists "customer_id" varchar(36);
alter table "public"."bookings" add column if not exists "receipt_no" integer;
alter table "public"."bookings" add column if not exists "booking_amount" double precision;
alter table "public"."bookings" add column if not exists "payment_method" varchar(50);
alter table "public"."bookings" add column if not exists "booking_date" varchar(20);
alter table "public"."bookings" add column if not exists "expected_sale_date" varchar(20);
alter table "public"."bookings" add column if not exists "agreed_price" double precision;
alter table "public"."bookings" add column if not exists "status" varchar(20) default 'active';
alter table "public"."bookings" add column if not exists "notes" text;
alter table "public"."bookings" add column if not exists "sale_id" varchar(36);
alter table "public"."bookings" add column if not exists "cancelled_at" varchar(40);
alter table "public"."bookings" add column if not exists "refund_amount" double precision;
alter table "public"."bookings" add column if not exists "retained_amount" double precision;
alter table "public"."bookings" add column if not exists "cancel_notes" text;
alter table "public"."bookings" add column if not exists "created_by" varchar(100);
alter table "public"."bookings" add column if not exists "created_at" varchar(40);
alter table "public"."bookings" add column if not exists "updated_at" varchar(40);
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
alter table "public"."spare_parts" add column if not exists "id" varchar(36);
alter table "public"."spare_parts" add column if not exists "company_id" varchar(36);
alter table "public"."spare_parts" add column if not exists "name" varchar(255);
alter table "public"."spare_parts" add column if not exists "category" varchar(100);
alter table "public"."spare_parts" add column if not exists "brand_compatibility" varchar(255);
alter table "public"."spare_parts" add column if not exists "part_number" varchar(100);
alter table "public"."spare_parts" add column if not exists "quantity" integer default 0;
alter table "public"."spare_parts" add column if not exists "unit_cost" double precision;
alter table "public"."spare_parts" add column if not exists "selling_price" double precision;
alter table "public"."spare_parts" add column if not exists "vendor_id" varchar(36);
alter table "public"."spare_parts" add column if not exists "bill_no" varchar(100);
alter table "public"."spare_parts" add column if not exists "entry_date" varchar(20);
alter table "public"."spare_parts" add column if not exists "supplier" varchar(255);
alter table "public"."spare_parts" add column if not exists "min_stock_alert" integer;
alter table "public"."spare_parts" add column if not exists "location" varchar(255);
alter table "public"."spare_parts" add column if not exists "notes" text;
alter table "public"."spare_parts" add column if not exists "is_kit" boolean default false;
alter table "public"."spare_parts" add column if not exists "stock_type" varchar(20);
alter table "public"."spare_parts" add column if not exists "created_at" varchar(40);
alter table "public"."spare_parts" add column if not exists "updated_at" varchar(40);
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
alter table "public"."spare_parts_set_components" add column if not exists "part_id" varchar(36);
alter table "public"."spare_parts_set_components" add column if not exists "name" varchar(255);
alter table "public"."spare_parts_set_components" add column if not exists "stock" integer default 0;
alter table "public"."spare_parts_set_components" add column if not exists "rate" double precision default 0;

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
alter table "public"."kit_components" add column if not exists "id" varchar(36);
alter table "public"."kit_components" add column if not exists "company_id" varchar(36);
alter table "public"."kit_components" add column if not exists "kit_part_id" varchar(36);
alter table "public"."kit_components" add column if not exists "component_part_id" varchar(36);
alter table "public"."kit_components" add column if not exists "qty_per_kit" integer;
alter table "public"."kit_components" add column if not exists "created_by" varchar(100);
alter table "public"."kit_components" add column if not exists "created_at" varchar(40);
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
alter table "public"."part_transactions" add column if not exists "id" varchar(36);
alter table "public"."part_transactions" add column if not exists "company_id" varchar(36);
alter table "public"."part_transactions" add column if not exists "part_id" varchar(36);
alter table "public"."part_transactions" add column if not exists "part_name" varchar(500);
alter table "public"."part_transactions" add column if not exists "type" varchar(10);
alter table "public"."part_transactions" add column if not exists "quantity" integer;
alter table "public"."part_transactions" add column if not exists "reason" varchar(255);
alter table "public"."part_transactions" add column if not exists "date" varchar(20);
alter table "public"."part_transactions" add column if not exists "job_id" varchar(36);
alter table "public"."part_transactions" add column if not exists "notes" text;
alter table "public"."part_transactions" add column if not exists "created_by" varchar(100);
alter table "public"."part_transactions" add column if not exists "created_at" varchar(40);
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
alter table "public"."job_cards" add column if not exists "id" varchar(36);
alter table "public"."job_cards" add column if not exists "company_id" varchar(36);
alter table "public"."job_cards" add column if not exists "vehicle_id" varchar(36);
alter table "public"."job_cards" add column if not exists "is_external" boolean default false;
alter table "public"."job_cards" add column if not exists "vehicle_brand" varchar(100);
alter table "public"."job_cards" add column if not exists "vehicle_model" varchar(100);
alter table "public"."job_cards" add column if not exists "vehicle_year" integer;
alter table "public"."job_cards" add column if not exists "registration_number" varchar(50);
alter table "public"."job_cards" add column if not exists "customer_name" varchar(255);
alter table "public"."job_cards" add column if not exists "customer_contact" varchar(50);
alter table "public"."job_cards" add column if not exists "work_description" text;
alter table "public"."job_cards" add column if not exists "mechanic_id" varchar(36);
alter table "public"."job_cards" add column if not exists "mechanic_name" varchar(255);
alter table "public"."job_cards" add column if not exists "estimated_cost" double precision;
alter table "public"."job_cards" add column if not exists "notes" text;
alter table "public"."job_cards" add column if not exists "coupon_no" integer;
alter table "public"."job_cards" add column if not exists "job_date" varchar(20);
alter table "public"."job_cards" add column if not exists "parts" jsonb;
alter table "public"."job_cards" add column if not exists "job_number" varchar(50);
alter table "public"."job_cards" add column if not exists "status" varchar(20);
alter table "public"."job_cards" add column if not exists "actual_cost" double precision;
alter table "public"."job_cards" add column if not exists "created_at" varchar(40);
alter table "public"."job_cards" add column if not exists "completed_at" varchar(40);
alter table "public"."job_cards" add column if not exists "created_by" varchar(100);
alter table "public"."job_cards" add column if not exists "is_warranty" boolean default false;
alter table "public"."job_cards" add column if not exists "sanakhat_cost" double precision;
alter table "public"."job_cards" add column if not exists "labour_charge" double precision;
alter table "public"."job_cards" add column if not exists "resanakhat_cost" double precision;
alter table "public"."job_cards" add column if not exists "after_sale" boolean default false;
alter table "public"."job_cards" add column if not exists "updated_at" varchar(40);
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
alter table "public"."expenses" add column if not exists "id" varchar(36);
alter table "public"."expenses" add column if not exists "company_id" varchar(36);
alter table "public"."expenses" add column if not exists "vehicle_id" varchar(36);
alter table "public"."expenses" add column if not exists "category" varchar(100);
alter table "public"."expenses" add column if not exists "amount" double precision;
alter table "public"."expenses" add column if not exists "description" varchar(500);
alter table "public"."expenses" add column if not exists "date" varchar(20);
alter table "public"."expenses" add column if not exists "added_by" varchar(100);
alter table "public"."expenses" add column if not exists "created_at" varchar(40);
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
alter table "public"."vendor_payments" add column if not exists "id" varchar(36);
alter table "public"."vendor_payments" add column if not exists "company_id" varchar(36);
alter table "public"."vendor_payments" add column if not exists "vendor_id" varchar(36);
alter table "public"."vendor_payments" add column if not exists "amount" double precision;
alter table "public"."vendor_payments" add column if not exists "vehicle_id" varchar(36);
alter table "public"."vendor_payments" add column if not exists "payment_date" varchar(20);
alter table "public"."vendor_payments" add column if not exists "notes" text;
alter table "public"."vendor_payments" add column if not exists "recorded_by" varchar(100);
alter table "public"."vendor_payments" add column if not exists "created_at" varchar(40);
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
alter table "public"."emi_records" add column if not exists "id" varchar(36);
alter table "public"."emi_records" add column if not exists "company_id" varchar(36);
alter table "public"."emi_records" add column if not exists "customer_id" varchar(36);
alter table "public"."emi_records" add column if not exists "vehicle_id" varchar(36);
alter table "public"."emi_records" add column if not exists "loan_amount" double precision;
alter table "public"."emi_records" add column if not exists "down_payment" double precision;
alter table "public"."emi_records" add column if not exists "interest_rate" double precision;
alter table "public"."emi_records" add column if not exists "tenure_months" integer;
alter table "public"."emi_records" add column if not exists "start_date" varchar(20);
alter table "public"."emi_records" add column if not exists "financer_name" varchar(255);
alter table "public"."emi_records" add column if not exists "notes" text;
alter table "public"."emi_records" add column if not exists "monthly_installment" double precision;
alter table "public"."emi_records" add column if not exists "total_payable" double precision;
alter table "public"."emi_records" add column if not exists "total_interest" double precision;
alter table "public"."emi_records" add column if not exists "status" varchar(20) default 'active';
alter table "public"."emi_records" add column if not exists "created_at" varchar(40);
alter table "public"."emi_records" add column if not exists "customer_name" varchar(255);
alter table "public"."emi_records" add column if not exists "customer_phone" varchar(50);
alter table "public"."emi_records" add column if not exists "vehicle_name" varchar(255);
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
alter table "public"."emi_payments" add column if not exists "id" varchar(36);
alter table "public"."emi_payments" add column if not exists "company_id" varchar(36);
alter table "public"."emi_payments" add column if not exists "emi_id" varchar(36);
alter table "public"."emi_payments" add column if not exists "amount" double precision;
alter table "public"."emi_payments" add column if not exists "payment_date" varchar(20);
alter table "public"."emi_payments" add column if not exists "notes" text;
alter table "public"."emi_payments" add column if not exists "recorded_by" varchar(100);
alter table "public"."emi_payments" add column if not exists "created_at" varchar(40);
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
alter table "public"."vehicle_photos" add column if not exists "id" varchar(36);
alter table "public"."vehicle_photos" add column if not exists "company_id" varchar(36);
alter table "public"."vehicle_photos" add column if not exists "vehicle_id" varchar(36);
alter table "public"."vehicle_photos" add column if not exists "filename" varchar(500);
alter table "public"."vehicle_photos" add column if not exists "content_type" varchar(100);
alter table "public"."vehicle_photos" add column if not exists "data" text;
alter table "public"."vehicle_photos" add column if not exists "storage_path" varchar(500);
alter table "public"."vehicle_photos" add column if not exists "uploaded_at" varchar(40);
alter table "public"."vehicle_photos" add column if not exists "size" integer;
alter table "public"."vehicle_photos" add column if not exists "sort_order" integer;
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
alter table "public"."legal_documents" add column if not exists "id" varchar(36);
alter table "public"."legal_documents" add column if not exists "company_id" varchar(36);
alter table "public"."legal_documents" add column if not exists "vehicle_id" varchar(36);
alter table "public"."legal_documents" add column if not exists "filename" varchar(500);
alter table "public"."legal_documents" add column if not exists "content_type" varchar(100);
alter table "public"."legal_documents" add column if not exists "data" text;
alter table "public"."legal_documents" add column if not exists "storage_path" varchar(500);
alter table "public"."legal_documents" add column if not exists "doc_type" varchar(30);
alter table "public"."legal_documents" add column if not exists "original_name" varchar(500);
alter table "public"."legal_documents" add column if not exists "uploaded_at" varchar(40);
alter table "public"."legal_documents" add column if not exists "size" integer;
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
alter table "public"."leads" add column if not exists "id" varchar(36);
alter table "public"."leads" add column if not exists "company_id" varchar(36);
alter table "public"."leads" add column if not exists "type" varchar(20);
alter table "public"."leads" add column if not exists "name" varchar(255);
alter table "public"."leads" add column if not exists "phone" varchar(50);
alter table "public"."leads" add column if not exists "message" text;
alter table "public"."leads" add column if not exists "images" jsonb;
alter table "public"."leads" add column if not exists "requested_service" varchar(255);
alter table "public"."leads" add column if not exists "vehicle_type" varchar(100);
alter table "public"."leads" add column if not exists "preferred_date" varchar(20);
alter table "public"."leads" add column if not exists "status" varchar(20) default 'new';
alter table "public"."leads" add column if not exists "created_at" varchar(40);
alter table "public"."leads" add column if not exists "email" varchar(255);
alter table "public"."leads" add column if not exists "address" varchar(500);
alter table "public"."leads" add column if not exists "remark" text;
alter table "public"."leads" add column if not exists "decided_by" varchar(100);
alter table "public"."leads" add column if not exists "decided_at" varchar(40);
alter table "public"."leads" add column if not exists "customer_id" varchar(36);
alter table "public"."leads" add column if not exists "vehicle_id" varchar(36);
alter table "public"."leads" add column if not exists "seen_at" varchar(40);
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
alter table "public"."settings" add column if not exists "id" varchar(36);
alter table "public"."settings" add column if not exists "company_id" varchar(36);
alter table "public"."settings" add column if not exists "logo_url" varchar(1000);
alter table "public"."settings" add column if not exists "business_name" varchar(255);
alter table "public"."settings" add column if not exists "contact_phone" varchar(50);
alter table "public"."settings" add column if not exists "contact_email" varchar(255);
alter table "public"."settings" add column if not exists "address" varchar(500);
alter table "public"."settings" add column if not exists "hero_image_url" varchar(1000);
alter table "public"."settings" add column if not exists "service_image_url" varchar(1000);
alter table "public"."settings" add column if not exists "warranty_days_default" integer;
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
alter table "public"."sync_logs" add column if not exists "id" varchar(36);
alter table "public"."sync_logs" add column if not exists "company_id" varchar(36);
alter table "public"."sync_logs" add column if not exists "pushed_at" varchar(40);
alter table "public"."sync_logs" add column if not exists "count" integer;
alter table "public"."sync_logs" add column if not exists "status" varchar(20);
alter table "public"."sync_logs" add column if not exists "message" varchar(500);
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
alter table "public"."audit_logs" add column if not exists "company_id" varchar(36);
alter table "public"."audit_logs" add column if not exists "action" varchar(100);
alter table "public"."audit_logs" add column if not exists "vehicle_id" varchar(36);
alter table "public"."audit_logs" add column if not exists "user" varchar(100);
alter table "public"."audit_logs" add column if not exists "timestamp" varchar(40);
alter table "public"."audit_logs" add column if not exists "details" text;
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
alter table "public"."ai_chat_sessions" add column if not exists "id" varchar(36);
alter table "public"."ai_chat_sessions" add column if not exists "company_id" varchar(36);
alter table "public"."ai_chat_sessions" add column if not exists "messages" jsonb;
alter table "public"."ai_chat_sessions" add column if not exists "updated_at" varchar(40);
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
alter table "public"."facebook_pages" add column if not exists "id" varchar(36);
alter table "public"."facebook_pages" add column if not exists "company_id" varchar(36);
alter table "public"."facebook_pages" add column if not exists "page_id" varchar(64);
alter table "public"."facebook_pages" add column if not exists "page_name" varchar(255);
alter table "public"."facebook_pages" add column if not exists "access_token" text;
alter table "public"."facebook_pages" add column if not exists "connected_by" varchar(100);
alter table "public"."facebook_pages" add column if not exists "connected_at" varchar(40);
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
alter table "public"."offer_prizes" add column if not exists "id" varchar(36);
alter table "public"."offer_prizes" add column if not exists "company_id" varchar(36);
alter table "public"."offer_prizes" add column if not exists "name" varchar(100);
alter table "public"."offer_prizes" add column if not exists "weight" integer default 0;
alter table "public"."offer_prizes" add column if not exists "stock" integer default 0;
alter table "public"."offer_prizes" add column if not exists "sort_order" integer default 0;
alter table "public"."offer_prizes" add column if not exists "created_at" varchar(40);
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
alter table "public"."offer_codes" add column if not exists "id" varchar(36);
alter table "public"."offer_codes" add column if not exists "company_id" varchar(36);
alter table "public"."offer_codes" add column if not exists "code" varchar(20);
alter table "public"."offer_codes" add column if not exists "status" varchar(10) default 'NEW';
alter table "public"."offer_codes" add column if not exists "customer_name" varchar(255);
alter table "public"."offer_codes" add column if not exists "phone" varchar(50);
alter table "public"."offer_codes" add column if not exists "prize" varchar(100);
alter table "public"."offer_codes" add column if not exists "created_by" varchar(100);
alter table "public"."offer_codes" add column if not exists "created_at" varchar(40);
alter table "public"."offer_codes" add column if not exists "used_at" varchar(40);

create table if not exists "public"."page_views" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "visitor_id" varchar(64),
  "path" varchar(300),
  "referrer" varchar(100),
  "device" varchar(10),
  "email" varchar(255),
  "created_at" varchar(40)
);
alter table "public"."page_views" enable row level security;  -- the public API key can read nothing; the backend connects directly
alter table "public"."page_views" add column if not exists "id" varchar(36);
alter table "public"."page_views" add column if not exists "company_id" varchar(36);
alter table "public"."page_views" add column if not exists "visitor_id" varchar(64);
alter table "public"."page_views" add column if not exists "path" varchar(300);
alter table "public"."page_views" add column if not exists "referrer" varchar(100);
alter table "public"."page_views" add column if not exists "device" varchar(10);
alter table "public"."page_views" add column if not exists "email" varchar(255);
alter table "public"."page_views" add column if not exists "created_at" varchar(40);
create index if not exists "idx_page_views_company_id" on "public"."page_views" ("company_id");
create index if not exists "idx_page_views_created_at" on "public"."page_views" ("created_at");

create table if not exists "public"."fin_parties" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "name" varchar(200) not null,
  "phone" varchar(30),
  "address" varchar(300),
  "created_at" varchar(40),
  "updated_at" varchar(40),
  "party_type_id" varchar(36),
  constraint "uq_fin_parties_phone" unique ("company_id", "phone")
);
alter table "public"."fin_parties" enable row level security;  -- the public API key can read nothing; the backend connects directly
alter table "public"."fin_parties" add column if not exists "id" varchar(36);
alter table "public"."fin_parties" add column if not exists "company_id" varchar(36);
alter table "public"."fin_parties" add column if not exists "name" varchar(200);
alter table "public"."fin_parties" add column if not exists "phone" varchar(30);
alter table "public"."fin_parties" add column if not exists "address" varchar(300);
alter table "public"."fin_parties" add column if not exists "created_at" varchar(40);
alter table "public"."fin_parties" add column if not exists "updated_at" varchar(40);
alter table "public"."fin_parties" add column if not exists "party_type_id" varchar(36);
create index if not exists "idx_fin_parties_company" on "public"."fin_parties" ("company_id", "name");

create table if not exists "public"."fin_bank_accounts" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "name" varchar(150) not null,
  "bank_name" varchar(150),
  "account_number" varchar(60),
  "account_holder_name" varchar(150),
  "address" varchar(300),
  "created_at" varchar(40),
  "updated_at" varchar(40),
  constraint "uq_fin_accounts_name" unique ("company_id", "name")
);
alter table "public"."fin_bank_accounts" enable row level security;  -- the public API key can read nothing; the backend connects directly
alter table "public"."fin_bank_accounts" add column if not exists "id" varchar(36);
alter table "public"."fin_bank_accounts" add column if not exists "company_id" varchar(36);
alter table "public"."fin_bank_accounts" add column if not exists "name" varchar(150);
alter table "public"."fin_bank_accounts" add column if not exists "bank_name" varchar(150);
alter table "public"."fin_bank_accounts" add column if not exists "account_number" varchar(60);
alter table "public"."fin_bank_accounts" add column if not exists "account_holder_name" varchar(150);
alter table "public"."fin_bank_accounts" add column if not exists "address" varchar(300);
alter table "public"."fin_bank_accounts" add column if not exists "created_at" varchar(40);
alter table "public"."fin_bank_accounts" add column if not exists "updated_at" varchar(40);

create table if not exists "public"."fin_account_transfers" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "from_account_id" varchar(36),
  "to_account_id" varchar(36),
  "amount" double precision not null,
  "note" varchar(500),
  "transfer_date" varchar(20) not null,
  "created_at" varchar(40)
);
alter table "public"."fin_account_transfers" enable row level security;  -- the public API key can read nothing; the backend connects directly
alter table "public"."fin_account_transfers" add column if not exists "id" varchar(36);
alter table "public"."fin_account_transfers" add column if not exists "company_id" varchar(36);
alter table "public"."fin_account_transfers" add column if not exists "from_account_id" varchar(36);
alter table "public"."fin_account_transfers" add column if not exists "to_account_id" varchar(36);
alter table "public"."fin_account_transfers" add column if not exists "amount" double precision;
alter table "public"."fin_account_transfers" add column if not exists "note" varchar(500);
alter table "public"."fin_account_transfers" add column if not exists "transfer_date" varchar(20);
alter table "public"."fin_account_transfers" add column if not exists "created_at" varchar(40);
create index if not exists "idx_fin_transfers_company" on "public"."fin_account_transfers" ("company_id", "transfer_date");

create table if not exists "public"."fin_expense_categories" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "name" varchar(150) not null,
  "created_at" varchar(40),
  "updated_at" varchar(40),
  "expense_group" varchar(10),
  constraint "uq_fin_categories_name" unique ("company_id", "name")
);
alter table "public"."fin_expense_categories" enable row level security;  -- the public API key can read nothing; the backend connects directly
alter table "public"."fin_expense_categories" add column if not exists "id" varchar(36);
alter table "public"."fin_expense_categories" add column if not exists "company_id" varchar(36);
alter table "public"."fin_expense_categories" add column if not exists "name" varchar(150);
alter table "public"."fin_expense_categories" add column if not exists "created_at" varchar(40);
alter table "public"."fin_expense_categories" add column if not exists "updated_at" varchar(40);
alter table "public"."fin_expense_categories" add column if not exists "expense_group" varchar(10);

create table if not exists "public"."fin_items" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "name" varchar(250) not null,
  "rate" double precision,
  "created_at" varchar(40),
  "updated_at" varchar(40),
  constraint "uq_fin_items_name" unique ("company_id", "name")
);
alter table "public"."fin_items" enable row level security;  -- the public API key can read nothing; the backend connects directly
alter table "public"."fin_items" add column if not exists "id" varchar(36);
alter table "public"."fin_items" add column if not exists "company_id" varchar(36);
alter table "public"."fin_items" add column if not exists "name" varchar(250);
alter table "public"."fin_items" add column if not exists "rate" double precision;
alter table "public"."fin_items" add column if not exists "created_at" varchar(40);
alter table "public"."fin_items" add column if not exists "updated_at" varchar(40);

create table if not exists "public"."fin_transactions" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "type" varchar(20) not null,
  "amount" double precision not null,
  "note" text,
  "party_name" varchar(200),
  "customer_id" varchar(36),
  "bill_no" varchar(60),
  "bill_date" varchar(20),
  "party_address" varchar(300),
  "vat_pan_no" varchar(60),
  "items" text,
  "discount_amount" double precision not null default 0,
  "vat_amount" double precision not null default 0,
  "expense_category_id" varchar(36),
  "payment_mode" varchar(10) not null default 'cash',
  "bank_account_id" varchar(36),
  "source_type" varchar(40),
  "source_id" varchar(36),
  "created_at" varchar(40),
  "updated_at" varchar(40),
  "installation_charge" double precision not null default 0,
  "service_charges" text
);
alter table "public"."fin_transactions" enable row level security;  -- the public API key can read nothing; the backend connects directly
alter table "public"."fin_transactions" add column if not exists "id" varchar(36);
alter table "public"."fin_transactions" add column if not exists "company_id" varchar(36);
alter table "public"."fin_transactions" add column if not exists "type" varchar(20);
alter table "public"."fin_transactions" add column if not exists "amount" double precision;
alter table "public"."fin_transactions" add column if not exists "note" text;
alter table "public"."fin_transactions" add column if not exists "party_name" varchar(200);
alter table "public"."fin_transactions" add column if not exists "customer_id" varchar(36);
alter table "public"."fin_transactions" add column if not exists "bill_no" varchar(60);
alter table "public"."fin_transactions" add column if not exists "bill_date" varchar(20);
alter table "public"."fin_transactions" add column if not exists "party_address" varchar(300);
alter table "public"."fin_transactions" add column if not exists "vat_pan_no" varchar(60);
alter table "public"."fin_transactions" add column if not exists "items" text;
alter table "public"."fin_transactions" add column if not exists "discount_amount" double precision default 0;
alter table "public"."fin_transactions" add column if not exists "vat_amount" double precision default 0;
alter table "public"."fin_transactions" add column if not exists "expense_category_id" varchar(36);
alter table "public"."fin_transactions" add column if not exists "payment_mode" varchar(10) default 'cash';
alter table "public"."fin_transactions" add column if not exists "bank_account_id" varchar(36);
alter table "public"."fin_transactions" add column if not exists "source_type" varchar(40);
alter table "public"."fin_transactions" add column if not exists "source_id" varchar(36);
alter table "public"."fin_transactions" add column if not exists "created_at" varchar(40);
alter table "public"."fin_transactions" add column if not exists "updated_at" varchar(40);
alter table "public"."fin_transactions" add column if not exists "installation_charge" double precision default 0;
alter table "public"."fin_transactions" add column if not exists "service_charges" text;
create index if not exists "idx_fin_tx_company" on "public"."fin_transactions" ("company_id", "type", "created_at");
create index if not exists "idx_fin_tx_party" on "public"."fin_transactions" ("customer_id");

create table if not exists "public"."fin_customer_ledger" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "customer_id" varchar(36) not null,
  "entry_type" varchar(10) not null,
  "amount" double precision not null,
  "note" text,
  "source" varchar(10) not null default 'manual',
  "source_type" varchar(40),
  "source_id" varchar(36),
  "bank_account_id" varchar(36),
  "entry_date" varchar(20),
  "receipt_no" varchar(40),
  "created_at" varchar(40)
);
alter table "public"."fin_customer_ledger" enable row level security;  -- the public API key can read nothing; the backend connects directly
alter table "public"."fin_customer_ledger" add column if not exists "id" varchar(36);
alter table "public"."fin_customer_ledger" add column if not exists "company_id" varchar(36);
alter table "public"."fin_customer_ledger" add column if not exists "customer_id" varchar(36);
alter table "public"."fin_customer_ledger" add column if not exists "entry_type" varchar(10);
alter table "public"."fin_customer_ledger" add column if not exists "amount" double precision;
alter table "public"."fin_customer_ledger" add column if not exists "note" text;
alter table "public"."fin_customer_ledger" add column if not exists "source" varchar(10) default 'manual';
alter table "public"."fin_customer_ledger" add column if not exists "source_type" varchar(40);
alter table "public"."fin_customer_ledger" add column if not exists "source_id" varchar(36);
alter table "public"."fin_customer_ledger" add column if not exists "bank_account_id" varchar(36);
alter table "public"."fin_customer_ledger" add column if not exists "entry_date" varchar(20);
alter table "public"."fin_customer_ledger" add column if not exists "receipt_no" varchar(40);
alter table "public"."fin_customer_ledger" add column if not exists "created_at" varchar(40);
create index if not exists "idx_fin_cl_party" on "public"."fin_customer_ledger" ("customer_id", "created_at");
create index if not exists "idx_fin_cl_company" on "public"."fin_customer_ledger" ("company_id");
create index if not exists "idx_fin_cl_source" on "public"."fin_customer_ledger" ("source_type", "source_id");

create table if not exists "public"."fin_vendor_ledger" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "vendor_id" varchar(36) not null,
  "entry_type" varchar(10) not null,
  "amount" double precision not null,
  "note" text,
  "source" varchar(10) not null default 'manual',
  "source_type" varchar(40),
  "source_id" varchar(36),
  "bank_account_id" varchar(36),
  "entry_date" varchar(20),
  "receipt_no" varchar(40),
  "created_at" varchar(40)
);
alter table "public"."fin_vendor_ledger" enable row level security;  -- the public API key can read nothing; the backend connects directly
alter table "public"."fin_vendor_ledger" add column if not exists "id" varchar(36);
alter table "public"."fin_vendor_ledger" add column if not exists "company_id" varchar(36);
alter table "public"."fin_vendor_ledger" add column if not exists "vendor_id" varchar(36);
alter table "public"."fin_vendor_ledger" add column if not exists "entry_type" varchar(10);
alter table "public"."fin_vendor_ledger" add column if not exists "amount" double precision;
alter table "public"."fin_vendor_ledger" add column if not exists "note" text;
alter table "public"."fin_vendor_ledger" add column if not exists "source" varchar(10) default 'manual';
alter table "public"."fin_vendor_ledger" add column if not exists "source_type" varchar(40);
alter table "public"."fin_vendor_ledger" add column if not exists "source_id" varchar(36);
alter table "public"."fin_vendor_ledger" add column if not exists "bank_account_id" varchar(36);
alter table "public"."fin_vendor_ledger" add column if not exists "entry_date" varchar(20);
alter table "public"."fin_vendor_ledger" add column if not exists "receipt_no" varchar(40);
alter table "public"."fin_vendor_ledger" add column if not exists "created_at" varchar(40);
create index if not exists "idx_fin_vl_party" on "public"."fin_vendor_ledger" ("vendor_id", "created_at");
create index if not exists "idx_fin_vl_company" on "public"."fin_vendor_ledger" ("company_id");
create index if not exists "idx_fin_vl_source" on "public"."fin_vendor_ledger" ("source_type", "source_id");

create table if not exists "public"."fin_statement_imports" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "reference_code" varchar(120) not null,
  "created_at" varchar(40),
  constraint "uq_fin_imports_ref" unique ("company_id", "reference_code")
);
alter table "public"."fin_statement_imports" enable row level security;  -- the public API key can read nothing; the backend connects directly
alter table "public"."fin_statement_imports" add column if not exists "id" varchar(36);
alter table "public"."fin_statement_imports" add column if not exists "company_id" varchar(36);
alter table "public"."fin_statement_imports" add column if not exists "reference_code" varchar(120);
alter table "public"."fin_statement_imports" add column if not exists "created_at" varchar(40);

create table if not exists "public"."fin_rentals" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "car" varchar(250) not null,
  "model" varchar(150),
  "customer_id" varchar(36),
  "customer_name" varchar(200),
  "start_date" varchar(20) not null,
  "end_date" varchar(20),
  "returned_on" varchar(20),
  "rate_per_day" double precision not null default 0,
  "note" varchar(500),
  "created_at" varchar(40),
  "updated_at" varchar(40)
);
alter table "public"."fin_rentals" enable row level security;  -- the public API key can read nothing; the backend connects directly
alter table "public"."fin_rentals" add column if not exists "id" varchar(36);
alter table "public"."fin_rentals" add column if not exists "company_id" varchar(36);
alter table "public"."fin_rentals" add column if not exists "car" varchar(250);
alter table "public"."fin_rentals" add column if not exists "model" varchar(150);
alter table "public"."fin_rentals" add column if not exists "customer_id" varchar(36);
alter table "public"."fin_rentals" add column if not exists "customer_name" varchar(200);
alter table "public"."fin_rentals" add column if not exists "start_date" varchar(20);
alter table "public"."fin_rentals" add column if not exists "end_date" varchar(20);
alter table "public"."fin_rentals" add column if not exists "returned_on" varchar(20);
alter table "public"."fin_rentals" add column if not exists "rate_per_day" double precision default 0;
alter table "public"."fin_rentals" add column if not exists "note" varchar(500);
alter table "public"."fin_rentals" add column if not exists "created_at" varchar(40);
alter table "public"."fin_rentals" add column if not exists "updated_at" varchar(40);
create index if not exists "idx_fin_rentals_company" on "public"."fin_rentals" ("company_id", "start_date");

create table if not exists "public"."fin_cash_account" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "name" varchar(150),
  "bank_name" varchar(150),
  "account_number" varchar(60),
  "account_holder_name" varchar(150),
  "address" varchar(300),
  "updated_at" varchar(40),
  constraint "uq_fin_cash_company" unique ("company_id")
);
alter table "public"."fin_cash_account" enable row level security;  -- the public API key can read nothing; the backend connects directly
alter table "public"."fin_cash_account" add column if not exists "id" varchar(36);
alter table "public"."fin_cash_account" add column if not exists "company_id" varchar(36);
alter table "public"."fin_cash_account" add column if not exists "name" varchar(150);
alter table "public"."fin_cash_account" add column if not exists "bank_name" varchar(150);
alter table "public"."fin_cash_account" add column if not exists "account_number" varchar(60);
alter table "public"."fin_cash_account" add column if not exists "account_holder_name" varchar(150);
alter table "public"."fin_cash_account" add column if not exists "address" varchar(300);
alter table "public"."fin_cash_account" add column if not exists "updated_at" varchar(40);

create table if not exists "public"."fin_quotations" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "quote_seq" integer not null default 0,
  "quote_no" varchar(80),
  "quote_date" varchar(20),
  "subject" varchar(300),
  "client_name" varchar(200) not null,
  "client_address" varchar(300),
  "salesperson_name" varchar(150),
  "salesperson_phone" varchar(40),
  "items" text,
  "terms" text,
  "total" double precision not null default 0,
  "business" text,
  "created_at" varchar(40)
);
alter table "public"."fin_quotations" enable row level security;  -- the public API key can read nothing; the backend connects directly
alter table "public"."fin_quotations" add column if not exists "id" varchar(36);
alter table "public"."fin_quotations" add column if not exists "company_id" varchar(36);
alter table "public"."fin_quotations" add column if not exists "quote_seq" integer default 0;
alter table "public"."fin_quotations" add column if not exists "quote_no" varchar(80);
alter table "public"."fin_quotations" add column if not exists "quote_date" varchar(20);
alter table "public"."fin_quotations" add column if not exists "subject" varchar(300);
alter table "public"."fin_quotations" add column if not exists "client_name" varchar(200);
alter table "public"."fin_quotations" add column if not exists "client_address" varchar(300);
alter table "public"."fin_quotations" add column if not exists "salesperson_name" varchar(150);
alter table "public"."fin_quotations" add column if not exists "salesperson_phone" varchar(40);
alter table "public"."fin_quotations" add column if not exists "items" text;
alter table "public"."fin_quotations" add column if not exists "terms" text;
alter table "public"."fin_quotations" add column if not exists "total" double precision default 0;
alter table "public"."fin_quotations" add column if not exists "business" text;
alter table "public"."fin_quotations" add column if not exists "created_at" varchar(40);
create index if not exists "idx_fin_quotations_company" on "public"."fin_quotations" ("company_id", "quote_seq");

create table if not exists "public"."fin_party_types" (
  "id" varchar(36) not null primary key,
  "company_id" varchar(36) not null,
  "name" varchar(100) not null,
  "created_at" varchar(40),
  constraint "uq_fin_party_types_name" unique ("company_id", "name")
);
alter table "public"."fin_party_types" enable row level security;  -- the public API key can read nothing; the backend connects directly
alter table "public"."fin_party_types" add column if not exists "id" varchar(36);
alter table "public"."fin_party_types" add column if not exists "company_id" varchar(36);
alter table "public"."fin_party_types" add column if not exists "name" varchar(100);
alter table "public"."fin_party_types" add column if not exists "created_at" varchar(40);

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
do $$ begin alter table "public"."fin_parties" add constraint "fk_fin_parties_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."fin_bank_accounts" add constraint "fk_fin_accounts_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."fin_account_transfers" add constraint "fk_fin_transfers_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."fin_expense_categories" add constraint "fk_fin_categories_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."fin_items" add constraint "fk_fin_items_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."fin_transactions" add constraint "fk_fin_tx_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."fin_customer_ledger" add constraint "fk_fin_cl_party" foreign key ("customer_id") references "public"."fin_parties" ("id") ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."fin_customer_ledger" add constraint "fk_fin_cl_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."fin_vendor_ledger" add constraint "fk_fin_vl_party" foreign key ("vendor_id") references "public"."fin_parties" ("id") ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."fin_vendor_ledger" add constraint "fk_fin_vl_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."fin_statement_imports" add constraint "fk_fin_imports_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."fin_rentals" add constraint "fk_fin_rentals_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."fin_rentals" add constraint "fk_fin_rentals_party" foreign key ("customer_id") references "public"."fin_parties" ("id") ON DELETE SET NULL; exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."fin_cash_account" add constraint "fk_fin_cash_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."fin_quotations" add constraint "fk_fin_quotations_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;
do $$ begin alter table "public"."fin_party_types" add constraint "fk_fin_party_types_company" foreign key ("company_id") references "public"."companies" ("id"); exception when duplicate_object then null; end $$;

commit;

notify pgrst, 'reload schema';
