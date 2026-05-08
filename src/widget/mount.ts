// Bootstrap: find the script tag, read its dataset, build the form (or the
// modal-mode trigger + dialog), wire up submit + close handlers. Pure DOM
// glue — `render.ts` and `submit.ts` are tested in isolation.

import type { FieldName } from "../shared/fields.js";
import {
  buildActionGroup,
  buildForm,
  buildModal,
  configFromDataset,
  type WidgetConfig,
} from "./render.js";
import { clientValidate, submitForm } from "./submit.js";
import { getTranslations } from "./i18n.js";

export interface MountOptions {
  fetchImpl?: typeof fetch;
  /**
   * Delay (ms) before the modal closes after a successful submit, so the
   * user can read the success message. Default 1500.
   */
  modalAutoCloseDelay?: number;
}

export function findMountTarget(scriptEl: HTMLScriptElement, doc: Document): Element {
  const selector = scriptEl.dataset.target;
  if (selector) {
    const found = doc.querySelector(selector);
    if (found) return found;
  }
  return scriptEl.parentElement ?? doc.body;
}

export interface MountResult {
  form: HTMLFormElement;
  /** Set in `modal` mode only. */
  trigger?: HTMLButtonElement;
  /** Set in `modal` mode only. */
  dialog?: HTMLDialogElement;
  /** Set in `modal` mode only — wraps the trigger and (if configured) the phone shortcut. */
  actions?: HTMLDivElement;
  /** Set when `params.phoneNumber` is configured. */
  phone?: HTMLAnchorElement;
}

export function mountFromScript(scriptEl: HTMLScriptElement, options: MountOptions = {}): MountResult {
  const doc = scriptEl.ownerDocument ?? document;
  const config = configFromDataset(scriptEl.dataset);
  const target = findMountTarget(scriptEl, doc);

  if (config.mode === "modal") {
    const { dialog, form, closeButton } = buildModal(config, doc);
    const { actions, trigger, phone } = buildActionGroup(config, doc);
    attachSubmitHandler(form, config, options, dialog);
    attachModalHandlers(trigger, dialog, closeButton);

    if (target === scriptEl.parentElement) {
      scriptEl.insertAdjacentElement("beforebegin", actions);
      scriptEl.insertAdjacentElement("beforebegin", dialog);
    } else {
      target.appendChild(actions);
      target.appendChild(dialog);
    }
    return { form, trigger, dialog, actions, phone: phone ?? undefined };
  }

  const form = buildForm(config, doc);
  attachSubmitHandler(form, config, options);
  if (target === scriptEl.parentElement) {
    scriptEl.insertAdjacentElement("beforebegin", form);
  } else {
    target.appendChild(form);
  }
  return { form };
}

/**
 * Wire the modal trigger + close button + backdrop click. Uses the native
 * `<dialog>` API so ESC dismissal is free.
 */
export function attachModalHandlers(
  trigger: HTMLButtonElement,
  dialog: HTMLDialogElement,
  closeButton: HTMLButtonElement,
): void {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      // happy-dom (and very old browsers) may lack showModal — fall back
      // to setting the `open` attribute so the dialog at least becomes
      // visible.
      dialog.setAttribute("open", "");
    }
  });

  closeButton.addEventListener("click", (event) => {
    event.preventDefault();
    closeDialog(dialog);
  });

  // Backdrop click: dialogs receive click events on themselves when the
  // user clicks outside the inner panel.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog(dialog);
  });
}

function closeDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

export function attachSubmitHandler(
  form: HTMLFormElement,
  config: WidgetConfig,
  options: MountOptions = {},
  dialog?: HTMLDialogElement,
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
      // In modal mode, close the dialog after a brief pause so the user
      // sees the confirmation message before it disappears.
      if (dialog) {
        const delay = options.modalAutoCloseDelay ?? 1500;
        setTimeout(() => closeDialog(dialog), delay);
      }
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
