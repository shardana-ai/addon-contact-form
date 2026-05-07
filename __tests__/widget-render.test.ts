import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import { buildForm, configFromDataset, parseFields } from "../src/widget/render.js";

let window: Window;
let document: Document;

beforeEach(() => {
  window = new Window({ url: "https://landing.shardana.ai/" });
  document = window.document as unknown as Document;
});

afterEach(() => {
  window.close();
});

const baseConfig = {
  formId: "da-giulia",
  submitUrl: "https://forms.shardana.ai/v1/submit",
  fields: ["name", "email", "message"] as ("name" | "email" | "phone" | "message")[],
  required: ["name", "email", "message"] as ("name" | "email" | "phone" | "message")[],
  locale: "it",
  theme: "light" as const,
  honeypotName: "website",
  mode: "inline" as const,
};

describe("parseFields", () => {
  it("falls back to default when input is empty", () => {
    expect(parseFields(undefined, ["name", "email"])).toEqual(["name", "email"]);
    expect(parseFields("", ["name"])).toEqual(["name"]);
  });

  it("filters out unknown fields", () => {
    expect(parseFields("name,foo,email", ["name"])).toEqual(["name", "email"]);
  });

  it("preserves order of valid fields", () => {
    expect(parseFields("phone,name,email", ["name", "email"])).toEqual(["phone", "name", "email"]);
  });

  it("falls back to default when all entries are unknown", () => {
    expect(parseFields("foo,bar", ["name"])).toEqual(["name"]);
  });
});

describe("configFromDataset", () => {
  it("reads dataset attributes into a typed config", () => {
    const config = configFromDataset({
      formId: "f1",
      submitUrl: "https://x/y",
      fields: "name,email,phone",
      required: "email",
      locale: "en",
      theme: "dark",
      honeypotName: "trap",
    } as unknown as DOMStringMap);
    expect(config.formId).toBe("f1");
    expect(config.fields).toEqual(["name", "email", "phone"]);
    expect(config.required).toEqual(["email"]);
    expect(config.theme).toBe("dark");
    expect(config.locale).toBe("en");
    expect(config.honeypotName).toBe("trap");
  });

  it("filters required to fields actually rendered", () => {
    const config = configFromDataset({
      fields: "name,email",
      required: "name,email,phone",
    } as unknown as DOMStringMap);
    expect(config.required).toEqual(["name", "email"]);
  });
});

describe("buildForm", () => {
  it("renders one input per declared field plus honeypot + submit", () => {
    const form = buildForm(baseConfig, document);
    expect(form.querySelector('input[name="name"]')).not.toBeNull();
    expect(form.querySelector('input[name="email"]')).not.toBeNull();
    expect(form.querySelector('textarea[name="message"]')).not.toBeNull();
    expect(form.querySelector('input[name="website"]')).not.toBeNull();
    expect(form.querySelector("button[type=submit]")).not.toBeNull();
    expect(form.dataset.formId).toBe("da-giulia");
  });

  it("marks required fields with required attribute and asterisk in label", () => {
    const form = buildForm(baseConfig, document);
    const emailInput = form.querySelector<HTMLInputElement>('input[name="email"]')!;
    expect(emailInput.required).toBe(true);
    const labels = Array.from(form.querySelectorAll(".shardana-cf__label")).map((n) => n.textContent ?? "");
    expect(labels.some((l) => l.includes("*"))).toBe(true);
  });

  it("renders only the requested locale's strings", () => {
    const form = buildForm({ ...baseConfig, locale: "en" }, document);
    expect(form.textContent).toContain("Send");
    expect(form.textContent).not.toContain("Invia");
  });

  it("applies the dark theme modifier class", () => {
    const form = buildForm({ ...baseConfig, theme: "dark" }, document);
    expect(form.className).toContain("shardana-cf--dark");
  });

  it("injects the global stylesheet exactly once per document", () => {
    buildForm(baseConfig, document);
    buildForm(baseConfig, document);
    expect(document.querySelectorAll("#shardana-contact-form-styles")).toHaveLength(1);
  });

  it("renders email field as type=email and phone as type=tel", () => {
    const form = buildForm({ ...baseConfig, fields: ["name", "email", "phone", "message"] }, document);
    expect(form.querySelector<HTMLInputElement>('input[name="email"]')!.type).toBe("email");
    expect(form.querySelector<HTMLInputElement>('input[name="phone"]')!.type).toBe("tel");
  });
});
