import { describe, test, expect } from "bun:test";
import { computeComponentStats, shortInsight } from "../attendance-stats";
import {
  computeCourseStats,
  computeOverallStats,
} from "../attendance-aggregate";

const baseInit = { initial_attended: 0, initial_conducted: 0, required_pct: 75 };

describe("computeComponentStats", () => {
  test("0/0 → null percentage, empty status, no needed/safe", () => {
    const s = computeComponentStats(baseInit, []);
    expect(s.percentage).toBeNull();
    expect(s.rawPercentage).toBeNull();
    expect(s.status).toBe("empty");
    expect(s.classesNeeded).toBe(0);
    expect(s.safeMisses).toBe(0);
  });

  test("imported baseline only", () => {
    const s = computeComponentStats({ initial_attended: 15, initial_conducted: 20, required_pct: 75 }, []);
    expect(s.attended).toBe(15);
    expect(s.conducted).toBe(20);
    expect(s.missed).toBe(5);
    expect(s.percentage).toBe(75);
    expect(s.status).toBe("safe");
  });

  test("attended event adds to attended and conducted", () => {
    const s = computeComponentStats(baseInit, [{ status: "attended", units: 1 }]);
    expect(s.attended).toBe(1);
    expect(s.conducted).toBe(1);
    expect(s.percentage).toBe(100);
  });

  test("missed event adds to conducted only", () => {
    const s = computeComponentStats(baseInit, [{ status: "missed", units: 1 }]);
    expect(s.attended).toBe(0);
    expect(s.conducted).toBe(1);
    expect(s.missed).toBe(1);
    expect(s.percentage).toBe(0);
    expect(s.status).toBe("danger");
  });

  test("cancelled does not increase conducted", () => {
    const s = computeComponentStats(baseInit, [
      { status: "attended", units: 1 },
      { status: "cancelled", units: 1 },
    ]);
    expect(s.conducted).toBe(1);
    expect(s.cancelled).toBe(1);
  });

  test("pending is passed in, does not count as conducted or missed", () => {
    const s = computeComponentStats(baseInit, [], { pendingUnits: 3 });
    expect(s.pending).toBe(3);
    expect(s.conducted).toBe(0);
    expect(s.missed).toBe(0);
  });

  test("multi-unit lab: units correctly multiplied", () => {
    const s = computeComponentStats(baseInit, [
      { status: "attended", units: 3 },
      { status: "missed", units: 3 },
    ]);
    expect(s.conducted).toBe(6);
    expect(s.attended).toBe(3);
    expect(s.percentage).toBe(50);
  });

  test("extra class treated as normal event", () => {
    const s = computeComponentStats(baseInit, [
      { status: "attended", units: 1 },
      { status: "attended", units: 1 }, // extra, still class
    ]);
    expect(s.conducted).toBe(2);
    expect(s.attended).toBe(2);
  });

  test("conducted credit: counts toward both", () => {
    const s = computeComponentStats(baseInit, [
      { status: "credit", units: 2, event_type: "credit", credit_counts_as_conducted: true },
    ]);
    expect(s.credited).toBe(2);
    expect(s.attended).toBe(2);
    expect(s.conducted).toBe(2);
    expect(s.percentage).toBe(100);
  });

  test("non-conducted bonus credit: attended only, percentage capped at 100", () => {
    const s = computeComponentStats(
      { initial_attended: 10, initial_conducted: 10, required_pct: 75 },
      [{ status: "credit", units: 3, event_type: "credit", credit_counts_as_conducted: false }],
    );
    expect(s.credited).toBe(3);
    expect(s.attended).toBe(13);
    expect(s.conducted).toBe(10);
    expect(s.rawPercentage).toBe(130);
    expect(s.percentage).toBe(100); // display cap
  });

  test("classesNeeded formula at 75% target", () => {
    // attended=6, conducted=10 → 60%. Need x: (6+x)/(10+x) >= 0.75 → x>=6.
    const s = computeComponentStats(
      { initial_attended: 6, initial_conducted: 10, required_pct: 75 },
      [],
    );
    expect(s.percentage).toBe(60);
    expect(s.classesNeeded).toBe(6);
    expect(s.status).toBe("danger");
  });

  test("safeMisses formula at 75% target", () => {
    // attended=9, conducted=10 → 90%. Can miss: floor(9/0.75 - 10)=2.
    const s = computeComponentStats(
      { initial_attended: 9, initial_conducted: 10, required_pct: 75 },
      [],
    );
    expect(s.safeMisses).toBe(2);
    expect(s.status).toBe("safe");
  });

  test("target 80%", () => {
    // attended=7, conducted=10 → 70%. Need (7+x)/(10+x) >= 0.8 → x>=5.
    const s = computeComponentStats(
      { initial_attended: 7, initial_conducted: 10, required_pct: 80 },
      [],
    );
    expect(s.classesNeeded).toBe(5);
  });

  test("target 100% with all attended → safe, infinite safeMisses via cap", () => {
    const s = computeComponentStats(
      { initial_attended: 10, initial_conducted: 10, required_pct: 100 },
      [],
    );
    expect(s.percentage).toBe(100);
    expect(s.status).toBe("safe");
    expect(s.classesNeeded).toBe(0);
  });

  test("target 100% below target → classesNeeded is Infinity (never recoverable)", () => {
    const s = computeComponentStats(
      { initial_attended: 9, initial_conducted: 10, required_pct: 100 },
      [],
    );
    expect(s.classesNeeded).toBe(Number.POSITIVE_INFINITY);
  });

  test("percentage never Infinity/NaN for empty component", () => {
    const s = computeComponentStats(baseInit, []);
    expect(Number.isNaN(s.percentage ?? 0)).toBe(false);
    expect(Number.isFinite(s.percentage ?? 0)).toBe(true);
  });

  test("shortInsight covers empty/safe/danger", () => {
    expect(shortInsight(computeComponentStats(baseInit, []), 75)).toBe("No classes yet");
    const safe = computeComponentStats(
      { initial_attended: 9, initial_conducted: 10, required_pct: 75 }, [],
    );
    expect(shortInsight(safe, 75)).toBe("Can miss 2");
    const risky = computeComponentStats(
      { initial_attended: 6, initial_conducted: 10, required_pct: 75 }, [],
    );
    expect(shortInsight(risky, 75)).toBe("Need 6");
  });
});

describe("computeCourseStats / computeOverallStats", () => {
  const course = {
    id: "c1", name: "X", code: null, color: null, icon: null,
    target_pct: 75, credits: null, semester: null, teacher: null, room: null,
    notes: null, position: 0, created_at: null, updated_at: null,
  } as any;

  const theory = {
    id: "t1", course_id: "c1", kind: "theory", label: null,
    default_units: 1, initial_attended: 8, initial_conducted: 10,
    required_pct: 75, position: 0,
  } as any;

  const lab = {
    id: "l1", course_id: "c1", kind: "lab", label: null,
    default_units: 3, initial_attended: 0, initial_conducted: 0,
    required_pct: 75, position: 1,
  } as any;

  test("weighted overall = sum(attended)/sum(conducted), not avg of percentages", () => {
    // Theory: 8/10 = 80%. Lab: 3 attended, 6 conducted = 50%.
    const events = [
      { id: "e1", component_id: "l1", schedule_entry_id: null, date: "2025-01-01",
        status: "attended", units: 3, event_type: "class", source: "schedule",
        credit_counts_as_conducted: true, note: null, start_minute: null, end_minute: null } as any,
      { id: "e2", component_id: "l1", schedule_entry_id: null, date: "2025-01-02",
        status: "missed", units: 3, event_type: "class", source: "schedule",
        credit_counts_as_conducted: true, note: null, start_minute: null, end_minute: null } as any,
    ];
    const cs = computeCourseStats(course, [theory, lab], events);
    expect(cs.attended).toBe(11);
    expect(cs.conducted).toBe(16);
    // Weighted: 11/16 = 68.75% ≠ (80+50)/2 = 65%
    expect(cs.percentage).toBeCloseTo(68.75, 2);
    const overall = computeOverallStats([cs]);
    expect(overall.percentage).toBeCloseTo(68.75, 2);
  });

  test("overall with zero conducted stays null, never NaN", () => {
    const emptyCs = computeCourseStats(course, [], []);
    const overall = computeOverallStats([emptyCs]);
    expect(overall.percentage).toBeNull();
    expect(overall.conducted).toBe(0);
  });
});