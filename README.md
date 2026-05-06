# addon-contact-form

Embeddable **contact form** add-on for [Heroic Landing](https://landing.shardana.ai)
(and any other static site that wants a Mailgun-backed form). Implements the
[Heroic add-on contract](https://github.com/shardana-ai/addon-injector/blob/main/docs/addon-contract.md):
ships a `<script>` widget plus an AWS Lambda submit handler.

- **Widget**: ~3.7 KB gzip, vanilla TypeScript, no framework dependencies.
- **Backend**: AWS Lambda + API Gateway HTTP API, forwards submissions to
  Mailgun. Strict per-`formId` allowlist so the endpoint cannot be reused
  for arbitrary inboxes.
- **Honeypot + payload validation** with Zod — bots and oversized payloads
  are rejected at the edge.
- **i18n built in**: it / en / de / fr / es. Override individual strings
  via `data-*` attributes.

The package is open source (MIT). You can use the **hosted instance**
operated by shardana.ai (`forms.shardana.ai`) or **self-host** the Lambda
on your own AWS account.

---

## Quick start (hosted)

Add the script to your page and let it auto-mount:

```html
<script
  src="https://forms.shardana.ai/v1/widget.js"
  data-form-id="my-restaurant"
  data-submit-url="https://forms.shardana.ai/v1/submit"
  data-fields="name,email,message"
  data-locale="it"
  data-theme="light"
  defer
></script>
```

Or wire it through `@shardana/addon-injector` from `plan.yml`:

```yaml
addons:
  - id: contact-form
    enabled: true
    injection: script
    src: https://forms.shardana.ai/v1/widget.js
    params:
      formId: my-restaurant
      submitUrl: https://forms.shardana.ai/v1/submit
      fields: name,email,message
      locale: it
      theme: light
```

The widget mounts the form just before its own script tag by default. Pass
`data-target="#my-section"` (or `target` in `plan.yml`'s `params`) to mount
it inside a specific element.

---

## Configuration

All options are read from `data-*` attributes on the script tag. They map
1:1 to the manifest in [`addon-manifest.json`](./addon-manifest.json).

| Attribute               | Required | Default                    | Notes                                                                                  |
|-------------------------|----------|----------------------------|----------------------------------------------------------------------------------------|
| `data-form-id`          | yes      | —                          | Stable id registered server-side. The Lambda refuses unknown ids.                      |
| `data-submit-url`       | yes      | —                          | API endpoint that receives the JSON submission.                                        |
| `data-fields`           | no       | `name,email,message`       | Comma-separated subset of `name,email,phone,message`.                                  |
| `data-required`         | no       | same as `data-fields`      | Subset of `data-fields` that is required.                                              |
| `data-locale`           | no       | `it`                       | One of `it`, `en`, `de`, `fr`, `es`.                                                   |
| `data-theme`            | no       | `light`                    | `light` or `dark`.                                                                     |
| `data-target`           | no       | parent of the script tag   | CSS selector of the mount node.                                                        |
| `data-success-message`  | no       | localized                  | Override the success copy.                                                             |
| `data-error-message`    | no       | localized                  | Override the error copy.                                                               |
| `data-honeypot-name`    | no       | `website`                  | Hidden field name. Bots fill every input; the server rejects when this is non-empty.   |

The form sends a JSON payload to `data-submit-url`:

```json
{
  "formId": "my-restaurant",
  "name": "Mario Rossi",
  "email": "mario@example.com",
  "message": "Vorrei prenotare un tavolo per quattro.",
  "metadata": { "locale": "it", "source": "https://my-restaurant.example/" },
  "website": ""
}
```

The Lambda validates the payload, looks up `formId` in its registry, and
forwards the submission to Mailgun.

---

## Self-hosting

You will deploy two pieces:

1. The **widget bundle** (`dist/widget/widget.global.js`) — host it on any CDN
   (e.g. CloudFront in front of an S3 bucket) and update `data-src` on the
   script tag to point at it.
2. The **Lambda submit handler** (`dist/lambda/submit.cjs`) — deploy to AWS
   with the included `serverless.yml`.

### 1. Build

```bash
pnpm install
pnpm build
# dist/widget/widget.global.js   ~3.7 KB gzipped
# dist/lambda/submit.cjs         Lambda handler bundle
```

### 2. Configure environment

Set the following environment variables when deploying:

| Variable           | Purpose                                                                                                                  |
|--------------------|--------------------------------------------------------------------------------------------------------------------------|
| `MAILGUN_DOMAIN`   | Mailgun sending domain (e.g. `mg.shardana.ai`).                                                                          |
| `MAILGUN_API_KEY`  | Mailgun secret API key.                                                                                                  |
| `MAILGUN_BASE_URL` | Optional. `https://api.eu.mailgun.net` for EU accounts. Defaults to the US endpoint.                                     |
| `ALLOWED_ORIGINS`  | Comma-separated list of origins allowed by CORS, or `*`. Defaults to `*`.                                                |
| `FORM_REGISTRY`    | JSON map `{ "<formId>": { "from": "...", "to": "...", "replyTo": "..." } }`. The handler rejects formIds not in the map. |

`FORM_REGISTRY` example:

```json
{
  "my-restaurant": {
    "from": "no-reply@my-restaurant.example",
    "to": "owner@my-restaurant.example",
    "replyTo": "support@my-restaurant.example"
  },
  "another-client": {
    "from": "no-reply@another.example",
    "to": ["owner@another.example", "manager@another.example"]
  }
}
```

Without an entry the Lambda returns `404 Unknown formId` — that is what
prevents `forms.shardana.ai` from being used as a free email-relay.

### 3. Deploy with Serverless Framework

```bash
serverless deploy --stage prod --region eu-south-1
```

The included `serverless.yml` provisions an HTTP API Gateway with CORS
restricted to `landing.shardana.ai` and `*.landing.shardana.ai`. Tweak the
`allowedOrigins` list for your own domains.

### 4. Point the widget at your endpoint

```html
<script
  src="https://your-cdn.example/widget.js"
  data-form-id="my-restaurant"
  data-submit-url="https://api.your-domain.example/v1/submit"
  defer
></script>
```

---

## Architecture

```
                                          Mailgun
                                            ▲
   ┌───────────┐   POST JSON   ┌──────────────────────┐
   │  widget   │──────────────▶│  Lambda submit.cjs   │
   │  (script) │   1.          │  (validate +         │
   │           │◀──────────────│   per-formId guard + │
   │  shards   │   ok / error  │   Mailgun POST)      │
   │  shadow-  │   2.          └──────────────────────┘
   │  free     │
   │  styles   │
   └───────────┘
```

**Why a per-formId registry?** A public submit endpoint without one becomes
an open mail relay. The registry binds each `formId` to a specific
`from`/`to` pair so customers cannot impersonate each other and bots
cannot reuse the URL.

**Why a honeypot?** Real users do not see the `website` (hidden) input.
Bots that fill every field hit the schema constraint and get rejected —
no CAPTCHA, no extra friction for humans.

---

## Development

```bash
pnpm install
pnpm typecheck   # tsc --noEmit, strict mode
pnpm test        # vitest, 49 tests
pnpm build       # tsup → dist/widget/widget.global.js + dist/lambda/submit.cjs
```

Tests cover:

- **Payload schema** — required formId, email format, length limits, honeypot, trim.
- **Mailgun client** — pure email construction, HTTP transport with mocked fetch, EU base URL, error propagation.
- **Lambda handler** — happy path, malformed payload, honeypot, unknown formId, registry replyTo.
- **Widget render** — field allowlist, locale strings, dark theme, single stylesheet injection, input types.
- **Widget submit** — client-side validation, fetch contract, server error surfaces.
- **End-to-end** — happy-dom form filled by the user → widget → Lambda contract → mocked Mailgun.

---

## Public infrastructure

The hosted instance run by shardana.ai is reachable at:

- Widget: `https://forms.shardana.ai/v1/widget.js`
- Submit: `https://forms.shardana.ai/v1/submit`

To register a new `formId` on the hosted instance, open an issue or contact
shardana.ai. The hosted endpoint is meant for Heroic Landing customers; for
arbitrary use cases please self-host.

---

## License

[MIT](./LICENSE) © shardana.ai
