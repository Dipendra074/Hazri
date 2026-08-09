import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { PwaUpdater } from "@/components/pwa/update-toast";
import { GitHubApkUpdater } from "@/components/native/github-apk-updater";
import { NativeRuntime } from "@/components/native/native-runtime";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1",
      },
      { title: "Hazri — Smart Attendance & Routine" },
      {
        name: "description",
        content:
          "Track class attendance the smart way — auto-present by default, tap only when you're absent. Routine, projects, and to-dos included.",
      },
      { name: "theme-color", content: "#0a0a12" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Hazri" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { property: "og:title", content: "Hazri — Smart Attendance & Routine" },
      {
        property: "og:description",
        content:
          "Track class attendance the smart way — auto-present by default, tap only when you're absent.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://hazri001.vercel.app" },
      { property: "og:image", content: "https://hazri001.vercel.app/hazri-social-preview.png" },
      { property: "og:site_name", content: "Hazri" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Hazri — Smart Attendance & Routine" },
      {
        name: "twitter:description",
        content:
          "Track class attendance the smart way — auto-present by default, tap only when you're absent.",
      },
      { name: "twitter:image", content: "https://hazri001.vercel.app/hazri-social-preview.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Mingzat&display=swap",
      },
      { rel: "icon", type: "image/svg+xml", href: "/logo.svg" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "canonical", href: "https://hazri001.vercel.app" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('hazri-theme')==='light'?'light':'dark';var r=document.documentElement;r.classList.remove('light','dark');r.classList.add(t);r.style.colorScheme=t}catch(e){}",
          }}
        />
        <HeadContent />
      </head>
      <body className="bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <NativeRuntime />
      <GitHubApkUpdater />
      <PwaUpdater />
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          unstyled: false,
          classNames: {
            toast:
              "!bg-card/80 !backdrop-blur-xl !border !border-border/60 !text-foreground !rounded-2xl !shadow-lg !px-4 !py-3 !text-sm",
            title: "!font-medium !tracking-tight",
            description: "!text-muted-foreground !text-xs !mt-0.5",
            error: "!border-destructive/40",
            success: "!border-primary/40",
          },
        }}
      />
    </QueryClientProvider>
  );
}
