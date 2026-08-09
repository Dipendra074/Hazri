import { createFileRoute } from "@tanstack/react-router";
import {
  Palette,
  Database,
  Sparkles,
  LifeBuoy,
  ShieldAlert,
} from "lucide-react";
import { NavGroup, NavRow } from "@/components/settings/ui";

export const Route = createFileRoute("/_authenticated/settings/")({
  ssr: false,
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight px-1">Settings</h1>

      <NavGroup title="General">
        <NavRow
          to="/settings/appearance"
          icon={Palette}
          label="Appearance"
          hint="Light or dark theme"
        />
      </NavGroup>

      <NavGroup title="Data & backup">
        <NavRow
          to="/settings/data"
          icon={Database}
          label="Data & backup"
          hint="Local storage, Google Drive, export and import"
          dataTour="settings-data"
        />
      </NavGroup>

      <NavGroup title="App">
        <NavRow
          to="/pro"
          icon={Sparkles}
          label="Hazri Pro"
          hint="Upcoming premium features"
        />
      </NavGroup>

      <NavGroup title="Help">
        <NavRow
          to="/settings/help"
          icon={LifeBuoy}
          label="Help & support"
          hint="FAQs, feedback and app tour"
        />
      </NavGroup>

      <NavGroup title="System">
        <NavRow
          to="/settings/advanced"
          icon={ShieldAlert}
          label="Advanced"
          hint="Destructive actions and local data reset"
        />
      </NavGroup>
    </div>
  );
}
