import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  TOUR_STEPS,
  endTour,
  getTourServerState,
  getTourState,
  goToStep,
  nextTourStep,
  prevTourStep,
  subscribeTour,
} from "@/lib/onboarding";
import { Button } from "@/components/ui/button";

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;
const TIP_MAX = 380;

function findTarget(selectors?: string[]): HTMLElement | null {
  if (!selectors) return null;
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && el.getClientRects().length > 0) return el;
  }
  return null;
}

/** Guided first-launch tour. Purely an overlay — never mutates app data. */
export function AppTour() {
  const { active, index } = useSyncExternalStore(subscribeTour, getTourState, getTourServerState);
  const step = TOUR_STEPS[index];
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [rect, setRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Make sure we're on the screen this step talks about.
  useEffect(() => {
    if (!active || !step?.route) return;
    if (pathname !== step.route) navigate({ to: step.route });
  }, [active, step?.route, pathname, navigate]);

  // Track the real element's box (scroll / resize / layout changes).
  useLayoutEffect(() => {
    if (!active || !step) return;
    let raf = 0;
    let scrolled = false;
    const measure = () => {
      const el = findTarget(step.targets);
      if (!el) {
        setRect(null);
      } else {
        if (!scrolled) {
          scrolled = true;
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [active, index, step]);

  // Auto-advance hooks (course sheet opened / closed, etc.).
  useEffect(() => {
    if (!active || !step) return;
    const { advanceWhenVisible, advanceWhenGone } = step;
    if (!advanceWhenVisible && !advanceWhenGone) return;
    let seen = false;
    const id = window.setInterval(() => {
      if (advanceWhenVisible && document.querySelector(advanceWhenVisible)) {
        nextTourStep();
      }
      if (advanceWhenGone) {
        const present = !!document.querySelector(advanceWhenGone);
        if (present) seen = true;
        else if (seen) nextTourStep();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [active, index, step]);

  const skip = useCallback(() => endTour(), []);

  if (!mounted || !active || !step) return null;

  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = document.documentElement.clientHeight || window.innerHeight;
  const MARGIN = 12;
  const tipWidth = Math.min(TIP_MAX, vw - MARGIN * 2);
  const hole = rect
    ? {
        top: Math.max(4, rect.top - PAD),
        left: Math.max(4, rect.left - PAD),
        width: Math.min(vw - 8, rect.width + PAD * 2),
        height: rect.height + PAD * 2,
      }
    : null;

  // Place the tooltip where it cannot cover the highlighted element.
  const maxLeft = Math.max(MARGIN, vw - tipWidth - MARGIN);
  let tipStyle: React.CSSProperties;
  if (!hole) {
    tipStyle = {
      left: Math.max(MARGIN, Math.min((vw - tipWidth) / 2, maxLeft)),
      ...(step.placement === "bottom"
        ? { bottom: MARGIN + 8 }
        : { top: Math.max(24, vh / 2 - 130) }),
      width: tipWidth,
      maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
      boxSizing: "border-box",
    };
  } else {
    const below = vh - (hole.top + hole.height);
    const placeBelow = below > 220 || below > hole.top;
    tipStyle = {
      left: Math.min(Math.max(MARGIN, hole.left + hole.width / 2 - tipWidth / 2), maxLeft),
      width: tipWidth,
      maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
      boxSizing: "border-box",
      ...(placeBelow
        ? { top: Math.min(hole.top + hole.height + 14, vh - 200) }
        : { bottom: Math.max(16, vh - hole.top + 14) }),
    };
  }


  const isLast = index === TOUR_STEPS.length - 1;
  const canBack = index > 0;

  return createPortal(
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Dim + spotlight */}
      <AnimatePresence initial={false}>
        {hole ? (
          <motion.div
            key="hole"
            initial={false}
            animate={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
            transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.6 }}
            className="absolute rounded-2xl ring-2 ring-primary/70"
            style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)" }}
          />
        ) : (
          <motion.div
            key="dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/72"
          />
        )}
      </AnimatePresence>

      {/* Tooltip / modal card */}
      <motion.div
        key={step.id}
        initial={{ opacity: 0, y: step.placement === "bottom" ? 40 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          step.placement === "bottom"
            ? { type: "spring", stiffness: 300, damping: 28 }
            : { duration: 0.22, ease: "easeOut" }
        }
        role="dialog"
        aria-label={step.title}
        className="absolute pointer-events-auto rounded-2xl p-px dark:bg-[linear-gradient(178deg,#7D7D7D_0%,#111111_65%)]"
        style={tipStyle}
      >
        <div className="rounded-2xl bg-card border border-border dark:border-transparent dark:bg-[#111111] p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Step {index + 1} of {TOUR_STEPS.length}
          </div>
          <h2 className="mt-1 text-base font-semibold tracking-tight">{step.title}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{step.body}</p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {step.optional ? (
              <>
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    const to = step.optional!.to;
                    nextTourStep();
                    navigate({ to });
                  }}
                >
                  {step.optional.label}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-full"
                  onClick={() => {
                    const skipTo = step.optional!.skipTo;
                    if (skipTo) goToStep(skipTo);
                    else nextTourStep();
                  }}
                >
                  {step.optional.laterLabel}
                </Button>

              </>
            ) : step.waitForUser ? (
              <span className="text-xs text-muted-foreground">Continue in the app to move on.</span>
            ) : (
              <Button
                size="sm"
                className="rounded-full"
                onClick={() => {
                  if (!isLast) return nextTourStep();
                  const to = step.doneTo;
                  endTour();
                  if (to) navigate({ to });
                }}
              >
                {step.primaryLabel ?? (isLast ? "Done" : "Next")}
              </Button>
            )}

            {canBack && !isLast && (
              <Button size="sm" variant="ghost" className="rounded-full" onClick={prevTourStep}>
                Back
              </Button>
            )}

            {!isLast && (
              <button
                type="button"
                onClick={skip}
                className="ml-auto text-xs text-muted-foreground underline underline-offset-4"
              >
                {index === 0 ? "Skip for now" : "Skip tour"}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Floating proxy for a control that sits under the dim layer */}
      {step.floatingAction && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="absolute pointer-events-none"
          style={
            hole
              ? {
                  top: Math.max(MARGIN, hole.top - 56),
                  left: hole.left,
                  width: hole.width,
                }
              : {
                  left: MARGIN,
                  right: MARGIN,
                  bottom: "calc(env(safe-area-inset-bottom) + 16px)",
                }
          }
        >
          <Button
            className="pointer-events-auto w-full rounded-full h-11 shadow-lg"
            onClick={() => {
              const el = document.querySelector<HTMLElement>(step.floatingAction!.selector);
              el?.click();
            }}
          >
            {step.floatingAction.label}
          </Button>
        </motion.div>
      )}
    </div>,

    document.body,
  );
}
