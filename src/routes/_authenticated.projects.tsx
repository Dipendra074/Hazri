import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/projects")({
  beforeLoad: () => {
    throw redirect({ to: "/planner", search: { tab: "projects" } });
  },
  component: () => null,
});
