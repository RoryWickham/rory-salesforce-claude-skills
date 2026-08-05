---
description: Set up a mock GIVEX gift card service (Cloudflare Worker + KV) for a Retail Cloud demo, with a branded portal to issue and manage gift cards. Use when someone wants to demo gift card functionality in Retail Cloud POS without a real GIVEX account.
---

# Retail Cloud Mock Gift Card Service

This skill deploys a self-contained mock GIVEX gift card service on Cloudflare Workers — no real GIVEX account needed. It gives you a working GIVEX endpoint you can point Retail Cloud CMS at, plus a branded web portal to issue and manage cards before a demo.

## What you'll get

**The service (Cloudflare Worker + KV):**
- A GIVEX JSON-RPC endpoint that Retail Cloud POS talks to — handles balance checks (`dc_994`) and redemptions (`dc_902`)
- Cards stored persistently in Cloudflare KV — survive deploys and session restarts
- Full transaction history per card (issued, redeemed, balance added, reset)
- Debug endpoint (`/debug`) to inspect the last POS request — useful if something goes wrong mid-demo

**The portal (web UI at the same URL):**
- Issue single cards with a custom amount and optional PIN
- Bulk issue N cards at once (same amount each)
- All cards listed with live barcodes you can scan directly in POS
- Per-card actions: add balance, reset to original issued amount, view transaction history, delete
- Inline label/nickname field for each card (e.g. "Rory demo card", "$50 for checkout demo")
- Print sheet — browser-print-optimized grid of all active cards with barcodes, balance, and PIN

**Retail Cloud CMS setup (you do this once):**
> CMS → Store Management → Store Settings → Advanced → Gift Card Integration
> - Service: **GIVEX**
> - Store: your store number
> - Card Type: **GiftCard**
> - Currency: **USD**
> - Transaction ID Format: **DEFAULT**
> - Username / Password: any value (mock ignores credentials)
> - Endpoint URL: the Worker URL you'll get after deploy
> - Allow Gift Card Purchase: ✓
> - Require Activation: leave unchecked

---

## Before we start

Say to the user:

> "I'm going to deploy a mock GIVEX gift card service to Cloudflare Workers for you. Here's what I need to know first:
>
> 1. **What's your Cloudflare account subdomain?**  
>    It's the `[name]` in URLs like `[name].workers.dev`. Check at dash.cloudflare.com → Workers & Pages. If you don't have one, we'll create the worker and it'll use your default subdomain.
>
> 2. **What name do you want for the Worker?** This becomes part of the URL (e.g. `acme-gift-card` → `acme-gift-card.[subdomain].workers.dev`). Keep it short and brand-appropriate.
>
> 3. **What's the URL of the customer's storefront?** I'll pull their logo and brand colors so the portal looks on-brand rather than generic."

Wait for all three answers before proceeding.

---

## Step 1 — Check for updates

```bash
git -C ~/.claude/commands/salesforce fetch origin main --quiet 2>/dev/null
git -C ~/.claude/commands/salesforce status -uno 2>/dev/null
```

- If **"Your branch is behind"**: tell the user to run `git -C ~/.claude/commands/salesforce pull` and re-invoke the skill. Stop here.
- If up to date or folder doesn't exist: proceed silently.

---

## Step 2 — Extract brand identity from the storefront URL

Use the browser tool to visit the customer's storefront URL. Look for:

1. **Logo** — find the `<img>` tag for the site logo (usually in `<header>`). Get the `src` URL. Download it with curl to a temp path, convert to base64.
2. **Primary brand color** — check for:
   - CSS custom properties (`--color-primary`, `--brand-color`, etc.) in `<style>` blocks or linked stylesheets
   - Dominant color on CTA buttons (`.btn-primary`, `[class*="button"]`)
   - Background colors on the header or nav bar
   - If none found: use `#1a1a1a` (dark neutral) as a safe default
3. **Secondary/accent color** — look for a highlight or accent color used alongside the primary. Default to `#f5f5f5` if not found.
4. **Font family** — note the body font if it's a Google Font or common system font. Default to `system-ui, sans-serif` if custom fonts require loading.

Tell the user what you found:
> "Found: logo at `[url]`, primary color `#XXXXXX`, accent `#XXXXXX`. Does that look right, or would you like to adjust anything?"

Wait for confirmation or corrections before building the worker.

If the storefront URL is inaccessible or returns an error, tell the user and ask if they want to provide brand colors manually or use generic Crocs-style defaults.

---

## Step 3 — Create the project folder

Create a folder at `~/claude-projects/[worker-name]/` (using the name from the user's answer). All files go here.

---

## Step 4 — Create `wrangler.toml`

```toml
name = "[worker-name]"
main = "worker.js"
compatibility_date = "2024-11-01"

[[kv_namespaces]]
binding = "GC_STORE"
id = "PLACEHOLDER"
```

---

## Step 5 — Create the KV namespace

Run:
```bash
cd ~/claude-projects/[worker-name] && npx wrangler kv namespace create GC_STORE
```

Parse the output for the namespace `id` and update `wrangler.toml` with the real value.

---

## Step 6 — Build `worker.js`

Build the complete worker with the brand identity extracted in Step 2 applied to the portal. The worker is a single `worker.js` file with all logic inline — no external dependencies except JsBarcode via CDN in the portal HTML.

**Brand customizations to apply:**
- Portal header: use the customer's brand name (derived from the domain/logo) instead of "Crocs"
- Header background color: use the primary brand color (or keep black if primary is light — ensure contrast)
- "Issue Card" button and active state accents: use the primary brand color
- "Mock Service" badge color: use the accent color
- Gift card graphic gradient: use the primary brand color as the dark end
- Logo in the header: embed as a base64 data URI — but **do not pass it through the Write tool** (35KB+ of base64 causes API timeouts). Instead:
  1. Write `worker.js` with `LOGO_PLACEHOLDER` as the `src` attribute value
  2. Inject the real base64 via Python after the fact:
     ```bash
     python3 - <<'EOF'
     import base64, pathlib
     logo = pathlib.Path('/tmp/logo.png').read_bytes()
     data_uri = 'data:image/png;base64,' + base64.b64encode(logo).decode()
     p = pathlib.Path('~/claude-projects/[worker-name]/worker.js').expanduser()
     p.write_text(p.read_text().replace('LOGO_PLACEHOLDER', data_uri))
     print(f"Done — {len(data_uri)} chars injected")
     EOF
     ```
  3. If the logo is a dark/colored image on a light background, add `filter: invert(1) brightness(10)` to the `<img>` CSS to render it white on a dark header
  4. If logo extraction failed or the image is too large, fall back to a styled text header instead
- Font: apply the detected font family in the portal's CSS

**Functional requirements (must match the reference implementation exactly):**

- GIVEX JSON-RPC handler for methods: `dc_994`, `dc_946`, `dc_995` → balance; `dc_902`, `dc_907`, `dc_947` → redeem; `dc_901` → activate; `dc_948` → void
  - `dc_907` has the same param layout as `dc_902`: `[lang, seqId, user, pass, cardNumber, amount, pin]`
- Balance result format: `[seqId, "0", "50.00", "0", "None", "USD", "", "", "", "", transRef]`
  - `result[0]` = echo of `params[1]` (seqId string like "PS00000172") — NOT generated
  - `result[2]` = balance as decimal dollars string — NOT cents
- Redemption result format: `[seqId, "0", transId, amountRedeemed, remainingBalance, "None", "", "", "", "", transRef, "", "", ""]`
- Result codes: `"0"` = OK, `"7"` = invalid card, `"5"` = inactive, `"11"` = insufficient funds
- Card storage in KV: `{ balance, issuedAmount, pin, active, createdAt, label? }`
- Transaction log in KV: key `__txn_<cardNumber>`, value = array of `{ ts, type, amount, balanceAfter }`
- Transaction types: `ISSUED`, `REDEEM`, `ADD_BALANCE`, `RESET`
- `/cards` endpoint: filter out keys starting with `__` (debug/txn keys)
- Routes: `POST /` (GIVEX RPC), `GET /` (portal HTML), `POST /issue`, `/add-balance`, `/reset`, `/label`, `/bulk-issue`, `/delete`, `GET /balance`, `/cards`, `/history`, `/debug`

**Portal features:**
- Issue single card (amount + optional PIN)
- Bulk issue (N cards, same amount)
- Card list table: status, label (inline editable), card number (with copy button), balance, PIN, issued date, barcode, actions
- Actions per card: + Balance (modal), Reset (instant, no confirm), History (modal), Delete (confirm modal)
- Print sheet: browser-print grid of all active cards with barcodes, balance, PIN, label
- Refresh button on card list

**Barcode:** JsBarcode via CDN (`https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js`), CODE128 format.

**Critical — onclick quoting in string-concatenated HTML:**  
When building table row HTML via string concatenation (not a template literal), never use `\'` to quote card numbers inside `onclick` attributes. The `\'` in JS source becomes a bare `'` in the rendered HTML, producing broken JS like `onclick="doThing('' + val + '')"` — a SyntaxError that silently prevents the entire `<script>` block from parsing, making every button a no-op.  
**Always use `&apos;` instead:** `onclick="doThing(&apos;' + card.cardNumber + '&apos;)"`. The browser decodes `&apos;` to `'` at attribute-parse time so the JS receives a valid string literal.

---

## Step 7 — Deploy

```bash
cd ~/claude-projects/[worker-name] && npx wrangler deploy
```

Confirm the Worker URL from the output (e.g. `https://[worker-name].[subdomain].workers.dev`).

---

## Step 8 — Smoke test

### 8a — API test
Issue one card to verify the backend works:

```bash
curl -s -X POST https://[worker-url]/issue \
  -H "Content-Type: application/json" \
  -d '{"amount": 50}' | python3 -m json.tool
```

Confirm the response contains `cardNumber`, `pin`, `balance: 50`, and `active: true`.

### 8b — Portal JS integrity check
Fetch the portal HTML and verify the script block is intact and contains no broken onclick quoting:

```bash
curl -s https://[worker-url]/ | python3 - <<'EOF'
import sys, re
html = sys.stdin.read()
script = re.search(r'<script>(.*?)</script>', html, re.DOTALL)
if not script:
    print("FAIL: no <script> block found")
    sys.exit(1)
src = script.group(1)
# issueCard must be defined
if 'function issueCard' not in src:
    print("FAIL: function issueCard missing — script block likely broken")
    sys.exit(1)
# No bare \' in onclick attributes (symptom of the quoting bug)
if "onclick=\"" in html and "\\'" in html:
    print("WARN: possible escaped single-quote in onclick — verify buttons work")
print("OK: script block present, issueCard defined")
EOF
```

If the check prints `FAIL`, the portal buttons will be non-functional. Fix: audit all `onclick` attributes built via string concatenation and replace any `\'` with `&apos;`.

Tell the user the test card number and balance so they can confirm the portal renders it in the card list.

---

## Step 9 — CMS configuration instructions

Tell the user:

> "Your gift card service is live at `https://[worker-url]`. Here's how to wire it up in Retail Cloud CMS:
>
> 1. Go to **CMS → Store Management → Store Settings → Advanced → Gift Card Integration**
> 2. Set **Service** to **GIVEX**
> 3. Set **Store** to your store number (e.g. `107`)
> 4. Set **Card Type** to **GiftCard**
> 5. Set **Currency** to **USD**
> 6. Set **Transaction ID Format** to **DEFAULT**
> 7. Enter anything for **Username** and **Password** (the mock ignores credentials)
> 8. Set **Endpoint URL** to: `https://[worker-url]/`  ← the trailing slash matters
> 9. Check **Allow Gift Card Purchase**
> 10. Leave **Require Activation** unchecked
> 11. Save
>
> To test: open POS, go to checkout, and scan or type any card number you issued via the portal. The balance should appear and you should be able to apply it as a tender.
>
> **Portal:** `https://[worker-url]/` — bookmark this for issuing cards before demos.  
> **Debug:** `https://[worker-url]/debug` — shows the last raw POS request if something looks off."

---

## Step 10 — Quick-reference handoff

Print a clean summary for the user:

```
Gift Card Service — [Brand Name]
─────────────────────────────────────────
Worker URL:    https://[worker-url]/
Portal:        https://[worker-url]/
Debug:         https://[worker-url]/debug
Source:        ~/claude-projects/[worker-name]/
Deploy:        cd ~/claude-projects/[worker-name] && npx wrangler deploy
KV namespace:  GC_STORE ([namespace-id])

CMS: GIVEX integration → Endpoint = https://[worker-url]/
```

---

## Critical rules

- **seqId must echo `params[1]`** — never generate a new value for `result[0]`. The POS validates this. Getting it wrong causes "Order Failed" errors.
- **All amounts are decimal dollars** — `"50.00"` not `"5000"`. Returning an integer for the balance renders as millions of dollars in POS.
- **POS uses `dc_994`, `dc_902`, and `dc_907`** — not `dc_946`/`dc_947` as the GIVEX docs suggest. Always handle all three. `dc_907` is an alternate redemption method the POS uses in some checkout flows instead of `dc_902` — same param layout, must route to the same handler.
- **KV filter** — always filter `k.name.startsWith("__")` when listing cards. Without this, transaction log and debug keys appear as card rows.
- **Trailing slash on endpoint URL** — Retail Cloud CMS requires it. Without the slash the GIVEX calls may fail to route.
- If a card worked fine then started requiring a second scan, it was likely scanned during a broken-response period (debugging). Issue a fresh card — it will work on first scan.
- **`&apos;` not `\'` in onclick attributes** — when building table row HTML via string concatenation, `\'` in JS source becomes a bare `'` in rendered HTML, breaking the entire `<script>` block silently. All buttons become no-ops. Use `&apos;` for single quotes inside HTML attribute values built by string concatenation. Always run the Step 8b portal JS check after deploy to catch this.
