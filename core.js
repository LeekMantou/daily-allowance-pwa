(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyBudgetCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function dateFromKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }

  function addDays(key, amount) {
    const date = dateFromKey(key);
    date.setDate(date.getDate() + amount);
    return dateKey(date);
  }

  function compareKeys(left, right) {
    return left.localeCompare(right);
  }

  function parseAmountToCents(value) {
    const normalized = String(value).trim().replace(/[，,]/g, ".");
    if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
    const [whole, fraction = ""] = normalized.split(".");
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
  }

  function transactionDateKey(transaction) {
    return dateKey(new Date(transaction.createdAt));
  }

  function buildLedger(state, throughKey) {
    const ledger = new Map();
    if (compareKeys(throughKey, state.trackingStartDate) < 0) return ledger;

    const spending = new Map();
    state.transactions.forEach(transaction => {
      const key = transactionDateKey(transaction);
      spending.set(key, (spending.get(key) || 0) + transaction.amountCents);
    });

    let carry = 0;
    for (let key = state.trackingStartDate; compareKeys(key, throughKey) <= 0; key = addDays(key, 1)) {
      const availableCents = state.dailyBudgetCents + carry;
      const spentCents = spending.get(key) || 0;
      const balanceCents = availableCents - spentCents;
      ledger.set(key, { key, baseCents: state.dailyBudgetCents, carryCents: carry, availableCents, spentCents, balanceCents });
      carry = balanceCents > 0
        ? (state.carryPositive ? balanceCents : 0)
        : (state.carryNegative ? balanceCents : 0);
    }
    return ledger;
  }

  function transactionsForKey(state, key, newestFirst = true) {
    return state.transactions
      .filter(transaction => transactionDateKey(transaction) === key)
      .sort((left, right) => (newestFirst ? -1 : 1) * (new Date(left.createdAt) - new Date(right.createdAt)));
  }

  return { dateKey, dateFromKey, addDays, compareKeys, parseAmountToCents, transactionDateKey, buildLedger, transactionsForKey };
});
