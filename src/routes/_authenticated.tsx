import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { User, ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/lib/theme";
import { BottomNavigation } from "@/components/app/bottom-navigation";
import { useProfile } from "@/hooks/use-profile";
import { hydrateSession, useSession } from "@/lib/session";
import { initDriveBackup, markLocalChange } from "@/lib/drive/service";
import { AppTour } from "@/components/onboarding/app-tour";
import { maybeAutoStartTour } from "@/lib/onboarding";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Local-first: resolve the local owner id. No auth gate, no redirect.
    const session = await hydrateSession();
    return { session };
  },
  component: Shell,
});


function ConnectivityStatus() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return (
    <span
      aria-label={online ? "Online" : "Offline"}
      title={online ? "Online" : "Offline"}
      className={`inline-block h-1.5 w-1.5 rounded-full ${online ? "bg-green-500" : "bg-blue-500"}`}
    />
  );

}

function Shell() {
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  useTheme();
  const session = useSession();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const activeIdentityRef = useRef<string | null>(null);

  // Optional Google Drive backup: watch local mutations so an enabled auto
  // backup knows there are changes to upload. No-op when Drive is off.
  useEffect(() => {
    initDriveBackup();
    return qc.getMutationCache().subscribe((event) => {
      if (event.mutation?.state.status === "success") markLocalChange();
    });
  }, [qc]);
  const name = profile?.display_name || profile?.email?.split("@")[0] || "";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const MAIN_TABS = [
    "/today",
    "/attendance",
    "/schedule",
    "/routine",
    "/courses",
    "/planner",
    "/projects",
    "/todos",
    "/more",
    "/settings",
    "/games",
    "/faqs",
    "/feedback",
    "/pro",
  ];
  const inMainTab = MAIN_TABS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  // Any authenticated page that isn't a main tab is treated as a profile
  // sub-page: show a back button and hide the bottom nav.
  const onProfile = !inMainTab;

  useEffect(() => {
    setMounted(true);
    const t = window.setTimeout(() => maybeAutoStartTour(), 600);
    return () => window.clearTimeout(t);
  }, []);

  // Clear cached data only after a real identity switch. Clearing on the first
  // mount can remove active refresh queries and leave Android/PWA reloads stuck
  // on skeleton states.
  useEffect(() => {
    if (session.mode === "none") return;
    const identityKey = `${session.mode}:${session.userId ?? "anon"}`;
    if (activeIdentityRef.current === null) {
      activeIdentityRef.current = identityKey;
      return;
    }
    if (activeIdentityRef.current !== identityKey) {
      activeIdentityRef.current = identityKey;
      qc.clear();
    }
  }, [qc, session.mode, session.userId]);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-transparent pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-2xl px-4 h-14 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          {onProfile ? (
            <button
              type="button"
              onClick={() =>
                navigate({ to: pathname === "/profile" ? "/today" : "/profile" })
              }
              className="h-9 w-9 rounded-full bg-black text-white dark:bg-white dark:text-black flex items-center justify-center hover:opacity-90 transition"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <Link
              to="/profile"
              className="h-9 w-9 rounded-full bg-black text-white dark:bg-white dark:text-black flex items-center justify-center hover:opacity-90 transition"
              aria-label="Profile"
            >
              <User className="h-4 w-4" />
            </Link>
          )}

          <span className="font-semibold tracking-tight truncate text-center">
            {profileLoading ? (
              <span className="mx-auto block h-4 w-24 animate-pulse rounded-full bg-muted" />
            ) : name ? (
              `Hi, ${name}`
            ) : (
              "Hazri"
            )}
          </span>

          <div className="relative h-8 w-8">
            <div
              aria-hidden="true"
              className="h-8 w-8 rounded-xl overflow-hidden flex items-center justify-center bg-gradient-to-br from-primary to-accent text-white font-bold text-sm"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                (name?.[0]?.toUpperCase() ?? "H")
              )}
            </div>
            <span className="absolute left-1/2 top-full -translate-x-1/2 leading-none">
              <ConnectivityStatus />
            </span>

          </div>


        </div>
      </header>

      <main className={`mx-auto max-w-2xl px-4 pt-4 ${onProfile ? "pb-8" : "pb-[calc(env(safe-area-inset-bottom)+104px)]"}`}>
        <Outlet />
      </main>

      {!onProfile && <BottomNavigation />}
      <AppTour />
    </div>
  );
}