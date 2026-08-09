import { createFileRoute, redirect } from "@tanstack/react-router";
import { hydrateSession } from "@/lib/session";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    // Local-first: no account, no auth gate — go straight into the app.
    await hydrateSession();
    throw redirect({ to: "/today" });
  },
  component: () => null,
});
