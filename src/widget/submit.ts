// Form submission flow: client-side validation, fetch to the Lambda, and
// status display. Pure logic — `mount.ts` wires it up to the global
// document/fetch.

import type { FieldName } from "../shared/fields.js";
import { getTranslations } from "./i18n.js";
import type { WidgetConfig } from "./render.js";

export interface SubmitDeps {
  fetchImpl?: typeof fetch;
  /** Override `window.location.href` for tests. */
  pageUrl?: string;
}

export type SubmitOutcome =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function clientValidate(
  data: Record<FieldName, string>,
  config: WidgetConfig,
  locale: string,
): { ok: true } | { ok: false; field: FieldName; message: string } {
  const t = getTranslations(locale);
  for (const field of config.required) {
    const value = data[field]?.trim() ?? "";
    if (!value) return { ok: false, field, message: t.required };
  }
  const email = data.email?.trim();
  if (email && !EMAIL_RE.test(email)) {
    return { ok: false, field: "email", message: t.invalidEmail };
  }
  return { ok: true };
}

export async function submitForm(
  config: WidgetConfig,
  payload: Record<string, unknown>,
  deps: SubmitDeps = {},
): Promise<SubmitOutcome> {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  if (!config.submitUrl) {
    return { ok: false, error: "missing submitUrl" };
  }
  try {
    const response = await fetchImpl(config.submitUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        formId: config.formId,
        metadata: {
          locale: config.locale,
          source: deps.pageUrl ?? (typeof location !== "undefined" ? location.href : ""),
        },
      }),
    });
    const json = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      messageId?: string;
      error?: string;
    };
    if (!response.ok || json.ok === false) {
      return { ok: false, error: json.error ?? `HTTP ${response.status}` };
    }
    return { ok: true, messageId: json.messageId ?? "" };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
