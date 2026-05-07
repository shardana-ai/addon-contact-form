import { describe, expect, it, vi } from "vitest";
import { handleSubmission, type HandlerEnv } from "../src/lambda/handler.js";

const env: HandlerEnv = {
  MAILGUN_DOMAIN: "mg.example.com",
  MAILGUN_API_KEY: "key-test",
  MAIL_FROM: "no-reply@example.com",
  MAIL_TO: "owner@example.com",
  ALLOWED_ORIGINS: "https://my-landing.example",
};

const goodPayload = {
  formId: "da-giulia",
  name: "Mario",
  email: "mario@example.com",
  message: "Hello",
};

describe("handleSubmission", () => {
  it("returns 200 for a valid submission and forwards to Mailgun", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ id: "<x@mg>" }), { status: 200 }),
    ) as unknown as typeof fetch;
    const result = await handleSubmission(env, goodPayload, { fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.messageId).toBe("<x@mg>");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("works without formId (it is now optional metadata)", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ id: "<x@mg>" }), { status: 200 }),
    ) as unknown as typeof fetch;
    const result = await handleSubmission(
      env,
      { name: "Mario", email: "m@x.com", message: "hi" },
      { fetchImpl },
    );
    expect(result.ok).toBe(true);
  });

  it("returns 400 when the payload is malformed", async () => {
    const result = await handleSubmission(env, { name: 42 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/Invalid payload/);
    }
  });

  it("returns 400 when only honeypot is filled (bot)", async () => {
    const result = await handleSubmission(env, { website: "spam" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("returns 400 when name/email/message are all empty", async () => {
    const result = await handleSubmission(env, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/required/);
  });

  it("returns 500 when MAIL_FROM is missing", async () => {
    const broken: HandlerEnv = { ...env, MAIL_FROM: "" };
    const result = await handleSubmission(broken, goodPayload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(500);
      expect(result.error).toMatch(/MAIL_FROM/);
    }
  });

  it("returns 500 when MAIL_TO is missing", async () => {
    const broken: HandlerEnv = { ...env, MAIL_TO: "" };
    const result = await handleSubmission(broken, goodPayload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/MAIL_TO/);
  });

  it("returns 500 when Mailgun fails", async () => {
    const fetchImpl = vi.fn(async () => new Response("oops", { status: 500 })) as unknown as typeof fetch;
    const result = await handleSubmission(env, goodPayload, { fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(500);
  });

  it("uses MAIL_REPLY_TO when set, instead of the submitter email", async () => {
    let capturedBody = "";
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedBody = (init?.body as URLSearchParams).toString();
      return new Response(JSON.stringify({ id: "<x@mg>" }), { status: 200 });
    }) as unknown as typeof fetch;
    await handleSubmission({ ...env, MAIL_REPLY_TO: "support@example.com" }, goodPayload, { fetchImpl });
    expect(capturedBody).toContain("h%3AReply-To=support%40example.com");
  });

  it("falls back to the submitter email as Reply-To when MAIL_REPLY_TO is unset", async () => {
    let capturedBody = "";
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedBody = (init?.body as URLSearchParams).toString();
      return new Response(JSON.stringify({ id: "<x@mg>" }), { status: 200 });
    }) as unknown as typeof fetch;
    await handleSubmission(env, goodPayload, { fetchImpl });
    expect(capturedBody).toContain("h%3AReply-To=mario%40example.com");
  });

  it("supports multiple recipients via comma-separated MAIL_TO", async () => {
    let capturedBody = "";
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedBody = (init?.body as URLSearchParams).toString();
      return new Response(JSON.stringify({ id: "<x@mg>" }), { status: 200 });
    }) as unknown as typeof fetch;
    await handleSubmission(
      { ...env, MAIL_TO: "owner@example.com, manager@example.com" },
      goodPayload,
      { fetchImpl },
    );
    expect(capturedBody).toContain("to=owner%40example.com%2C+manager%40example.com");
  });
});
