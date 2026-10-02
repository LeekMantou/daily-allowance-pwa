import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = mkdtempSync(join(tmpdir(), "daily-budget-smoke-"));
const debugPort = 9333;
const chrome = spawn(chromePath, [
  "--headless",
  "--disable-gpu",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "http://127.0.0.1:8081/"
], { stdio: "ignore" });

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function findPage() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      const page = pages.find(item => item.type === "page" && item.url.includes("127.0.0.1:8081"));
      if (page) return page;
    } catch {}
    await pause(100);
  }
  throw new Error("Chrome test page did not start");
}

let sequence = 0;
let socket;
const pending = new Map();

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.result.exceptionDetails) throw new Error(response.result.exceptionDetails.text);
  return response.result.result.value;
}

try {
  const page = await findPage();
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message);
  });
  await command("Runtime.enable");
  await pause(250);

  assert.equal(await evaluate("document.querySelector('#remainingAmount').textContent"), "¥100.00");
  assert.equal(await evaluate("document.querySelector('#addButton').click(); document.querySelector('#expenseDialog').open"), true);
  await evaluate("document.querySelector('#expenseAmount').value='28'; document.querySelector('#expenseForm').requestSubmit();");
  assert.equal(await evaluate("document.querySelector('#remainingAmount').textContent"), "¥72.00");
  assert.equal(await evaluate("document.querySelector('#todaySpent').textContent"), "¥28");
  assert.equal(await evaluate("document.querySelector('#recordCount').textContent"), "1 笔");

  await evaluate("document.querySelector('#historyButton').click()");
  assert.equal(await evaluate("document.querySelectorAll('.history-summary').length"), 1);
  await evaluate("document.querySelector('#historyDialog').close(); document.querySelector('#statisticsButton').click()");
  assert.equal(await evaluate("document.querySelector('#statisticsDialog').open"), true);
  assert.equal(await evaluate("document.querySelector('#statisticsSummary').textContent.includes('本月消费')"), true);
  await evaluate("document.querySelector('#statisticsDialog').close(); document.querySelector('#settingsButton').click()");
  assert.equal(await evaluate("document.querySelector('#carryPositive').checked && document.querySelector('#carryNegative').checked"), true);
  assert.equal(await evaluate("document.querySelectorAll('input[name=appearance]').length"), 3);
  await evaluate("document.querySelector('#settingsDialog').close(); document.querySelector('#undoButton').click()");
  assert.equal(await evaluate("document.querySelector('#remainingAmount').textContent"), "¥100.00");
  assert.equal(await evaluate("document.querySelector('#toast').textContent"), "已撤销 ¥28");

  await evaluate(`localStorage.setItem('daily-allowance-v1', JSON.stringify({
    dailyLimitCents: 12345,
    expenses: [{ id: 'legacy', amountCents: 1000, createdAt: new Date().toISOString() }]
  })); location.reload()`);
  await pause(300);
  assert.equal(await evaluate("document.querySelector('#remainingAmount').textContent"), "¥113.45");
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('daily-allowance-v1')).version"), 2);

  console.log("browser smoke tests passed");
} finally {
  socket?.close();
  chrome.kill();
  await pause(100);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
