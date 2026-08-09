import { QueryClient } from "@tanstack/react-query";

/**
 * Local guest data is stored in IndexedDB and must remain usable when the
 * browser reports that it is offline. `offlineFirst` still lets failed remote
 * work pause until connectivity returns, but it does not prevent the initial
 * query or mutation function from running.
 */
export function createHazriQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: "offlineFirst",
      },
      mutations: {
        networkMode: "offlineFirst",
      },
    },
  });
}
