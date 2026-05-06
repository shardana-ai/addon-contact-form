// Field allowlist + types — kept separate from `payload.ts` so the widget
// bundle does not pull in Zod (only the Lambda needs runtime validation).

export const allowedFields = ["name", "email", "phone", "message"] as const;
export type FieldName = (typeof allowedFields)[number];
