// Submission payload shared between the widget (client-side construction)
// and the Lambda handler (server-side validation). Kept in `src/shared/` so
// both bundles import the same source of truth — no drift between the two
// pieces of the contract.

import { z } from "zod";

export { allowedFields, type FieldName } from "./fields.js";

const trimmedString = (max: number) => z.string().trim().min(1).max(max);

export const submissionPayloadSchema = z.object({
  // Optional tag for the email subject + metadata. Single-tenant Lambdas
  // do not route on this field; it is purely informational.
  formId: z.string().min(1).max(64).optional(),
  // Honeypot field. Bots fill every visible input — we add a hidden one and
  // reject the request if it is non-empty. Real users never see it.
  website: z.string().max(0).optional().default(""),
  name: trimmedString(120).optional(),
  email: z.string().trim().email().max(180).optional(),
  phone: trimmedString(40).optional(),
  message: trimmedString(2000).optional(),
  // Free-form metadata: locale, source URL, etc. Capped to keep email size
  // reasonable.
  metadata: z.record(z.string().max(500)).optional().default({}),
});

export type SubmissionPayload = z.input<typeof submissionPayloadSchema>;
export type ValidatedSubmission = z.output<typeof submissionPayloadSchema>;
