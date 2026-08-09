import { afterEach, describe, expect, it } from "bun:test";
import { MutationObserver, onlineManager } from "@tanstack/react-query";

import { createHazriQueryClient } from "../query-client";

const initialOnlineState = onlineManager.isOnline();

afterEach(() => {
  onlineManager.setOnline(initialOnlineState);
});

describe("Hazri QueryClient offline policy", () => {
  it("runs the initial guest query and mutation while offline", async () => {
    onlineManager.setOnline(false);
    const queryClient = createHazriQueryClient();
    const calls: string[] = [];

    try {
      const queryResult = await queryClient.fetchQuery({
        queryKey: ["guest", "indexed-db", "query"],
        queryFn: async () => {
          calls.push("query");
          return "local query result";
        },
      });

      const mutation = new MutationObserver(queryClient, {
        mutationFn: async (value: string) => {
          calls.push("mutation");
          return `saved ${value}`;
        },
      });
      const mutationResult = await mutation.mutate("locally");

      expect(queryResult).toBe("local query result");
      expect(mutationResult).toBe("saved locally");
      expect(calls).toEqual(["query", "mutation"]);
      expect(queryClient.getDefaultOptions().queries?.networkMode).toBe("offlineFirst");
      expect(queryClient.getDefaultOptions().mutations?.networkMode).toBe("offlineFirst");
    } finally {
      queryClient.clear();
    }
  });
});
