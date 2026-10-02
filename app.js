"use strict";

const { dateKey, dateFromKey, addDays, compareKeys, parseAmountToCents, transactionDateKey, buildLedger, transactionsForKey } = DailyBudgetCore;
const STORAGE_KEY = "daily-allowance-v1";
const DATA_VERSION = 2;
const DEFAULT_BUDGET_CENTS = 10000;

const $ = selector => document.querySelector(selector);
const elements = {
  date: $("#todayDate"), remaining: $("#remainingAmount"), balanceLabel: $("#balanceLabel"), available: $("#availableAmount"), spent: $("#todaySpent"), carryNote: $("#carryNote"),
  count: $("#recordCount"), records: $("#todayRecords"), addButton: $("#addButton"), undoButton: $("#undoButton"), historyButton: $("#historyButton"), statisticsButton: $("#statisticsButton"), settingsButton: $("#settingsButton"),
  expenseDialog: $("#expenseDialog"), expenseForm: $("#expenseForm"), expenseTitle: $("#expenseDialogTitle"), expenseAmount: $("#expenseAmount"), expenseError: $("#expenseError"),
  settingsDialog: $("#settingsDialog"), settingsForm: $("#settingsForm"), limitAmount: $("#limitAmount"), carryPositive: $("#carryPositive"), carryNegative: $("#carryNegative"), settingsError: $("#settingsError"),
  historyDialog: $("#historyDialog"), historyRecords: $("#historyRecords"), dayDialog: $("#dayDialog"), dayTitle: $("#dayDialogTitle"), daySummary: $("#daySummary"), dayRecords: $("#dayRecords"),
  statisticsDialog: $("#statisticsDialog"), statisticsMonth: $("#statisticsMonth"), statisticsSummary: $("#statisticsSummary"), dailyTrend: $("#dailyTrend"), previousMonth: $("#previousMonth"), nextMonth: $("#nextMonth"),
  exportButton: $("#exportButton"), importButton: $("#importButton"), importFile: $("#importFile"), toast: $("#toast"), emptyTemplate: $("#emptyTemplate")
};

let state = loadState();
let renderedDateKey = dateKey(new Date());
let editingTransactionId = null;
let selectedDayKey = null;
let statisticsDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12);
let toastTimer = null;

function defaultState() {
  return {
    version: DATA_VERSION,
    dailyBudgetCents: DEFAULT_BUDGET_CENTS,
    carryPositive: true,
    carryNegative: true,
    appearance: "system",
    trackingStartDate: dateKey(new Date()),
    transactions: []
  };
}

function normalizeState(raw) {
  if (!raw || typeof raw !== "object") throw new Error("备份格式无效");
  const migrated = raw.version === DATA_VERSION ? raw : {
    version: DATA_VERSION,
    dailyBudgetCents: raw.dailyLimitCents || Math.round(Number(raw.dailyBudget) * 100),
    carryPositive: raw.carryPositive ?? true,
    carryNegative: raw.carryNegative ?? true,
    appearance: raw.appearance || "system",
    trackingStartDate: raw.trackingStartDate,
    transactions: raw.transactions || raw.expenses || []
  };

  const transactions = migrated.transactions.filter(item =>
    item && typeof item.id === "string" && Number.isSafeInteger(item.amountCents) && item.amountCents > 0 && !Number.isNaN(Date.parse(item.createdAt))
  ).map(item => ({ id: item.id, amountCents: item.amountCents, createdAt: new Date(item.createdAt).toISOString() }));

  if (!Number.isSafeInteger(migrated.dailyBudgetCents) || migrated.dailyBudgetCents <= 0) throw new Error("每日额度无效");
  const earliestTransaction = transactions.length ? transactions.map(transactionDateKey).sort()[0] : dateKey(new Date());
  const candidateStart = /^\d{4}-\d{2}-\d{2}$/.test(migrated.trackingStartDate || "") ? migrated.trackingStartDate : earliestTransaction;

  return {
    version: DATA_VERSION,
    dailyBudgetCents: migrated.dailyBudgetCents,
    carryPositive: Boolean(migrated.carryPositive),
    carryNegative: Boolean(migrated.carryNegative),
    appearance: ["system", "light", "dark"].includes(migrated.appearance) ? migrated.appearance : "system",
    trackingStartDate: compareKeys(candidateStart, earliestTransaction) <= 0 ? candidateStart : earliestTransaction,
    transactions
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatMoney(cents, fixed = false, showPlus = false) {
  const value = Math.abs(cents) / 100;
  const text = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: fixed ? 2 : 0, maximumFractionDigits: 2 }).format(value);
  const sign = cents < 0 ? "-" : (showPlus && cents > 0 ? "+" : "");
  return `${sign}¥${text}`;
}

function formatDate(key, options) {
  return new Intl.DateTimeFormat("zh-CN", options).format(dateFromKey(key));
}

function getLedgerThrough(key) {
  return buildLedger(state, compareKeys(key, state.trackingStartDate) < 0 ? state.trackingStartDate : key);
}

function dayData(key) {
  return getLedgerThrough(key).get(key) || { key, baseCents: state.dailyBudgetCents, carryCents: 0, availableCents: state.dailyBudgetCents, spentCents: 0, balanceCents: state.dailyBudgetCents };
}

function makeEmpty(message) {
  const fragment = elements.emptyTemplate.content.cloneNode(true);
  fragment.querySelector("p").textContent = message;
  return fragment;
}

function makeRecordRow(transaction, editable = false) {
  const row = document.createElement(editable ? "button" : "div");
  row.className = `record-row${editable ? " editable" : ""}`;
  if (editable) row.type = "button";

  const time = document.createElement("span");
  time.className = "record-time";
  time.textContent = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(transaction.createdAt));
  const amount = document.createElement("strong");
  amount.className = "record-amount";
  amount.textContent = `-${formatMoney(transaction.amountCents)}`;
  row.append(time, amount);

  if (editable) {
    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.textContent = "›";
    row.append(chevron);
    row.addEventListener("click", () => openEditTransaction(transaction.id));
  }
  return row;
}

function renderToday() {
  const now = new Date();
  renderedDateKey = dateKey(now);
  const transactions = transactionsForKey(state, renderedDateKey);
  const day = dayData(renderedDateKey);
  const over = day.balanceCents < 0;

  elements.date.textContent = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(now);
  elements.balanceLabel.textContent = over ? "今日超支" : "今日剩余";
  elements.remaining.textContent = formatMoney(day.balanceCents, true);
  elements.remaining.classList.toggle("negative", over);
  elements.available.textContent = formatMoney(day.availableCents);
  elements.spent.textContent = formatMoney(day.spentCents);
  elements.carryNote.textContent = day.carryCents > 0 ? `含昨日结余 ${formatMoney(day.carryCents, false, true)}` : day.carryCents < 0 ? `已扣昨日超支 ${formatMoney(day.carryCents)}` : "";
  elements.carryNote.hidden = day.carryCents === 0;
  elements.count.textContent = transactions.length ? `${transactions.length} 笔` : "";
  elements.records.replaceChildren();
  transactions.length ? transactions.forEach(transaction => elements.records.append(makeRecordRow(transaction))) : elements.records.append(makeEmpty("今天还没有消费"));
  elements.undoButton.hidden = transactions.length === 0;
}

function openExpenseDialog() {
  editingTransactionId = null;
  elements.expenseTitle.textContent = "记录消费";
  elements.expenseAmount.value = "";
  elements.expenseError.textContent = "";
  elements.expenseDialog.showModal();
  setTimeout(() => elements.expenseAmount.focus(), 120);
}

function openEditTransaction(id) {
  const transaction = state.transactions.find(item => item.id === id);
  if (!transaction) return;
  editingTransactionId = id;
  elements.expenseTitle.textContent = "修改金额";
  elements.expenseAmount.value = (transaction.amountCents / 100).toFixed(transaction.amountCents % 100 ? 2 : 0);
  elements.expenseError.textContent = "";
  elements.expenseDialog.showModal();
  setTimeout(() => elements.expenseAmount.focus(), 120);
}

function refreshOpenViews() {
  renderToday();
  if (elements.historyDialog.open) renderHistory();
  if (elements.dayDialog.open && selectedDayKey) renderDayDetail(selectedDayKey);
  if (elements.statisticsDialog.open) renderStatistics();
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 3500);
}

function renderHistory() {
  const keys = [...new Set(state.transactions.map(transactionDateKey))].sort().reverse();
  elements.historyRecords.replaceChildren();
  if (!keys.length) {
    elements.historyRecords.append(makeEmpty("还没有历史记录"));
    return;
  }
  const through = [dateKey(new Date()), ...keys].sort().at(-1);
  const ledger = getLedgerThrough(through);
  keys.forEach(key => {
    const day = ledger.get(key) || dayData(key);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-summary";
    button.innerHTML = `<span class="history-date">${formatDate(key, { month: "long", day: "numeric", weekday: "short" })}</span>
      <span><small>可用</small><strong>${formatMoney(day.availableCents)}</strong></span>
      <span><small>消费</small><strong>${formatMoney(day.spentCents)}</strong></span>
      <span class="${day.balanceCents < 0 ? "negative-text" : ""}"><small>${day.balanceCents < 0 ? "超支" : "结余"}</small><strong>${formatMoney(day.balanceCents, false, true)}</strong></span>
      <i>›</i>`;
    button.addEventListener("click", () => {
      selectedDayKey = key;
      renderDayDetail(key);
      elements.dayDialog.showModal();
    });
    elements.historyRecords.append(button);
  });
}

function renderDayDetail(key) {
  const day = dayData(key);
  const transactions = transactionsForKey(state, key, false);
  elements.dayTitle.textContent = formatDate(key, { month: "long", day: "numeric" });
  elements.daySummary.innerHTML = `<div><span>可用</span><strong>${formatMoney(day.availableCents)}</strong></div><div><span>消费</span><strong>${formatMoney(day.spentCents)}</strong></div><div><span>${day.balanceCents < 0 ? "超支" : "结余"}</span><strong class="${day.balanceCents < 0 ? "negative-text" : ""}">${formatMoney(day.balanceCents, false, true)}</strong></div>`;
  elements.dayRecords.replaceChildren();
  if (!transactions.length) {
    elements.dayRecords.append(makeEmpty("当天没有消费"));
    return;
  }
  transactions.forEach(transaction => {
    const wrapper = document.createElement("div");
    wrapper.className = "editable-wrapper";
    wrapper.append(makeRecordRow(transaction, true));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.textContent = "删除";
    remove.addEventListener("click", () => {
      if (!window.confirm(`删除这笔 ${formatMoney(transaction.amountCents)} 的消费？`)) return;
      state.transactions = state.transactions.filter(item => item.id !== transaction.id);
      saveState();
      refreshOpenViews();
      showToast("记录已删除");
    });
    wrapper.append(remove);
    elements.dayRecords.append(wrapper);
  });
}

function monthStartKey(date) {
  return dateKey(new Date(date.getFullYear(), date.getMonth(), 1, 12));
}

function renderStatistics() {
  const today = new Date();
  const startKey = monthStartKey(statisticsDate);
  const isCurrentMonth = statisticsDate.getFullYear() === today.getFullYear() && statisticsDate.getMonth() === today.getMonth();
  const daysInMonth = new Date(statisticsDate.getFullYear(), statisticsDate.getMonth() + 1, 0).getDate();
  const endDay = isCurrentMonth ? today.getDate() : daysInMonth;
  const endKey = dateKey(new Date(statisticsDate.getFullYear(), statisticsDate.getMonth(), endDay, 12));
  const ledger = getLedgerThrough(endKey);
  const monthTransactions = state.transactions.filter(transaction => transactionDateKey(transaction).startsWith(startKey.slice(0, 7)));
  const spent = monthTransactions.reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const trackedStart = compareKeys(startKey, state.trackingStartDate) < 0 ? state.trackingStartDate : startKey;
  const trackedDays = compareKeys(trackedStart, endKey) <= 0 ? Math.round((dateFromKey(endKey) - dateFromKey(trackedStart)) / 86400000) + 1 : 0;
  const endingBalance = ledger.get(endKey)?.balanceCents ?? 0;
  let overspentDays = 0;
  for (let key = trackedStart; trackedDays && compareKeys(key, endKey) <= 0; key = addDays(key, 1)) if ((ledger.get(key)?.balanceCents ?? 0) < 0) overspentDays++;

  elements.statisticsMonth.textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(statisticsDate);
  elements.nextMonth.disabled = isCurrentMonth;
  elements.statisticsSummary.innerHTML = `
    <div><span>本月基础额度</span><strong>${formatMoney(state.dailyBudgetCents * daysInMonth)}</strong></div>
    <div><span>本月消费</span><strong>${formatMoney(spent)}</strong></div>
    <div><span>当前累计余额</span><strong class="${endingBalance < 0 ? "negative-text" : ""}">${formatMoney(endingBalance, false, true)}</strong></div>
    <div><span>平均每日消费</span><strong>${formatMoney(trackedDays ? Math.round(spent / trackedDays) : 0)}</strong></div>
    <div><span>本月超支天数</span><strong>${overspentDays} 天</strong></div>`;

  elements.dailyTrend.replaceChildren();
  if (!trackedDays) {
    elements.dailyTrend.append(makeEmpty("这个月还没有数据"));
    return;
  }
  for (let key = trackedStart; compareKeys(key, endKey) <= 0; key = addDays(key, 1)) {
    const day = ledger.get(key);
    const row = document.createElement("div");
    row.className = "trend-row";
    row.innerHTML = `<span>${dateFromKey(key).getDate()}日</span><strong>${formatMoney(day?.spentCents || 0)}</strong>`;
    elements.dailyTrend.append(row);
  }
}

function applyAppearance() {
  document.documentElement.dataset.theme = state.appearance;
  const dark = state.appearance === "dark" || (state.appearance === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  $("meta[name='theme-color']").content = dark ? "#000000" : "#f5f5f7";
}

function backupPayload() {
  return {
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    dailyBudget: state.dailyBudgetCents / 100,
    dailyBudgetCents: state.dailyBudgetCents,
    carryPositive: state.carryPositive,
    carryNegative: state.carryNegative,
    appearance: state.appearance,
    trackingStartDate: state.trackingStartDate,
    transactions: state.transactions
  };
}

async function exportBackup() {
  const filename = `DailyBudget-${dateKey(new Date())}.json`;
  const file = new File([JSON.stringify(backupPayload(), null, 2)], filename, { type: "application/json" });
  try {
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "每日额度备份" });
    } else {
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    showToast("备份已生成");
  } catch (error) {
    if (error.name !== "AbortError") showToast("导出失败，请重试");
  }
}

elements.addButton.addEventListener("click", openExpenseDialog);
elements.expenseForm.addEventListener("submit", event => {
  event.preventDefault();
  const cents = parseAmountToCents(elements.expenseAmount.value);
  if (cents === null) {
    elements.expenseError.textContent = "请输入大于 0、最多两位小数的金额";
    return;
  }
  if (editingTransactionId) {
    const transaction = state.transactions.find(item => item.id === editingTransactionId);
    if (transaction) transaction.amountCents = cents;
    showToast("金额已修改");
  } else {
    const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    state.transactions.push({ id, amountCents: cents, createdAt: new Date().toISOString() });
  }
  saveState();
  elements.expenseDialog.close();
  refreshOpenViews();
});

elements.undoButton.addEventListener("click", () => {
  const latest = transactionsForKey(state, dateKey(new Date()))[0];
  if (!latest) return;
  state.transactions = state.transactions.filter(transaction => transaction.id !== latest.id);
  saveState();
  refreshOpenViews();
  showToast(`已撤销 ${formatMoney(latest.amountCents)}`);
});

elements.settingsButton.addEventListener("click", () => {
  elements.limitAmount.value = (state.dailyBudgetCents / 100).toFixed(state.dailyBudgetCents % 100 ? 2 : 0);
  elements.carryPositive.checked = state.carryPositive;
  elements.carryNegative.checked = state.carryNegative;
  $(`input[name="appearance"][value="${state.appearance}"]`).checked = true;
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
  state.dailyBudgetCents = cents;
  state.carryPositive = elements.carryPositive.checked;
  state.carryNegative = elements.carryNegative.checked;
  state.appearance = $("input[name='appearance']:checked")?.value || "system";
  saveState();
  applyAppearance();
  elements.settingsDialog.close();
  refreshOpenViews();
  showToast("设置已保存");
});

elements.historyButton.addEventListener("click", () => { renderHistory(); elements.historyDialog.showModal(); });
elements.statisticsButton.addEventListener("click", () => { statisticsDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12); renderStatistics(); elements.statisticsDialog.showModal(); });
elements.previousMonth.addEventListener("click", () => { statisticsDate.setMonth(statisticsDate.getMonth() - 1); renderStatistics(); });
elements.nextMonth.addEventListener("click", () => { if (!elements.nextMonth.disabled) { statisticsDate.setMonth(statisticsDate.getMonth() + 1); renderStatistics(); } });
elements.exportButton.addEventListener("click", exportBackup);
elements.importButton.addEventListener("click", () => elements.importFile.click());
elements.importFile.addEventListener("change", async () => {
  const file = elements.importFile.files?.[0];
  elements.importFile.value = "";
  if (!file) return;
  try {
    const restored = normalizeState(JSON.parse(await file.text()));
    if (!window.confirm(`恢复备份将替换当前的 ${state.transactions.length} 笔记录，是否继续？`)) return;
    state = restored;
    saveState();
    applyAppearance();
    elements.settingsDialog.close();
    refreshOpenViews();
    showToast(`已恢复 ${state.transactions.length} 笔记录`);
  } catch (error) {
    showToast(error.message || "备份文件无效");
  }
});

document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => $(`#${button.dataset.close}`).close()));
document.querySelectorAll("dialog.sheet").forEach(dialog => dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); }));

function refreshForDateChange() {
  if (dateKey(new Date()) !== renderedDateKey) refreshOpenViews();
}

document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshForDateChange(); });
window.addEventListener("focus", refreshForDateChange);
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (state.appearance === "system") applyAppearance(); });
setInterval(refreshForDateChange, 30000);

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));

saveState();
applyAppearance();
renderToday();
