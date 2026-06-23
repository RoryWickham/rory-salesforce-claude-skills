---
description: Build a custom Retail Cloud POS tile experience as a hosted web app loaded in a native WebView. Use when someone wants to create a custom tile/cell in the Retail Cloud POS layout that displays dynamic or pre-canned content. The app is hosted on Cloudflare Workers and surfaced in the POS via a Deep Link set to "Webview via URL" — it renders inside the POS app like an iFrame but is technically a native WebView.
---

# Retail Cloud Custom Tile Builder

This skill guides you through building a custom iFrame tile experience for the Retail Cloud (PredictSpring) POS, hosted on Cloudflare Workers.

## Step 1 — Understand the experience

Ask the user:

> "What do you want this tile to do? For example: look something up by ID and return details, display a calculator, show a form, present product recommendations, etc."

Then ask:

> "What data should it return or display? Give me as much detail as you can — field names, sample values, anything pre-canned you want to show in the demo."

## Step 2 — Branding

Ask:

> "What branding should it use? Tell me: the company or product name, a primary color (or just say 'default' and I'll use a clean neutral style), and whether there's a logo letter or icon you'd like in the header."

## Step 3 — Build the app

Based on the answers, build a self-contained `index.html` in `~/claude-projects/` that:

- Has a clean header with the brand name and color
- Has whatever input, display, or interaction the user described
- Uses hardcoded/pre-canned data for the demo (no real backend needed)
- Includes a fake loading delay (1.2–1.5 seconds) with a spinning logo overlay so it feels like a live lookup
- Is fully self-contained — no external dependencies, no CDN links, everything inline

Design principles:
- Mobile-first, works well in a narrow iFrame (360–480px wide)
- Clean card-based layout
- Subtle box shadows, rounded corners, readable font sizes
- Use the brand's primary color for the header background, buttons, and accents
- Error state if required input is missing or invalid

**If the experience involves looking something up by ID or code**, add a barcode scanner to the search input:
- Embed a small camera icon inside the right edge of the input field (no background, just the icon — like Google's search bar)
- Use a `.input-wrap` div with `position: relative` to contain the input and the absolutely-positioned icon button
- Use `background: none !important` on the scan button so it doesn't inherit button styles
- Tapping the icon opens a full-screen camera overlay with a Cancel button
- Use **Quagga2** for scanning — it's the only library that reliably handles 1D barcodes (Code 128, Code 39) in iOS WebViews. Load it from CDN: `<script src="https://cdn.jsdelivr.net/npm/@ericblade/quagga2/dist/quagga.min.js"></script>`
- Do NOT use `BarcodeDetector` (not available in iOS WebViews) or `html5-qrcode` (poor 1D barcode support on iOS)
- Do NOT pass `formatsToSupport` or numeric format codes — it causes silent init failures on iOS
- Quagga2 decoder readers to use: `['code_128_reader', 'code_39_reader', 'ean_reader', 'upc_reader']`
- On successful scan: call `Quagga.stop()`, hide the overlay, populate the input, auto-trigger the lookup
- Note: hand scanners (USB/Bluetooth) act as keyboards and work automatically with no extra code — they type into the focused input and send Enter

## Step 4 — Set up and deploy to Cloudflare Workers

1. Create `~/claude-projects/<tilename>-tile/` with `index.html`, `worker.js`, and `wrangler.toml`

2. `worker.js` should:
   - Serve the HTML on `GET /`
   - Optionally expose a `POST /lookup` endpoint if needed
   - Include CORS headers

3. `wrangler.toml` should be minimal:
   ```toml
   name = "<tilename>-tile"
   main = "worker.js"
   compatibility_date = "2024-11-01"
   account_id = "4586c3c345576c865f390e7d9c9a34df"
   ```

4. Use this sync command to keep `worker.js` in sync with `index.html` after any edits:
   ```bash
   python3 - <<'PYEOF'
   with open('index.html', 'r') as f:
       html = f.read()
   html_escaped = html.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')

   WORKER = 'const HTML = `' + html_escaped + '''`;

   export default {
     async fetch(request) {
       const url = new URL(request.url);
       if (url.pathname === "/" || url.pathname === "") {
         return new Response(HTML, {
           headers: {
             "Content-Type": "text/html;charset=UTF-8",
             "Cache-Control": "no-cache",
             "X-Frame-Options": "ALLOWALL",
             "Access-Control-Allow-Origin": "*",
           },
         });
       }
       return new Response("Not found", { status: 404 });
     },
   };
   '''

   with open('worker.js', 'w') as f:
       f.write(WORKER)
   print("Sync complete.")
   PYEOF
   ```

   > **Why this approach:** Do NOT use `re.sub` to replace the `const HTML = \`...\`;` block in the existing worker.js. The regex stops at the first `` `; `` it finds in the worker footer JS, corrupting the file. Always write worker.js from scratch on each sync.

5. Check if wrangler is installed:
   ```bash
   cd ~/claude-projects/<tilename>-tile && npx wrangler --version
   ```
   If not: `npm init -y && npm install --save-dev wrangler`

6. Log in to Cloudflare (one-time, opens browser):
   ```bash
   npx wrangler login
   ```
   - Use a **personal email** to sign up/log in — do not use a work Google account
   - If prompted to register a `workers.dev` subdomain, go to `dash.cloudflare.com` → Workers & Pages → complete onboarding

7. Deploy:
   ```bash
   npx wrangler deploy
   ```

   This will output a URL like `https://<tilename>-tile.<subdomain>.workers.dev`

## Step 5 — Test it

Run the app in a browser at the deployed URL and verify it works end to end before handing off.

## Step 6 — Wire it into Retail Cloud

Tell the user:

> "Your tile is live at: **[URL]**
>
> To add it to your POS layout in Retail Cloud:
>
> 1. Go to your Retail Cloud CMS and open the **Layout** you want to add the tile to
> 2. Find the cell where you want the tile to appear and click to edit it
> 3. Under **Deep Link**, select **Webview via URL**
> 4. Under **URL Options**, select **Custom URL**
> 5. Paste **[URL]** into the URL field
> 6. Save and publish the layout
>
> The tile will now appear in that cell in the POS app and load your experience in an iFrame."

## Step 7 — Iterate

Ask: "How does it look? Any changes to the layout, data, colors, or copy?"

Make changes to `index.html`, re-run the sync command, then redeploy with `npx wrangler deploy`.

## Critical rules

- Always edit `index.html` as the source of truth — never edit the HTML string inside `worker.js` directly
- Always run the sync command before deploying
- Keep everything self-contained in the HTML — no external JS/CSS libraries
- The app must work in a narrow iFrame — test at ~400px wide
- Use a personal Cloudflare account, not a work/SSO account, to avoid login issues
- ZScaler may block Netlify — Cloudflare Workers is the preferred hosting option
- GitHub Pages is a fallback if Cloudflare isn't available (requires public repo or paid plan for Pages on private repos)
