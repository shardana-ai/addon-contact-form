# addon-contact-form

A self-hostable **contact form** add-on. Two artefacts in one repo:

- A **vanilla TypeScript widget** (~3.7 KB gzip) that auto-mounts from
  `data-*` attributes on its own `<script>` tag.
- A **single-tenant AWS Lambda** that forwards submissions to Mailgun.
  One deploy = one form. No central registry, no hosted dependency:
  every operator runs their own Lambda in their own AWS account.

Implements the
[Heroic add-on contract](https://github.com/shardana-ai/addon-injector/blob/main/docs/addon-contract.md),
so it plugs straight into `@shardana/addon-injector`. The widget is
framework-agnostic — drop it on any static site, not just a Heroic landing.

License: [MIT](./LICENSE).

---

## Architecture

```
                                            Mailgun
                                              ▲
   ┌───────────┐   POST JSON   ┌──────────────────────────┐
   │  widget   │──────────────▶│  Lambda submit.cjs       │
   │  (script) │   1.          │                          │
   │           │               │  reads MAIL_FROM/MAIL_TO │
   │  drop on  │◀──────────────│  from env vars at deploy│
   │  any site │   ok / error  │  time, no DB, no cache  │
   └───────────┘   2.          └──────────────────────────┘
```

**Why single-tenant?** A multi-tenant Lambda needs a registry, and a
registry needs a control plane. That removes the "drop in and go" property.
With one Lambda per form, the recipient address is plain config and the
endpoint URL is the unforgeable identifier — anyone who has the URL can
submit, but only the operator who deployed it can change where the email
goes.

**What about spam?** Honeypot + size limits + CORS allowlist + Zod payload
validation. The form is small enough that a target-by-name attack is the
worst case — solvable with rate limiting at the API Gateway level if it
matters.

---

## Quick start

You need:

1. A Mailgun account with a verified sending domain.
2. An AWS account with the Serverless Framework set up.
3. Node 20 + pnpm to build the artefacts.

### 1. Install + build

```bash
git clone https://github.com/shardana-ai/addon-contact-form
cd addon-contact-form
pnpm install
pnpm build
# dist/widget/widget.global.js   3.7 KB gzipped
# dist/lambda/submit.cjs         Lambda handler bundle
```

### 2. Configure + deploy the Lambda

Set environment variables in your shell (or a `.env`-like loader your CI
uses):

```bash
export MAILGUN_DOMAIN=mg.example.com
export MAILGUN_API_KEY=key-...                    # secret, do NOT commit
export MAIL_FROM="no-reply@example.com"           # must be authorized by MAILGUN_DOMAIN
export MAIL_TO="owner@example.com"                # comma-separated for multiple recipients
export MAIL_REPLY_TO="support@example.com"        # optional, defaults to the submitter's email
export ALLOWED_ORIGINS="https://my-landing.example,https://www.my-landing.example"
# export MAILGUN_BASE_URL="https://api.eu.mailgun.net"   # only for EU Mailgun accounts

serverless deploy --stage prod --region eu-south-1
```

Output looks like:

```
endpoints:
  POST - https://abcd1234.execute-api.eu-south-1.amazonaws.com/v1/submit
  OPTIONS - https://abcd1234.execute-api.eu-south-1.amazonaws.com/v1/submit
```

That URL is the only piece of state you need to keep.

### 3. Host the widget bundle

The widget is a single IIFE file. Pick whichever delivery suits you:

- **GitHub release (free, recommended)**: tag a release on this repo and
  the bundle is served by jsDelivr at
  `https://cdn.jsdelivr.net/gh/<your-fork-or-shardana-ai>/addon-contact-form@<tag>/dist/widget/widget.global.js`.
- **S3 + CloudFront**: copy `dist/widget/widget.global.js` to your bucket
  behind a CDN. Set `Cache-Control: public, max-age=31536000, immutable`
  for the versioned path.
- **Same origin**: serve it from your landing's own domain to avoid
  third-party requests entirely.

### 4. Drop the script tag on your page

```html
<script
  src="https://cdn.jsdelivr.net/gh/shardana-ai/addon-contact-form@v0.2.0/dist/widget/widget.global.js"
  data-submit-url="https://abcd1234.execute-api.eu-south-1.amazonaws.com/v1/submit"
  data-form-id="my-landing"
  data-fields="name,email,message"
  data-locale="it"
  data-theme="light"
  defer
></script>
```

The widget self-mounts where the script tag sits (or wherever
`data-target` points). On submit it POSTs to `data-submit-url`; success
shows a localized confirmation, errors a localized fallback.

### 5. (optional) Wire it through `@shardana/addon-injector`

If your site uses `plan.yml` and the Heroic addon contract:

```yaml
addons:
  - id: contact-form
    enabled: true
    injection: script
    src: https://cdn.jsdelivr.net/gh/shardana-ai/addon-contact-form@v0.2.0/dist/widget/widget.global.js
    params:
      submitUrl: https://abcd1234.execute-api.eu-south-1.amazonaws.com/v1/submit
      formId: my-landing
      fields: name,email,phone,message
      required: name,email,message
      locale: it
      theme: light
      target: "#contatti"
```

---

## Configuration reference

All widget options are read from `data-*` attributes on the script tag —
they map 1:1 to the `params` block in [`addon-manifest.json`](./addon-manifest.json).

| Attribute              | Required | Default                  | Notes                                                                                |
|------------------------|----------|--------------------------|--------------------------------------------------------------------------------------|
| `data-submit-url`      | yes      | —                        | API endpoint of your Lambda.                                                         |
| `data-form-id`         | no       | —                        | Tag added to the email subject + metadata. Useful when one inbox handles many forms. |
| `data-fields`          | no       | `name,email,message`     | Comma-separated subset of `name,email,phone,message`.                                |
| `data-required`        | no       | same as `data-fields`    | Subset of `data-fields` that is required.                                            |
| `data-locale`          | no       | `it`                     | One of `it`, `en`, `de`, `fr`, `es`.                                                 |
| `data-theme`           | no       | `light`                  | `light` or `dark`.                                                                   |
| `data-target`          | no       | parent of the script tag | CSS selector of the mount node.                                                      |
| `data-success-message` | no       | localized                | Override the success copy.                                                           |
| `data-error-message`   | no       | localized                | Override the error copy.                                                             |
| `data-honeypot-name`   | no       | `website`                | Hidden field name. Bots fill every input; the server rejects when this is non-empty. |

The form posts JSON to `data-submit-url`:

```json
{
  "formId": "my-landing",
  "name": "Mario Rossi",
  "email": "mario@example.com",
  "message": "Vorrei prenotare un tavolo per quattro.",
  "metadata": { "locale": "it", "source": "https://my-landing.example/" },
  "website": ""
}
```

### Lambda environment variables

| Variable           | Required | Purpose                                                                                       |
|--------------------|----------|-----------------------------------------------------------------------------------------------|
| `MAILGUN_DOMAIN`   | yes      | Mailgun sending domain (e.g. `mg.example.com`).                                               |
| `MAILGUN_API_KEY`  | yes      | Mailgun secret API key.                                                                       |
| `MAIL_FROM`        | yes      | "From" address. Must belong to `MAILGUN_DOMAIN` or be authorised by it.                       |
| `MAIL_TO`          | yes      | Recipient(s). Comma-separated for multiple addresses.                                         |
| `MAIL_REPLY_TO`    | no       | Override the Reply-To header. Defaults to the submitter's email when present.                 |
| `ALLOWED_ORIGINS`  | no       | Comma-separated CORS allowlist. Defaults to `*`. Strongly recommended in production.          |
| `MAILGUN_BASE_URL` | no       | EU endpoint override (`https://api.eu.mailgun.net`). Defaults to the US endpoint.             |

The Lambda will return `500 Missing required env var: …` if any of the
four required variables is unset.

---

## Development

```bash
pnpm install
pnpm typecheck   # tsc --noEmit, strict mode
pnpm test        # vitest, 50 tests
pnpm build       # tsup → dist/widget/widget.global.js + dist/lambda/submit.cjs
```

Tests cover:

- **Payload schema** (7) — required-field guards, email format, length limits, honeypot rejection, trim.
- **Mailgun client** (8) — pure email construction, HTML escape, EU base URL, transport with mocked fetch.
- **Lambda handler** (11) — happy path, payload errors, honeypot, missing env vars, Reply-To fallback, multi-recipient.
- **Widget render** (12) — field allowlist, locale strings, dark theme, single-stylesheet idempotency, input types.
- **Widget submit** (8) — client-side validation, JSON contract, server error surface.
- **End-to-end** (4) — happy-dom form filled by the user → widget → Lambda contract → mocked Mailgun.

`.github/workflows/ci.yml` runs typecheck + build + tests + a 6 KB gzip
guard for the widget bundle on every push and pull request.

---

## License

[MIT](./LICENSE) © shardana.ai
