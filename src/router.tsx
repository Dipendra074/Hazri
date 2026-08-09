import { createRouter, useRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { createHazriQueryClient } from "./lib/query-client";

const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk \S+ failed/i;

function DefaultPending() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
    </div>
  );
}

function DefaultError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const isChunk = CHUNK_ERROR_RE.test(error?.message ?? "");
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h2 className="text-base font-semibold text-foreground">
          {isChunk ? "This page isn't cached yet" : "Something went wrong"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {isChunk
            ? "Reconnect to load it. Your saved data is safe on this device."
            : "You can try again or head back."}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <button
            onClick={() => router.history.back()}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = createHazriQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: DefaultPending,
    defaultErrorComponent: DefaultError,
  });

  return router;
};
