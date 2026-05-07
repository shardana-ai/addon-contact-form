// Thin Mailgun client. Not a generic SDK — only `messages.send` with the
// fields we need. Keeps the Lambda bundle small (no `mailgun.js` + axios
// chain) and lets us inject `fetch` from tests.
//
// Mailgun API reference: https://documentation.mailgun.com/docs/mailgun/api-reference/openapi-final/tag/Messages/

import type { ValidatedSubmission } from "../shared/payload.js";

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

/**
 * Build the Mailgun message body. Pure function — no network — so tests can
 * assert the exact email layout independently of the HTTP transport.
 */
export function buildEmail(submission: ValidatedSubmission, config: MailgunConfig): BuiltEmail {
  const lines: string[] = [];
  const htmlLines: string[] = [];

  if (submission.formId) {
    lines.push(`Form: ${submission.formId}`);
    htmlLines.push(`<p><strong>Form:</strong> ${escapeHtml(submission.formId)}</p>`);
  }

  if (submission.name) {
    lines.push(`Nome: ${submission.name}`);
    htmlLines.push(`<p><strong>Nome:</strong> ${escapeHtml(submission.name)}</p>`);
  }
  if (submission.email) {
    lines.push(`Email: ${submission.email}`);
    htmlLines.push(`<p><strong>Email:</strong> ${escapeHtml(submission.email)}</p>`);
  }
  if (submission.phone) {
    lines.push(`Telefono: ${submission.phone}`);
    htmlLines.push(`<p><strong>Telefono:</strong> ${escapeHtml(submission.phone)}</p>`);
  }
  if (submission.message) {
    lines.push("");
    lines.push(submission.message);
    htmlLines.push(
      `<p><strong>Messaggio:</strong></p><p>${escapeHtml(submission.message).replace(/\n/g, "<br>")}</p>`,
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

  const sender = submission.name ?? submission.email ?? "anonimo";
  const tag = submission.formId ? ` (${submission.formId})` : "";
  const subject = `[Heroic] Nuovo messaggio da ${sender}${tag}`;

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
