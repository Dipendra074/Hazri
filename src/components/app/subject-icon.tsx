import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared subject/course icon container used everywhere in the app
 * (Today, Schedule, Attendance, Calendar, Courses, Add/Edit, Course detail).
 *
 * Canonical style — matches the Today card:
 *   - dark background   #191919
 *   - 0.3px border       #404040
 *   - white icon         strokeWidth 1.5
 *
 * The wrapper's height/width/radius come from `className` so each surface
 * can scale the tile while keeping the exact same visual language.
 * No subject-specific background colours are ever applied here.
 */
export function SubjectIcon({
  icon: Icon,
  className,
  iconClassName,
  strokeWidth = 1.5,
}: {
  icon: LucideIcon;
  className?: string;
  iconClassName?: string;
  strokeWidth?: number;
}) {
  return (
    <div
      className={cn(
        "grid place-items-center shrink-0 rounded-xl border-[0.3px] border-[#404040] bg-[#191919] text-white dark:border-[0.5px] dark:border-[#696969]",
        className,
      )}
    >
      <Icon className={cn("h-5 w-5", iconClassName)} strokeWidth={strokeWidth} />
    </div>
  );
}