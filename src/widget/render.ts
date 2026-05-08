// Pure rendering helpers — turn a `WidgetConfig` into a `<form>` element.
// Kept separate from `mount.ts` (the script-tag bootstrap) so tests can
// instantiate the form without touching the global `document` lifecycle.

import { allowedFields, type FieldName } from "../shared/fields.js";
import { getTranslations, type Translations } from "./i18n.js";

export type WidgetMode = "inline" | "modal";

/**
 * Per-instance overrides for the widget's CSS variables. Each field maps
 * to a `--cf-*` custom property; unset values fall back to the host
 * page's Heroic theme tokens (`--color-accent` etc.) and finally to the
 * widget's hardcoded defaults.
 */
export interface WidgetThemeOverrides {
  /** Accent colour — submit + trigger background, focus outline. */
  accent?: string;
  /** Text colour on top of the accent (button label, icon). */
  accentText?: string;
  /** Modal panel background and form text fallback. */
  background?: string;
  /** Foreground text colour inside the modal/form. */
  text?: string;
  /** Input border colour (defaults to `text`). */
  inputBorder?: string;
  /** Input background colour (defaults to transparent). */
  inputBackground?: string;
  /** Input text colour (defaults to `text`). */
  inputText?: string;
  /** Muted colour for placeholders. */
  muted?: string;
}

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
  /** Optional palette overrides — emitted as inline CSS variables. */
  themeOverrides?: WidgetThemeOverrides;
  /**
   * In `modal` mode, render the trigger as an icon-only square button
   * (envelope SVG without text label). Default `false` (icon + label).
   */
  iconOnly?: boolean;
  /**
   * Optional phone number rendered as a sibling button next to the
   * mail trigger. Click → `tel:` link, fires the OS phone app /
   * Skype / FaceTime. Should be a tel-friendly string (e.g. `+393332627187`).
   * When unset, no phone button is rendered.
   */
  phoneNumber?: string;
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
  const themeOverrides: WidgetThemeOverrides = {
    accent: dataset.accent,
    accentText: dataset.accentText,
    background: dataset.background,
    text: dataset.textColor,
    inputBorder: dataset.inputBorder,
    inputBackground: dataset.inputBackground,
    inputText: dataset.inputText,
    muted: dataset.muted,
  };
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
    iconOnly: dataset.iconOnly === "true",
    phoneNumber: dataset.phoneNumber,
    triggerLabel: dataset.triggerLabel,
    modalTitle: dataset.modalTitle,
    themeOverrides: hasAnyOverride(themeOverrides) ? themeOverrides : undefined,
  };
}

function hasAnyOverride(overrides: WidgetThemeOverrides): boolean {
  return Object.values(overrides).some((v) => typeof v === "string" && v.length > 0);
}

/**
 * Render the inline `style="--cf-…: value; …"` string from a
 * `WidgetThemeOverrides`. Empty / missing fields are skipped so the CSS
 * fallback chain still applies.
 */
export function buildThemeStyle(overrides: WidgetThemeOverrides | undefined): string {
  if (!overrides) return "";
  const map: Array<[string, string | undefined]> = [
    ["--cf-accent", overrides.accent],
    ["--cf-accent-text", overrides.accentText],
    ["--cf-bg", overrides.background],
    ["--cf-text", overrides.text],
    ["--cf-input-border", overrides.inputBorder],
    ["--cf-input-bg", overrides.inputBackground],
    ["--cf-input-text", overrides.inputText],
    ["--cf-muted", overrides.muted],
  ];
  return map
    .filter(([, value]) => typeof value === "string" && value.length > 0)
    .map(([prop, value]) => `${prop}: ${cssSanitize(value!)}`)
    .join("; ");
}

// Lightweight sanitizer — colour values come from plan.yml, so authors
// can pass `var(--color-accent)` as well as raw hex / rgb. We strip the
// characters that would let a misbehaving value break out of the inline
// style context (`;`, `<`, `>`, `}`).
function cssSanitize(value: string): string {
  return value.replace(/[;<>}]/g, "").trim();
}

/**
 * Apply theme overrides as inline `style="--cf-…: value; …"` on the
 * given element. No-op when the config has no overrides.
 */
function applyThemeStyle(el: HTMLElement, config: WidgetConfig): void {
  const inline = buildThemeStyle(config.themeOverrides);
  if (!inline) return;
  const existing = el.getAttribute("style");
  el.setAttribute("style", existing ? `${existing}; ${inline}` : inline);
}

const STYLE_ID = "shardana-contact-form-styles";

const ENVELOPE_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="m22 8-10 6L2 8"/></svg>';

const CLOSE_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

const PHONE_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';

// Theming model
// =============
// All colours go through CSS variables (`--cf-*`) with cascading
// fallbacks:
//
//   1. The host page can set them inline via plan.yml `params` — the
//      widget emits `style="--cf-accent: #abc; …"` on each rendered
//      element.
//   2. Otherwise they fall back to the host's Heroic theme variables
//      (`--color-accent`, `--color-bg`, `--color-text`) — set by the
//      Astro template from `site.theme.palette`.
//   3. Finally, hardcoded sensible defaults (slate / white) so the
//      widget remains visible even on a vanilla page that has no
//      theme tokens.
//
// Two compound vars derive automatically:
//   --cf-accent-text  defaults to --color-bg (so the button label sits
//                     well on the accent background) and falls back to
//                     #fff.
//   --cf-input-bg     defaults to transparent so inputs blend with the
//                     panel.
const STYLES = `
.shardana-cf,.shardana-cf-trigger,.shardana-cf-modal{
  /* Cascading defaults — overridable via inline style */
  --cf-accent: var(--color-accent, #0f172a);
  --cf-accent-text: var(--color-bg, #ffffff);
  --cf-text: var(--color-text, currentColor);
  --cf-muted: var(--color-muted, #64748b);
  --cf-line: var(--color-line, currentColor);
  --cf-bg: var(--color-bg, #ffffff);
  --cf-input-bg: transparent;
  --cf-input-border: var(--cf-line);
  --cf-input-text: var(--cf-text);
  --cf-error: #b00020;
  --cf-success: #0a7c2a;
}
.shardana-cf{display:flex;flex-direction:column;gap:0.85rem;font-family:inherit;color:var(--cf-text);}
.shardana-cf__field{display:flex;flex-direction:column;gap:0.3rem;}
.shardana-cf__label{font-size:0.85rem;font-weight:600;letter-spacing:0.02em;color:var(--cf-text);}
.shardana-cf__input,.shardana-cf__textarea{
  width:100%;padding:0.65rem 0.75rem;border:1px solid var(--cf-input-border);border-radius:0.5rem;
  background:var(--cf-input-bg);color:var(--cf-input-text);font:inherit;
}
.shardana-cf__input::placeholder,.shardana-cf__textarea::placeholder{color:var(--cf-muted);opacity:0.85;}
.shardana-cf__input:focus,.shardana-cf__textarea:focus{outline:2px solid var(--cf-accent);outline-offset:1px;}
.shardana-cf__textarea{min-height:7rem;resize:vertical;}
.shardana-cf__honeypot{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;}
.shardana-cf__error{color:var(--cf-error);font-size:0.8rem;display:none;}
.shardana-cf__error.is-visible{display:block;}
.shardana-cf__submit{
  align-self:flex-start;border:0;cursor:pointer;padding:0.7rem 1.4rem;border-radius:0.5rem;
  font:inherit;font-weight:600;background:var(--cf-accent);color:var(--cf-accent-text);
}
.shardana-cf__submit:hover:not(:disabled){filter:brightness(1.08);}
.shardana-cf__submit:disabled{opacity:0.6;cursor:wait;}
.shardana-cf__status{font-size:0.9rem;margin-top:0.2rem;}
.shardana-cf__status[data-state="success"]{color:var(--cf-success);}
.shardana-cf__status[data-state="error"]{color:var(--cf-error);}

/* Modal mode: actions row (trigger button + optional phone shortcut) */
.shardana-cf-actions{
  display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;justify-content:flex-start;
}
.shardana-cf-trigger,.shardana-cf-phone{
  display:inline-flex;align-items:center;gap:0.6rem;cursor:pointer;border:0;
  font:inherit;font-weight:600;padding:0.75rem 1.4rem;border-radius:0.5rem;
  background:var(--cf-accent);color:var(--cf-accent-text);
  text-decoration:none;
}
.shardana-cf-trigger > span,.shardana-cf-phone > span{color:var(--cf-accent-text);}
.shardana-cf-trigger svg,.shardana-cf-phone svg{color:var(--cf-accent-text);}
.shardana-cf-trigger:hover,.shardana-cf-phone:hover{filter:brightness(1.08);}
.shardana-cf-trigger:focus-visible,.shardana-cf-phone:focus-visible{
  outline:2px solid var(--cf-accent);outline-offset:2px;
}
/* Icon-only variant: square button, no padding around the label. */
.shardana-cf-trigger.is-icon-only,.shardana-cf-phone.is-icon-only{
  padding:0.65rem;width:2.75rem;height:2.75rem;justify-content:center;
}
.shardana-cf-trigger.is-icon-only > span:not([aria-hidden="true"]),
.shardana-cf-phone.is-icon-only > span:not([aria-hidden="true"]){
  position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;
}

.shardana-cf-modal{
  border:0;padding:0;background:transparent;
  width:min(560px,calc(100vw - 2rem));max-height:calc(100vh - 4rem);
  border-radius:0.75rem;overflow:visible;
}
.shardana-cf-modal::backdrop{background:rgba(0,0,0,0.55);backdrop-filter:blur(2px);}
.shardana-cf-modal__panel{
  background:var(--cf-bg);color:var(--cf-text);border-radius:0.75rem;padding:1.5rem 1.5rem 1.25rem;
  display:flex;flex-direction:column;gap:1rem;
  box-shadow:0 25px 50px -12px rgba(0,0,0,0.35);
}
.shardana-cf-modal__header{
  display:flex;align-items:center;justify-content:space-between;gap:1rem;
}
.shardana-cf-modal__title{font-size:1.1rem;font-weight:700;margin:0;color:var(--cf-text);}
.shardana-cf-modal__close{
  background:transparent;border:0;cursor:pointer;color:var(--cf-text);
  display:inline-flex;align-items:center;justify-content:center;
  width:2rem;height:2rem;border-radius:0.4rem;
}
.shardana-cf-modal__close svg{color:var(--cf-text);}
.shardana-cf-modal__close:hover{background:rgba(127,127,127,0.15);}
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
  applyThemeStyle(form, config);

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
  button.className = `shardana-cf-trigger shardana-cf--${config.theme}${config.iconOnly ? " is-icon-only" : ""}`;
  button.setAttribute("data-shardana-cf-trigger", "");
  button.setAttribute("data-form-id", config.formId);
  applyThemeStyle(button, config);

  // SVG icon + text label. The label is always present in the DOM for
  // accessibility (screen readers); when `iconOnly` is true the CSS
  // hides it visually but still exposes it as the button's accessible
  // name (we also set aria-label as a belt-and-braces).
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
 * Render a phone shortcut button next to the modal trigger. It's a plain
 * `<a href="tel:...">` styled to match the trigger — clicking it triggers
 * the OS phone app on mobile, FaceTime / Skype / etc. on desktop. The
 * widget never opens a modal for this button; the dialing is handled by
 * the OS.
 */
export function buildPhoneButton(config: WidgetConfig, doc: Document): HTMLAnchorElement | null {
  if (!config.phoneNumber) return null;
  ensureStyles(doc);
  const t = getTranslations(config.locale);
  const link = doc.createElement("a");
  // Strip everything but `+` and digits for the tel: URI; the visible
  // label keeps the user-friendly format.
  const telDigits = config.phoneNumber.replace(/[^+\d]/g, "");
  link.href = `tel:${telDigits}`;
  link.className = `shardana-cf-phone shardana-cf--${config.theme}${config.iconOnly ? " is-icon-only" : ""}`;
  link.setAttribute("data-shardana-cf-phone", "");
  applyThemeStyle(link, config);

  const ariaLabel = `${t.callLabel} ${config.phoneNumber}`;
  const iconSpan = doc.createElement("span");
  iconSpan.setAttribute("aria-hidden", "true");
  iconSpan.style.display = "inline-flex";
  iconSpan.innerHTML = PHONE_SVG;
  const labelSpan = doc.createElement("span");
  labelSpan.textContent = config.phoneNumber;
  link.appendChild(iconSpan);
  link.appendChild(labelSpan);
  link.setAttribute("aria-label", ariaLabel);
  return link;
}

/**
 * Build a flex container that holds the modal trigger and (optionally)
 * the phone shortcut. Mounting them through this wrapper keeps them on
 * one line and makes per-instance CSS targeting easy
 * (`.shardana-cf-actions`).
 */
export function buildActionGroup(config: WidgetConfig, doc: Document): { actions: HTMLDivElement; trigger: HTMLButtonElement; phone: HTMLAnchorElement | null } {
  ensureStyles(doc);
  const actions = doc.createElement("div");
  actions.className = `shardana-cf-actions shardana-cf--${config.theme}`;
  actions.setAttribute("data-shardana-cf-actions", "");
  applyThemeStyle(actions, config);

  const trigger = buildTrigger(config, doc);
  const phone = buildPhoneButton(config, doc);
  actions.appendChild(trigger);
  if (phone) actions.appendChild(phone);
  return { actions, trigger, phone };
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
  applyThemeStyle(dialog, config);

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
