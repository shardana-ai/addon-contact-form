// Pure rendering helpers — turn a `WidgetConfig` into a `<form>` element.
// Kept separate from `mount.ts` (the script-tag bootstrap) so tests can
// instantiate the form without touching the global `document` lifecycle.

import { allowedFields, type FieldName } from "../shared/fields.js";
import { getTranslations, type Translations } from "./i18n.js";

export type WidgetMode = "inline" | "modal";

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
  /** Display mode. `inline` mounts the form in place; `modal` mounts a trigger button that opens a dialog. Default `inline`. */
  mode: WidgetMode;
  /** Custom label on the modal trigger button. Defaults to a localized string. */
  triggerLabel?: string;
  /** Custom title in the modal header. Defaults to a localized string. */
  modalTitle?: string;
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
  const mode: WidgetMode = dataset.mode === "modal" ? "modal" : "inline";
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
    mode,
    triggerLabel: dataset.triggerLabel,
    modalTitle: dataset.modalTitle,
  };
}

const STYLE_ID = "shardana-contact-form-styles";

const ENVELOPE_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="m22 8-10 6L2 8"/></svg>';

const CLOSE_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

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

/* Modal mode: trigger button + dialog */
.shardana-cf-trigger{
  display:inline-flex;align-items:center;gap:0.6rem;cursor:pointer;border:0;
  font:inherit;font-weight:600;padding:0.75rem 1.4rem;border-radius:0.5rem;
  background:currentColor;color:#fff;
}
.shardana-cf-trigger > span{color:#fff;}
.shardana-cf-trigger > svg{color:#fff;}
.shardana-cf-trigger:hover{filter:brightness(1.05);}
.shardana-cf-trigger:focus-visible{outline:2px solid currentColor;outline-offset:2px;}
.shardana-cf--dark .shardana-cf-trigger,
.shardana-cf--dark .shardana-cf-trigger > span,
.shardana-cf--dark .shardana-cf-trigger > svg{color:#000;}

.shardana-cf-modal{
  border:0;padding:0;background:transparent;
  width:min(560px,calc(100vw - 2rem));max-height:calc(100vh - 4rem);
  border-radius:0.75rem;overflow:visible;color:inherit;
}
.shardana-cf-modal::backdrop{background:rgba(0,0,0,0.55);backdrop-filter:blur(2px);}
.shardana-cf-modal__panel{
  background:#fff;color:#111;border-radius:0.75rem;padding:1.5rem 1.5rem 1.25rem;
  display:flex;flex-direction:column;gap:1rem;
  box-shadow:0 25px 50px -12px rgba(0,0,0,0.35);
}
.shardana-cf-modal--dark .shardana-cf-modal__panel{background:#1a1a1a;color:#f4f4f4;}
.shardana-cf-modal__header{
  display:flex;align-items:center;justify-content:space-between;gap:1rem;
}
.shardana-cf-modal__title{font-size:1.1rem;font-weight:700;margin:0;}
.shardana-cf-modal__close{
  background:transparent;border:0;cursor:pointer;color:inherit;
  display:inline-flex;align-items:center;justify-content:center;
  width:2rem;height:2rem;border-radius:0.4rem;
}
.shardana-cf-modal__close:hover{background:rgba(0,0,0,0.08);}
.shardana-cf-modal--dark .shardana-cf-modal__close:hover{background:rgba(255,255,255,0.12);}
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

/**
 * Build the modal-mode trigger button. Pure renderer: callers wire the
 * click handler in `mount.ts`. Carries an SVG envelope icon and a
 * localized label (overridable via `config.triggerLabel`).
 */
export function buildTrigger(config: WidgetConfig, doc: Document): HTMLButtonElement {
  ensureStyles(doc);
  const t = getTranslations(config.locale);
  const button = doc.createElement("button");
  button.type = "button";
  button.className = `shardana-cf-trigger shardana-cf--${config.theme}`;
  button.setAttribute("data-shardana-cf-trigger", "");
  button.setAttribute("data-form-id", config.formId);

  // SVG icon + text label. innerHTML is fine because the icon source is
  // constant and the label gets escapeHtml'd.
  const labelText = config.triggerLabel ?? t.triggerLabel;
  const iconSpan = doc.createElement("span");
  iconSpan.setAttribute("aria-hidden", "true");
  iconSpan.style.display = "inline-flex";
  iconSpan.innerHTML = ENVELOPE_SVG;
  const labelSpan = doc.createElement("span");
  labelSpan.textContent = labelText;
  button.appendChild(iconSpan);
  button.appendChild(labelSpan);
  button.setAttribute("aria-label", labelText);
  return button;
}

/**
 * Build the modal-mode `<dialog>`. Contains a header (title + close
 * button) and the same form `buildForm` produces. The close + click
 * handlers are wired in `mount.ts`.
 */
export function buildModal(
  config: WidgetConfig,
  doc: Document,
): { dialog: HTMLDialogElement; form: HTMLFormElement; closeButton: HTMLButtonElement } {
  ensureStyles(doc);
  const t = getTranslations(config.locale);
  const dialog = doc.createElement("dialog") as HTMLDialogElement;
  dialog.className = `shardana-cf-modal shardana-cf-modal--${config.theme}`;
  dialog.setAttribute("data-shardana-cf-modal", "");
  dialog.setAttribute("aria-labelledby", `shardana-cf-title-${config.formId}`);

  const panel = doc.createElement("div");
  panel.className = "shardana-cf-modal__panel";

  const header = doc.createElement("div");
  header.className = "shardana-cf-modal__header";
  const title = doc.createElement("h2");
  title.className = "shardana-cf-modal__title";
  title.id = `shardana-cf-title-${config.formId}`;
  title.textContent = config.modalTitle ?? t.modalTitle;

  const closeButton = doc.createElement("button");
  closeButton.type = "button";
  closeButton.className = "shardana-cf-modal__close";
  closeButton.setAttribute("data-shardana-cf-close", "");
  closeButton.setAttribute("aria-label", t.closeLabel);
  closeButton.innerHTML = CLOSE_SVG;

  header.appendChild(title);
  header.appendChild(closeButton);
  panel.appendChild(header);

  const form = buildForm(config, doc);
  panel.appendChild(form);

  dialog.appendChild(panel);
  return { dialog, form, closeButton };
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
