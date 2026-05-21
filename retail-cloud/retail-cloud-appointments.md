---
description: Build a self-contained appointments calendar web app for Retail Cloud (PredictSpring) POS, hosted on Cloudflare Workers and surfaced via App Extensions iFrame. Two-panel layout: calendar on the left, appointment cards on the right. Appointments are seeded by date for consistency across reloads. Use when someone wants to show scheduled appointments inside the POS.
---

# Retail Cloud Appointments App Builder

This skill builds a two-panel appointments calendar app for the Retail Cloud (PredictSpring) POS, hosted on Cloudflare Workers.

## Step 1 — Understand the use case

Ask the user:

> "What kind of business or vertical is this for? (e.g. auto service, salon, home improvement, retail fitting rooms) This drives the appointment types and branding."

> "What should each appointment card show? Default is: customer name, appointment type, time, and phone number. Are there any additional fields specific to your use case — like a bay number, technician, room, or stylist?"

> "Is there a specific fixed appointment you'd like to always appear on today's date? (e.g. a named customer with a specific service and time — useful for demos)"

## Step 2 — Branding

Ask:

> "What branding should it use? Tell me: company or product name, primary color for the calendar panel background, and accent color for selected dates and highlights. Or just say 'default' and I'll use a clean dark/blue style."

## Step 3 — Appointment types

Based on the vertical, suggest a list of 6–8 appointment types and confirm with the user before proceeding. Examples by vertical:

- **Auto service:** Oil Change, Tire Rotation, Wheel Alignment, Brake Inspection, Strut Replacement, Tire Replacement, Battery Check, Multi-Point Inspection
- **Salon/spa:** Haircut, Color & Highlights, Blowout, Manicure, Pedicure, Facial, Massage
- **Home improvement:** Kitchen Renovation, Bath Remodel, Design Consultation, Flooring Install, Porch/Patio Renovation
- **Retail:** Personal Styling, Alterations, VIP Shopping, Gift Wrapping, Loyalty Consultation

## Step 4 — Build the app

Build two files in `~/claude-projects/<name>-appointments/`:

### `src/data.js` — appointment generation logic

- Large name pools (100+ first names, 100+ last names) for random customer names
- Random phone numbers with two area codes
- Appointment types array from Step 3
- Time slots on the hour or half-hour between 10:00 AM and 3:30 PM, each 30 minutes long
- `getAppointments(year, month, day)` — returns seeded appointments for a given date:
  - Only generate appointments for days within the current calendar month; all other months return `[]`
  - Seed by `year * 100000 + month * 1000 + day * 7` for consistency across reloads
  - 0–4 randomly generated appointments per day
  - No two appointments share the same time slot
  - If a fixed appointment was requested, always include it on today's date, sorted first by time
  - Each appointment includes: name, type, time, phone, plus any extra fields from Step 1
  - Extra fields (e.g. bay, technician) should have their own pools and be randomly assigned
- `hasDayAppointments(year, month, day)` — returns true if the day has any appointments (used for calendar dots); only returns true for current month

### `src/index.js` — server-side rendered Worker

- Reads `?year=`, `?month=`, `?day=` query params; defaults to today
- All navigation (month arrows, day selection) uses `window.location.href` with query string — no client-side state
- Two-panel layout:
  - **Left panel** (calendar): uses the brand's primary color as background. Month navigation arrows, day-of-week headers, day grid. Today gets a subtle white ring when not selected. Selected day uses the accent color. Days with appointments show a small dot below the number.
  - **Right panel** (appointments): white/light background. Selected date as heading with appointment count subtitle. Appointment cards with a left border accent in the accent color. Each card shows the fields from Step 1. Empty state message if no appointments.
- Response headers: `Content-Type: text/html;charset=UTF-8` and `X-Frame-Options: ALLOWALL`

### `wrangler.toml`
```toml
name = "<name>-appointments"
main = "src/index.js"
compatibility_date = "2024-01-01"
```

### `package.json`
```json
{
  "name": "<name>-appointments",
  "version": "1.0.0",
  "private": true,
  "devDependencies": { "wrangler": "^3.0.0" },
  "scripts": { "deploy": "wrangler deploy", "dev": "wrangler dev" }
}
```

## Step 5 — Deploy to Cloudflare Workers

```bash
cd ~/claude-projects/<name>-appointments && npm install && npx wrangler deploy
```

If not logged in: `npx wrangler login` (use a personal Cloudflare account, not a work/SSO account).

## Step 6 — Wire into Retail Cloud

Tell the user:

> "Your appointments app is live at: **[URL]**
>
> To surface it in the POS:
> 1. Go to Retail Cloud CMS → open the Layout you want to add it to
> 2. Find the cell and click to edit it
> 3. Under **Deep Link**, select **Webview via URL**
> 4. Under **URL Options**, select **Custom URL**
> 5. Paste **[URL]** into the URL field
> 6. Save and publish the layout"

## Step 7 — Iterate

Ask: "How does it look? Any changes to the appointment types, card fields, colors, or branding?"

Make changes to `src/data.js` or `src/index.js` directly, then redeploy with `npx wrangler deploy`.

## Reference implementation

The Goodyear Auto Service appointments app at `https://appointments-worker.rory-wickham.workers.dev` is the canonical reference for this skill:
- Primary color: `#1a1a1a` (black), accent: `#f4c00a` (Goodyear yellow)
- Appointment types: Oil Change, Tire Rotation, Wheel Alignment, Brake Inspection, Strut Replacement, Tire Replacement, Battery Check, Multi-Point Inspection
- Extra card fields: Bay (1–4), Technician (pool of 10 names)
- Fixed appointment: Rachel Morris, Wheel Alignment, 10:30 AM, Bay 2, J. Alvarez
- Source files: `~/claude-projects/appointments-worker/`

## Critical rules

- `src/data.js` and `src/index.js` are the source of truth — edit them directly, no sync script needed (unlike the tile skill)
- Appointments must only be generated for the current calendar month — other months return empty
- Seeding must be deterministic so appointments don't change on reload
- No client-side JS state — all navigation via query string
- Response must include `X-Frame-Options: ALLOWALL` for iFrame compatibility
- Use a personal Cloudflare account to avoid login issues
