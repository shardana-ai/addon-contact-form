// IIFE entrypoint. Auto-mounts when the bundle is loaded as
// `<script src="https://forms.shardana.ai/v1/widget.js" data-form-id="…">`.
//
// Also exposes `window.ShardanaContactForm.mount(scriptElement)` for
// programmatic mounting (e.g. SPA pages that load the form into a modal).

import {
  buildActionGroup,
  buildForm,
  buildModal,
  buildPhoneButton,
  buildTrigger,
  configFromDataset,
} from "./render.js";
import {
  mountFromScript,
  attachSubmitHandler,
  attachModalHandlers,
  findMountTarget,
} from "./mount.js";
import { clientValidate, submitForm } from "./submit.js";

const api = {
  mount: mountFromScript,
  buildForm,
  buildModal,
  buildTrigger,
  buildPhoneButton,
  buildActionGroup,
  attachSubmitHandler,
  attachModalHandlers,
  configFromDataset,
  clientValidate,
  submitForm,
  findMountTarget,
};

declare global {
  interface Window {
    ShardanaContactForm: typeof api;
  }
}

if (typeof window !== "undefined") {
  window.ShardanaContactForm = api;
}

if (typeof document !== "undefined") {
  // `document.currentScript` is the live <script> element when this code
  // executes synchronously. With `defer` the script runs after parsing, but
  // before DOMContentLoaded — the reference is still valid.
  const scriptEl = document.currentScript as HTMLScriptElement | null;
  if (scriptEl && scriptEl.dataset.formId) {
    const run = () => {
      try {
        mountFromScript(scriptEl);
      } catch (err) {
        // Failing silently in the host page is preferable to throwing — log
        // for debugging, the customer can inspect via DevTools.
        // eslint-disable-next-line no-console
        console.error("[shardana-contact-form] mount failed:", err);
      }
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  }
}

export default api;
