import { useEffect, useRef, useState } from "react";
import { OTPInput, REGEXP_ONLY_DIGITS } from "input-otp";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { logAuthError, mapAuthError, mapOtpError } from "@/lib/auth-errors";
import { startSignedInSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const RESEND_COOLDOWN = 60;
const REQUEST_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: PromiseLike<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("client_timeout")), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** j***n@college.edu — keeps the domain readable without exposing the full address. */
export function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  if (!domain) return email;
  if (name.length <= 2) return `${name[0] ?? ""}***@${domain}`;
  return `${name[0]}${"*".repeat(Math.min(name.length - 2, 4))}${name[name.length - 1]}@${domain}`;
}

type SlotState = { char: string | null; isActive: boolean; hasFakeCaret: boolean };

function Slot({ slot }: { slot: SlotState }) {

  return (
    <div
      data-active={slot?.isActive ? "true" : "false"}
      className="otp-slot relative flex items-center justify-center"
    >
      {slot?.char}
      {slot?.hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      )}
    </div>
  );
}

function SuccessCheck() {
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="otp-check-ring flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
        <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" aria-hidden="true">
          <path
            className="otp-check-path"
            d="M4.5 12.5l4.5 4.5L19.5 7"
            stroke="var(--primary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="text-sm font-medium">Email verified</p>
    </div>
  );
}

export interface OtpVerificationProps {
  email: string;
  onVerified: () => void;
  onChangeEmail: () => void;
  /** Seconds remaining before a resend is allowed, carried over from signup. */
  initialCooldown?: number;
}

export function OtpVerification({
  email,
  onVerified,
  onChangeEmail,
  initialCooldown = RESEND_COOLDOWN,
}: OtpVerificationProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(initialCooldown);
  const submitting = useRef(false);
  const autoTried = useRef<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function verify(value: string) {
    if (submitting.current || loading || success) return;
    if (value.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    submitting.current = true;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await withTimeout(
        supabase.auth.verifyOtp({ email, token: value, type: "email" }),
      );
      if (err) throw err;
      // Only treat it as verified when a real session came back.
      const session =
        data.session ?? (await supabase.auth.getSession().then((r) => r.data.session));
      if (!session) throw new Error("verification_incomplete");

      startSignedInSession(session.user.id, session.user.email ?? null);
      setSuccess(true);
      setTimeout(onVerified, 1100);
    } catch (err) {
      logAuthError("verify_otp", err);
      setError(mapOtpError(err).message);
      setCode("");
      setShake(true);
      setTimeout(() => setShake(false), 450);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || resending || success) return;
    setResending(true);
    setError(null);
    try {
      const { error: err } = await withTimeout(supabase.auth.resend({ type: "signup", email }));
      if (err) throw err;
      setCooldown(RESEND_COOLDOWN);
      setCode("");
      toast.success("A new code is on its way. Check your inbox.");
    } catch (err) {
      logAuthError("resend_otp", err);
      const mapped = mapAuthError(err);
      if (mapped.kind === "rate_limited") setCooldown(RESEND_COOLDOWN);
      toast.error(mapped.message);
    } finally {
      setResending(false);
    }
  }

  // Auto-submit once the sixth digit lands (typed or pasted).
  useEffect(() => {
    if (code.length === 6 && autoTried.current !== code && !loading && !success) {
      autoTried.current = code;
      void verify(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div className="otp-enter space-y-4 text-center">
      {success ? (
        <SuccessCheck />
      ) : (
        <>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
            <MailCheck className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Verify your email</h2>
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code we sent to{" "}
              <span className="font-medium text-foreground break-all">{maskEmail(email)}</span>
            </p>
          </div>
        </>
      )}

      <div className={cn("flex justify-center", shake && "otp-shake", success && "otp-success")}>
        <OTPInput
          value={code}
          onChange={setCode}
          maxLength={6}
          autoFocus
          disabled={loading || success}
          pattern={REGEXP_ONLY_DIGITS}
          inputMode="numeric"
          aria-label="Verification code"
          containerClassName="flex items-center gap-2 has-[:disabled]:opacity-70"
          className="disabled:cursor-not-allowed"
          render={({ slots }) => (
            <>
              {slots.map((slot, i) => (
                <Slot key={i} slot={slot} />
              ))}
            </>
          )}
        />
      </div>

      {error && !success && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      {!success && (
        <>
          <Button
            type="button"
            className="w-full rounded-full h-11 font-semibold"
            onClick={() => verify(code)}
            disabled={loading || code.length !== 6}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? "Verifying…" : "Verify"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full rounded-full h-11 font-medium"
            onClick={handleResend}
            disabled={cooldown > 0 || resending}
          >
            {resending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </Button>

          <button
            type="button"
            onClick={onChangeEmail}
            className="text-xs font-medium text-primary"
          >
            Change email
          </button>
        </>
      )}
    </div>
  );
}
