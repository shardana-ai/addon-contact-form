// Bootstrap: find the script tag, read its dataset, build the form, wire
// up submit handler. Pure DOM glue — render and submit are tested in
// isolation.

import type { FieldName } from "../shared/fields.js";
import { buildForm, configFromDataset, type WidgetConfig } from "./render.js";
import { clientValidate, submitForm } from "./submit.js";
import { getTranslations } from "./i18n.js";

export interface MountOptions {
  fetchImpl?: typeof fetch;
}

export function findMountTarget(scriptEl: HTMLScriptElement, doc: Document): Element {
  const selector = scriptEl.dataset.target;
  if (selector) {
    const found = doc.querySelector(selector);
    if (found) return found;
  }
  // Default: insert just before the script tag's parent's closing element.
  // This puts the form at the location where the AddonInjector emitted the
  // script, which on a Heroic landing is below the footer — customers can
  // override via data-target.
  return scriptEl.parentElement ?? doc.body;
}

export function mountFromScript(scriptEl: HTMLScriptElement, options: MountOptions = {}): HTMLFormElement {
  const doc = scriptEl.ownerDocument ?? document;
  const config = configFromDataset(scriptEl.dataset);
  const target = findMountTarget(scriptEl, doc);
  const form = buildForm(config, doc);
  attachSubmitHandler(form, config, options);
  if (target === scriptEl.parentElement) {
    scriptEl.insertAdjacentElement("beforebegin", form);
  } else {
    target.appendChild(form);
  }
  return form;
}

export function attachSubmitHandler(
  form: HTMLFormElement,
  config: WidgetConfig,
  options: MountOptions = {},
): void {
  const t = getTranslations(config.locale);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors(form);
    const data = collectFields(form, config.fields);

    const validation = clientValidate(data, config, config.locale);
    if (!validation.ok) {
      showFieldError(form, validation.field, validation.message);
      return;
    }

    // Honeypot — never sent normally, but if present we still forward it so
    // the server can reject in case the script tag is misconfigured.
    const honeypot = readNamedValue(form, config.honeypotName);

    const submitButton = form.querySelector<HTMLButtonElement>(".shardana-cf__submit");
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = t.submitting;
    }

    const result = await submitForm(config, { ...data, [config.honeypotName]: honeypot }, options);

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = t.submit;
    }

    const status = form.querySelector<HTMLElement>(".shardana-cf__status");
    if (!status) return;
    if (result.ok) {
      status.dataset.state = "success";
      status.textContent = config.successMessage ?? t.success;
      form.reset();
    } else {
      status.dataset.state = "error";
      status.textContent = config.errorMessage ?? t.error;
    }
  });
}

function collectFields(form: HTMLFormElement, fields: FieldName[]): Record<FieldName, string> {
  const out = {} as Record<FieldName, string>;
  for (const field of fields) {
    out[field] = readNamedValue(form, field);
  }
  return out;
}

function readNamedValue(form: HTMLFormElement, name: string): string {
  const el = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[name="${name}"]`,
  );
  return el ? String(el.value ?? "") : "";
}

function clearErrors(form: HTMLFormElement): void {
  form.querySelectorAll<HTMLElement>("[data-field-error]").forEach((el) => {
    el.classList.remove("is-visible");
    el.textContent = "";
  });
  const status = form.querySelector<HTMLElement>(".shardana-cf__status");
  if (status) {
    status.removeAttribute("data-state");
    status.textContent = "";
  }
}

function showFieldError(form: HTMLFormElement, field: FieldName, message: string): void {
  const target = form.querySelector<HTMLElement>(`[data-field-error="${field}"]`);
  if (target) {
    target.textContent = message;
    target.classList.add("is-visible");
  }
}
