import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { buildForm } from "../src/widget/render.js";
import { attachSubmitHandler, findMountTarget } from "../src/widget/mount.js";
import { handleSubmission, type HandlerEnv } from "../src/lambda/handler.js";

let window: Window;
let document: Document;

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("waitFor timeout");
}

beforeEach(() => {
  window = new Window({ url: "https://landing.shardana.ai/" });
  document = window.document as unknown as Document;
});

afterEach(() => {
  window.close();
});

const widgetConfig = {
  formId: "da-giulia",
  submitUrl: "https://forms.shardana.ai/v1/submit",
  fields: ["name", "email", "message"] as ("name" | "email" | "phone" | "message")[],
  required: ["name", "email", "message"] as ("name" | "email" | "phone" | "message")[],
  locale: "it",
  theme: "light" as const,
  honeypotName: "website",
  mode: "inline" as const,
};

const handlerEnv: HandlerEnv = {
  MAILGUN_DOMAIN: "mg.example.com",
  MAILGUN_API_KEY: "key-test",
  MAIL_FROM: "no-reply@example.com",
  MAIL_TO: "owner@example.com",
};

describe("end-to-end: widget → submitUrl → Lambda → Mailgun", () => {
  it("happy path: a form submission reaches Mailgun via the Lambda contract", async () => {
    // Stand up the form as the widget would.
    const form = buildForm(widgetConfig, document);
    document.body.appendChild(form);

    // The Mailgun fetch is mocked out so the test stays hermetic.
    const mailgunFetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: "<integration@mg>" }), { status: 200 }),
    ) as unknown as typeof fetch;

    // The widget's fetch routes JSON to the Lambda's pure entry point.
    const widgetFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const result = await handleSubmission(handlerEnv, body, { fetchImpl: mailgunFetch });
      const status = result.status;
      const payload = result.ok
        ? { ok: true, messageId: result.messageId }
        : { ok: false, error: result.error, details: result.details };
      return new Response(JSON.stringify(payload), { status });
    }) as unknown as typeof fetch;

    attachSubmitHandler(form, widgetConfig, { fetchImpl: widgetFetch });

    // Fill in the form like a real user would.
    (form.querySelector('input[name="name"]') as HTMLInputElement).value = "Mario Rossi";
    (form.querySelector('input[name="email"]') as HTMLInputElement).value = "mario@example.com";
    (form.querySelector('textarea[name="message"]') as HTMLTextAreaElement).value = "Vorrei un tavolo";

    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event);
    await waitFor(() => (form.querySelector(".shardana-cf__status") as HTMLElement).dataset.state === "success");

    expect(widgetFetch).toHaveBeenCalledOnce();
    expect(mailgunFetch).toHaveBeenCalledOnce();
    const status = form.querySelector(".shardana-cf__status") as HTMLElement;
    expect(status.dataset.state).toBe("success");
    expect(status.textContent).toMatch(/Grazie/);
    // After success the form is reset.
    expect((form.querySelector('input[name="name"]') as HTMLInputElement).value).toBe("");
  });

  it("widget surfaces an error when the Lambda is misconfigured (missing MAIL_TO)", async () => {
    const form = buildForm(widgetConfig, document);
    document.body.appendChild(form);

    const brokenEnv: HandlerEnv = { ...handlerEnv, MAIL_TO: "" };
    const mailgunFetch = vi.fn() as unknown as typeof fetch;
    const widgetFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const result = await handleSubmission(brokenEnv, body, { fetchImpl: mailgunFetch });
      return new Response(JSON.stringify(result.ok ? result : { ok: false, error: result.error }), {
        status: result.status,
      });
    }) as unknown as typeof fetch;
    attachSubmitHandler(form, widgetConfig, { fetchImpl: widgetFetch });

    (form.querySelector('input[name="name"]') as HTMLInputElement).value = "X";
    (form.querySelector('input[name="email"]') as HTMLInputElement).value = "x@x.com";
    (form.querySelector('textarea[name="message"]') as HTMLTextAreaElement).value = "hi";

    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event);
    await waitFor(() => (form.querySelector(".shardana-cf__status") as HTMLElement).dataset.state === "error");

    expect(mailgunFetch).not.toHaveBeenCalled();
    const status = form.querySelector(".shardana-cf__status") as HTMLElement;
    expect(status.dataset.state).toBe("error");
  });

  it("findMountTarget honors data-target when provided", () => {
    const slot = document.createElement("div");
    slot.id = "contact-slot";
    document.body.appendChild(slot);

    const script = document.createElement("script") as HTMLScriptElement;
    script.dataset.target = "#contact-slot";
    document.body.appendChild(script);

    expect(findMountTarget(script, document)).toBe(slot);
  });

  it("findMountTarget falls back to the script's parent when target is missing", () => {
    const wrapper = document.createElement("div");
    document.body.appendChild(wrapper);
    const script = document.createElement("script") as HTMLScriptElement;
    wrapper.appendChild(script);
    expect(findMountTarget(script, document)).toBe(wrapper);
  });
});
