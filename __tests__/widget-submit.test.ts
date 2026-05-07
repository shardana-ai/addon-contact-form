import { describe, expect, it, vi } from "vitest";
import { clientValidate, submitForm } from "../src/widget/submit.js";
import type { WidgetConfig } from "../src/widget/render.js";

const config: WidgetConfig = {
  formId: "f1",
  submitUrl: "https://forms.example/submit",
  fields: ["name", "email", "message"],
  required: ["name", "email", "message"],
  locale: "it",
  theme: "light",
  honeypotName: "website",
  mode: "inline",
};

describe("clientValidate", () => {
  it("passes when all required fields are filled and email is valid", () => {
    const r = clientValidate({ name: "Mario", email: "m@x.com", message: "hi", phone: "" }, config, "it");
    expect(r.ok).toBe(true);
  });

  it("flags missing required field", () => {
    const r = clientValidate({ name: "", email: "m@x.com", message: "hi", phone: "" }, config, "it");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.field).toBe("name");
      expect(r.message).toMatch(/obbligatorio/i);
    }
  });

  it("flags malformed email", () => {
    const r = clientValidate({ name: "x", email: "not-an-email", message: "hi", phone: "" }, config, "en");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.field).toBe("email");
      expect(r.message).toMatch(/Invalid/i);
    }
  });

  it("ignores empty optional email when not required", () => {
    const r = clientValidate(
      { name: "x", email: "", message: "hi", phone: "" },
      { ...config, required: ["name", "message"] },
      "it",
    );
    expect(r.ok).toBe(true);
  });
});

describe("submitForm", () => {
  it("returns error when submitUrl is empty", async () => {
    const r = await submitForm({ ...config, submitUrl: "" }, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/missing submitUrl/);
  });

  it("posts JSON with formId and metadata", async () => {
    let capturedBody = "";
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ ok: true, messageId: "<id@mg>" }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await submitForm(config, { name: "x", email: "x@x.com" }, { fetchImpl, pageUrl: "https://landing/" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.messageId).toBe("<id@mg>");
    const parsed = JSON.parse(capturedBody);
    expect(parsed.formId).toBe("f1");
    expect(parsed.metadata.locale).toBe("it");
    expect(parsed.metadata.source).toBe("https://landing/");
  });

  it("returns error on non-2xx response", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: "rate-limited" }), { status: 429 }),
    );
    const r = await submitForm(config, { name: "x" }, { fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("rate-limited");
  });

  it("returns error on network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const r = await submitForm(config, { name: "x" }, { fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("network down");
  });
});
