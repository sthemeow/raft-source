import assert from "node:assert/strict";
import { test } from "vitest";
import { classifyRouteForTab } from "../src/hooks/useTabRouteMemory";
import { railModeToMobileTab } from "../src/store/mobileNavStore";

test("usage has a distinct desktop tab and belongs to Members on mobile", () => {
  assert.equal(classifyRouteForTab("/s/example/usage", "/s/example"), "usage");
  assert.equal(classifyRouteForTab("/s/other/usage", "/s/example"), null);
  assert.equal(railModeToMobileTab("usage"), "members");
});
