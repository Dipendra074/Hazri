/**
 * First-launch guided tour state for Hazri.
 *
 * Pure UI concern: nothing here touches attendance, courses, storage of user
 * data, or backup logic. Only a small local flag + in-memory step index.
 */

const DONE_KEY = "hazri:tour_done_v1";

export type TourStepId =
  | "welcome"
  | "add-course"
  | "course-form"
  | "subject-card"
  | "attendance-controls"
  | "attendance-percent"
  | "timetable"
  | "schedule-edit"
  | "more-menu"
  | "settings-hub"
  | "backup"
  | "finish";

export type TourStep = {
  id: TourStepId;
  /** Route to be on before the step shows. */
  route?: string;
  /** First matching selector becomes the spotlight anchor. */
  targets?: string[];
  title: string;
  body: string;
  /** Auto-advance when a selector appears (e.g. the course sheet opens). */
  advanceWhenVisible?: string;
  /** Auto-advance when a selector disappears (e.g. the sheet closed). */
  advanceWhenGone?: string;
  /** Hide the default Next button (user must interact with the real UI). */
  waitForUser?: boolean;
  /** Optional step: primary action navigates, secondary just continues. */
  optional?: { label: string; to: string; laterLabel: string; skipTo?: TourStepId };
  /** Floating proxy button that triggers a real (possibly dimmed) control. */
  floatingAction?: { label: string; selector: string };
  primaryLabel?: string;
  /** Card placement when there's no spotlight target. */
  placement?: "center" | "bottom";
  /** Route to navigate to when the final step is completed. */
  doneTo?: string;
};


export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Hazri",
    body: "Hazri keeps your attendance, timetable and attendance targets in one place — all stored on your device.",
    primaryLabel: "Set up Hazri",
  },
  {
    id: "add-course",
    route: "/courses",
    targets: ['[data-tour="add-course-empty"]', '[data-tour="add-course"]'],
    title: "Add your first subject",
    body: "Tap Add to create a course. Courses power your schedule and attendance stats.",
    waitForUser: true,
    advanceWhenVisible: '[data-tour="course-name"]',
  },
  {
    id: "course-form",
    route: "/courses",
    targets: ['[data-tour="course-name"]'],
    title: "Name it, then set a target",
    body: "Enter the subject name, then pick your attendance target (usually 75%). Tap Create course when you're done.",
    waitForUser: true,
    advanceWhenGone: '[data-tour="course-name"]',
    floatingAction: { label: "Create course", selector: '[data-tour="create-course"]' },
  },

  {
    id: "subject-card",
    route: "/today",
    targets: ['[data-tour="subject-card"]', '[data-tour="course-item"]'],
    title: "Your subject card",
    body: "Each card shows a subject's attendance at a glance — attended, missed and where you stand.",
  },
  {
    id: "attendance-controls",
    route: "/today",
    targets: ['[data-tour="attendance-actions"]'],
    title: "Mark attendance",
    body: "Attended = you were there. Missed = you weren't. Off = the class didn't happen. Clear removes the marking.",
  },
  {
    id: "attendance-percent",
    route: "/today",
    targets: ['[data-tour="attendance-percent"]', '[data-tour="subject-card"]'],
    title: "Live percentage",
    body: "Hazri updates the percentage instantly. “At target”, “can miss next lecture” or “can't miss the next lecture” tell you how safe you are.",
  },
  {
    id: "timetable",
    route: "/today",
    targets: ['[data-tour="nav-schedule"]'],
    title: "Add your timetable",
    body: "Add your weekly lectures once and Hazri shows the right classes every day. Optional.",
    optional: {
      label: "Set up timetable",
      to: "/schedule",
      laterLabel: "Do this later",
      skipTo: "more-menu",
    },
  },
  {
    id: "schedule-edit",
    route: "/schedule",
    targets: ['[data-tour="schedule-edit"]'],
    title: "The pencil button",
    body: "Tap the pencil to switch into edit mode — there you can add classes, reorder them and change timings. Tap it again to go back to the full week view.",
  },
  {
    id: "more-menu",
    route: "/more",
    targets: ['[data-tour="more-settings"]', '[data-tour="nav-more"]'],
    title: "Everything else lives in More",
    body: "Profile, courses, planner, games and help are all here. “All settings” opens Hazri's settings.",
  },
  {
    id: "settings-hub",
    route: "/settings",
    targets: ['[data-tour="settings-data"]'],
    title: "Settings, organised",
    body: "Appearance, Data & backup, Help and Advanced each have their own page. Data & backup is where your storage, export and Google Drive live.",
  },
  {
    id: "backup",
    route: "/settings/data",
    targets: ['[data-tour="drive-backup"]'],
    title: "Keep a backup",
    body: "Connect Google Drive to keep your Hazri data safe and restore it later. Completely optional.",
    optional: { label: "Set up backup", to: "/drive-backup", laterLabel: "Do this later" },
  },
  {
    id: "finish",
    title: "You're ready to use Hazri",
    body: "That's it — open Hazri after your classes and mark attendance. Everything else updates on its own.",
    primaryLabel: "Start using Hazri",
    placement: "bottom",
    doneTo: "/today",
  },
];

type State = { active: boolean; index: number };

let state: State = { active: false, index: 0 };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function set(next: State) {
  state = next;
  emit();
}

export function subscribeTour(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getTourState(): State {
  return state;
}

const SERVER_STATE: State = { active: false, index: 0 };
export function getTourServerState(): State {
  return SERVER_STATE;
}

export function isTourDone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return true;
  }
}

function markDone() {
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {
    /* storage unavailable — tour simply may show again */
  }
}

/** Manual replay (Help & FAQs / Settings). Never clears the persisted flag. */
export function startTour() {
  set({ active: true, index: 0 });
}

/**
 * Auto-start guard: runs at most once per page load, and only when the
 * persistent first-run flag is absent (fresh install / cleared app data).
 * The flag is written immediately so reloads mid-tour never re-trigger it.
 */
let autoStartAttempted = false;
export function maybeAutoStartTour() {
  if (typeof window === "undefined") return;
  if (autoStartAttempted) return;
  autoStartAttempted = true;
  if (isTourDone() || state.active) return;
  markDone();
  startTour();
}

export function nextTourStep() {
  if (!state.active) return;
  if (state.index >= TOUR_STEPS.length - 1) return endTour();
  set({ active: true, index: state.index + 1 });
}

export function prevTourStep() {
  if (!state.active || state.index === 0) return;
  set({ active: true, index: state.index - 1 });
}

export function goToStep(id: TourStepId) {
  const i = TOUR_STEPS.findIndex((s) => s.id === id);
  if (i >= 0) set({ active: true, index: i });
}

/** Skip or complete — both persist the flag so it never auto-shows again. */
export function endTour() {
  markDone();
  set({ active: false, index: 0 });
}
