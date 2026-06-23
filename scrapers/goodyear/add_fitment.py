"""
Fetch fitment data from Goodyear API and add Make/Model/Year/Trim columns
to goodyear_tires_feed.csv. Each tire row gets a pipe-delimited list of
fitment combos that map to its size.
"""

import csv
import json
import subprocess
import random
import uuid

INPUT  = "/Users/rory.wickham/claude-projects/goodyearWork/goodyear_tires_feed.csv"
OUTPUT = "/Users/rory.wickham/claude-projects/goodyearWork/goodyear_tires_feed.csv"

YEARS  = list(range(2014, 2027))
MAKES  = ["Ford", "GMC", "Honda"]

# Curated models per make (2-4 per make)
MODELS = {
    "Ford":  ["F-150", "Explorer", "Mustang", "Escape"],
    "GMC":   ["Sierra 1500", "Yukon", "Terrain", "Acadia"],
    "Honda": ["Civic", "Accord", "CR-V", "Pilot"],
}

# Max trims to keep per model/year combo
MAX_TRIMS = 3

USID = str(uuid.uuid4())
HEADERS_CURL = [
    "-H", "Content-Type: application/json",
    "-H", "Origin: https://www.goodyear.com",
    "-H", "Referer: https://www.goodyear.com/en-us/tires/all-tires",
    "-H", f"Cookie: usid={USID}",
]
URL = "https://www.goodyear.com/api/graphqlProxy"


def gql(refine, filter_=None):
    payload = {
        "moduleName": "tireFinderQueries",
        "queryName": "fetchTireFinder",
        "payload": {
            "input": {
                "brand": "goodyear",
                "lob": "consumer",
                "region": "na",
                "localeCountry": "en-US",
                "type": "vehicle",
                "selectedType": "vehicle",
                "refine": refine,
                "showTopSearched": False,
            }
        },
        "turnstileToken": None,
    }
    if filter_:
        payload["payload"]["input"]["filter"] = filter_

    result = subprocess.run(
        ["curl", "-s", "-X", "POST", URL] + HEADERS_CURL + ["-d", json.dumps(payload)],
        capture_output=True, text=True, timeout=30
    )
    try:
        return json.loads(result.stdout)
    except Exception:
        return {}


def get_refinements(data):
    try:
        return data["tireFinder"]["data"]["refinements"][0]["values"]
    except Exception:
        return []


def get_sizes(data):
    sizes = set()
    try:
        for hit in data["tireFinder"]["data"]["hits"]:
            for v in hit.get("productVariant", []):
                w = v.get("width", "")
                a = v.get("aspectRatio", "")
                r = v.get("rimDiameter", "")
                if w and a and r:
                    sizes.add(f"{w}/{a}R{r}")
    except Exception:
        pass
    return sizes


# Build fitment map: size -> list of "Year|Make|Model|Trim" strings
print("Building fitment map...")
fitment_map = {}  # size -> set of "Year|Make|Model|Trim"

for year in YEARS:
    print(f"  Year {year}...")
    base_refine = ["cgid=vehiclefinder", f"year={year}"]

    for make in MAKES:
        models_for_make = MODELS[make]

        for model in models_for_make:
            # Get trims for this year/make/model
            trim_refine = base_refine + [f"make={make}", f"model={model}"]
            trim_data = gql(trim_refine, filter_=["versionOption"])
            trims = [v["label"] for v in get_refinements(trim_data)]

            if not trims:
                # Model may not exist for this year — skip silently
                continue

            # Take a random sample of up to MAX_TRIMS
            sampled_trims = random.sample(trims, min(MAX_TRIMS, len(trims)))

            for trim in sampled_trims:
                # Get tire sizes for this full YMMT
                size_refine = trim_refine + [f"versionOption={trim}"]
                size_data = gql(size_refine)
                sizes = get_sizes(size_data)

                for size in sizes:
                    if size not in fitment_map:
                        fitment_map[size] = set()
                    fitment_map[size].add(f"{year}|{make}|{model}|{trim}")

print(f"  Done. {len(fitment_map)} unique sizes have fitment data.\n")

# Read existing feed and add fitment columns
with open(INPUT, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    original_fields = reader.fieldnames
    rows = list(reader)

fitment_cols = ["FitmentYear", "FitmentMake", "FitmentModel", "FitmentTrim"]
base_fields = [f for f in original_fields if f not in fitment_cols]
new_fields = base_fields + fitment_cols

matched = 0
for row in rows:
    size = row.get("size", "") or row.get("Size", "")
    combos = fitment_map.get(size, set())
    if combos:
        matched += 1
        combo_list = sorted(combos)
        years  = sorted(set(c.split("|")[0] for c in combo_list))
        makes  = sorted(set(c.split("|")[1] for c in combo_list))
        models = sorted(set(c.split("|")[2] for c in combo_list))
        trims  = sorted(set(c.split("|")[3] for c in combo_list))
        row["FitmentYear"]  = "|".join(years)
        row["FitmentMake"]  = "|".join(makes)
        row["FitmentModel"] = "|".join(models)
        row["FitmentTrim"]  = "|".join(trims)
    else:
        row["FitmentYear"]  = ""
        row["FitmentMake"]  = ""
        row["FitmentModel"] = ""
        row["FitmentTrim"]  = ""

print(f"Rows with fitment data: {matched} / {len(rows)}")

with open(OUTPUT, "w", newline="\n", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=new_fields, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)

print(f"Saved to {OUTPUT}")
