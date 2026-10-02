"use strict";

const STORAGE_KEY = "daily-allowance-v1";
const DEFAULT_LIMIT_CENTS = 10000;

const elements = {
  date: document.querySelector("#todayDate"),
  remaining: document.querySelector("#remainingAmount"),
  limit: document.querySelector("#dailyLimit"),
  spent: document.querySelector("#todaySpent"),
  count: document.querySelector("#recordCount"),
  records: document.querySelector("#todayRecords"),
  addButton: document.querySelector("#addButton"),
  historyButton: document.querySelector("#historyButton"),
  settingsButton: document.querySelector("#settingsButton"),
  expenseDialog: document.querySelector("#expenseDialog"),
  expenseForm: document.querySelector("#expenseForm"),
  expenseAmount: document.querySelector("#expenseAmount"),
  expenseError: document.querySelector("#expenseError"),
  settingsDialog: document.querySelector("#settingsDialog"),
  settingsForm: document.querySelector("#settingsForm"),
  limitAmount: document.querySelector("#limitAmount"),
  settingsError: document.querySelector("#settingsError"),
  historyDialog: document.querySelector("#historyDialog"),
  historyRecords: document.querySelector("#historyRecords"),
  emptyTemplate: document.querySelector("#emptyTemplate")
};

let state = loadState();
let renderedDateKey = dateKey(new Date());

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || !Number.isSafeInteger(parsed.dailyLimitCents) || !Array.isArray(parsed.expenses)) throw new Error("invalid data");
    return {
      dailyLimitCents: Math.max(1, parsed.dailyLimitCents),
      expenses: parsed.expenses.filter(item =>
        item && typeof item.id === "string" && Number.isSafeInteger(item.amountCents) && item.amountCents > 0 && !Number.isNaN(Date.parse(item.createdAt))
      )
    };
  } catch {
    return { dailyLimitCents: DEFAULT_LIMIT_CENTS, expenses: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseAmountToCents(value) {
  const normalized = value.trim().replace(/[，,]/g, ".");
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function formatMoney(cents, fixed = false) {
  const value = Math.abs(cents) / 100;
  const text = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: fixed ? 2 : 0,
    maximumFractionDigits: 2
  }).format(value);
  return `${cents < 0 ? "-" : ""}¥${text}`;
}

function expensesForKey(key) {
  return state.expenses
    .filter(expense => dateKey(new Date(expense.createdAt)) === key)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function sumExpenses(expenses) {
  return expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
}

function makeRecordRow(expense) {
  const row = document.createElement("div");
  row.className = "record-row";

  const time = document.createElement("span");
  time.className = "record-time";
  time.textContent = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(expense.createdAt));

  const amount = document.createElement("strong");
  amount.className = "record-amount";
  amount.textContent = `-${formatMoney(expense.amountCents)}`;

  row.append(time, amount);
  return row;
}

function renderToday() {
  const now = new Date();
  renderedDateKey = dateKey(now);
  const expenses = expensesForKey(renderedDateKey);
  const spent = sumExpenses(expenses);
  const remaining = state.dailyLimitCents - spent;

  elements.date.textContent = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(now);
  elements.remaining.textContent = formatMoney(remaining, true);
  elements.remaining.classList.toggle("negative", remaining < 0);
  elements.limit.textContent = formatMoney(state.dailyLimitCents);
  elements.spent.textContent = formatMoney(spent);
  elements.count.textContent = expenses.length ? `${expenses.length} 笔` : "";
  elements.records.replaceChildren();

  if (expenses.length === 0) {
    elements.records.append(elements.emptyTemplate.content.cloneNode(true));
  } else {
    expenses.forEach(expense => elements.records.append(makeRecordRow(expense)));
  }
}

function renderHistory() {
  const groups = new Map();
  state.expenses.forEach(expense => {
    const key = dateKey(new Date(expense.createdAt));
    if (key === dateKey(new Date())) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(expense);
  });

  elements.historyRecords.replaceChildren();
  const keys = [...groups.keys()].sort().reverse();
  if (keys.length === 0) {
    const empty = elements.emptyTemplate.content.cloneNode(true);
    empty.querySelector("p").textContent = "还没有历史记录";
    elements.historyRecords.append(empty);
    return;
  }

  keys.forEach(key => {
    const expenses = groups.get(key).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const section = document.createElement("section");
    section.className = "history-group";
    const heading = document.createElement("h3");
    const date = new Date(`${key}T12:00:00`);
    heading.textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(date);
    const list = document.createElement("div");
    list.className = "history-day";
    expenses.forEach(expense => list.append(makeRecordRow(expense)));
    const total = document.createElement("div");
    total.className = "history-total";
    total.innerHTML = `<span>共 ${expenses.length} 笔</span><strong>-${formatMoney(sumExpenses(expenses))}</strong>`;
    list.append(total);
    section.append(heading, list);
    elements.historyRecords.append(section);
  });
}

function openExpenseDialog() {
  elements.expenseAmount.value = "";
  elements.expenseError.textContent = "";
  elements.expenseDialog.showModal();
  setTimeout(() => elements.expenseAmount.focus(), 120);
}

elements.addButton.addEventListener("click", openExpenseDialog);
elements.expenseForm.addEventListener("submit", event => {
  event.preventDefault();
  const cents = parseAmountToCents(elements.expenseAmount.value);
  if (cents === null) {
    elements.expenseError.textContent = "请输入大于 0、最多两位小数的金额";
    return;
  }
  state.expenses.push({ id: crypto.randomUUID(), amountCents: cents, createdAt: new Date().toISOString() });
  saveState();
  elements.expenseDialog.close();
  renderToday();
});

elements.settingsButton.addEventListener("click", () => {
  elements.limitAmount.value = (state.dailyLimitCents / 100).toFixed(state.dailyLimitCents % 100 ? 2 : 0);
  elements.settingsError.textContent = "";
  elements.settingsDialog.showModal();
});

elements.settingsForm.addEventListener("submit", event => {
  event.preventDefault();
  const cents = parseAmountToCents(elements.limitAmount.value);
  if (cents === null) {
    elements.settingsError.textContent = "请输入大于 0、最多两位小数的额度";
    return;
  }
  state.dailyLimitCents = cents;
  saveState();
  elements.settingsDialog.close();
  renderToday();
});

elements.historyButton.addEventListener("click", () => {
  renderHistory();
  elements.historyDialog.showModal();
});

document.querySelectorAll("[data-close]").forEach(button => {
  button.addEventListener("click", () => document.querySelector(`#${button.dataset.close}`).close());
});

document.querySelectorAll("dialog").forEach(dialog => {
  dialog.addEventListener("click", event => {
    if (event.target === dialog && dialog.classList.contains("sheet")) dialog.close();
  });
});

function refreshForDateChange() {
  if (dateKey(new Date()) !== renderedDateKey) renderToday();
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshForDateChange();
});
window.addEventListener("focus", refreshForDateChange);
setInterval(refreshForDateChange, 30000);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

renderToday();
