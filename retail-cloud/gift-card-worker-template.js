// Mock GIVEX Gift Card Service — Template
// Placeholders (replaced at build time):
//   {{BRAND_NAME}}      — e.g. "Peter Millar"
//   {{PRIMARY_COLOR}}   — e.g. "#0e1d48"
//   {{ACCENT_COLOR}}    — e.g. "#00a650"
//   {{LOGO_PLACEHOLDER}} — base64 data URI (injected via Python after Write)

const RESULT_OK = "0";
const RESULT_INSUFFICIENT = "11";
const RESULT_INVALID = "7";
const RESULT_INACTIVE = "5";

// ── GIVEX JSON-RPC handlers ──────────────────────────────────────────────────

async function handleJsonRpc(request, env) {
  let body;
  let rawText = "";
  try {
    rawText = await request.text();
    body = JSON.parse(rawText);
  } catch {
    await env.GC_STORE.put("__debug_last_request", rawText || "(empty body)");
    return jsonResponse({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }

  // Append to request log for debugging (keep last 10)
  const logRaw = await env.GC_STORE.get("__debug_log");
  const log = logRaw ? JSON.parse(logRaw) : [];
  log.push({ ts: new Date().toISOString(), method: body.method, params: body.params, id: body.id });
  if (log.length > 10) log.splice(0, log.length - 10);
  await env.GC_STORE.put("__debug_log", JSON.stringify(log));
  await env.GC_STORE.put("__debug_last_request", JSON.stringify({ headers: Object.fromEntries(request.headers), body }, null, 2));

  const { method, params, id } = body;
  const seqId = params?.[1] ?? String(id);  // echo params[1] back in result[0]

  // dc_902 redemption params: [lang, seq, user, pass, cardNumber, amount, pin]
  // dc_947 redemption params: [lang, seq, user, pass, cardNumber, pin, amount, currency]
  let cardNumber, pin, amount;

  if (method === "dc_902" || method === "dc_907") {
    cardNumber = params?.[4] ?? "";
    amount     = params?.[5] ?? "0";
    pin        = params?.[6] ?? "";
  } else {
    cardNumber = params?.[4] ?? "";
    pin        = params?.[5] ?? "";
    amount     = params?.[6] ?? "0";
  }

  if (method === "dc_946" || method === "dc_994" || method === "dc_995") {
    return jsonRpcBalance(id, seqId, cardNumber, pin, env);
  }
  if (method === "dc_901") {
    return jsonRpcActivate(id, seqId, cardNumber, pin, amount, env);
  }
  if (method === "dc_902" || method === "dc_907" || method === "dc_947") {
    return jsonRpcRedeem(id, seqId, cardNumber, pin, amount, env);
  }
  if (method === "dc_948") {
    return jsonResponse({ jsonrpc: "2.0", id, result: makeRedeemResult(seqId, RESULT_OK, 0, 0) });
  }

  return jsonResponse({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
}

function toDollars(val) {
  return parseFloat(val).toFixed(2);
}

function makeBalanceResult(seqId, resultCode, balanceDollars) {
  return [seqId, resultCode, toDollars(balanceDollars), "0", "None", "USD", "", "", "", "", genTransId()];
}

function makeRedeemResult(seqId, resultCode, amountDollars, remainingDollars) {
  return [seqId, resultCode, genTransId(), toDollars(amountDollars), toDollars(remainingDollars), "None", "", "", "", "", genTransId(), "", "", ""];
}

async function jsonRpcBalance(id, seqId, cardNumber, pin, env) {
  const card = await getCard(cardNumber, env);
  if (!card) return jsonResponse({ jsonrpc: "2.0", id, result: makeBalanceResult(seqId, RESULT_INVALID, 0) });
  if (!card.active) return jsonResponse({ jsonrpc: "2.0", id, result: makeBalanceResult(seqId, RESULT_INACTIVE, 0) });
  return jsonResponse({ jsonrpc: "2.0", id, result: makeBalanceResult(seqId, RESULT_OK, card.balance) });
}

async function jsonRpcActivate(id, seqId, cardNumber, pin, amount, env) {
  let card = await getCard(cardNumber, env);
  const amt = parseFloat(amount) || 0;
  if (!card) {
    card = { balance: amt, pin: pin || "", active: true, createdAt: new Date().toISOString() };
  } else {
    card.balance = amt;
    card.active = true;
  }
  await saveCard(cardNumber, card, env);
  return jsonResponse({ jsonrpc: "2.0", id, result: makeBalanceResult(seqId, RESULT_OK, card.balance) });
}

async function jsonRpcRedeem(id, seqId, cardNumber, pin, amount, env) {
  const card = await getCard(cardNumber, env);
  if (!card) return jsonResponse({ jsonrpc: "2.0", id, result: makeRedeemResult(seqId, RESULT_INVALID, 0, 0) });
  if (!card.active) return jsonResponse({ jsonrpc: "2.0", id, result: makeRedeemResult(seqId, RESULT_INACTIVE, 0, 0) });
  const amt = parseFloat(amount) || 0;
  if (card.balance < amt) return jsonResponse({ jsonrpc: "2.0", id, result: makeRedeemResult(seqId, RESULT_INSUFFICIENT, 0, card.balance) });
  const newBalance = parseFloat((card.balance - amt).toFixed(2));
  card.balance = newBalance;
  await saveCard(cardNumber, card, env);
  await appendTxn(cardNumber, { type: "REDEEM", amount: amt, balanceAfter: newBalance }, env);
  return jsonResponse({ jsonrpc: "2.0", id, result: makeRedeemResult(seqId, RESULT_OK, amt, newBalance) });
}

// ── Card management API ──────────────────────────────────────────────────────

async function handleIssue(request, env) {
  let body;
  try { body = await request.json(); } catch { return apiError("Invalid JSON", 400); }
  const amount = parseFloat(body.amount);
  if (!amount || amount <= 0) return apiError("Invalid amount", 400);
  const cardNumber = generateCardNumber();
  const pin = body.pin || generatePin();
  const card = { balance: amount, issuedAmount: amount, pin, active: true, createdAt: new Date().toISOString() };
  await saveCard(cardNumber, card, env);
  await appendTxn(cardNumber, { type: "ISSUED", amount, balanceAfter: amount }, env);
  return jsonResponse({ cardNumber, pin, balance: amount, active: true });
}

async function handleAddBalance(request, env) {
  let body;
  try { body = await request.json(); } catch { return apiError("Invalid JSON", 400); }
  const { cardNumber, amount } = body;
  const amt = parseFloat(amount);
  if (!cardNumber) return apiError("Missing cardNumber", 400);
  if (!amt || amt <= 0) return apiError("Invalid amount", 400);
  const card = await getCard(cardNumber, env);
  if (!card) return apiError("Card not found", 404);
  card.balance = parseFloat((card.balance + amt).toFixed(2));
  await saveCard(cardNumber, card, env);
  await appendTxn(cardNumber, { type: "ADD_BALANCE", amount: amt, balanceAfter: card.balance }, env);
  return jsonResponse({ cardNumber, balance: card.balance });
}

async function handleResetBalance(request, env) {
  let body;
  try { body = await request.json(); } catch { return apiError("Invalid JSON", 400); }
  const { cardNumber } = body;
  if (!cardNumber) return apiError("Missing cardNumber", 400);
  const card = await getCard(cardNumber, env);
  if (!card) return apiError("Card not found", 404);
  if (!card.issuedAmount) {
    card.issuedAmount = card.balance;
    if (!card.issuedAmount) return apiError("Card has no original amount on record. Delete and reissue it.", 400);
  }
  const original = card.issuedAmount;
  card.balance = original;
  card.active = true;
  await saveCard(cardNumber, card, env);
  await appendTxn(cardNumber, { type: "RESET", amount: original, balanceAfter: original }, env);
  return jsonResponse({ cardNumber, balance: card.balance });
}

async function handleSetLabel(request, env) {
  let body;
  try { body = await request.json(); } catch { return apiError("Invalid JSON", 400); }
  const { cardNumber, label } = body;
  if (!cardNumber) return apiError("Missing cardNumber", 400);
  const card = await getCard(cardNumber, env);
  if (!card) return apiError("Card not found", 404);
  card.label = (label || "").trim().slice(0, 40);
  await saveCard(cardNumber, card, env);
  return jsonResponse({ cardNumber, label: card.label });
}

async function handleBulkIssue(request, env) {
  let body;
  try { body = await request.json(); } catch { return apiError("Invalid JSON", 400); }
  const count = Math.min(parseInt(body.count) || 1, 20);
  const amount = parseFloat(body.amount);
  if (!amount || amount <= 0) return apiError("Invalid amount", 400);
  const issued = [];
  for (let i = 0; i < count; i++) {
    const cardNumber = generateCardNumber();
    const pin = generatePin();
    const card = { balance: amount, issuedAmount: amount, pin, active: true, createdAt: new Date().toISOString() };
    await saveCard(cardNumber, card, env);
    await appendTxn(cardNumber, { type: "ISSUED", amount, balanceAfter: amount }, env);
    issued.push({ cardNumber, pin, balance: amount });
  }
  return jsonResponse(issued);
}

async function handleDeleteCard(request, env) {
  let body;
  try { body = await request.json(); } catch { return apiError("Invalid JSON", 400); }
  const { cardNumber } = body;
  if (!cardNumber) return apiError("Missing cardNumber", 400);
  await env.GC_STORE.delete(cardNumber);
  await env.GC_STORE.delete("__txn_" + cardNumber);
  return jsonResponse({ deleted: true });
}

async function handleGetHistory(request, env) {
  const url = new URL(request.url);
  const cardNumber = url.searchParams.get("card") ?? "";
  if (!cardNumber) return apiError("Missing card parameter", 400);
  const raw = await env.GC_STORE.get("__txn_" + cardNumber);
  const txns = raw ? JSON.parse(raw) : [];
  return jsonResponse(txns);
}

async function handleBalanceLookup(request, env) {
  const url = new URL(request.url);
  const cardNumber = url.searchParams.get("card") ?? "";
  if (!cardNumber) return apiError("Missing card parameter", 400);
  const card = await getCard(cardNumber, env);
  if (!card) return apiError("Card not found", 404);
  return jsonResponse({ cardNumber, balance: card.balance, pin: card.pin, active: card.active, createdAt: card.createdAt });
}

async function handleListCards(env) {
  const list = await env.GC_STORE.list();
  const cards = await Promise.all(
    list.keys
      .filter(k => !k.name.startsWith("__"))
      .map(async (k) => {
        const card = await getCard(k.name, env);
        return card ? { cardNumber: k.name, ...card } : null;
      })
  );
  return jsonResponse(cards.filter(Boolean));
}

// ── KV helpers ───────────────────────────────────────────────────────────────

async function getCard(cardNumber, env) {
  const raw = await env.GC_STORE.get(cardNumber);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function saveCard(cardNumber, card, env) {
  await env.GC_STORE.put(cardNumber, JSON.stringify(card));
}

async function appendTxn(cardNumber, entry, env) {
  const key = "__txn_" + cardNumber;
  const raw = await env.GC_STORE.get(key);
  const txns = raw ? JSON.parse(raw) : [];
  txns.push({ ts: new Date().toISOString(), ...entry });
  if (txns.length > 50) txns.splice(0, txns.length - 50);
  await env.GC_STORE.put(key, JSON.stringify(txns));
}

// ── Utilities ────────────────────────────────────────────────────────────────

function generateCardNumber() {
  // 19-digit number starting with 6006 (standard gift card prefix)
  let num = "6006";
  for (let i = 0; i < 15; i++) num += Math.floor(Math.random() * 10);
  return num;
}

function generatePin() {
  let pin = "";
  for (let i = 0; i < 4; i++) pin += Math.floor(Math.random() * 10);
  return pin;
}

function genTransId() {
  return Math.floor(Math.random() * 9000000 + 1000000).toString();
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

function apiError(msg, status = 400) {
  return jsonResponse({ error: msg }, status);
}

// ── Portal HTML ──────────────────────────────────────────────────────────────

function portalHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{BRAND_NAME}} Gift Card Portal</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; min-height: 100vh; }

  .header {
    background: {{PRIMARY_COLOR}};
    padding: 16px 24px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .header img { height: 36px; filter: brightness(10); }
  .header h1 { color: #fff; font-size: 18px; font-weight: 600; }
  .header .badge {
    background: {{ACCENT_COLOR}};
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 20px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .top-area { max-width: 600px; margin: 32px auto 0; padding: 0 16px; }
  .wide-area { max-width: 1400px; margin: 0 auto 32px; padding: 0 16px; }

  .panel {
    background: #fff;
    border-radius: 12px;
    padding: 28px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    margin-bottom: 24px;
  }
  .panel h2 { font-size: 15px; font-weight: 600; color: #111; margin-bottom: 20px; }

  .form-row { display: flex; gap: 12px; align-items: flex-end; }
  .form-group { flex: 1; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; color: #555; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.4px; }
  .form-group input {
    width: 100%; padding: 10px 14px; border: 1.5px solid #e0e0e0;
    border-radius: 8px; font-size: 15px; outline: none; transition: border-color 0.15s;
  }
  .form-group input:focus { border-color: {{PRIMARY_COLOR}}; }

  .btn {
    padding: 10px 22px; border: none; border-radius: 8px; font-size: 14px;
    font-weight: 600; cursor: pointer; transition: opacity 0.15s; white-space: nowrap;
  }
  .btn:hover { opacity: 0.85; }
  .btn-primary { background: {{PRIMARY_COLOR}}; color: #fff; }
  .btn-sm { padding: 6px 14px; font-size: 12px; }
  .btn-outline { background: transparent; border: 1.5px solid #ddd; color: #333; }

  #result { display: none; }
  .gc-card {
    background: {{PRIMARY_COLOR}};
    border-radius: 16px;
    padding: 28px;
    color: #fff;
    position: relative;
    overflow: hidden;
    margin-bottom: 20px;
  }
  .gc-card::before {
    content: '';
    position: absolute;
    top: -40px; right: -40px;
    width: 160px; height: 160px;
    background: rgba(255,255,255,0.06);
    border-radius: 50%;
  }
  .gc-card-logo { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 24px; color: #fff; }
  .gc-card-logo span { color: rgba(255,255,255,0.65); font-weight: 400; }
  .gc-card-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.6); margin-bottom: 4px; }
  .gc-card-number { font-size: 15px; font-family: 'Courier New', monospace; letter-spacing: 2px; color: #fff; margin-bottom: 20px; word-break: break-all; }
  .gc-card-row { display: flex; gap: 32px; }
  .gc-card-amount { font-size: 28px; font-weight: 700; color: #fff; }
  .gc-card-pin-val { font-size: 20px; font-weight: 600; color: #fff; font-family: 'Courier New', monospace; }

  .barcode-section { background: #fff; border-radius: 10px; padding: 20px; text-align: center; }
  .barcode-section svg { max-width: 100%; }
  .barcode-label { font-size: 11px; color: #888; margin-top: 8px; }

  .action-row { display: flex; gap: 10px; margin-top: 16px; }

  .error-msg { color: #d32f2f; font-size: 13px; margin-top: 8px; display: none; }
  .success-msg { color: #2e7d32; font-size: 13px; margin-top: 8px; display: none; }

  .list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .list-header h2 { margin-bottom: 0; }
  .list-count { font-size: 12px; color: #888; font-weight: 500; }

  #card-list-body { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .gc-table { width: 100%; border-collapse: collapse; }
  .gc-table thead th {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #888;
    padding: 0 12px 10px;
    text-align: left;
    border-bottom: 1.5px solid #f0f0f0;
    white-space: nowrap;
  }
  .gc-table thead th:last-child { text-align: center; }
  .gc-table tbody tr { border-bottom: 1px solid #f5f5f5; transition: background 0.1s; }
  .gc-table tbody tr:last-child { border-bottom: none; }
  .gc-table tbody tr:hover { background: #fafafa; }
  .gc-table td { padding: 12px 8px; vertical-align: middle; }

  .td-number { font-family: 'Courier New', monospace; font-size: 13px; color: #111; min-width: 180px; white-space: nowrap; }
  .td-number .copy-btn { display: inline-block; margin-left: 6px; cursor: pointer; color: #bbb; font-size: 11px; vertical-align: middle; }
  .td-number .copy-btn:hover { color: #555; }
  .td-balance { font-size: 15px; font-weight: 700; color: #111; white-space: nowrap; min-width: 80px; }
  .td-balance.low { color: #d32f2f; }
  .td-pin { font-family: 'Courier New', monospace; font-size: 14px; color: #444; min-width: 60px; }
  .td-issued { font-size: 12px; color: #888; white-space: nowrap; min-width: 90px; }
  .td-barcode { text-align: center; width: 160px; min-width: 160px; max-width: 160px; }
  .td-barcode svg { display: block; margin: 0 auto; }
  .td-status { white-space: nowrap; }
  .status-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; vertical-align: middle; }
  .dot-active { background: #2e7d32; }
  .dot-inactive { background: #ccc; }
  .empty-state { text-align: center; padding: 40px 0; color: #aaa; font-size: 14px; }

  .td-label { min-width: 90px; max-width: 110px; }
  .label-text { font-size: 12px; color: #555; cursor: pointer; padding: 3px 6px; border-radius: 4px; display: inline-block; }
  .label-text:hover { background: #f0f0f0; }
  .label-text.empty { color: #ccc; font-style: italic; }
  .label-input {
    font-size: 12px; padding: 3px 6px; border: 1.5px solid {{PRIMARY_COLOR}};
    border-radius: 4px; width: 110px; outline: none; display: none;
  }

  .td-actions { white-space: nowrap; min-width: 160px; }
  .gc-table .td-actions { padding-left: 20px; }
  .btn-icon {
    padding: 4px 8px; font-size: 11px; font-weight: 600; border-radius: 5px;
    border: 1.5px solid; cursor: pointer; margin-right: 3px; background: transparent;
    transition: all 0.15s;
  }
  .btn-icon:last-child { margin-right: 0; }
  .btn-add   { border-color: #2e7d32; color: #2e7d32; }
  .btn-add:hover { background: #2e7d32; color: #fff; }
  .btn-reset { border-color: #7b1fa2; color: #7b1fa2; }
  .btn-reset:hover { background: #7b1fa2; color: #fff; }
  .btn-hist  { border-color: #1565c0; color: #1565c0; }
  .btn-hist:hover { background: #1565c0; color: #fff; }
  .btn-del   { border-color: #d32f2f; color: #d32f2f; }
  .btn-del:hover { background: #d32f2f; color: #fff; }

  .modal-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.45); z-index: 100;
    align-items: center; justify-content: center;
  }
  .modal-overlay.open { display: flex; }
  .modal {
    background: #fff; border-radius: 14px; padding: 28px;
    width: 100%; max-width: 480px; box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    position: relative; max-height: 80vh; overflow-y: auto;
  }
  .modal h3 { font-size: 15px; font-weight: 700; color: #111; margin-bottom: 16px; }
  .modal-close {
    position: absolute; top: 16px; right: 18px;
    font-size: 20px; color: #aaa; cursor: pointer; background: none; border: none; line-height: 1;
  }
  .modal-close:hover { color: #333; }
  .modal-actions { display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end; }

  .hist-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .hist-table th {
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
    color: #888; padding: 0 8px 8px; text-align: left; border-bottom: 1.5px solid #f0f0f0;
  }
  .hist-table td { padding: 10px 8px; border-bottom: 1px solid #f5f5f5; vertical-align: middle; }
  .hist-table tr:last-child td { border-bottom: none; }
  .txn-badge {
    display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 7px;
    border-radius: 20px; text-transform: uppercase; letter-spacing: 0.4px;
  }
  .txn-ISSUED      { background: #e8f5e9; color: #2e7d32; }
  .txn-REDEEM      { background: #fff3e0; color: #e65100; }
  .txn-ADD_BALANCE { background: #e3f2fd; color: #1565c0; }
  .txn-RESET       { background: #f3e5f5; color: #7b1fa2; }

  @media print {
    .header, .top-area, .wide-area .panel > *:not(#print-sheet) { display: none !important; }
    #print-sheet { display: block !important; }
    .print-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; padding: 20px; }
    .print-card { border: 1px solid #ddd; border-radius: 8px; padding: 14px; page-break-inside: avoid; }
    .print-card-num { font-family: monospace; font-size: 11px; margin-bottom: 4px; }
    .print-card-meta { font-size: 11px; color: #555; margin-bottom: 8px; }
  }
  #print-sheet { display: none; }
</style>
</head>
<body>

<div class="header">
  <img src="{{LOGO_PLACEHOLDER}}" alt="{{BRAND_NAME}}" onerror="this.style.display='none'"/>
  <h1>{{BRAND_NAME}} Gift Card Portal</h1>
  <span class="badge">Mock Service</span>
</div>

<div class="top-area">

  <div class="panel">
    <h2>Issue New Gift Card</h2>
    <div class="form-row">
      <div class="form-group">
        <label>Amount (USD)</label>
        <input type="number" id="amount" placeholder="50.00" min="1" step="0.01">
      </div>
      <div class="form-group" style="max-width:120px">
        <label>PIN (optional)</label>
        <input type="text" id="pin" placeholder="Auto" maxlength="8">
      </div>
      <button class="btn btn-primary" onclick="issueCard()">Issue Card</button>
      <button class="btn btn-outline" onclick="openModal('modal-bulk')" style="margin-left:4px">Bulk Issue</button>
    </div>
    <div id="issue-error" class="error-msg"></div>
  </div>

  <div class="panel" id="result">
    <h2>Card Issued</h2>
    <div class="gc-card">
      <div class="gc-card-logo">{{BRAND_NAME}} <span>Gift Card</span></div>
      <div class="gc-card-label">Card Number</div>
      <div class="gc-card-number" id="res-number"></div>
      <div class="gc-card-row">
        <div>
          <div class="gc-card-label">Balance</div>
          <div class="gc-card-amount" id="res-amount"></div>
        </div>
        <div>
          <div class="gc-card-label">PIN</div>
          <div class="gc-card-pin-val" id="res-pin"></div>
        </div>
      </div>
    </div>
    <div class="barcode-section">
      <svg id="barcode"></svg>
      <div class="barcode-label">Scan in Retail Cloud POS</div>
    </div>
    <div class="action-row">
      <button class="btn btn-outline btn-sm" onclick="printSheet()">Print All Cards</button>
      <button class="btn btn-outline btn-sm" onclick="copyLatest()">Copy Number</button>
    </div>
    <div id="copy-success" class="success-msg">Copied to clipboard!</div>
  </div>

</div>

<div class="wide-area">
  <div class="panel">
    <div class="list-header">
      <h2>All Gift Cards</h2>
      <div style="display:flex;align-items:center;gap:12px">
        <span class="list-count" id="list-count"></span>
        <button class="btn btn-outline btn-sm" onclick="loadCardList()">Refresh</button>
        <button class="btn btn-outline btn-sm" onclick="printSheet()">Print Sheet</button>
      </div>
    </div>
    <div id="card-list-body">
      <div class="empty-state">No cards issued yet.</div>
    </div>
  </div>
</div>

<div id="print-sheet">
  <div class="print-grid" id="print-grid"></div>
</div>

<div class="modal-overlay" id="modal-bulk">
  <div class="modal" style="max-width:400px">
    <button class="modal-close" onclick="closeModal('modal-bulk')">×</button>
    <h3>Bulk Issue Cards</h3>
    <div class="form-row" style="margin-bottom:12px">
      <div class="form-group">
        <label>Amount Each (USD)</label>
        <input type="number" id="bulk-amount" placeholder="50.00" min="1" step="0.01">
      </div>
      <div class="form-group" style="max-width:80px">
        <label>Count</label>
        <input type="number" id="bulk-count" placeholder="3" min="1" max="20" value="3">
      </div>
    </div>
    <div id="bulk-error" class="error-msg"></div>
    <div id="bulk-result" style="display:none;margin-top:12px;padding:12px;background:#f5f5f5;border-radius:8px;font-size:13px;color:#555;"></div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-sm" onclick="closeModal('modal-bulk')">Close</button>
      <button class="btn btn-primary btn-sm" onclick="submitBulkIssue()">Issue Cards</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modal-add">
  <div class="modal">
    <button class="modal-close" onclick="closeModal('modal-add')">×</button>
    <h3>Add Balance</h3>
    <div style="font-size:12px;color:#888;margin-bottom:14px;">Card: <span id="add-card-num" style="font-family:monospace;color:#333;"></span></div>
    <div class="form-group">
      <label>Amount to Add (USD)</label>
      <input type="number" id="add-amount" placeholder="25.00" min="0.01" step="0.01">
    </div>
    <div id="add-error" class="error-msg"></div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-sm" onclick="closeModal('modal-add')">Cancel</button>
      <button class="btn btn-primary btn-sm" onclick="submitAddBalance()">Add Balance</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modal-hist">
  <div class="modal" style="max-width:560px">
    <button class="modal-close" onclick="closeModal('modal-hist')">×</button>
    <h3>Transaction History</h3>
    <div style="font-size:12px;color:#888;margin-bottom:14px;">Card: <span id="hist-card-num" style="font-family:monospace;color:#333;"></span></div>
    <div id="hist-body"></div>
  </div>
</div>

<div class="modal-overlay" id="modal-del">
  <div class="modal" style="max-width:380px">
    <button class="modal-close" onclick="closeModal('modal-del')">×</button>
    <h3>Delete Card?</h3>
    <div style="font-size:13px;color:#555;margin-bottom:4px;">This will permanently remove the card and its history.</div>
    <div style="font-family:monospace;font-size:13px;color:#111;margin-top:10px;" id="del-card-num"></div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-sm" onclick="closeModal('modal-del')">Cancel</button>
      <button class="btn btn-sm" style="background:#d32f2f;color:#fff;border:none;" onclick="submitDelete()">Delete</button>
    </div>
  </div>
</div>

<script>
let activeCard = null;
let allCards = [];

async function issueCard() {
  const amount = parseFloat(document.getElementById('amount').value);
  const pin = document.getElementById('pin').value.trim();
  const errEl = document.getElementById('issue-error');
  errEl.style.display = 'none';
  if (!amount || amount <= 0) { errEl.textContent = 'Please enter a valid amount.'; errEl.style.display = 'block'; return; }
  const body = { amount };
  if (pin) body.pin = pin;
  const res = await fetch('/issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'Failed to issue card.'; errEl.style.display = 'block'; return; }
  document.getElementById('res-number').textContent = data.cardNumber;
  document.getElementById('res-amount').textContent = '$' + parseFloat(data.balance).toFixed(2);
  document.getElementById('res-pin').textContent = data.pin || '—';
  document.getElementById('result').style.display = 'block';
  JsBarcode('#barcode', data.cardNumber, { format: 'CODE128', width: 2, height: 60, displayValue: false, margin: 10 });
  document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  await loadCardList();
}

async function loadCardList() {
  const res = await fetch('/cards');
  if (!res.ok) return;
  allCards = await res.json();
  const container = document.getElementById('card-list-body');
  const countEl = document.getElementById('list-count');
  if (!allCards.length) { container.innerHTML = '<div class="empty-state">No cards issued yet.</div>'; countEl.textContent = ''; return; }
  allCards.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  countEl.textContent = allCards.length + ' card' + (allCards.length !== 1 ? 's' : '');
  const table = document.createElement('table');
  table.className = 'gc-table';
  table.innerHTML = \`<thead><tr>
    <th>Status</th><th>Label</th><th>Card Number</th><th>Balance</th>
    <th>PIN</th><th>Issued</th><th style="text-align:center">Barcode</th><th>Actions</th>
  </tr></thead><tbody id="gc-tbody"></tbody>\`;
  container.innerHTML = '';
  container.appendChild(table);
  const tbody = document.getElementById('gc-tbody');
  allCards.forEach((card, idx) => {
    const tr = document.createElement('tr');
    tr.id = 'row-' + card.cardNumber;
    const svgId = 'bc-' + idx;
    const isLow = card.balance < 10;
    const dateStr = card.createdAt ? new Date(card.createdAt).toLocaleDateString() : '—';
    const labelVal = card.label || '';
    tr.innerHTML = \`
      <td class="td-status"><span class="status-dot \${card.active ? 'dot-active' : 'dot-inactive'}"></span>\${card.active ? 'Active' : 'Inactive'}</td>
      <td class="td-label">
        <span class="label-text \${labelVal ? '' : 'empty'}" id="lbl-\${card.cardNumber}" onclick="editLabel('\${card.cardNumber}')">\${labelVal || 'Add label'}</span>
        <input class="label-input" id="lbl-input-\${card.cardNumber}" value="\${labelVal}" maxlength="40"
          onblur="saveLabel('\${card.cardNumber}')" onkeydown="if(event.key==='Enter')saveLabel('\${card.cardNumber}');if(event.key==='Escape')cancelLabel('\${card.cardNumber}')">
      </td>
      <td class="td-number">\${card.cardNumber}<span class="copy-btn" onclick="copyText('\${card.cardNumber}', this)" title="Copy">⎘</span></td>
      <td class="td-balance \${isLow ? 'low' : ''}" id="bal-\${card.cardNumber}">\$\${parseFloat(card.balance).toFixed(2)}</td>
      <td class="td-pin">\${card.pin || '—'}</td>
      <td class="td-issued">\${dateStr}</td>
      <td class="td-barcode"><svg id="\${svgId}"></svg></td>
      <td class="td-actions">
        <button class="btn-icon btn-add"   onclick="openAddBalance('\${card.cardNumber}')">+ Bal</button>
        <button class="btn-icon btn-reset" onclick="resetCard('\${card.cardNumber}')">Reset</button>
        <button class="btn-icon btn-hist"  onclick="openHistory('\${card.cardNumber}')">History</button>
        <button class="btn-icon btn-del"   onclick="openDelete('\${card.cardNumber}')">Delete</button>
      </td>\`;
    tbody.appendChild(tr);
    JsBarcode('#' + svgId, card.cardNumber, { format: 'CODE128', width: 1.0, height: 36, displayValue: false, margin: 2 });
    const svgEl = document.getElementById(svgId);
    if (svgEl) { svgEl.setAttribute('width', '155'); svgEl.setAttribute('height', '36'); svgEl.setAttribute('preserveAspectRatio', 'none'); }
  });
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('click', e => {
  ['modal-add','modal-hist','modal-del','modal-bulk'].forEach(id => {
    if (e.target === document.getElementById(id)) closeModal(id);
  });
});

function editLabel(cardNumber) {
  document.getElementById('lbl-' + cardNumber).style.display = 'none';
  const input = document.getElementById('lbl-input-' + cardNumber);
  input.style.display = 'inline-block'; input.focus(); input.select();
}
function cancelLabel(cardNumber) {
  document.getElementById('lbl-input-' + cardNumber).style.display = 'none';
  document.getElementById('lbl-' + cardNumber).style.display = 'inline-block';
}
async function saveLabel(cardNumber) {
  const input = document.getElementById('lbl-input-' + cardNumber);
  const span = document.getElementById('lbl-' + cardNumber);
  const label = input.value.trim();
  await fetch('/label', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardNumber, label }) });
  input.style.display = 'none';
  span.style.display = 'inline-block';
  span.textContent = label || 'Add label';
  span.className = 'label-text' + (label ? '' : ' empty');
}

function openAddBalance(cardNumber) {
  activeCard = cardNumber;
  document.getElementById('add-card-num').textContent = cardNumber;
  document.getElementById('add-amount').value = '';
  document.getElementById('add-error').style.display = 'none';
  openModal('modal-add');
}
async function submitAddBalance() {
  const amount = parseFloat(document.getElementById('add-amount').value);
  const errEl = document.getElementById('add-error');
  errEl.style.display = 'none';
  if (!amount || amount <= 0) { errEl.textContent = 'Please enter a valid amount.'; errEl.style.display = 'block'; return; }
  const res = await fetch('/add-balance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardNumber: activeCard, amount }) });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'Failed to add balance.'; errEl.style.display = 'block'; return; }
  closeModal('modal-add');
  const balEl = document.getElementById('bal-' + activeCard);
  if (balEl) { balEl.textContent = '$' + parseFloat(data.balance).toFixed(2); balEl.className = 'td-balance' + (data.balance < 10 ? ' low' : ''); }
}

async function resetCard(cardNumber) {
  const res = await fetch('/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardNumber }) });
  const data = await res.json();
  if (!res.ok) { alert(data.error || 'Reset failed.'); return; }
  const balEl = document.getElementById('bal-' + cardNumber);
  if (balEl) { balEl.textContent = '$' + parseFloat(data.balance).toFixed(2); balEl.className = 'td-balance' + (data.balance < 10 ? ' low' : ''); }
}

async function submitBulkIssue() {
  const amount = parseFloat(document.getElementById('bulk-amount').value);
  const count = parseInt(document.getElementById('bulk-count').value) || 1;
  const errEl = document.getElementById('bulk-error');
  const resultEl = document.getElementById('bulk-result');
  errEl.style.display = 'none'; resultEl.style.display = 'none';
  if (!amount || amount <= 0) { errEl.textContent = 'Please enter a valid amount.'; errEl.style.display = 'block'; return; }
  const res = await fetch('/bulk-issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, count }) });
  const cards = await res.json();
  if (!res.ok) { errEl.textContent = cards.error || 'Failed to issue cards.'; errEl.style.display = 'block'; return; }
  resultEl.innerHTML = \`Issued \${cards.length} card\${cards.length !== 1 ? 's' : ''} at \$\${parseFloat(amount).toFixed(2)} each.\`;
  resultEl.style.display = 'block';
  await loadCardList();
}

async function openHistory(cardNumber) {
  activeCard = cardNumber;
  document.getElementById('hist-card-num').textContent = cardNumber;
  document.getElementById('hist-body').innerHTML = '<div style="text-align:center;padding:20px;color:#aaa;font-size:13px;">Loading...</div>';
  openModal('modal-hist');
  const res = await fetch('/history?card=' + encodeURIComponent(cardNumber));
  const txns = await res.json();
  if (!txns.length) { document.getElementById('hist-body').innerHTML = '<div style="text-align:center;padding:20px;color:#aaa;font-size:13px;">No transactions yet.</div>'; return; }
  const rows = [...txns].reverse().map(t => {
    const date = new Date(t.ts).toLocaleString();
    const amtStr = t.amount != null ? '$' + parseFloat(t.amount).toFixed(2) : '—';
    const balStr = t.balanceAfter != null ? '$' + parseFloat(t.balanceAfter).toFixed(2) : '—';
    return \`<tr><td>\${date}</td><td><span class="txn-badge txn-\${t.type}">\${t.type.replace(/_/g,' ')}</span></td><td style="text-align:right">\${amtStr}</td><td style="text-align:right;font-weight:600">\${balStr}</td></tr>\`;
  }).join('');
  document.getElementById('hist-body').innerHTML = \`<table class="hist-table"><thead><tr><th>Date</th><th>Type</th><th style="text-align:right">Amount</th><th style="text-align:right">Balance After</th></tr></thead><tbody>\${rows}</tbody></table>\`;
}

function openDelete(cardNumber) {
  activeCard = cardNumber;
  document.getElementById('del-card-num').textContent = cardNumber;
  openModal('modal-del');
}
async function submitDelete() {
  const res = await fetch('/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardNumber: activeCard }) });
  if (res.ok) {
    closeModal('modal-del');
    const row = document.getElementById('row-' + activeCard);
    if (row) row.remove();
    const tbody = document.getElementById('gc-tbody');
    if (tbody && tbody.rows.length === 0) {
      document.getElementById('card-list-body').innerHTML = '<div class="empty-state">No cards issued yet.</div>';
      document.getElementById('list-count').textContent = '';
    } else {
      const cur = parseInt(document.getElementById('list-count').textContent) - 1;
      document.getElementById('list-count').textContent = cur + ' card' + (cur !== 1 ? 's' : '');
    }
  }
}

function printSheet() {
  const grid = document.getElementById('print-grid');
  grid.innerHTML = '';
  allCards.filter(c => c.active).forEach((card, idx) => {
    const svgId = 'pbc-' + idx;
    const label = card.label ? \`<div style="font-weight:600;margin-bottom:2px;">\${card.label}</div>\` : '';
    const div = document.createElement('div');
    div.className = 'print-card';
    div.innerHTML = \`\${label}<div class="print-card-num">\${card.cardNumber}</div><div class="print-card-meta">Balance: \$\${parseFloat(card.balance).toFixed(2)} &nbsp;|&nbsp; PIN: \${card.pin || '—'}</div><svg id="\${svgId}"></svg>\`;
    grid.appendChild(div);
    JsBarcode('#' + svgId, card.cardNumber, { format: 'CODE128', width: 1.8, height: 50, displayValue: false, margin: 4 });
  });
  window.print();
}

function copyLatest() {
  const num = document.getElementById('res-number').textContent;
  copyText(num, null);
  const el = document.getElementById('copy-success');
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 2000);
}
function copyText(text, el) {
  navigator.clipboard.writeText(text).then(() => {
    if (el) { el.textContent = '✓'; setTimeout(() => el.textContent = '⎘', 1500); }
  });
}

loadCardList();
</script>
</body>
</html>`;
}

// ── Router ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    if (method === "POST" && url.pathname === "/") {
      const ct = request.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) return handleJsonRpc(request, env);
    }
    if (method === "POST" && url.pathname === "/issue")         return handleIssue(request, env);
    if (method === "POST" && url.pathname === "/add-balance")   return handleAddBalance(request, env);
    if (method === "POST" && url.pathname === "/reset")         return handleResetBalance(request, env);
    if (method === "POST" && url.pathname === "/label")         return handleSetLabel(request, env);
    if (method === "POST" && url.pathname === "/bulk-issue")    return handleBulkIssue(request, env);
    if (method === "POST" && url.pathname === "/delete")        return handleDeleteCard(request, env);
    if (method === "GET"  && url.pathname === "/history")       return handleGetHistory(request, env);
    if (method === "GET"  && url.pathname === "/balance")       return handleBalanceLookup(request, env);
    if (method === "GET"  && url.pathname === "/cards")         return handleListCards(env);
    if (method === "GET"  && url.pathname === "/debug") {
      const last = await env.GC_STORE.get("__debug_last_request");
      const log  = await env.GC_STORE.get("__debug_log");
      return new Response(
        "=== LAST REQUEST ===\n" + (last || "none") + "\n\n=== RECENT CALLS (newest last) ===\n" + (log ? JSON.stringify(JSON.parse(log), null, 2) : "none"),
        { headers: { "Content-Type": "text/plain" } }
      );
    }
    if (method === "GET" && url.pathname === "/") {
      return new Response(portalHtml(), { headers: { "Content-Type": "text/html" } });
    }

    return new Response("Not Found", { status: 404 });
  }
};
