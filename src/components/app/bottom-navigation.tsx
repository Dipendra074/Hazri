import { Link, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useRef, useState, type SVGProps, type ComponentType } from "react";
import { HomeIcon, CalendarIcon, ProjectIcon, TaskIcon, MoreIcon } from "./nav-icons";

type Tab = {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  match?: string[];
};

const TABS: Tab[] = [
  { to: "/today", label: "Today", icon: HomeIcon, match: ["/today"] },
  { to: "/schedule", label: "Schedule", icon: CalendarIcon, match: ["/schedule", "/routine"] },
  { to: "/attendance", label: "Attendance", icon: ProjectIcon, match: ["/attendance", "/course"] },
  { to: "/planner", label: "Planner", icon: TaskIcon, match: ["/planner", "/projects", "/todos"] },
  { to: "/more", label: "More", icon: MoreIcon, match: ["/more", "/settings", "/games", "/faqs", "/feedback", "/pro", "/courses"] },
];

export function BottomNavigation() {
  const location = useLocation();
  const matched = TABS.findIndex((t) =>
    (t.match ?? [t.to]).some((p) => location.pathname === p || location.pathname.startsWith(p + "/")),
  );
  // Keep the pill on the last matched tab when the user visits a non-nav route
  // (e.g. /profile, /settings). Default to Home on first load.
  const lastRef = useRef(matched === -1 ? 0 : matched);
  const [activeIndex, setActiveIndex] = useState(lastRef.current);
  useEffect(() => {
    if (matched !== -1 && matched !== lastRef.current) {
      lastRef.current = matched;
      setActiveIndex(matched);
    }
  }, [matched]);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <div className="mx-auto max-w-2xl px-4 pb-3">
        <div className="rounded-full ring-1 ring-black/5 dark:ring-0 dark:p-px dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.55)_0%,rgba(255,255,255,0.08)_55%,rgba(255,255,255,0)_100%)] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.25)] dark:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)]">
        <div
          className="relative flex items-center justify-between rounded-full bg-white dark:bg-[#0F0F0F] p-2"
          style={{ height: 62 }}
        >
          {TABS.map((t, i) => {
            const isActive = i === activeIndex;
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                data-tour={`nav-${t.label.toLowerCase()}`}
                aria-label={t.label}
                aria-current={isActive ? "page" : undefined}
                className="relative flex flex-1 items-center justify-center outline-none"
              >
                <span className="relative flex h-11 w-11 items-center justify-center">
                  {isActive && (
                    <motion.span
                      layoutId="bottom-nav-pill"
                      className="absolute inset-0 rounded-full bg-[#212528] dark:bg-white"
                      transition={{ type: "spring", stiffness: 500, damping: 38, mass: 0.9 }}
                    />
                  )}
                  <Icon
                    className={`relative h-[22px] w-[22px] transition-colors duration-200 ${
                      isActive
                        ? "text-white dark:text-[#212528]"
                        : "text-[#212528]/70 dark:text-white/80"
                    }`}
                  />
                </span>
              </Link>
            );
          })}
        </div>
        </div>
      </div>
    </nav>
  );
}