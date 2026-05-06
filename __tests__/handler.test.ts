import { describe, expect, it, vi } from "vitest";
import {
  handleSubmission,
  parseRegistry,
  type HandlerEnv,
  type FormRegistry,
} from "../src/lambda/handler.js";

const registry: FormRegistry = {
  "da-giulia": { from: "no-reply@example.com", to: "owner@restaurant.example", replyTo: "support@example.com" },
};

const env: HandlerEnv = {
  MAILGUN_DOMAIN: "mg.example.com",
  MAILGUN_API_KEY: "key-test",
  ALLOWED_ORIGINS: "https://landing.shardana.ai",
  FORM_REGISTRY: JSON.stringify(registry),
};

const goodPayload = {
  formId: "da-giulia",
  name: "Mario",
  email: "mario@example.com",
  message: "Hello",
};

describe("parseRegistry", () => {
  it("parses a JSON object", () => {
    expect(parseRegistry('{"a":{"from":"a","to":"b"}}')).toEqual({ a: { from: "a", to: "b" } });
  });
  it("returns {} for undefined", () => {
    expect(parseRegistry(undefined)).toEqual({});
  });
  it("throws on a non-object root", () => {
    expect(() => parseRegistry("[]")).toThrow();
  });
});

describe("handleSubmission", () => {
  it("returns 200 for a valid submission and forwards to Mailgun", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "<x@mg>" }), { status: 200 })) as unknown as typeof fetch;
    const result = await handleSubmission(env, goodPayload, { fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.messageId).toBe("<x@mg>");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("returns 400 when the payload is malformed", async () => {
    const result = await handleSubmission(env, { not: "valid" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/Invalid payload/);
    }
  });

  it("returns 400 when only honeypot is filled (bot)", async () => {
    const result = await handleSubmission(env, { formId: "da-giulia", website: "spam" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("returns 400 when name/email/message are all empty", async () => {
    const result = await handleSubmission(env, { formId: "da-giulia" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/required/);
  });

  it("returns 404 when formId is not in the registry", async () => {
    const result = await handleSubmission(env, { ...goodPayload, formId: "unknown" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error).toMatch(/Unknown formId/);
    }
  });

  it("returns 500 when Mailgun fails", async () => {
    const fetchImpl = vi.fn(async () => new Response("oops", { status: 500 })) as unknown as typeof fetch;
    const result = await handleSubmission(env, goodPayload, { fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(500);
  });

  it("uses the registry's replyTo when present", async () => {
    let capturedBody = "";
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedBody = (init?.body as URLSearchParams).toString();
      return new Response(JSON.stringify({ id: "<x@mg>" }), { status: 200 });
    }) as unknown as typeof fetch;
    await handleSubmission(env, goodPayload, { fetchImpl });
    expect(capturedBody).toContain("h%3AReply-To=support%40example.com");
  });
});
