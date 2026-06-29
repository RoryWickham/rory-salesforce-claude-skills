---
description: Migrate a single Quip document to Google Docs, placing it in the correct Google Drive folder based on the Quip folder hierarchy. Use when the user provides a Quip document URL and wants it migrated to Google Drive.
---

# Quip → Google Docs: Single Document Migration

Migrate one Quip document to Google Docs, preserving headings, nested bullets, hyperlinks, and placing it in the right Google Drive folder.

## Step 1 — Check for updates

```bash
git -C ~/.claude/commands/salesforce fetch origin main --quiet 2>/dev/null
git -C ~/.claude/commands/salesforce status -uno 2>/dev/null
```

- If **"Your branch is behind"**: tell the user "Heads up — there's a newer version of this skill available. Run `git -C ~/.claude/commands/salesforce pull` to update, then re-run." Stop here.
- If up to date: proceed silently.

## Step 2 — Get inputs

If the user hasn't provided them, ask:
1. **Quip URL** — the URL of the document to migrate (e.g. `https://salesforce.quip.com/AbCdEfGhIjKl`)
2. **Google Drive root folder** — the top-level Drive folder that corresponds to the root of their Quip workspace (e.g. `Rory's Client Folder`). This is used to resolve where in Drive to place the migrated doc.

## Step 3 — Fetch and parse the Quip doc

Run:
```bash
python3 ~/claude-projects/quip-migration/migrate.py <quip-url>
```

This returns JSON with:
- `title` — the document title
- `quip_folder_hierarchy` — ordered list of `{id, title}` from root → immediate parent
- `markdown_preview` — first 500 chars of the generated markdown (for sanity check)

## Step 4 — Resolve the Drive folder

The Quip hierarchy looks like: `[User Root] > [Account Folder] > [Subfolder] > ...`

Strip the first element (user's Quip root — equivalent to their Drive root). For each remaining level, resolve against Google Drive:

**For each folder level (starting from the Drive root folder):**

1. Use `search_drive_files` to list all subfolders inside the current Drive folder
2. Compare the Quip folder name against each Drive folder name using fuzzy matching:
   - **Exact match** (score = 1.0) → use it silently
   - **Close match** (score ≥ 0.6, < 1.0) → show the user: "I found a folder called '[Drive name]' — is this the right destination for '[Quip name]'?" Wait for confirmation before proceeding.
   - **No match** (score < 0.6 OR no results) → tell the user: "No existing folder found for '[Quip name]'. I'll create it." Then create it with `create_drive_folder`.

3. Once the folder is confirmed/created, use its ID as the parent for the next level.

## Step 5 — Generate the markdown

Run:
```bash
python3 -c "
from migrate import migrate_doc
import sys
sys.path.insert(0, '$HOME/claude-projects/quip-migration')
result = migrate_doc('$QUIP_URL')
print(result['markdown'])
" 2>/dev/null
```

Capture the full markdown output.

## Step 6 — Create the Google Doc

Use `import_to_google_doc` with:
- `file_name` = the document title from Step 3
- `content` = the full markdown from Step 5
- `source_format` = `markdown`
- `folder_id` = the resolved/created folder ID from Step 4

## Step 7 — Confirm and report

Tell the user:
- The Google Doc URL
- The Drive folder it was placed in
- Any folders that were created (vs. matched)
- Any content that was skipped (e.g. embedded spreadsheets — flag these for manual follow-up)

## Known limitations

- **Embedded Quip spreadsheets** — cannot be auto-converted; flag for manual handling
- **Images** — only migrated if publicly accessible from Quip's CDN; otherwise skipped
- **Bold/italic inline formatting** — not currently preserved (plain text only)
- **Tables** — not yet supported; flagged for manual follow-up
