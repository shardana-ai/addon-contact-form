// AWS Lambda handler exposed via API Gateway. One Lambda = one form: the
// recipient address is configured at deploy time via env vars, not via a
// central registry. This keeps the addon truly self-hostable — anyone can
// `serverless deploy` to their own AWS account and own the endpoint.
//
// `handleSubmission(env, body, deps)` is the pure entry point exercised by
// tests; `handler` is the AWS glue.

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { ZodError } from "zod";
import { submissionPayloadSchema, type ValidatedSubmission } from "../shared/payload.js";
import { sendEmail, type MailgunConfig } from "./mailgun.js";

export interface HandlerEnv {
  MAILGUN_DOMAIN: string;
  MAILGUN_API_KEY: string;
  /** "From" address used by Mailgun. Must belong to MAILGUN_DOMAIN or be authorised by it. */
  MAIL_FROM: string;
  /** Recipient(s). Comma-separated when more than one. */
  MAIL_TO: string;
  /** Optional explicit Reply-To. Falls back to the submitter's email. */
  MAIL_REPLY_TO?: string;
  /** Comma-separated list of allowed Origin header values for CORS. `*` allows all. */
  ALLOWED_ORIGINS?: string;
  /** Optional EU endpoint override (`https://api.eu.mailgun.net`). */
  MAILGUN_BASE_URL?: string;
}

export interface HandlerDependencies {
  fetchImpl?: typeof fetch;
}

export type SubmissionResult =
  | { ok: true; status: 200; messageId: string }
  | { ok: false; status: 400 | 500; error: string; details?: unknown };

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function assertEnv(env: HandlerEnv): void {
  const required: Array<keyof HandlerEnv> = ["MAILGUN_DOMAIN", "MAILGUN_API_KEY", "MAIL_FROM", "MAIL_TO"];
  for (const key of required) {
    if (!env[key]) throw new Error(`Missing required env var: ${key}`);
  }
}

/**
 * Pure entry point. Validates the payload, runs the honeypot check, and
 * forwards the email via Mailgun. The recipient mapping is fixed by
 * deployment-time env vars — there is no per-request lookup.
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

  if (submission.website && submission.website.length > 0) {
    return { ok: false, status: 400, error: "Submission rejected" };
  }

  if (!submission.name && !submission.email && !submission.message) {
    return { ok: false, status: 400, error: "At least one of name/email/message is required" };
  }

  try {
    assertEnv(env);
  } catch (err) {
    return { ok: false, status: 500, error: (err as Error).message };
  }

  const recipients = splitList(env.MAIL_TO);
  const config: MailgunConfig = {
    domain: env.MAILGUN_DOMAIN,
    apiKey: env.MAILGUN_API_KEY,
    baseUrl: env.MAILGUN_BASE_URL,
    from: env.MAIL_FROM,
    to: recipients.length === 1 ? recipients[0]! : recipients,
    replyTo: env.MAIL_REPLY_TO,
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
  const list = splitList(allowed);
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
