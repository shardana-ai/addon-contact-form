// Pure rendering helpers — turn a `WidgetConfig` into a `<form>` element.
// Kept separate from `mount.ts` (the script-tag bootstrap) so tests can
// instantiate the form without touching the global `document` lifecycle.

import { allowedFields, type FieldName } from "../shared/fields.js";
import { getTranslations, type Translations } from "./i18n.js";

export interface WidgetConfig {
  formId: string;
  submitUrl: string;
  fields: FieldName[];
  required: FieldName[];
  locale: string;
  theme: "light" | "dark";
  successMessage?: string;
  errorMessage?: string;
  /** Honeypot field name — kept hidden from real users. Defaults to `website`. */
  honeypotName: string;
}

const DEFAULT_FIELDS: FieldName[] = ["name", "email", "message"];
const DEFAULT_REQUIRED: FieldName[] = ["name", "email", "message"];

export function parseFields(input: string | undefined, fallback: FieldName[]): FieldName[] {
  if (!input) return [...fallback];
  const tokens = input
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const out: FieldName[] = [];
  for (const t of tokens) {
    if ((allowedFields as readonly string[]).includes(t)) {
      out.push(t as FieldName);
    }
  }
  return out.length > 0 ? out : [...fallback];
}

export function configFromDataset(dataset: DOMStringMap): WidgetConfig {
  const fields = parseFields(dataset.fields, DEFAULT_FIELDS);
  const required = parseFields(dataset.required, DEFAULT_REQUIRED).filter((f) => fields.includes(f));
  const theme = dataset.theme === "dark" ? "dark" : "light";
  return {
    formId: dataset.formId ?? "default",
    submitUrl: dataset.submitUrl ?? "",
    fields,
    required,
    locale: dataset.locale ?? "it",
    theme,
    successMessage: dataset.successMessage,
    errorMessage: dataset.errorMessage,
    honeypotName: dataset.honeypotName ?? "website",
  };
}

const STYLE_ID = "shardana-contact-form-styles";

const STYLES = `
.shardana-cf{display:flex;flex-direction:column;gap:0.85rem;font-family:inherit;color:inherit;}
.shardana-cf__field{display:flex;flex-direction:column;gap:0.3rem;}
.shardana-cf__label{font-size:0.85rem;font-weight:600;letter-spacing:0.02em;}
.shardana-cf__input,.shardana-cf__textarea{
  width:100%;padding:0.65rem 0.75rem;border:1px solid currentColor;border-radius:0.5rem;
  background:transparent;color:inherit;font:inherit;
}
.shardana-cf__input:focus,.shardana-cf__textarea:focus{outline:2px solid currentColor;outline-offset:1px;}
.shardana-cf__textarea{min-height:7rem;resize:vertical;}
.shardana-cf__honeypot{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;}
.shardana-cf__error{color:#b00020;font-size:0.8rem;display:none;}
.shardana-cf__error.is-visible{display:block;}
.shardana-cf__submit{
  align-self:flex-start;border:0;cursor:pointer;padding:0.7rem 1.25rem;border-radius:0.5rem;
  font:inherit;font-weight:600;background:currentColor;color:#fff;
}
.shardana-cf__submit:disabled{opacity:0.6;cursor:wait;}
.shardana-cf__status{font-size:0.9rem;margin-top:0.2rem;}
.shardana-cf__status[data-state="success"]{color:#0a7c2a;}
.shardana-cf__status[data-state="error"]{color:#b00020;}
.shardana-cf--dark .shardana-cf__submit{color:#000;}
`;

export function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  doc.head.appendChild(style);
}

export function buildForm(config: WidgetConfig, doc: Document): HTMLFormElement {
  ensureStyles(doc);
  const t = getTranslations(config.locale);
  const form = doc.createElement("form");
  form.className = `shardana-cf shardana-cf--${config.theme}`;
  form.setAttribute("novalidate", "");
  form.setAttribute("data-shardana-cf", "");
  form.setAttribute("data-form-id", config.formId);

  for (const field of config.fields) {
    form.appendChild(renderField(field, config, t, doc));
  }

  // Hidden honeypot — bots fill every input on the page.
  const honeypot = doc.createElement("input");
  honeypot.type = "text";
  honeypot.name = config.honeypotName;
  honeypot.tabIndex = -1;
  honeypot.autocomplete = "off";
  honeypot.setAttribute("aria-hidden", "true");
  honeypot.className = "shardana-cf__honeypot";
  form.appendChild(honeypot);

  const submit = doc.createElement("button");
  submit.type = "submit";
  submit.className = "shardana-cf__submit";
  submit.textContent = t.submit;
  form.appendChild(submit);

  const status = doc.createElement("p");
  status.className = "shardana-cf__status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  form.appendChild(status);

  return form;
}

function renderField(
  field: FieldName,
  config: WidgetConfig,
  t: Translations,
  doc: Document,
): HTMLElement {
  const wrapper = doc.createElement("label");
  wrapper.className = "shardana-cf__field";

  const labelText = doc.createElement("span");
  labelText.className = "shardana-cf__label";
  labelText.textContent = t.labels[field] + (config.required.includes(field) ? " *" : "");
  wrapper.appendChild(labelText);

  let input: HTMLInputElement | HTMLTextAreaElement;
  if (field === "message") {
    input = doc.createElement("textarea");
    input.className = "shardana-cf__textarea";
    input.rows = 4;
  } else {
    input = doc.createElement("input");
    input.className = "shardana-cf__input";
    input.type = field === "email" ? "email" : field === "phone" ? "tel" : "text";
  }
  input.name = field;
  input.placeholder = t.placeholders[field];
  if (config.required.includes(field)) input.required = true;
  wrapper.appendChild(input);

  const error = doc.createElement("span");
  error.className = "shardana-cf__error";
  error.setAttribute("data-field-error", field);
  wrapper.appendChild(error);

  return wrapper;
}
