import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import {
  buildActionGroup,
  buildPhoneButton,
  buildTrigger,
  configFromDataset,
} from "../src/widget/render.js";

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

describe("configFromDataset — iconOnly + phoneNumber", () => {
  it("reads iconOnly=true from data-icon-only=\"true\"", () => {
    expect(configFromDataset({ iconOnly: "true" } as DOMStringMap).iconOnly).toBe(true);
  });

  it("treats any non-`true` iconOnly value as false", () => {
    expect(configFromDataset({} as DOMStringMap).iconOnly).toBe(false);
    expect(configFromDataset({ iconOnly: "1" } as DOMStringMap).iconOnly).toBe(false);
    expect(configFromDataset({ iconOnly: "false" } as DOMStringMap).iconOnly).toBe(false);
  });

  it("captures phoneNumber from the dataset", () => {
    expect(configFromDataset({ phoneNumber: "+393332627187" } as DOMStringMap).phoneNumber)
      .toBe("+393332627187");
  });
});

describe("buildTrigger — iconOnly variant", () => {
  it("adds the is-icon-only class when iconOnly is true", () => {
    const trigger = buildTrigger({ ...baseConfig, iconOnly: true }, document);
    expect(trigger.classList.contains("is-icon-only")).toBe(true);
    // Label is still in the DOM (visually hidden via CSS) for accessibility.
    const labels = Array.from(trigger.querySelectorAll("span"));
    expect(labels.some((s) => s.textContent === "Contattaci")).toBe(true);
    expect(trigger.getAttribute("aria-label")).toBe("Contattaci");
  });

  it("does not add the is-icon-only class when iconOnly is false / unset", () => {
    expect(buildTrigger(baseConfig, document).classList.contains("is-icon-only")).toBe(false);
  });

  it("the icon-only stylesheet hides the visible label via `:not([aria-hidden])`", () => {
    buildTrigger({ ...baseConfig, iconOnly: true }, document);
    const sheet = document.getElementById("shardana-contact-form-styles") as HTMLStyleElement;
    expect(sheet.textContent).toMatch(/\.shardana-cf-trigger\.is-icon-only/);
    expect(sheet.textContent).toContain('span:not([aria-hidden="true"])');
  });
});

describe("buildPhoneButton", () => {
  it("returns null when no phoneNumber is configured", () => {
    expect(buildPhoneButton(baseConfig, document)).toBeNull();
  });

  it("renders an <a href=\"tel:…\"> with the phone icon and the number as label", () => {
    const link = buildPhoneButton(
      { ...baseConfig, phoneNumber: "+39 333 262 7187" },
      document,
    )!;
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("tel:+393332627187");
    expect(link.classList.contains("shardana-cf-phone")).toBe(true);
    expect(link.querySelector("svg")).not.toBeNull();
    // The visible label keeps the user-friendly format with spaces.
    const labelSpan = Array.from(link.querySelectorAll("span")).find(
      (s) => s.getAttribute("aria-hidden") !== "true",
    );
    expect(labelSpan?.textContent).toBe("+39 333 262 7187");
    expect(link.getAttribute("aria-label")).toMatch(/Chiama \+39 333 262 7187/);
  });

  it("strips non-digit (except `+`) characters from the tel: URI", () => {
    const link = buildPhoneButton(
      { ...baseConfig, phoneNumber: "(+39) 333 / 262-7187" },
      document,
    )!;
    expect(link.getAttribute("href")).toBe("tel:+393332627187");
  });

  it("supports the icon-only variant via the same flag as the trigger", () => {
    const link = buildPhoneButton(
      { ...baseConfig, phoneNumber: "+39 333", iconOnly: true },
      document,
    )!;
    expect(link.classList.contains("is-icon-only")).toBe(true);
  });

  it("uses the localized `callLabel` for the aria-label prefix (en)", () => {
    const link = buildPhoneButton(
      { ...baseConfig, locale: "en", phoneNumber: "+1 555 1234" },
      document,
    )!;
    expect(link.getAttribute("aria-label")).toBe("Call +1 555 1234");
  });
});

describe("buildActionGroup", () => {
  it("returns just the trigger inside the actions wrapper when no phoneNumber is set", () => {
    const { actions, trigger, phone } = buildActionGroup(baseConfig, document);
    expect(actions.classList.contains("shardana-cf-actions")).toBe(true);
    expect(actions.children).toHaveLength(1);
    expect(actions.firstElementChild).toBe(trigger);
    expect(phone).toBeNull();
  });

  it("returns trigger + phone link when phoneNumber is set", () => {
    const { actions, trigger, phone } = buildActionGroup(
      { ...baseConfig, phoneNumber: "+393332627187" },
      document,
    );
    expect(actions.children).toHaveLength(2);
    expect(actions.children[0]).toBe(trigger);
    expect(actions.children[1]).toBe(phone);
    expect(phone?.getAttribute("href")).toBe("tel:+393332627187");
  });

  it("propagates iconOnly to both children", () => {
    const { trigger, phone } = buildActionGroup(
      { ...baseConfig, iconOnly: true, phoneNumber: "+393332627187" },
      document,
    );
    expect(trigger.classList.contains("is-icon-only")).toBe(true);
    expect(phone?.classList.contains("is-icon-only")).toBe(true);
  });

  it("emits the actions stylesheet rules with flex layout", () => {
    buildActionGroup(baseConfig, document);
    const sheet = document.getElementById("shardana-contact-form-styles") as HTMLStyleElement;
    expect(sheet.textContent).toContain(".shardana-cf-actions");
    expect(sheet.textContent).toMatch(/\.shardana-cf-actions\s*\{[^}]*display:\s*flex/);
    expect(sheet.textContent).toMatch(/justify-content:\s*flex-start/);
  });
});
