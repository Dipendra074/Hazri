import { createFileRoute } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme";
import { SettingsCard, SubPageHeader } from "@/components/settings/ui";

export const Route = createFileRoute("/_authenticated/settings/appearance")({
  ssr: false,
  component: AppearancePage,
});

function AppearancePage() {
  const { theme, setTheme } = useTheme();
  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
  ];

  return (
    <div className="space-y-5">
      <SubPageHeader title="Appearance" description="How Hazri looks on this device." />

      <SettingsCard className="space-y-4">
        <div>
          <div className="font-medium">Theme</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Choose how Hazri looks on this device.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-secondary">
          {options.map(({ value, label, icon: Icon }) => {
            const active = theme === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition ${
                  active
                    ? "bg-white text-foreground shadow-sm dark:bg-[#252525] dark:text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                aria-pressed={active}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
      </SettingsCard>
    </div>
  );
}
