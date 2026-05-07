import { describe, expect, it } from "vitest";
import { submissionPayloadSchema } from "../src/shared/payload.js";

describe("submissionPayloadSchema", () => {
  it("accepts a minimal valid payload", () => {
    const parsed = submissionPayloadSchema.parse({ formId: "f1", name: "Mario", message: "Ciao" });
    expect(parsed.formId).toBe("f1");
    expect(parsed.metadata).toEqual({});
    expect(parsed.website).toBe("");
  });

  it("accepts a payload without formId (it is optional metadata)", () => {
    const result = submissionPayloadSchema.safeParse({ message: "x" });
    expect(result.success).toBe(true);
  });

  it("rejects malformed email", () => {
    const result = submissionPayloadSchema.safeParse({ formId: "f", email: "not-an-email", message: "hi" });
    expect(result.success).toBe(false);
  });

  it("rejects oversize fields (DoS protection)", () => {
    const result = submissionPayloadSchema.safeParse({
      formId: "f",
      message: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects oversize metadata values", () => {
    const result = submissionPayloadSchema.safeParse({
      formId: "f",
      message: "ok",
      metadata: { url: "x".repeat(501) },
    });
    expect(result.success).toBe(false);
  });

  it("rejects honeypot non-empty value (bot)", () => {
    const result = submissionPayloadSchema.safeParse({
      formId: "f",
      message: "ok",
      website: "http://spam.example",
    });
    // The schema itself accepts only empty strings for `website` (max=0).
    expect(result.success).toBe(false);
  });

  it("trims whitespace in user fields", () => {
    const parsed = submissionPayloadSchema.parse({ formId: "f", name: "  Mario  ", message: " Hi  " });
    expect(parsed.name).toBe("Mario");
    expect(parsed.message).toBe("Hi");
  });
});
