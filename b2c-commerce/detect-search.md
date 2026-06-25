---
description: Detect whether a B2C Commerce storefront is using native SFCC search or a third-party search provider (Algolia, Unbxd, Bloomreach, Constructor, Searchspring, Klevu, Coveo, etc.). Use when the user provides a storefront URL and wants to know which search engine is powering it.
---

# B2C Commerce Search Provider Detector

Given a storefront URL, determine whether search is powered by native SFCC search or a third-party provider, and identify which one.

## Step 1 — Check for updates

Before doing anything else, run:
```bash
git -C ~/.claude/commands/salesforce fetch origin main --quiet 2>/dev/null
git -C ~/.claude/commands/salesforce status -uno 2>/dev/null
```

- If **"Your branch is behind"**: tell the user "Heads up — there's a newer version of this skill available. Run `git -C ~/.claude/commands/salesforce pull` to update before we continue, then re-run the skill." Stop here.
- If up to date: proceed silently.

## Step 2 — Get the URL

If the user hasn't already provided a URL, ask: "What's the storefront URL you'd like me to check?"

Set `TARGET_URL` to the provided URL (strip trailing slash).

## Step 3 — Confirm it's SFCC

Fetch `[TARGET_URL]/robots.txt` using the browser tool (WebFetch will likely return 403 on bot-protected sites).

Look for any of these SFCC fingerprints:
- `demandware.static` anywhere in the file → **confirmed SFCC**
- `Sites-[SiteName]-Site` path pattern → **confirmed SFCC**
- Pipeline-style controller blocks (`/*Cart-Show*`, `/*Product-Show*`, `/*Search*`, `/*COBilling*`, etc.) → **confirmed SFCC**
- `prefn`/`prefv` query param disallows → **strong SFCC signal**

If none of these are present, report: "This doesn't appear to be a Salesforce B2C Commerce site. The robots.txt shows no SFCC fingerprints. Search provider detection may not apply." Then stop.

If confirmed SFCC, note the Site ID from the `Sites-[SiteName]-Site` path.

## Step 4 — Check for third-party search in robots.txt

Still in the robots.txt, scan the allowed/disallowed URL patterns for third-party search signals:

- `unbxd` anywhere → **Unbxd**
- `cnstrc.com` or `constructor` in any URL → **Constructor.io**
- `algolia` in any URL → **Algolia**
- `bloomreach` or `brcloud` in any URL → **Bloomreach**
- `searchspring` in any URL → **Searchspring**
- `klevu` in any URL → **Klevu**
- `coveo` or `cloud.coveo` in any URL → **Coveo**
- `hawksearch` in any URL → **Hawksearch**
- `lucidworks` in any URL → **Lucidworks Fusion**
- `yext` in any URL → **Yext**

If a match is found here, skip to Step 7 with high confidence.

## Step 5 — Check search URL patterns

Navigate the browser to `[TARGET_URL]/search?q=test` (or try `[TARGET_URL]/s/test` if that 404s).

Observe the URL after the page loads — note whether it redirects or stays put.

Then check the search results page URL parameters:
- `?q=` + `prefn`/`prefv` + `srule=` parameters → **native SFCC search**
- `?q=` alone with no SFCC-style refinement params, or unusual param names → investigate further

## Step 6 — Inspect page source for JS fingerprints

On the loaded search results page, use the browser's accessibility tree to look at the page title and any visible text, then navigate to the page source by checking for these known provider JS domains in the page:

Navigate to `[TARGET_URL]/search?q=test` and inspect the HTML for `<script src="...">` tags. Look specifically for:

| Domain fragment | Provider |
|---|---|
| `algolia.net` or `algoliainsights` | Algolia |
| `unbxd.io` or `unbxdapi.com` | Unbxd |
| `bloomreach.com` or `brcloud.com` or `exponea.com` | Bloomreach |
| `cnstrc.com` | Constructor.io |
| `searchspring.io` or `searchspring.net` | Searchspring |
| `klevu.com` | Klevu |
| `cloud.coveo.com` | Coveo |
| `hawksearch.com` | Hawksearch |
| `lucidworks.com` | Lucidworks |
| `yext.com` | Yext |
| `searchanise.io` | Searchanise |
| `doofinder.com` | Doofinder |

Use the Python sandbox (`mcp__plugin_aisuite_aisuite__python`) to scan any saved accessibility tree or page content files in `/tmp/tool-responses/` for these strings.

## Step 7 — Try the SFCC suggest endpoint

Navigate the browser to `[TARGET_URL]/on/demandware.store/Sites-[SiteID]-Site/default/Search-GetSuggestions?q=test`

- If it returns JSON with product suggestions → **native SFCC search confirmed** (this endpoint is SFCC-proprietary)
- If it 404s or returns an error → the suggest endpoint has been replaced, likely by a third-party

If you don't know the Site ID yet, try the generic path: `[TARGET_URL]/Search-GetSuggestions?q=test`

## Step 8 — Check BuiltWith (optional, if still uncertain)

If still undetermined after Steps 3–7, navigate to `https://builtwith.com/[domain]` using the browser tool and look for any listed search/merchandising technology under "Widgets" or "eCommerce" sections.

## Step 9 — Report the verdict

Report using this format:

---

**Search Provider Verdict: [Provider Name or "Native SFCC Search"]**

**Platform:** Salesforce B2C Commerce Cloud (SFRA / SiteGenesis)
**Site ID:** `[SiteID if found]`
**Search engine:** [Provider name and confidence level]

**Evidence:**
- [Bullet 1: what you found and where]
- [Bullet 2: confirming signal]
- [Bullet 3: any counterevidence or caveats]

**Confidence:** High / Medium / Low

---

Confidence levels:
- **High** — direct domain match in scripts or robots.txt, or native SFCC suggest endpoint responded
- **Medium** — URL patterns and parameter names match one provider but no direct JS confirmation
- **Low** — circumstantial (visual appearance, URL structure only), recommend manual DevTools check

If the verdict is a **third-party provider**, add a brief note on what this means:
> "This means product search, ranking, and autocomplete are controlled outside of SFCC's native search index. Merchandising rules, sorting, and search analytics will live in [Provider]'s admin — not in Business Manager."

If the verdict is **native SFCC search**, add:
> "Search is powered by SFCC's built-in search index. Sorting rules, search refinements, and synonyms are all managed in Business Manager → Merchant Tools → Search."

## Critical rules

- Always use the browser tool for page fetches — WebFetch returns 403 on most SFCC storefronts
- robots.txt is the fastest and most reliable first signal — always start there
- Never guess the provider based on visual appearance alone
- If confident after Step 3 or 4, skip straight to Step 9 — don't run unnecessary steps
- The suggest endpoint test (Step 7) is the single strongest native-SFCC confirmation signal
