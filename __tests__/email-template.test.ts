import { describe, expect, it } from "vitest";
import { buildEmail, renderSubject, type MailgunConfig } from "../src/lambda/mailgun.js";
import { submissionPayloadSchema } from "../src/shared/payload.js";

const baseConfig: MailgunConfig = {
  domain: "mg.example.com",
  apiKey: "key-test",
  from: "no-reply@example.com",
  to: "owner@example.com",
};

const submission = submissionPayloadSchema.parse({
  formId: "da-giulia",
  name: "Mario Rossi",
  email: "mario@example.com",
  phone: "+39 333 1234567",
  message: "Vorrei prenotare un tavolo.",
  metadata: { locale: "it", source: "https://landing.example/" },
});

describe("renderSubject", () => {
  it("substitutes every supported placeholder", () => {
    expect(
      renderSubject("New: {sender} / {name} / {email} / {formId} / {brand}", {
        sender: "Mario",
        name: "Mario",
        email: "mario@x.com",
        formId: "da-giulia",
        brand: "Trattoria",
      }),
    ).toBe("New: Mario / Mario / mario@x.com / da-giulia / Trattoria");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(renderSubject("Hi {whatever}", { sender: "x", name: "", email: "", formId: "", brand: "" }))
      .toBe("Hi {whatever}");
  });
});

describe("buildEmail with custom template", () => {
  it("uses the custom subjectTemplate verbatim", () => {
    const email = buildEmail(submission, {
      ...baseConfig,
      template: { subjectTemplate: "[{brand}] Nuovo contatto da {sender}", brandName: "Trattoria da Giulia" },
    });
    expect(email.subject).toBe("[Trattoria da Giulia] Nuovo contatto da Mario Rossi");
  });

  it("appends a brand footer in text + html when brandName is set", () => {
    const email = buildEmail(submission, {
      ...baseConfig,
      template: { brandName: "Trattoria da Giulia" },
    });
    expect(email.text).toContain("Inviato dal sito di Trattoria da Giulia.");
    expect(email.html).toContain("Inviato dal sito di <strong>Trattoria da Giulia</strong>.");
  });

  it("escapes the brand name in HTML to prevent injection", () => {
    const email = buildEmail(submission, {
      ...baseConfig,
      template: { brandName: "<script>alert(1)</script>" },
    });
    expect(email.html).not.toContain("<script>alert(1)");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("inserts the intro at the top of text + html when set", () => {
    const email = buildEmail(submission, {
      ...baseConfig,
      template: { intro: "Questo è un messaggio dal form contatti del tuo sito." },
    });
    expect(email.text.split("\n")[0]).toBe("Questo è un messaggio dal form contatti del tuo sito.");
    expect(email.html.startsWith("<p>Questo è un messaggio")).toBe(true);
  });

  it("uses English labels when locale=en", () => {
    const en = submissionPayloadSchema.parse({
      formId: "da-giulia",
      name: "Jane",
      email: "jane@x.com",
      message: "hi",
      metadata: { locale: "en" },
    });
    const email = buildEmail(en, baseConfig);
    expect(email.text).toContain("Form: da-giulia");
    expect(email.text).toContain("Name: Jane");
    expect(email.text).toContain("Email: jane@x.com");
    expect(email.text).not.toContain("Nome:"); // Italian label suppressed
  });

  it("falls back to the default subject when no template is set", () => {
    const email = buildEmail(submission, baseConfig);
    expect(email.subject).toBe("[Heroic] Nuovo messaggio da Mario Rossi (da-giulia)");
  });

  it("the default subject drops the formId tag when formId is absent", () => {
    const noFormId = submissionPayloadSchema.parse({ name: "Mario", message: "hi" });
    const email = buildEmail(noFormId, baseConfig);
    expect(email.subject).toBe("[Heroic] Nuovo messaggio da Mario");
  });

  it("template.locale wins over submission.metadata.locale", () => {
    const email = buildEmail(submission, {
      ...baseConfig,
      template: { locale: "en" },
    });
    expect(email.text).toContain("Name: Mario Rossi");
    expect(email.text).not.toContain("Nome:");
  });
});
