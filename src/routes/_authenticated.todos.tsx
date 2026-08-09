import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/todos")({
  beforeLoad: () => {
    throw redirect({ to: "/planner", search: { tab: "todos" } });
  },
  component: () => null,
});
