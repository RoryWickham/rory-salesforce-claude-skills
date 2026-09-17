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
> CMS → Store Management → Integrations → Gift Cards → Create
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

First, ask:

> "Are you setting up a **new** gift card worker, or **updating an existing one** to the latest portal layout?"

**If UPDATING an existing worker:**

Search for existing gift card worker folders:
```bash
ls ~/claude-projects/*/worker.js 2>/dev/null | sed 's|/worker.js||' | sed 's|.*/||'
```

Suggest the most likely match based on the customer context and ask:
> "Is your existing worker at `~/claude-projects/[suggested-folder]/`? Or is it somewhere else?"

Once confirmed, read the existing `wrangler.toml` to get the worker name and KV namespace ID — no need to re-ask for those. Then skip directly to **Updating an existing worker** at the bottom of this skill. Stop here and do not continue with Steps 1–10.

---

**If NEW worker:** Ask:

> "Do you already have a Cloudflare account with Workers set up, and have you used `wrangler` before?"

**If NO (or unsure):** Walk them through setup before asking anything else:

> "No problem — here's how to get set up (it's free and takes about 5 minutes):
>
> 1. Create a free account at **dash.cloudflare.com** if you don't have one — use your Salesforce email address
> 2. Once logged in, go to **Workers & Pages** in the left sidebar — this activates Workers on your account and assigns you a `[name].workers.dev` subdomain
> 3. Note your subdomain — it's shown at the top of the Workers & Pages page (e.g. `rory-wickham.workers.dev`)
> 4. Make sure Node.js is installed (`node -v` in terminal — if not, install from nodejs.org)
> 5. Log in to wrangler by running: `! npx wrangler login`
>    - This opens a browser window — authorize it, then come back here
>
> Once that's done, let me know and I'll continue."

Wait for confirmation before proceeding to the main questions.

**If YES:** Proceed directly to the main questions below.

---

Say to the user:

> "I'm going to deploy a mock GIVEX gift card service to Cloudflare Workers for you. Here's what I need to know first:
>
> 1. **What's your Cloudflare account subdomain?**  
>    It's the `[name]` in URLs like `[name].workers.dev`. Find it at dash.cloudflare.com → Workers & Pages.
>
> 2. **What name do you want for the Worker?** This becomes part of the URL (e.g. `acme-gift-card` → `acme-gift-card.[subdomain].workers.dev`). Keep it short and brand-appropriate.
>
> 3. **What's the URL of the customer's storefront?** I'll pull their logo and brand colors so the portal looks on-brand rather than generic."

Wait for all three answers before proceeding.

**Note:** Even if the user says they're set up, `wrangler` may still prompt for login on first use. If Step 5 returns an authentication error, tell them to run `! npx wrangler login` and then retry.

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

If the command fails with "A KV namespace with the title 'GC_STORE' already exists", that namespace belongs to a different worker. Create a customer-specific one instead (e.g. `PM_GC_STORE` for Peter Millar) to avoid data mixing — the binding in `wrangler.toml` stays `GC_STORE`, only the namespace title and id change:

```bash
npx wrangler kv namespace create [CUSTOMER]_GC_STORE
```

Update `wrangler.toml` `id` with the new namespace id.

---

## Step 6 — Build `worker.js` from the canonical template

**Do not write the worker from scratch.** Copy the canonical template and substitute brand values — this ensures consistent portal layout across all customers.

```bash
cp ~/.claude/commands/salesforce/retail-cloud/gift-card-worker-template.js ~/claude-projects/[worker-name]/worker.js
```

Then run this Python substitution to apply brand values:

```bash
python3 - <<'EOF'
import pathlib

p = pathlib.Path('~/claude-projects/[worker-name]/worker.js').expanduser()
content = p.read_text()
content = content.replace('{{BRAND_NAME}}',    '[Brand Name]')
content = content.replace('{{PRIMARY_COLOR}}', '[#primary]')
content = content.replace('{{ACCENT_COLOR}}',  '[#accent]')
p.write_text(content)
print("Brand values substituted")
EOF
```

Then inject the logo as base64 (**do not pass base64 through the Write tool** — it causes API timeouts):

```bash
python3 - <<'EOF'
import base64, pathlib
logo = pathlib.Path('/path/to/logo.png').read_bytes()
data_uri = 'data:image/png;base64,' + base64.b64encode(logo).decode()
p = pathlib.Path('~/claude-projects/[worker-name]/worker.js').expanduser()
p.write_text(p.read_text().replace('{{LOGO_PLACEHOLDER}}', data_uri))
print(f"Done — {len(data_uri)} chars injected")
EOF
```

**Logo notes:**
- The template header already has `filter: brightness(10)` on the img — this renders a dark/navy logo as white on a dark header
- If logo extraction failed or the image is too large (>100KB), replace `{{LOGO_PLACEHOLDER}}` with an empty string — the `onerror` handler hides the img tag automatically
- If the customer already has a white logo variant in the project folder, use that instead

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
> 1. Go to **CMS → Store Management → Integrations → Gift Cards → Create**
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

## Updating an existing worker

The fastest path to get current is a full redeploy from the template — not a surgical patch. The KV namespace is untouched so all existing cards survive.

**1. Read the existing `wrangler.toml`** to confirm the worker name and KV namespace ID — no need to ask the user for these.

**2. Extract the current brand values** from the existing `worker.js` — grep for the `.header { background:` color and any accent color in use. Show the user what was found:
> "Found: primary color `#XXXXXX`, accent `#XXXXXX`, brand name `[name]`. Does that still look right?"

Wait for confirmation before proceeding.

**3. Copy the latest template:**
```bash
cp ~/.claude/commands/salesforce/retail-cloud/gift-card-worker-template.js ~/claude-projects/[worker-name]/worker.js
```

**4. Re-run brand substitution** (same as Step 6 of the new build flow) with the confirmed values.

**5. Re-inject the logo.** Check if there's already a white logo variant in the project folder:
```bash
ls ~/claude-projects/[worker-name]/*.png 2>/dev/null
```
Use it if present. Otherwise re-extract from the storefront or ask the user to point to the logo file.

**6. Redeploy:**
```bash
cd ~/claude-projects/[worker-name] && npx wrangler deploy
```

**7.** Confirm the worker URL from the output and tell the user the portal is updated. No changes to `wrangler.toml` or CMS settings are needed.

---

## Critical rules

- **seqId must echo `params[1]`** — never generate a new value for `result[0]`. The POS validates this. Getting it wrong causes "Order Failed" errors.
- **All amounts are decimal dollars** — `"50.00"` not `"5000"`. Returning an integer for the balance renders as millions of dollars in POS.
- **POS uses `dc_994`, `dc_902`, and `dc_907`** — not `dc_946`/`dc_947` as the GIVEX docs suggest. Always handle all three. `dc_907` is an alternate redemption method the POS uses in some checkout flows instead of `dc_902` — same param layout, must route to the same handler.
- **KV filter** — always filter `k.name.startsWith("__")` when listing cards. Without this, transaction log and debug keys appear as card rows.
- **Trailing slash on endpoint URL** — Retail Cloud CMS requires it. Without the slash the GIVEX calls may fail to route.
- If a card worked fine then started requiring a second scan, it was likely scanned during a broken-response period (debugging). Issue a fresh card — it will work on first scan.
- **Always use the canonical template** (`gift-card-worker-template.js`) — never write the worker from scratch. The template uses JS template literals for the card list (not string concatenation), which avoids the `\'`/`&apos;` quoting bug entirely. If you modify the template, keep the card list rows using template literals.
