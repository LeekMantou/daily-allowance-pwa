"use strict";

const assert = require("node:assert/strict");
const { parseAmountToCents, buildLedger } = require("../core.js");

function makeState(overrides = {}) {
  return {
    dailyBudgetCents: 10000,
    carryPositive: true,
    carryNegative: true,
    trackingStartDate: "2026-10-01",
    transactions: [],
    ...overrides
  };
}

assert.equal(parseAmountToCents("23.5"), 2350);
assert.equal(parseAmountToCents("23,50"), 2350);
assert.equal(parseAmountToCents("0"), null);
assert.equal(parseAmountToCents("1.234"), null);

const positive = buildLedger(makeState({
  transactions: [
    { id: "1", amountCents: 8000, createdAt: "2026-10-01T12:00:00+08:00" },
    { id: "2", amountCents: 9000, createdAt: "2026-10-02T12:00:00+08:00" }
  ]
}), "2026-10-03");
assert.equal(positive.get("2026-10-01").balanceCents, 2000);
assert.equal(positive.get("2026-10-02").availableCents, 12000);
assert.equal(positive.get("2026-10-02").balanceCents, 3000);
assert.equal(positive.get("2026-10-03").availableCents, 13000);

const negative = buildLedger(makeState({
  transactions: [{ id: "1", amountCents: 13500, createdAt: "2026-10-01T12:00:00+08:00" }]
}), "2026-10-02");
assert.equal(negative.get("2026-10-01").balanceCents, -3500);
assert.equal(negative.get("2026-10-02").availableCents, 6500);

const positiveOff = buildLedger(makeState({ carryPositive: false }), "2026-10-02");
assert.equal(positiveOff.get("2026-10-02").availableCents, 10000);

const negativeOff = buildLedger(makeState({
  carryNegative: false,
  transactions: [{ id: "1", amountCents: 13500, createdAt: "2026-10-01T12:00:00+08:00" }]
}), "2026-10-02");
assert.equal(negativeOff.get("2026-10-02").availableCents, 10000);

console.log("core tests passed");
