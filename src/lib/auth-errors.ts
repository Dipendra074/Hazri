/**
 * Maps Supabase Auth errors to safe, user-friendly messages.
 * Raw errors, codes, URLs and keys must never reach the UI.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 20;

export const GENERIC_CREDENTIALS = "Email or password is incorrect.";
export const UNVERIFIED_EMAIL =
  "Please verify your email before signing in. Check your inbox for the verification link.";
export const RATE_LIMITED = "Too many attempts. Please wait a few minutes and try again.";
export const NEUTRAL_SIGNUP_EXISTS =
  "If an account already exists for this email, try signing in or resetting your password.";

export type AuthErrorKind =
  | "invalid_credentials"
  | "unverified"
  | "rate_limited"
  | "weak_password"
  | "invalid_email"
  | "network"
  | "timeout"
  | "email_send_failed"
  | "db_error"
  | "link_expired"
  | "link_used"
  | "unknown";

/** Logs the raw error for developers only; never surfaced to the UI. */
export function logAuthError(scope: string, error: unknown) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error(`[auth:${scope}]`, error);
  }
}

export interface MappedAuthError {
  kind: AuthErrorKind;
  message: string;
}

function textOf(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error.toLowerCase();
  const e = error as { message?: string; code?: string; error_description?: string };
  return `${e.code ?? ""} ${e.message ?? ""} ${e.error_description ?? ""}`.toLowerCase();
}

/** Validate a password against the app's length policy. Returns null when valid. */
export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters.`;
  }
  if (password.length > PASSWORD_MAX) {
    return `Password must be ${PASSWORD_MAX} characters or fewer.`;
  }
  return null;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function mapAuthError(error: unknown): MappedAuthError {
  const t = textOf(error);

  if (!t) return { kind: "unknown", message: "Something went wrong. Please try again." };

  if (
    t.includes("rate limit") ||
    t.includes("too many requests") ||
    t.includes("over_email_send")
  ) {
    return { kind: "rate_limited", message: RATE_LIMITED };
  }
  if (t.includes("email not confirmed") || t.includes("email_not_confirmed")) {
    return { kind: "unverified", message: UNVERIFIED_EMAIL };
  }
  if (
    t.includes("invalid login credentials") ||
    t.includes("invalid_credentials") ||
    t.includes("invalid grant") ||
    t.includes("user not found") ||
    t.includes("invalid password")
  ) {
    return { kind: "invalid_credentials", message: GENERIC_CREDENTIALS };
  }
  if (
    t.includes("weak password") ||
    t.includes("weak_password") ||
    t.includes("password should be")
  ) {
    return {
      kind: "weak_password",
      message: `Please choose a stronger password (${PASSWORD_MIN}–${PASSWORD_MAX} characters).`,
    };
  }
  if (
    t.includes("invalid email") ||
    t.includes("email_address_invalid") ||
    t.includes("validation_failed")
  ) {
    return { kind: "invalid_email", message: "Please enter a valid email address." };
  }
  if (t.includes("client_timeout") || t.includes("timed out") || t.includes("timeout")) {
    return {
      kind: "timeout",
      message: "The server is taking too long to respond. Please try again in a moment.",
    };
  }
  if (
    t.includes("failed to fetch") ||
    t.includes("network") ||
    t.includes("networkerror") ||
    t.includes("load failed")
  ) {
    return {
      kind: "network",
      message: "Can't reach the server. Check your connection and try again.",
    };
  }
  if (t.includes("expired") && (t.includes("token") || t.includes("link") || t.includes("otp"))) {
    return {
      kind: "link_expired",
      message: "That verification link has expired. Request a new one and try again.",
    };
  }
  if (
    t.includes("already been used") ||
    t.includes("token_used") ||
    t.includes("already confirmed")
  ) {
    return {
      kind: "link_used",
      message: "That verification link was already used. You can sign in now.",
    };
  }
  return { kind: "unknown", message: "Something went wrong. Please try again." };
}

/** Maps errors from verifyOtp / resend into friendly OTP-specific messages. */
export function mapOtpError(error: unknown): MappedAuthError {
  const t = textOf(error);
  // Supabase returns a single "expired or invalid" message for both cases.
  if (t.includes("expired") && t.includes("invalid")) {
    return {
      kind: "invalid_credentials",
      message: "That code isn't correct or has expired. Try again or resend a new code.",
    };
  }
  if (t.includes("expired")) {
    return {
      kind: "link_expired",
      message: "That code has expired. Tap “Resend code” to get a new one.",
    };
  }
  if (
    t.includes("token has invalid") ||
    t.includes("invalid token") ||
    t.includes("otp_expired") ||
    t.includes("invalid otp") ||
    t.includes("token not found") ||
    t.includes("verification_incomplete")
  ) {
    return { kind: "invalid_credentials", message: "That code isn't correct. Please try again." };
  }
  const mapped = mapAuthError(error);
  if (mapped.kind === "unknown") {
    return {
      kind: "unknown",
      message: "That code isn't correct or has expired. Try again or resend a new code.",
    };
  }

  return mapped;
}

/** Message used for signup failures, kept neutral to avoid account enumeration. */

export function mapSignupError(error: unknown): MappedAuthError {
  const t = textOf(error);
  if (
    t.includes("already registered") ||
    t.includes("user_already_exists") ||
    t.includes("already been registered")
  ) {
    return { kind: "unknown", message: NEUTRAL_SIGNUP_EXISTS };
  }
  // GoTrue returns this when the account was created but the SMTP send failed.
  if (
    t.includes("error sending confirmation") ||
    t.includes("error sending email") ||
    t.includes("unexpected_failure") ||
    t.includes("smtp")
  ) {
    return {
      kind: "email_send_failed",
      message:
        "Your account was created, but we couldn't send the verification email right now. Use “Resend verification email” in a minute.",
    };
  }
  // Trigger/RLS failure while creating the profile row.
  if (t.includes("database error") || t.includes("saving new user")) {
    return {
      kind: "db_error",
      message:
        "Your account may have been created, but we couldn't finish setting up your profile. Try signing in, or contact support if it keeps happening.",
    };
  }
  return mapAuthError(error);
}
