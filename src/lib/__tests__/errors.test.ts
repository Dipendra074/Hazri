import { test, expect } from "bun:test";
import { describeError, toUserMessage } from "../errors";
const pg = { message: 'new row violates row-level security policy for table "courses"', code: "42501", details: null, hint: null };
test("pg object", () => {
  expect(describeError(pg).code).toBe("42501");
  expect(toUserMessage(pg, "Course could not be saved. Please try again.")).toBe("Course could not be saved. Please try again.");
  expect(String(toUserMessage(pg))).not.toContain("[object Object]");
  expect(toUserMessage({}, "fallback")).toBe("fallback");
});
