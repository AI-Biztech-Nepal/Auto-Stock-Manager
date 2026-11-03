-- Finance books: services on bills and Direct / Indirect expense heads (Profit & Loss).
--
-- RUN BY HAND, ONCE, after migration_add_finance_books.sql. Nothing in the app runs this file. Until it
-- has been run, the Finance tab shows "not set up yet" naming this file.
--
--   mysql -u <user> -p <db>  < migration_add_finance_services.sql
--
-- Safe to re-run. It only ADDS two nullable columns; existing rows keep working unchanged.
--
--   fin_transactions.service_charges   the service lines of a Sale bill (installation, labour, repair ...)
--                                      or a Purchase bill (services bought in / outsourced work):
--                                      [{"name": "Servicing", "amount": 500}, ...]. They are part of the bill:
--                                      the discount and VAT apply to the items and the services together.
--                                      The P&L shows services sold as direct income and services bought as a
--                                      direct expense.
--   fin_expense_categories.expense_group  'direct' or 'indirect'. A head is direct unless marked indirect.

ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS service_charges JSON NULL;
ALTER TABLE fin_expense_categories ADD COLUMN IF NOT EXISTS expense_group VARCHAR(10) NULL;
