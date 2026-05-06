// AWS Lambda handler exposed via API Gateway. Validates the submission,
// enforces per-formId allowlists (so customers can't reuse forms.shardana.ai
// for arbitrary domains) and forwards to Mailgun.
//
// The handler is split from the side-effects: `handleSubmission(env, body)`
// is pure-ish (only does network I/O via injected fetch) and is what the
// tests exercise. `handler` is the Lambda glue.

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { ZodError } from "zod";
import { submissionPayloadSchema, type ValidatedSubmission } from "../shared/payload.js";
import { sendEmail, type MailgunConfig } from "./mailgun.js";

export interface HandlerEnv {
  MAILGUN_DOMAIN: string;
  MAILGUN_API_KEY: string;
  /** Comma-separated list of allowed Origin header prefixes for CORS. `*` allows all. */
  ALLOWED_ORIGINS?: string;
  /** Optional EU endpoint override. */
  MAILGUN_BASE_URL?: string;
  /**
   * JSON-encoded map { formId: { from, to, replyTo? } }. Customers register
   * each formId in the admin panel; the handler refuses unknown ids so that
   * forms.shardana.ai cannot be used to spam arbitrary inboxes.
   */
  FORM_REGISTRY: string;
}

export interface FormRegistryEntry {
  from: string;
  to: string | string[];
  replyTo?: string;
}

export type FormRegistry = Record<string, FormRegistryEntry>;

export interface HandlerDependencies {
  fetchImpl?: typeof fetch;
  /** Override `Date.now()` in tests for stable rate-limit windows. */
  now?: () => number;
}

export type SubmissionResult =
  | { ok: true; status: 200; messageId: string }
  | { ok: false; status: 400 | 403 | 404 | 500; error: string; details?: unknown };

export function parseRegistry(raw: string | undefined): FormRegistry {
  if (!raw) return {};
  const parsed = JSON.parse(raw) as FormRegistry;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("FORM_REGISTRY must be a JSON object");
  }
  return parsed;
}

/**
 * Pure entry point. Runs validation, enforces honeypot + registry, sends
 * the email, and returns a structured result.
 */
export async function handleSubmission(
  env: HandlerEnv,
  rawBody: unknown,
  deps: HandlerDependencies = {},
): Promise<SubmissionResult> {
  let submission: ValidatedSubmission;
  try {
    submission = submissionPayloadSchema.parse(rawBody);
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, status: 400, error: "Invalid payload", details: err.flatten() };
    }
    return { ok: false, status: 400, error: "Invalid JSON" };
  }

  // Honeypot — bots fill every field, real users never see `website`.
  if (submission.website && submission.website.length > 0) {
    return { ok: false, status: 400, error: "Submission rejected" };
  }

  if (!submission.name && !submission.email && !submission.message) {
    return { ok: false, status: 400, error: "At least one of name/email/message is required" };
  }

  const registry = parseRegistry(env.FORM_REGISTRY);
  const entry = registry[submission.formId];
  if (!entry) {
    return { ok: false, status: 404, error: `Unknown formId: ${submission.formId}` };
  }

  const config: MailgunConfig = {
    domain: env.MAILGUN_DOMAIN,
    apiKey: env.MAILGUN_API_KEY,
    baseUrl: env.MAILGUN_BASE_URL,
    from: entry.from,
    to: entry.to,
    replyTo: entry.replyTo,
  };

  try {
    const { id } = await sendEmail(submission, config, { fetchImpl: deps.fetchImpl });
    return { ok: true, status: 200, messageId: id };
  } catch (err) {
    return { ok: false, status: 500, error: (err as Error).message };
  }
}

function corsHeaders(env: HandlerEnv, origin: string | undefined): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS ?? "*";
  const list = allowed.split(",").map((s) => s.trim()).filter(Boolean);
  const allowOrigin = list.includes("*") || (origin && list.includes(origin)) ? origin ?? "*" : list[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const env = process.env as unknown as HandlerEnv;
  const origin = event.headers?.origin ?? event.headers?.Origin;
  const headers = { "Content-Type": "application/json", ...corsHeaders(env, origin) };

  if (event.requestContext?.http?.method === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  let body: unknown;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Invalid JSON" }) };
  }

  const result = await handleSubmission(env, body);
  if (result.ok) {
    return { statusCode: result.status, headers, body: JSON.stringify({ ok: true, messageId: result.messageId }) };
  }
  return { statusCode: result.status, headers, body: JSON.stringify({ ok: false, error: result.error, details: result.details }) };
}
