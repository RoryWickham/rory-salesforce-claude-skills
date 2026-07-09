---
description: Deploy the B2B Commerce demo components (inventory widget, quick order, buyer notification modal) to a B2B Commerce Enhanced SDO org. Use when an SE wants to set up these components in their own org.
---

# B2B Commerce Demo Components — Deploy Skill

This skill deploys three custom demo components to a Salesforce B2B Commerce Enhanced SDO org:

- **Inventory Availability** — real OCI inventory widget on the PDP (QOH, ATF, status badge)
- **Quick Order** — enhanced home page quick order with product image and name
- **Buyer Notification Modal** — targeted login popup for specific buyers

The whole process takes about 5 minutes. Stay nearby — I'll ask a couple of questions and show you where to drop the components in Experience Builder at the end.

## Step 1 — Check for updates

Before doing anything else, run:
```bash
git -C ~/.claude/commands/salesforce fetch origin main --quiet 2>/dev/null
git -C ~/.claude/commands/salesforce status -uno 2>/dev/null
```

- If the output says **"Your branch is behind"**: tell the user "Heads up — there's a newer version of this skill available. Run `git -C ~/.claude/commands/salesforce pull` to update before we continue, then re-run the skill." Stop here.
- If up to date or the folder doesn't exist: proceed silently.

## Step 2 — Get the org alias

Say to the user: "What's your org alias? Run `sf org list` if you're not sure — look for the B2B Commerce Enhanced org."

Once they provide it, store it as `ORG_ALIAS` and use it in all subsequent CLI commands.

Verify the org is reachable:
```bash
sf org display --target-org "ORG_ALIAS" 2>&1
```

If it fails, tell the user their org isn't authenticated and ask them to run `sf org login web` first.

## Step 3 — Clone the components repo

Check whether the components repo is already cloned:
```bash
ls ~/claude-projects/b2b-commerce-demo-components/sfdx-project 2>/dev/null
```

If it doesn't exist:
```bash
git clone git@github.com:RoryWickham/b2b-commerce-demo-components.git ~/claude-projects/b2b-commerce-demo-components
```

If it already exists, pull latest:
```bash
git -C ~/claude-projects/b2b-commerce-demo-components pull
```

## Step 4 — OCI preflight check

Run the preflight check to see if OCI is ready in their org:

```bash
cat > /tmp/b2b_oci_check.apex << 'EOF'
Map<String, Object> result = B2BInventoryController.checkOciSetup();
System.debug(result);
EOF
sf apex run --target-org "ORG_ALIAS" --file /tmp/b2b_oci_check.apex 2>&1
```

**Wait** — this will fail because `B2BInventoryController` isn't deployed yet. Instead, run this raw OCI check:

```bash
cat > /tmp/b2b_oci_raw.apex << 'EOF'
// Check OCI ConnectApi availability
try {
    ConnectApi.OCIGetInventoryAvailabilityInputRepresentation test = new ConnectApi.OCIGetInventoryAvailabilityInputRepresentation();
    System.debug('OCI_AVAILABLE: true');
} catch(Exception e) {
    System.debug('OCI_AVAILABLE: false - ' + e.getMessage());
}
// Check LocationGroup
List<LocationGroup> groups = [SELECT ExternalReference, LocationGroupName FROM LocationGroup WHERE ExternalReference != null LIMIT 1];
System.debug('LOCATION_GROUPS: ' + groups.size() + ' - ' + groups);
EOF
sf apex run --target-org "ORG_ALIAS" --file /tmp/b2b_oci_raw.apex 2>&1 | grep "USER_DEBUG"
```

Interpret the output:
- `OCI_AVAILABLE: false` → Tell the user: "OCI (Omnichannel Inventory) doesn't appear to be provisioned in this org. The inventory widget will show 'No Stock' for all products until OCI is set up. You can still deploy the other two components. Want to continue anyway?"
- `LOCATION_GROUPS: 0` → Tell the user: "OCI is available but no Location Groups are configured yet. The inventory widget will show zeros. I'd recommend setting up a Location Group in Setup → Inventory → Location Groups before deploying, but we can continue and fix it later."
- Both present → proceed silently.

## Step 5 — Deploy Apex classes

```bash
sf project deploy start \
  --source-dir force-app/main/default/classes \
  --target-org "ORG_ALIAS" 2>&1
```

Run this from `~/claude-projects/b2b-commerce-demo-components/sfdx-project/`.

If it fails, show the error and diagnose before continuing.

## Step 6 — Deploy LWC components

```bash
sf project deploy start \
  --source-dir force-app/main/default/lwc \
  --target-org "ORG_ALIAS" 2>&1
```

If it fails with a namespace error (`LWC1538`), tell the user: "The standard LWC components deployed fine — the quick order widget deploys separately in the next step."

## Step 7 — Deploy Quick Order (DigitalExperienceBundle)

The quick order component lives inside the DigitalExperienceBundle and must be deployed separately:

```bash
sf project deploy start \
  --source-dir force-app/main/default/digitalExperiences/site/SDO_B2B_Commerce_Enhanced1/sfdc_cms__lwc/b2bQuickOrder \
  --source-dir force-app/main/default/digitalExperiences/site/SDO_B2B_Commerce_Enhanced1/sfdc_cms__lwc/b2bQuickOrderDisplay \
  --source-dir force-app/main/default/digitalExperiences/site/SDO_B2B_Commerce_Enhanced1/sfdc_cms__lwc/b2bQuickOrderItem \
  --target-org "ORG_ALIAS" 2>&1
```

If it fails because the site name doesn't match (the SDO org uses a different site name), run:
```bash
ls force-app/main/default/digitalExperiences/site/
```
And retry with the correct site folder name.

## Step 8 — Assign permission set

```bash
cat > /tmp/b2b_permset.apex << 'EOF'
List<User> communityUsers = [
    SELECT Id FROM User
    WHERE IsActive = true
    AND Profile.UserLicense.Name = 'Customer Community Plus'
    LIMIT 50
];
PermissionSet ps = [SELECT Id FROM PermissionSet WHERE Name = 'B2BInventoryControllerAccess' LIMIT 1];
List<PermissionSetAssignment> toInsert = new List<PermissionSetAssignment>();
Set<Id> existing = new Map<Id, PermissionSetAssignment>(
    [SELECT AssigneeId FROM PermissionSetAssignment WHERE PermissionSetId = :ps.Id]
).keySet();
for (User u : communityUsers) {
    if (!existing.contains(u.Id)) {
        toInsert.add(new PermissionSetAssignment(AssigneeId = u.Id, PermissionSetId = ps.Id));
    }
}
if (!toInsert.isEmpty()) insert toInsert;
System.debug('Assigned to ' + toInsert.size() + ' users (' + (communityUsers.size() - toInsert.size()) + ' already had it)');
EOF
sf apex run --target-org "ORG_ALIAS" --file /tmp/b2b_permset.apex 2>&1 | grep "USER_DEBUG"
```

Report back how many users were assigned.

## Step 9 — Post-deploy OCI verification

Now that the Apex is deployed, run the full preflight check:

```bash
cat > /tmp/b2b_verify.apex << 'EOF'
Map<String, Object> result = B2BInventoryController.checkOciSetup();
System.debug('OCI check: ' + result);
EOF
sf apex run --target-org "ORG_ALIAS" --file /tmp/b2b_verify.apex 2>&1 | grep "USER_DEBUG"
```

- `ready=true` → 
- `ready=false` → show the `issues` list to the user with specific next steps from Step 4

## Step 10 — Tell the user where to place the components

Say to the user:

"Everything is deployed. Here's where to place each component in Experience Builder — open your B2B Enhanced storefront, go to Experience Builder, and **republish the page after placing each one** (LWR caches the page bundle, so changes won't show without a publish).

**Inventory Availability widget** (b2bInventoryAvailability)
- Open the **Product Detail Page** in Experience Builder
- Search `b2bInventoryAvailability` in the component panel
- Drop it between the Quantity selector and Tier Discounts sections
- No configuration needed — it auto-detects the product from the URL

**Quick Order widget** (B2B Quick Order)
- Open the **Home page** in Experience Builder
- Search `b2b` in the component panel → look for **'B2B Quick Order'** under Open Code
- Replace the existing quick order component — don't add it alongside the original
- No configuration needed

**Buyer Notification Modal** (b2bPromorAndOrderNotification)
- Open any page where you want the notification to appear (usually Home)
- Search `b2bPromorAndOrderNotification` in the component panel
- Configure in the properties panel:
  - **Target Buyer Username** — Salesforce username of the buyer to target (leave blank for all buyers)
  - **Notification Title / Message** — supports `{name}` token for the buyer's first name
  - **Notification Type** — `promo` or `order`
  - **Show Once Per Session** — suppresses after first view per day

After placing components, hit **Publish** in Experience Builder for each page you modified."

## Troubleshooting

**Inventory shows 'No Stock' for all products**
- Run the OCI preflight check (Step 9) — it will tell you exactly what's missing
- Most common causes: no LocationGroup ExternalReference set, or no inventory seeded in OCI

**Quick Order row disappears after entering a SKU**
- Check browser console for errors
- Most likely cause: labels returning null — confirm the DigitalExperienceBundle deployed correctly (Step 7) and the page was republished

**Component doesn't appear in Experience Builder search**
- Make sure the page was **republished** after deploy — LWR won't pick up new components without it
- For Quick Order: search exactly `b2b` (not the full name) and look under Open Code section
