import { createFileRoute, redirect } from "@tanstack/react-router";
import { hydrateSession } from "@/lib/session";

/**
 * Hazri is local-first: there is no sign up, sign in, OTP or email
 * verification any more. This route is kept only so old bookmarks,
 * shortcuts and installed-PWA start URLs keep working — it sends the
 * user straight into the app.
 *
 * The previous Supabase email/password + OTP implementation is preserved
 * in Git history and can be restored if accounts ever come back.
 */
export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    await hydrateSession();
    throw redirect({ to: "/today", replace: true });
  },
  component: () => null,
});
