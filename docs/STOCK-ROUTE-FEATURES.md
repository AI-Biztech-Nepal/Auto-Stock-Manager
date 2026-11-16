# Which stock.* feature owns which route

Generated from `api_router` by the table in `backend/portal_bridge.py` (`PATH_FEATURES`); `tests/test_stock_feature_guards.py` fails if a gated route has no guard. 216 routes in all.

## stock.ai_assistant (7)
- `GET /ai/festival-intelligence`
- `GET /assistant/briefing`
- `GET /assistant/key`
- `POST /ai/chatbot`
- `POST /ai/price-suggestion`
- `POST /ai/suggestions`
- `POST /assistant/lookup`

## stock.bookings (5)
- `DELETE /bookings/{bid}`
- `GET /bookings`
- `POST /bookings`
- `POST /bookings/{bid}/cancel`
- `PUT /bookings/{bid}`

## stock.crm (15)
- `DELETE /crm/customers/{cid}`
- `DELETE /crm/followups/{fid}`
- `DELETE /crm/interactions/{iid}`
- `GET /crm/customers/{cid}`
- `GET /crm/overview`
- `GET /crm/sale-notes-leads`
- `GET /crm/vehicle-options`
- `POST /crm/customers/{cid}/followups`
- `POST /crm/customers/{cid}/interactions`
- `POST /crm/import`
- `POST /crm/sale-notes-leads`
- `PUT /crm/customers/{cid}/assign`
- `PUT /crm/customers/{cid}/lead-status`
- `PUT /crm/followups/{fid}`
- `PUT /crm/interactions/{iid}`

## stock.job_cards (4)
- `DELETE /jobs/{jid}`
- `GET /jobs`
- `POST /jobs`
- `PUT /jobs/{jid}`

## stock.leads (7)
- `GET /leads`
- `GET /leads/new-count`
- `POST /leads/seen`
- `POST /leads/{lid}/accept`
- `POST /leads/{lid}/reject`
- `POST /public/leads`
- `POST /public/leads/click`

## stock.offers (5)
- `GET /offers/dashain`
- `GET /public/offers/dashain`
- `POST /public/offers/dashain/check`
- `POST /public/offers/dashain/spin`
- `PUT /offers/dashain/prizes`

## stock.public_site (4)
- `GET /public/settings`
- `GET /public/vehicles`
- `GET /public/vehicles/{vid}`
- `GET /public/vehicles/{vid}/photos/{photo_id}`

## stock.sanakhat (3)
- `GET /sanakhat/vehicles`
- `PATCH /sanakhat/vehicles/{vid}`
- `PATCH /vehicles/{vid}/sale-statuses`

## stock.share (11)
- `DELETE /facebook/page`
- `GET /facebook/callback`
- `GET /facebook/connect`
- `GET /facebook/pending/{nonce}`
- `GET /facebook/status`
- `GET /public/share/{vid}`
- `GET /share/link/{vid}`
- `GET /share/profile`
- `POST /facebook/post`
- `POST /facebook/select`
- `POST /share/captions`

## stock.spare_parts (13)
- `DELETE /spare-parts/{pid}`
- `GET /spare-parts`
- `GET /spare-parts/summary`
- `GET /spare-parts/{pid}/containing-kits`
- `GET /spare-parts/{pid}/kit-components`
- `GET /spare-parts/{pid}/transactions`
- `POST /spare-parts`
- `POST /spare-parts/{pid}/adjust-stock`
- `POST /spare-parts/{pid}/break-kit`
- `POST /spare-parts/{pid}/kit-components`
- `POST /spare-parts/{pid}/set-components/stock-out`
- `POST /spare-parts/{pid}/stock-out`
- `PUT /spare-parts/{pid}`

## stock.vehicles (5)
- `DELETE /vehicles/{vid}/legal-documents/{doc_id}`
- `GET /legal-documents/{doc_id}/file`
- `GET /vehicles/{vid}/legal-documents`
- `GET /vehicles/{vid}/qr-data`
- `POST /vehicles/{vid}/legal-documents`

## stock.visits (3)
- `GET /visits/search`
- `GET /visits/summary`
- `POST /public/visit`

## stock.warranty (4)
- `GET /warranties`
- `POST /warranties/{vid}/restore`
- `POST /warranties/{vid}/void`
- `PUT /warranties/{vid}/length`

## Not gated

- infra / Finance (not flagged here): 67 routes
- core: 63 routes

Core on purpose until the generic items core (Prompt 4): `/vehicles` CRUD, customers, sales, vendors, reports, settings, team, expenses, photos, presence, audit log. `/fin`, `/emi*`, `/partners*`, `/finance/summary` go to Finance (Prompt 3c).
