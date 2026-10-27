# Minilytics API

All programmatic access lives under `/api/v1`. Every endpoint is authenticated with a site's
**API key** — the `ml_...` value shown in the site's Settings in the dashboard. Pass it as a Bearer
token:

```
Authorization: Bearer ml_xxxxxxxxxxxxxxxx
```

One key grants access to **one site**. There is no global/admin key. If a key leaks, rotate it from
Settings (**Rotate key**) — the old one stops working immediately.

Base URL for this deployment: `https://minilytics.gneuman.workers.dev`

There are three groups of endpoints:

- **Read** — pull a site's stats (for scripts, dashboards, AI agents).
- **Summary** — one compact, AI-ready snapshot.
- **Ingest** — push payments, goals and external events in.

Separately, **payment webhooks** (Stripe, Dodo) are configured per site and do not use the API key —
see [Payments & revenue](#payments--revenue).

---

## Authentication

```bash
# Missing or wrong key → 401
curl https://minilytics.gneuman.workers.dev/api/v1/summary
# {"error":"invalid api key"}

# With the key → 200
curl https://minilytics.gneuman.workers.dev/api/v1/summary \
  -H "Authorization: Bearer ml_xxxxxxxxxxxxxxxx"
```

### Shared query parameters (read + summary)

These accept the same range/filter params the dashboard uses:

| Param | Example | Meaning |
|---|---|---|
| `range` | `today`, `yesterday`, `24h`, `2d`, `7d`, `30d`, `90d`, `12mo`, `all` | Time window. Default: `7d`. |
| `from` / `to` | `?from=1790575200000&to=1793110725925` | Custom range in epoch ms (overrides `range`). |
| `filters` | `?filters={"channel":"Organic Search"}` | URL-encoded JSON; restricts to matching sessions. Keys: `channel`, `source`, `referrer_domain`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `ref`, `country`, `region`, `city`, `browser`, `os`, `device`, `entry_page`, `exit_page`, `hostname`, `page`, `goal`. |

Money in responses is in **major currency units** (e.g. `29.99`, not `2999`) for the summary
endpoint; the raw read endpoints return minor units as stored — see each endpoint.

---

## Summary — `GET /api/v1/summary`

One call for the whole picture of a site in a window: KPIs now vs the previous period, plus top
sources, channels and entry pages ranked by revenue. Built for an AI agent deciding what to publish.
All money is in major units.

```bash
curl "https://minilytics.gneuman.workers.dev/api/v1/summary?range=30d" \
  -H "Authorization: Bearer ml_xxxxxxxxxxxxxxxx"
```

Response (abridged):

```json
{
  "site": { "id": "5p22002i1r1g6u4h", "name": "Gabriel Neuman", "domain": "gabrielneuman.com" },
  "range": { "from": 1790575200000, "to": 1793110725925, "granularity": "day" },
  "currency": "MXN",
  "kpis": {
    "current":  { "visitors": 125, "sessions": 134, "pageviews": 151,
                  "bounceRate": 0.925, "avgDuration": 41361,
                  "revenue": 0, "payments": 0, "customers": 0,
                  "conversionRate": 0, "revenuePerVisitor": 0 },
    "previous": { "visitors": 0, "...": 0 },
    "online": 2
  },
  "topSources":   [ { "label": "Direct/None", "visitors": 89, "revenue": 0, "customers": 0, "revenuePerVisitor": 0 } ],
  "topChannels":  [ { "label": "Organic Search", "visitors": 37, "revenue": 0, "customers": 0, "revenuePerVisitor": 0 } ],
  "topEntryPages":[ { "label": "/modelos-ia-gratuitos", "visitors": 18, "revenue": 0, "customers": 0, "revenuePerVisitor": 0 } ]
}
```

Notes:
- `bounceRate` and `conversionRate` are fractions (0–1). `avgDuration` is in milliseconds.
- `previous` is the immediately preceding window of the same length — for change %.
- `revenue` stays `0` until a payment source is connected (see below).

---

## Read endpoints

Same data the dashboard renders. Money is in **minor units** (cents) unless noted; the dashboard
divides by `decimals` (returned by `overview`). Accept the shared query params above.

### `GET /api/v1/read/overview`
KPIs (current + previous), `online` count, and a time series for charting.

### `GET /api/v1/read/breakdown?dim=<dimension>&limit=<n>`
Rows for one dimension, ranked by visitors. `limit` default 100, max 500.

`dim` values: `source`, `channel`, `campaign`, `keyword`, `utm_source`, `utm_medium`, `utm_content`,
`ref`, `country`, `region`, `city`, `browser`, `os`, `device`, `entry_page`, `exit_page`, `hostname`,
`referrer`.

```bash
curl "https://minilytics.gneuman.workers.dev/api/v1/read/breakdown?dim=entry_page&limit=20" \
  -H "Authorization: Bearer ml_xxxxxxxxxxxxxxxx"
```

```json
[ { "label": "/modelos-ia-gratuitos", "visitors": 18, "pageviews": 24, "revenue": 0, "customers": 0, "extra": null } ]
```

### `GET /api/v1/read/customers`
Up to 200 recent payments with attribution: who paid, how much, the source/channel credited, and how
the payment was matched (`matched_by`).

### `GET /api/v1/read/visitors`
Up to 200 recent visitors with sessions, pageviews, duration, source and total `spent`.

### `GET /api/v1/read/visitors/:visitorId`
Everything one visitor did: profile, sessions, events (pages/clicks/goals) and payments. Includes
`currency` and `decimals`.

---

## Ingest endpoints

### `POST /api/v1/events` — external metrics
Push metrics from other platforms (LinkedIn impressions, newsletter opens…) to sit alongside your
traffic.

| Field | Required | Notes |
|---|---|---|
| `name` | yes | What happened, e.g. `linkedin_impressions`. |
| `type` | no | Default `external`. The reserved tracker types `pageview`/`goal`/`outbound` are rejected (coerced to `external`). |
| `value` | no | Number; stored inside `props.value`. |
| `path` | no | A URL path to associate. |
| `visitor_id` | no | A real `ml_vid`; attaches to that visitor's latest session. |
| `timestamp` | no | ISO string; default now. |
| `props` | no | Any JSON object; `props.platform` names the synthetic visitor. |

Without a `visitor_id`, the event is filed under a synthetic visitor `ext:<platform-or-name>` (and a
matching synthetic session with `source=external`, `channel=External`), so aggregate platform metrics
stay groupable without touching real visitor data.

```bash
curl -X POST https://minilytics.gneuman.workers.dev/api/v1/events \
  -H "Authorization: Bearer ml_xxxxxxxxxxxxxxxx" -H "Content-Type: application/json" \
  -d '{"name":"linkedin_impressions","value":1234,"props":{"platform":"linkedin","post":"/p/abc"}}'
# {"ok":true,"visitor_id":"ext:linkedin","synthetic":true}
```

### `POST /api/v1/goals` — server-side goals
Record a goal (e.g. `signup`) from your backend against a known visitor.

```bash
curl -X POST https://minilytics.gneuman.workers.dev/api/v1/goals \
  -H "Authorization: Bearer ml_xxxxxxxxxxxxxxxx" -H "Content-Type: application/json" \
  -d '{"visitor_id":"<ml_vid>","name":"signup","props":{"plan":"pro"}}'
```
Returns `404` if the visitor has no session yet.

### `POST /api/v1/payments` — generic payment
For any payment provider without a native webhook. Amount in **major units**.

| Field | Required | Notes |
|---|---|---|
| `transaction_id` | yes | Unique id for the payment. |
| `amount` | yes | Number in major units, e.g. `29.99`. |
| `currency` | no | ISO code; default the site's currency. |
| `visitor_id` | no | `ml_vid` cookie, for direct attribution. |
| `email` / `name` | no | Used to match the payment to a visitor. |
| `customer_id` | no | For linking renewals. |
| `timestamp` | no | ISO string; default now. |
| `refunded` | no | `true` records a refund (negative amount). |
| `renewal` | no | `true` marks a subscription renewal. |

```bash
curl -X POST https://minilytics.gneuman.workers.dev/api/v1/payments \
  -H "Authorization: Bearer ml_xxxxxxxxxxxxxxxx" -H "Content-Type: application/json" \
  -d '{"transaction_id":"txn_1","amount":29.99,"currency":"MXN","email":"jane@acme.com"}'
# {"ok":true,"attributed":true,"visitor_id":"..."}
```

---

## Payments & revenue

`revenue` in the stats stays `0` until payments flow in. Three ways in, in order of preference:

1. **Stripe webhook** (native, no code): `POST /api/webhooks/stripe/:siteId`. Configure the endpoint
   in Stripe with events `payment_intent.succeeded`, `checkout.session.completed`, `charge.refunded`,
   then paste the signing secret into the site's Settings. Pass `ml_visitor_id` / `ml_session_id` in
   the Checkout metadata (or `client_reference_id`) so a payment links to the visitor who clicked.
2. **Dodo webhook** (native, no code): `POST /api/webhooks/dodo/:siteId`. Paste the Dodo webhook
   secret into Settings.
3. **Generic API** (`POST /api/v1/payments`, above) for anything else — e.g. a Zoho Books custom
   function that POSTs when an invoice is marked paid. See `docs/planes/` for the Zoho integration
   plan once decided.

---

## Errors

| Status | Body | Meaning |
|---|---|---|
| `400` | `{"error":"..."}` | Bad input (missing required field, unknown `dim`). |
| `401` | `{"error":"invalid api key"}` | Missing or wrong Bearer key. |
| `404` | `{"error":"..."}` | Visitor not found / unknown route under `/api`. |
