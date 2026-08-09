import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { initializeChunkRecovery } from "./lib/chunk-recovery";
import { initPwa } from "./lib/pwa-register";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// An explicit call keeps recovery in the client bundle even though this
// package declares modules side-effect-free. The initializer is a server no-op.
initializeChunkRecovery();
void initPwa();

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
