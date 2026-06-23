import csv, random

INPUT = "/Users/rory.wickham/claude-projects/goodyearWork/goodyear_tires_feed.csv"
OUTPUT = INPUT

MAKES_MODELS = {
    "Ford":    ["F-150", "Explorer", "Mustang", "Escape", "Edge"],
    "GMC":     ["Sierra 1500", "Yukon", "Terrain", "Acadia"],
    "Honda":   ["Civic", "Accord", "CR-V", "Pilot"],
    "Toyota":  ["Camry", "RAV4", "Tacoma", "Highlander"],
    "Chevrolet": ["Silverado 1500", "Equinox", "Malibu", "Traverse"],
    "Jeep":    ["Wrangler", "Grand Cherokee", "Cherokee", "Compass"],
    "BMW":     ["3 Series", "5 Series", "X3", "X5"],
    "Mercedes-Benz": ["C-Class", "E-Class", "GLE", "GLC"],
}

with open(INPUT, newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))
    fieldnames = list(rows[0].keys())

for row in rows:
    row["FitmentYear"] = str(random.randint(2014, 2026))
    make = random.choice(list(MAKES_MODELS.keys()))
    row["FitmentMake"] = make
    row["FitmentModel"] = random.choice(MAKES_MODELS[make])

with open(OUTPUT, "w", newline="\n", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)

print(f"Updated {len(rows)} rows.")
