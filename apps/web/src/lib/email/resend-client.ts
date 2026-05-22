/**
 * Thin Resend HTTP client.
 *
 * We deliberately *don't* use the official `resend` npm package — it
 * adds dependencies (zod, etc) we already have at incompatible versions
 * and an extra package to keep in sync on the VPS. The Resend REST API
 * is one POST request, so we just call it ourselves.
 *
 * Required env vars:
 *   RESEND_API_KEY     — `re_xxx...` from https://resend.com/api-keys
 *   RESEND_FROM_EMAIL  — sender, e.g. `Arcmath <noreply@mail.forecaster-ai.com>`
 *                        Must be a verified sender domain on the Resend
 *                        dashboard. For development the special address
 *                        `onboarding@resend.dev` works without verification
 *                        but only delivers to your own Resend-registered
 *                        email.
 *
 * Local-dev fallback: if RESEND_API_KEY is not set, instead of failing
 * we log the email payload to stderr so devs can grab the verification
 * link without setting up Resend. Set EMAIL_LOG_ONLY=1 to force this
 * mode even when the API key is set (useful in tests).
 */

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string; // Plain-text fallback for client like text-only mailers
  /**
   * Idempotency key — Resend uses this to dedupe retries on its end.
   * Default: a random ID per call, which is fine for a one-shot send.
   */
  idempotencyKey?: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const logOnly = process.env.EMAIL_LOG_ONLY === "1";

  // Dev fallback: print the payload so the dev can copy the verify link.
  if (!apiKey || logOnly) {
    // eslint-disable-next-line no-console
    console.warn(
      "[email] RESEND_API_KEY not set or EMAIL_LOG_ONLY=1 — printing email instead of sending:",
      {
        to: input.to,
        subject: input.subject,
        // First 500 chars of html (full would be noisy)
        htmlPreview: input.html.slice(0, 500),
        text: input.text
      }
    );
    return { ok: true, id: "log-only" };
  }

  if (!from) {
    return {
      ok: false,
      error: "RESEND_FROM_EMAIL not configured. Set it to e.g. 'Arcmath <noreply@mail.your-domain.com>'."
    };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        ...(input.idempotencyKey
          ? { "Idempotency-Key": input.idempotencyKey }
          : {})
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Resend HTTP ${response.status}: ${errorText.slice(0, 300)}`
      };
    }

    const body = (await response.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: body.id ?? "unknown" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown fetch error"
    };
  }
}
