import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import {
  buildForm,
  buildModal,
  buildThemeStyle,
  buildTrigger,
  configFromDataset,
} from "../src/widget/render.js";

let window: Window;
let document: Document;

beforeEach(() => {
  window = new Window({ url: "https://landing.shardana.ai/" });
  document = window.document as unknown as Document;
});

afterEach(() => {
  window.close();
});

describe("configFromDataset — theming", () => {
  it("captures every supported theming attribute when present", () => {
    const config = configFromDataset({
      mode: "modal",
      accent: "#1d6f9b",
      accentText: "#fff",
      background: "#fffaf3",
      textColor: "#0d2434",
      muted: "#5b6e7a",
      inputBorder: "#bfd4e2",
      inputBackground: "transparent",
      inputText: "#0d2434",
    } as unknown as DOMStringMap);
    expect(config.themeOverrides).toEqual({
      accent: "#1d6f9b",
      accentText: "#fff",
      background: "#fffaf3",
      text: "#0d2434",
      muted: "#5b6e7a",
      inputBorder: "#bfd4e2",
      inputBackground: "transparent",
      inputText: "#0d2434",
    });
  });

  it("emits no themeOverrides when none of the dataset keys are set", () => {
    const config = configFromDataset({ mode: "modal" } as DOMStringMap);
    expect(config.themeOverrides).toBeUndefined();
  });
});

describe("buildThemeStyle", () => {
  it("returns an empty string when overrides are undefined or empty", () => {
    expect(buildThemeStyle(undefined)).toBe("");
    expect(buildThemeStyle({})).toBe("");
  });

  it("emits only the set fields, mapped to --cf-* custom properties", () => {
    expect(
      buildThemeStyle({ accent: "#1d6f9b", accentText: "#fff", background: "#fffaf3" }),
    ).toBe("--cf-accent: #1d6f9b; --cf-accent-text: #fff; --cf-bg: #fffaf3");
  });

  it("strips potentially style-breaking characters from values", () => {
    expect(buildThemeStyle({ accent: "red; }<x" })).toBe("--cf-accent: red x");
  });

  it("supports `var(--token)` values for theme tokens", () => {
    expect(buildThemeStyle({ accent: "var(--color-accent)" })).toBe(
      "--cf-accent: var(--color-accent)",
    );
  });
});

const baseConfig = {
  formId: "f",
  submitUrl: "https://x/y",
  fields: ["name", "email", "message"] as ("name" | "email" | "phone" | "message")[],
  required: ["name", "email", "message"] as ("name" | "email" | "phone" | "message")[],
  locale: "it",
  theme: "light" as const,
  honeypotName: "website",
  mode: "modal" as const,
};

describe("inline style application", () => {
  it("emits the inline style on buildForm when overrides are present", () => {
    const form = buildForm(
      { ...baseConfig, themeOverrides: { accent: "#1d6f9b" } },
      document,
    );
    expect(form.getAttribute("style")).toBe("--cf-accent: #1d6f9b");
  });

  it("emits the inline style on buildTrigger", () => {
    const trigger = buildTrigger(
      { ...baseConfig, themeOverrides: { accent: "#1d6f9b", accentText: "#fff" } },
      document,
    );
    const style = trigger.getAttribute("style");
    expect(style).toContain("--cf-accent: #1d6f9b");
    expect(style).toContain("--cf-accent-text: #fff");
  });

  it("emits the inline style on the dialog (panel inherits via CSS vars)", () => {
    const { dialog } = buildModal(
      { ...baseConfig, themeOverrides: { background: "#fffaf3", text: "#0d2434" } },
      document,
    );
    const style = dialog.getAttribute("style");
    expect(style).toContain("--cf-bg: #fffaf3");
    expect(style).toContain("--cf-text: #0d2434");
  });

  it("does not set a style attribute when overrides are absent", () => {
    const trigger = buildTrigger(baseConfig, document);
    expect(trigger.getAttribute("style")).toBeNull();
  });
});

describe("CSS rules use variables (no more currentColor traps)", () => {
  it("the injected stylesheet references --cf-accent for trigger background", () => {
    buildTrigger(baseConfig, document);
    const sheet = document.getElementById("shardana-contact-form-styles") as HTMLStyleElement;
    expect(sheet.textContent).toContain(".shardana-cf-trigger");
    expect(sheet.textContent).toContain("background:var(--cf-accent");
    expect(sheet.textContent).toContain("color:var(--cf-accent-text");
  });

  it("the submit button uses --cf-accent / --cf-accent-text", () => {
    buildForm(baseConfig, document);
    const sheet = document.getElementById("shardana-contact-form-styles") as HTMLStyleElement;
    expect(sheet.textContent).toContain(".shardana-cf__submit");
    expect(sheet.textContent).toMatch(/\.shardana-cf__submit\s*\{[^}]*background:\s*var\(--cf-accent/);
  });
});
