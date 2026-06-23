import csv, random

INPUT = "/Users/rory.wickham/claude-projects/goodyearWork/goodyear_tires_feed.csv"
OUTPUT = INPUT

ADDON_SKUS = {"211119", "155212", "155193"}

# Build pool from merch + services, excluding addOnSKU values
merch_ids = []
with open("/Users/rory.wickham/claude-projects/goodyearWork/goodyear_merch_feed.csv") as f:
    for row in csv.DictReader(f):
        gid = row.get("ItemGroupID") or row.get("item_group_id", "")
        if gid and gid not in ADDON_SKUS:
            merch_ids.append(gid)
merch_ids = list(dict.fromkeys(merch_ids))  # dedupe

svc_ids = []
with open("/Users/rory.wickham/claude-projects/goodyearWork/goodyear_services_feed.csv") as f:
    for row in csv.DictReader(f):
        gid = row.get("item_group_id", "")
        if gid and gid not in ADDON_SKUS:
            svc_ids.append(gid)
svc_ids = list(dict.fromkeys(svc_ids))

pool = merch_ids + svc_ids
print(f"Recommendation pool: {len(pool)} IDs ({len(merch_ids)} merch + {len(svc_ids)} services)")

with open(INPUT, newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))
    fieldnames = list(rows[0].keys())

# Assign consistent recommendations per item_group_id
recco_map = {}
for row in rows:
    gid = row["item_group_id"]
    if gid not in recco_map:
        picks = random.sample(pool, min(random.randint(3, 5), len(pool)))
        recco_map[gid] = "|".join(picks)
    row["ProductRecommendations"] = recco_map[gid]

with open(OUTPUT, "w", newline="\n", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)

print(f"Updated {len(rows)} rows.")
