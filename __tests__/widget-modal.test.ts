import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { buildModal, buildTrigger, configFromDataset } from "../src/widget/render.js";
import { attachModalHandlers, attachSubmitHandler } from "../src/widget/mount.js";

let window: Window;
let document: Document;

const baseConfig = {
  formId: "da-giulia",
  submitUrl: "https://forms.shardana.ai/v1/submit",
  fields: ["name", "email", "message"] as ("name" | "email" | "phone" | "message")[],
  required: ["name", "email", "message"] as ("name" | "email" | "phone" | "message")[],
  locale: "it",
  theme: "light" as const,
  honeypotName: "website",
  mode: "modal" as const,
};

beforeEach(() => {
  window = new Window({ url: "https://landing.shardana.ai/" });
  document = window.document as unknown as Document;
});

afterEach(() => {
  window.close();
});

async function flush(ms = 5): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await flush(5);
  }
  throw new Error("waitFor timeout");
}

describe("configFromDataset — mode", () => {
  it("defaults mode to inline", () => {
    expect(configFromDataset({} as DOMStringMap).mode).toBe("inline");
  });

  it("reads mode=modal from the dataset", () => {
    expect(configFromDataset({ mode: "modal" } as unknown as DOMStringMap).mode).toBe("modal");
  });

  it("ignores unknown mode values (treats them as inline)", () => {
    expect(configFromDataset({ mode: "popover" } as unknown as DOMStringMap).mode).toBe("inline");
  });

  it("captures triggerLabel and modalTitle when present", () => {
    const config = configFromDataset({
      mode: "modal",
      triggerLabel: "Scrivici",
      modalTitle: "Mandaci un messaggio",
    } as unknown as DOMStringMap);
    expect(config.triggerLabel).toBe("Scrivici");
    expect(config.modalTitle).toBe("Mandaci un messaggio");
  });
});

describe("buildTrigger", () => {
  it("renders a button with envelope icon and a localized label", () => {
    const button = buildTrigger(baseConfig, document);
    expect(button.tagName).toBe("BUTTON");
    expect(button.type).toBe("button");
    expect(button.classList.contains("shardana-cf-trigger")).toBe(true);
    expect(button.textContent).toContain("Contattaci");
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.dataset.formId).toBe("da-giulia");
  });

  it("uses a custom triggerLabel when provided", () => {
    const button = buildTrigger({ ...baseConfig, triggerLabel: "Scrivici" }, document);
    expect(button.textContent).toContain("Scrivici");
    expect(button.getAttribute("aria-label")).toBe("Scrivici");
  });

  it("emits the dark theme variant via the modifier class", () => {
    const button = buildTrigger({ ...baseConfig, theme: "dark" }, document);
    expect(button.className).toContain("shardana-cf--dark");
  });
});

describe("buildModal", () => {
  it("returns a dialog containing header + form, with closeable header button", () => {
    const { dialog, form, closeButton } = buildModal(baseConfig, document);
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog.querySelector(".shardana-cf-modal__title")?.textContent).toContain("Scrivici");
    expect(form.tagName).toBe("FORM");
    expect(form.dataset.formId).toBe("da-giulia");
    expect(closeButton.tagName).toBe("BUTTON");
    expect(closeButton.dataset.shardanaCfClose).toBe("");
  });

  it("uses a custom modalTitle when provided", () => {
    const { dialog } = buildModal({ ...baseConfig, modalTitle: "Mandaci un messaggio" }, document);
    expect(dialog.querySelector(".shardana-cf-modal__title")?.textContent).toBe(
      "Mandaci un messaggio",
    );
  });
});

describe("attachModalHandlers", () => {
  it("opens the dialog on trigger click", () => {
    const trigger = buildTrigger(baseConfig, document);
    const { dialog, closeButton } = buildModal(baseConfig, document);
    document.body.appendChild(trigger);
    document.body.appendChild(dialog);

    attachModalHandlers(trigger, dialog, closeButton);
    const showSpy = vi.fn();
    (dialog as unknown as { showModal: typeof showSpy }).showModal = showSpy;

    trigger.click();
    expect(showSpy).toHaveBeenCalledOnce();
  });

  it("closes the dialog on close button click", () => {
    const trigger = buildTrigger(baseConfig, document);
    const { dialog, closeButton } = buildModal(baseConfig, document);
    document.body.appendChild(trigger);
    document.body.appendChild(dialog);

    attachModalHandlers(trigger, dialog, closeButton);
    const closeSpy = vi.fn();
    (dialog as unknown as { close: typeof closeSpy }).close = closeSpy;

    closeButton.click();
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it("closes the dialog when the user clicks on the backdrop (the dialog itself)", () => {
    const trigger = buildTrigger(baseConfig, document);
    const { dialog, closeButton } = buildModal(baseConfig, document);
    document.body.appendChild(trigger);
    document.body.appendChild(dialog);

    attachModalHandlers(trigger, dialog, closeButton);
    const closeSpy = vi.fn();
    (dialog as unknown as { close: typeof closeSpy }).close = closeSpy;

    dialog.dispatchEvent(new window.Event("click", { bubbles: true }) as unknown as Event);
    expect(closeSpy).toHaveBeenCalledOnce();
  });
});

describe("submit in modal mode auto-closes", () => {
  it("closes the dialog after a successful submit (with auto-close delay)", async () => {
    const config = baseConfig;
    const { dialog, form, closeButton } = buildModal(config, document);
    document.body.appendChild(dialog);
    const trigger = buildTrigger(config, document);
    document.body.appendChild(trigger);
    attachModalHandlers(trigger, dialog, closeButton);

    const closeSpy = vi.fn();
    (dialog as unknown as { close: typeof closeSpy }).close = closeSpy;

    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, messageId: "<x@local>" }), { status: 200 }),
    ) as unknown as typeof fetch;
    attachSubmitHandler(form, config, { fetchImpl, modalAutoCloseDelay: 20 }, dialog);

    (form.querySelector('input[name="name"]') as HTMLInputElement).value = "Mario";
    (form.querySelector('input[name="email"]') as HTMLInputElement).value = "m@x.com";
    (form.querySelector('textarea[name="message"]') as HTMLTextAreaElement).value = "ciao";
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event);

    // Status flips to "success" first; close fires after the delay.
    await waitFor(() => closeSpy.mock.calls.length > 0);
    const status = form.querySelector(".shardana-cf__status") as HTMLElement;
    expect(status.dataset.state).toBe("success");
  });

  it("does NOT auto-close on a server error", async () => {
    const config = baseConfig;
    const { dialog, form, closeButton } = buildModal(config, document);
    document.body.appendChild(dialog);
    const trigger = buildTrigger(config, document);
    document.body.appendChild(trigger);
    attachModalHandlers(trigger, dialog, closeButton);

    const closeSpy = vi.fn();
    (dialog as unknown as { close: typeof closeSpy }).close = closeSpy;

    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: "boom" }), { status: 500 }),
    ) as unknown as typeof fetch;
    attachSubmitHandler(form, config, { fetchImpl, modalAutoCloseDelay: 20 }, dialog);

    (form.querySelector('input[name="name"]') as HTMLInputElement).value = "X";
    (form.querySelector('input[name="email"]') as HTMLInputElement).value = "x@x.com";
    (form.querySelector('textarea[name="message"]') as HTMLTextAreaElement).value = "x";
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event);

    await waitFor(() => {
      const s = (form.querySelector(".shardana-cf__status") as HTMLElement | null)?.dataset.state;
      return s === "error";
    });
    // Wait past the modalAutoCloseDelay window — close should still not have fired.
    await flush(80);
    expect(closeSpy).not.toHaveBeenCalled();
  });
});
