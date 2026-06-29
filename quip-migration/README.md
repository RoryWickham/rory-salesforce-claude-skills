# Quip Migration Skills

Skills for migrating Quip documents and folders to Google Docs/Drive.

## Skills

- **migrate-doc** — Migrate a single Quip document to Google Docs, placing it in the correct Google Drive folder based on the Quip folder hierarchy

## Setup

The skills require `migrate.py` to be present at `~/claude-projects/quip-migration/migrate.py`.

### Dependencies
```bash
pip3 install requests beautifulsoup4
```

### Quip API token
Add your token to `migrate.py` or set `QUIP_TOKEN` as an environment variable.
Get your token at: https://quip.com/dev/token

## Planned Skills

- **migrate-folder** — Migrate an entire Quip folder (and subfolders) to Google Drive, preserving hierarchy
- **migrate-bulk** — Bulk migrate a full Quip account
