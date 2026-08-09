import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/app/coming-soon";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession, sessionKey, type Session } from "@/lib/session";
import { routineApi } from "@/lib/data/routine";
import { toUserMessage } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/routine")({
  component: RoutinePage,
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function RoutinePage() {
  const session = useSession();
  if (session.mode === "signed_in") {
    return (
      <ComingSoon
        icon={CalendarDays}
        title="Weekly routine"
        body="Add your class schedule to unlock smart auto-present — every class defaults to present, you only tap when you miss one."
        phase="Phase 2"
      />
    );
  }
  if (session.mode !== "guest") return null;
  return <RoutineList session={session} />;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function fromMinutes(mins: number): string {
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function RoutineList({ session }: { session: Session }) {
  const qc = useQueryClient();
  const key = [...sessionKey(session), "routine"] as const;

  const [label, setLabel] = useState("");
  const [weekday, setWeekday] = useState(1);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");

  const { data: slots = [] } = useQuery({
    queryKey: key,
    queryFn: () => routineApi.list(session),
  });

  const add = useMutation({
    mutationFn: () =>
      routineApi.create(session, {
        subjectId: null,
        label: label.trim() || "Class",
        weekday,
        startMinute: toMinutes(start),
        endMinute: toMinutes(end),
        kind: "lecture",
      }),
    onSuccess: () => {
      setLabel("");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(toUserMessage(e, "Failed")),
  });

  const del = useMutation({
    mutationFn: (id: string) => routineApi.delete(session, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Weekly routine</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (toMinutes(end) <= toMinutes(start)) {
            toast.error("End must be after start");
            return;
          }
          add.mutate();
        }}
        className="rounded-2xl bg-card border border-border p-3 space-y-3"
      >
        <div className="space-y-1.5">
          <Label htmlFor="r-label">Label</Label>
          <Input
            id="r-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Data Structures"
            className="h-10 rounded-xl"
            maxLength={80}
          />
        </div>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w, i) => (
            <button
              key={w}
              type="button"
              onClick={() => setWeekday(i)}
              className={`py-2 rounded-lg text-xs font-medium transition ${
                weekday === i
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="r-start">Start</Label>
            <Input
              id="r-start"
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-end">End</Label>
            <Input
              id="r-end"
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-11 rounded-full" disabled={add.isPending}>
          <Plus className="h-4 w-4 mr-1" /> Add slot
        </Button>
      </form>

      {slots.length === 0 ? (
        <div className="rounded-3xl bg-card border border-border border-dashed p-8 text-center">
          <CalendarDays className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <div className="font-semibold">No routine slots yet</div>
          <p className="text-sm text-muted-foreground mt-1">
            Add your first class above.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {WEEKDAYS.map((w, i) => {
            const daySlots = slots.filter((s) => s.weekday === i);
            if (daySlots.length === 0) return null;
            return (
              <div key={w} className="rounded-2xl bg-card border border-border p-3">
                <div className="text-xs font-semibold text-muted-foreground mb-2">
                  {w}
                </div>
                <ul className="space-y-2">
                  {daySlots.map((s) => (
                    <li key={s.id} className="flex items-center gap-3">
                      <div className="text-xs tabular-nums text-muted-foreground w-24">
                        {fromMinutes(s.startMinute)}–{fromMinutes(s.endMinute)}
                      </div>
                      <div className="flex-1 text-sm truncate">
                        {s.label ?? "Class"}
                      </div>
                      <button
                        type="button"
                        onClick={() => del.mutate(s.id)}
                        className="text-muted-foreground/60 hover:text-destructive p-1"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}