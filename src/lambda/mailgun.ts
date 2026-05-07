// Thin Mailgun client. Not a generic SDK — only `messages.send` with the
// fields we need. Keeps the Lambda bundle small (no `mailgun.js` + axios
// chain) and lets us inject `fetch` from tests.
//
// Mailgun API reference: https://documentation.mailgun.com/docs/mailgun/api-reference/openapi-final/tag/Messages/

import type { ValidatedSubmission } from "../shared/payload.js";

export interface EmailTemplate {
  /**
   * Mustache-style template for the email subject. Available placeholders:
   *   {sender}   — name → email → "anonymous"
   *   {name}     — submitted name (or empty)
   *   {email}    — submitted email (or empty)
   *   {formId}   — formId or empty
   *   {brand}    — config.brandName or empty
   * Default: `[Heroic] Nuovo messaggio da {sender}` (with ` ({formId})` appended when formId is set).
   */
  subjectTemplate?: string;
  /**
   * Brand / business name shown in the email HTML footer ("Inviato dal sito
   * di {brand}"). When unset, no footer is emitted. Also available as
   * `{brand}` in `subjectTemplate`.
   */
  brandName?: string;
  /** Free-form preamble inserted at the top of the email body (text + html). */
  intro?: string;
  /** Locale used to pick built-in field labels. Defaults to "it". */
  locale?: string;
}

export interface MailgunConfig {
  domain: string;
  apiKey: string;
  /** Optional EU endpoint: "https://api.eu.mailgun.net". Defaults to US. */
  baseUrl?: string;
  /** "from" header — usually no-reply@yourdomain. */
  from: string;
  /** Recipient(s). Multiple addresses are joined with a comma. */
  to: string | string[];
  /** Optional Reply-To override. Defaults to the submitter's email when present. */
  replyTo?: string;
  /** Optional content customisation (subject template, brand name). */
  template?: EmailTemplate;
}

export interface BuiltEmail {
  from: string;
  to: string;
  "h:Reply-To"?: string;
  subject: string;
  text: string;
  html: string;
}

const ESCAPE_HTML: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const ESCAPE_HTML_RE = /[&<>"']/g;

function escapeHtml(input: string): string {
  return input.replace(ESCAPE_HTML_RE, (ch) => ESCAPE_HTML[ch]!);
}

function joinAddresses(value: string | string[]): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

type LabelKey = "form" | "name" | "email" | "phone" | "message" | "footer";

const LABELS: Record<string, Record<LabelKey, string>> = {
  it: {
    form: "Form",
    name: "Nome",
    email: "Email",
    phone: "Telefono",
    message: "Messaggio",
    footer: "Inviato dal sito di",
  },
  en: {
    form: "Form",
    name: "Name",
    email: "Email",
    phone: "Phone",
    message: "Message",
    footer: "Sent from the website of",
  },
  de: {
    form: "Form",
    name: "Name",
    email: "E-Mail",
    phone: "Telefon",
    message: "Nachricht",
    footer: "Gesendet von der Website von",
  },
  fr: {
    form: "Form",
    name: "Nom",
    email: "Email",
    phone: "Téléphone",
    message: "Message",
    footer: "Envoyé depuis le site de",
  },
  es: {
    form: "Form",
    name: "Nombre",
    email: "Email",
    phone: "Teléfono",
    message: "Mensaje",
    footer: "Enviado desde el sitio de",
  },
};

function pickLabels(locale: string | undefined): Record<LabelKey, string> {
  if (!locale) return LABELS.it!;
  const key = locale.slice(0, 2).toLowerCase();
  return LABELS[key] ?? LABELS.it!;
}

function senderLabel(submission: ValidatedSubmission, locale: string | undefined): string {
  if (submission.name) return submission.name;
  if (submission.email) return submission.email;
  return locale?.startsWith("en") ? "anonymous" : "anonimo";
}

const PLACEHOLDER_RE = /\{(sender|name|email|formId|brand)\}/g;

export function renderSubject(
  template: string,
  vars: { sender: string; name: string; email: string; formId: string; brand: string },
): string {
  return template.replace(PLACEHOLDER_RE, (_, key: string) => vars[key as keyof typeof vars] ?? "");
}

/**
 * Build the Mailgun message body. Pure function — no network — so tests can
 * assert the exact email layout independently of the HTTP transport.
 */
export function buildEmail(submission: ValidatedSubmission, config: MailgunConfig): BuiltEmail {
  const lines: string[] = [];
  const htmlLines: string[] = [];
  const template = config.template ?? {};
  const locale = template.locale ?? (submission.metadata?.locale ?? "it");
  const labels = pickLabels(locale);

  if (template.intro) {
    lines.push(template.intro);
    lines.push("");
    htmlLines.push(`<p>${escapeHtml(template.intro).replace(/\n/g, "<br>")}</p>`);
  }

  if (submission.formId) {
    lines.push(`${labels.form}: ${submission.formId}`);
    htmlLines.push(`<p><strong>${labels.form}:</strong> ${escapeHtml(submission.formId)}</p>`);
  }

  if (submission.name) {
    lines.push(`${labels.name}: ${submission.name}`);
    htmlLines.push(`<p><strong>${labels.name}:</strong> ${escapeHtml(submission.name)}</p>`);
  }
  if (submission.email) {
    lines.push(`${labels.email}: ${submission.email}`);
    htmlLines.push(`<p><strong>${labels.email}:</strong> ${escapeHtml(submission.email)}</p>`);
  }
  if (submission.phone) {
    lines.push(`${labels.phone}: ${submission.phone}`);
    htmlLines.push(`<p><strong>${labels.phone}:</strong> ${escapeHtml(submission.phone)}</p>`);
  }
  if (submission.message) {
    lines.push("");
    lines.push(submission.message);
    htmlLines.push(
      `<p><strong>${labels.message}:</strong></p><p>${escapeHtml(submission.message).replace(/\n/g, "<br>")}</p>`,
    );
  }

  const meta = Object.entries(submission.metadata ?? {});
  if (meta.length > 0) {
    lines.push("");
    lines.push("--");
    htmlLines.push("<hr>");
    for (const [key, value] of meta) {
      lines.push(`${key}: ${value}`);
      htmlLines.push(`<p><small>${escapeHtml(key)}: ${escapeHtml(value)}</small></p>`);
    }
  }

  if (template.brandName) {
    lines.push("");
    lines.push(`${labels.footer} ${template.brandName}.`);
    htmlLines.push(
      `<p style="margin-top:1.5rem;color:#888;font-size:0.85rem;">${labels.footer} <strong>${escapeHtml(template.brandName)}</strong>.</p>`,
    );
  }

  const sender = senderLabel(submission, locale);
  const subjectTemplate = template.subjectTemplate
    ?? (submission.formId
      ? "[Heroic] Nuovo messaggio da {sender} ({formId})"
      : "[Heroic] Nuovo messaggio da {sender}");
  const subject = renderSubject(subjectTemplate, {
    sender,
    name: submission.name ?? "",
    email: submission.email ?? "",
    formId: submission.formId ?? "",
    brand: template.brandName ?? "",
  });

  const email: BuiltEmail = {
    from: config.from,
    to: joinAddresses(config.to),
    subject,
    text: lines.join("\n"),
    html: htmlLines.join("\n"),
  };
  const replyTo = config.replyTo ?? submission.email;
  if (replyTo) email["h:Reply-To"] = replyTo;
  return email;
}

export interface SendOptions {
  /** Inject a custom fetch (used in tests). Defaults to `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * Send the email via Mailgun's HTTP API. Throws on non-2xx with the response
 * body for diagnostics.
 */
export async function sendEmail(
  submission: ValidatedSubmission,
  config: MailgunConfig,
  options: SendOptions = {},
): Promise<{ id: string }> {
  const email = buildEmail(submission, config);
  const baseUrl = config.baseUrl ?? "https://api.mailgun.net";
  const url = `${baseUrl}/v3/${encodeURIComponent(config.domain)}/messages`;

  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(email)) {
    body.append(key, value);
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${config.apiKey}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Mailgun error ${response.status}: ${text}`);
  }
  const json = (await response.json()) as { id?: string };
  return { id: json.id ?? "" };
}
