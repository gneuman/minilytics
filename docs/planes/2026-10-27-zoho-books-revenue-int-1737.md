---
titulo: "Revenue de Zoho Books → minilytics (INT-1737)"
fecha: 2026-10-27
proyecto: minilytics
estado: minilytics-listo / pendiente-config-n8n-zoho
tipo: integracion
tags: [revenue, zoho-books, n8n, webhook, stripe, api, INT-1737]
---

## Objetivo

Que **todo el ingreso caiga en minilytics** (fuente de verdad de datos): los cobros de Stripe y los
de **Zoho Books** (efectivo, depósito, tarjeta). El revenue del dashboard hoy es 0 porque no hay
fuente de pagos conectada. Linear: [INT-1737](https://linear.app/gnb-labs/issue/INT-1737).

## Qué ya está listo (cero código nuevo en minilytics)

- **Stripe:** webhook nativo `POST /api/webhooks/stripe/:siteId` ya implementado. Solo configurar en
  Stripe (eventos `payment_intent.succeeded`, `checkout.session.completed`, `charge.refunded`) y
  pegar el signing secret en Settings del sitio.
- **Genérico (para Zoho):** `POST /api/v1/payments` con `Authorization: Bearer <api_key>`. Acepta
  `transaction_id`, `amount` (decimal, p.ej. 1500.00), `currency`, `email`, `name`, `timestamp`.
- **El dinero nunca se pierde:** si el `email` no liga con ningún visitante, el pago entra igual al
  total y aparece como **"Sin atribuir"** (no inventa fuente). Verificado en producción.
- **API documentada:** `docs/API.md`.
- Worker en producción: `https://minilytics.gneuman.workers.dev` (sitio `gabrielneuman.com`, MXN).

## Decisión de arquitectura (tomada 2026-10-27)

**Camino B: Zoho Books → n8n → minilytics.** Elegido porque el plan de Zoho Books puede no tener
Custom Functions, y porque las automatizaciones viven en n8n (regla GNB).

**Dónde se valida qué:**
- La **firma HMAC de Zoho** (`X-Zoho-Webhook-Signature`) la valida **n8n**, que es quien recibe el
  webhook de Zoho. (No tiene sentido validarla en minilytics: Zoho no le pega a minilytics.)
- minilytics confía en que el POST viene de n8n por la **API key** (`Bearer ml_...`). Suficiente: solo
  quien tiene la key registra pagos.

```
Zoho Books (Invoice Status=Paid)
   │  webhook nativo + X-Zoho-Webhook-Signature (secret token de Zoho)
   ▼
n8n  ── valida firma HMAC-SHA256(base64) ──► mapea JSON ──► POST con Bearer api_key
   │
   ▼
minilytics  POST /api/v1/payments  → dashboard (atribuido por email, o "Sin atribuir")
```

## Pasos pendientes (fuera de este repo)

### En Zoho Books (config, sin código)
1. Settings → Automation → **Workflow Rules**: módulo **Invoice**, tipo **Edited / cuando cualquier
   campo cambia**, criterio **`Status is Paid`**.
2. Acción **Webhook** → URL del webhook de n8n, método POST.
3. Activar **"secure with a secret token"** → guardar el token (NO se puede ver después). Header que
   envía Zoho: `X-Zoho-Webhook-Signature`.
4. Confirmar con una factura real que el payload trae el **correo del cliente** (puede venir en
   `contact_persons`, no en el nivel raíz).

> Firma Zoho (para validar en n8n): HMAC-SHA256 en base64 del string formado por los pares
> clave-valor ordenados alfabéticamente y concatenados, con el JSON crudo anexado al final. Ver doc
> oficial: zoho.com/books/help/settings/automation/workflow-actions/webhooks.html

### En n8n
1. **Webhook node** recibe el POST de Zoho.
2. **Code/Function node**: valida `X-Zoho-Webhook-Signature` con el secret token (rechaza si no liga).
3. **Set node**: mapea al body de minilytics:
   - `transaction_id` ← `payment_id` (o `invoice_id`)
   - `amount` ← `amount` / `total` (**unidades mayores**, p.ej. 1500.00 — verificar con pago real)
   - `currency` ← `currency_code` (ISO, p.ej. `MXN`)
   - `email` ← `email` del contacto
   - `name` ← `customer_name`
   - `timestamp` ← `date` (OJO: Zoho manda solo fecha `yyyy-mm-dd`, sin hora)
4. **HTTP Request node**: `POST https://minilytics.gneuman.workers.dev/api/v1/payments`,
   header `Authorization: Bearer <api_key del sitio>` (leer de credenciales n8n, NO hardcodear).

## Atribución (requisito clave)

El correo del cliente debe existir en minilytics ANTES del cobro (capturado en el sitio con
`identify({ email })`). Si nunca pasó por la web → "Sin atribuir". Normal y esperado.

## Verificación (MAA — no cerrar con 200, cerrar con evidencia)

- **Medir:** nº de pagos de Zoho que llegan y % con `attributed:true` en la respuesta del endpoint.
- **Base:** hoy 0 ingresos de Zoho en el dashboard.
- **Actuar / prueba de aceptación:** marcar una factura real como **Paid** y verificar:
  1. n8n recibe el webhook y la firma valida.
  2. minilytics responde `{"ok":true,"attributed":true,...}` en un caso donde el email SÍ ligaba.
  3. El pago aparece en el dashboard (Journey) con monto y moneda correctos.
  - **Verificar dos cosas no 100% documentadas de Zoho:** (a) que `amount` llega en unidades mayores
    (no centavos); (b) que `MXN` llega como `"MXN"`.

## Notas

- Si "Sin atribuir" no convence, cambiar el label en `src/dashboard/lib/i18n.tsx` (buscar la cadena).
- Stripe es independiente y más directo: configúralo en paralelo para cerrar el otro flujo de revenue.
