import { describe, expect, it, vi } from "vitest";
import { buildEmail, sendEmail, type MailgunConfig } from "../src/lambda/mailgun.js";
import { submissionPayloadSchema } from "../src/shared/payload.js";

const baseConfig: MailgunConfig = {
  domain: "mg.example.com",
  apiKey: "key-test",
  from: "no-reply@example.com",
  to: "owner@restaurant.example",
};

const submission = submissionPayloadSchema.parse({
  formId: "da-giulia",
  name: "Mario Rossi",
  email: "mario@example.com",
  phone: "+39 333 1234567",
  message: "Vorrei prenotare un tavolo per 4 persone.\nGrazie!",
  metadata: { locale: "it", source: "https://landing.shardana.ai/" },
});

describe("buildEmail", () => {
  it("includes all fields and a structured subject", () => {
    const email = buildEmail(submission, baseConfig);
    expect(email.from).toBe(baseConfig.from);
    expect(email.to).toBe(baseConfig.to);
    expect(email.subject).toContain("Mario Rossi");
    expect(email.subject).toContain("da-giulia");
    expect(email.text).toContain("Form: da-giulia");
    expect(email.text).toContain("Nome: Mario Rossi");
    expect(email.text).toContain("Email: mario@example.com");
    expect(email.text).toContain("Telefono: +39 333 1234567");
    expect(email.text).toContain("Vorrei prenotare un tavolo");
    expect(email.text).toContain("locale: it");
  });

  it("escapes HTML in user-supplied fields", () => {
    const malicious = submissionPayloadSchema.parse({
      formId: "f",
      name: "<script>alert(1)</script>",
      message: "x",
    });
    const email = buildEmail(malicious, baseConfig);
    expect(email.html).not.toContain("<script>alert(1)");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("sets Reply-To to the submitter email by default", () => {
    const email = buildEmail(submission, baseConfig);
    expect(email["h:Reply-To"]).toBe("mario@example.com");
  });

  it("explicit Reply-To wins over the submitter email", () => {
    const email = buildEmail(submission, { ...baseConfig, replyTo: "support@example.com" });
    expect(email["h:Reply-To"]).toBe("support@example.com");
  });

  it("joins multiple recipients with a comma", () => {
    const email = buildEmail(submission, { ...baseConfig, to: ["a@x.com", "b@x.com"] });
    expect(email.to).toBe("a@x.com, b@x.com");
  });
});

describe("sendEmail", () => {
  it("POSTs to the Mailgun messages endpoint with Basic auth", async () => {
    const calls: Array<[unknown, RequestInit | undefined]> = [];
    const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify({ id: "<abc@mg>" }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await sendEmail(submission, baseConfig, { fetchImpl });
    expect(result.id).toBe("<abc@mg>");

    expect(calls).toHaveLength(1);
    const [url, init] = calls[0]!;
    expect(url).toBe("https://api.mailgun.net/v3/mg.example.com/messages");
    expect(init!.method).toBe("POST");
    const auth = init!.headers as Record<string, string>;
    expect(auth.Authorization).toMatch(/^Basic /);
    expect(auth["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  it("uses the EU base URL when configured", async () => {
    let capturedUrl: unknown = "";
    const fetchImpl = vi.fn(async (url: unknown) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    }) as unknown as typeof fetch;
    await sendEmail(submission, { ...baseConfig, baseUrl: "https://api.eu.mailgun.net" }, { fetchImpl });
    expect(capturedUrl).toBe("https://api.eu.mailgun.net/v3/mg.example.com/messages");
  });

  it("throws on non-2xx response with the body included", async () => {
    const fetchImpl = vi.fn(async () => new Response("forbidden", { status: 403 })) as unknown as typeof fetch;
    await expect(sendEmail(submission, baseConfig, { fetchImpl })).rejects.toThrow(/403.*forbidden/);
  });
});
