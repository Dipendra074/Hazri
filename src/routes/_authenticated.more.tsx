import { createFileRoute } from "@tanstack/react-router";
import {
  Settings,
  Gamepad2,
  HelpCircle,
  MessageSquare,
  Sparkles,
  BookOpen,
  User,
  FolderKanban,
} from "lucide-react";
import { DeveloperRow } from "@/components/DeveloperRow";
import { NavGroup, NavRow } from "@/components/settings/ui";

export const Route = createFileRoute("/_authenticated/more")({
  component: MorePage,
});

function MorePage() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight px-1">More</h1>

      <NavGroup title="Account">
        <NavRow to="/profile" icon={User} label="Profile" hint="Name, avatar, personal details" />
      </NavGroup>

      <NavGroup title="Academics">
        <NavRow to="/courses" icon={BookOpen} label="Courses" hint="Add and manage your courses" />
        <NavRow to="/planner" icon={FolderKanban} label="Planner" hint="Projects and to-dos" />
      </NavGroup>

      <NavGroup title="Utilities">
        <NavRow to="/games" icon={Gamepad2} label="Games" hint="Take a quick break" />
        <NavRow to="/pro" icon={Sparkles} label="Hazri Pro" hint="Upcoming premium features" />
      </NavGroup>

      <NavGroup title="Support">
        <NavRow to="/faqs" icon={HelpCircle} label="Help & FAQs" hint="Common questions" />
        <NavRow to="/feedback" icon={MessageSquare} label="Feedback & bug report" hint="Ideas and bug reports" />
      </NavGroup>

      <NavGroup title="Settings">
        <NavRow to="/settings" icon={Settings} label="All settings" hint="Appearance, data, backup and more" dataTour="more-settings" />
      </NavGroup>

      <NavGroup title="About">
        <DeveloperRow />
      </NavGroup>
    </div>
  );
}
