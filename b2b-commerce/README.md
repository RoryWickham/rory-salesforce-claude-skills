# B2B Commerce Skills

Skills for Salesforce B2B Commerce demos and implementations.

## Demo Components

Custom LWC + Apex components for the B2B Commerce Enhanced SDO org are maintained at:

**https://github.com/RoryWickham/b2b-commerce-demo-components**

### What's in the repo

| Component | Type | Description |
|-----------|------|-------------|
| `b2bInventoryAvailability` | LWC + Apex | PDP widget showing real OCI inventory (QOH, ATF, status badge, qty-aware warning) |
| `b2bQuickOrder` / `Display` / `Item` | DigitalExperienceBundle LWC | Enhanced quick order with product image, name, SKU — home page widget |
| `b2bPromorAndOrderNotification` | LWC + Apex | Targeted buyer login modal (promo or order notification, `{name}` token, once-per-session) |

### Deployment quick reference

**Target:** SDO B2B Commerce Enhanced org (`SDO_B2B_Commerce_Enhanced1` site)  
**Buyer test user:** Lauren Bailey (SDO-Customer Community Plus)

```bash
# Clone
git clone git@github.com:RoryWickham/b2b-commerce-demo-components.git
cd b2b-commerce-demo-components

# Deploy all custom components + Apex to your org
sf project deploy start \
  --source-dir sfdx-project/force-app/main/default/classes \
  --source-dir sfdx-project/force-app/main/default/lwc \
  --source-dir sfdx-project/force-app/main/default/digitalExperiences \
  --target-org "Your Org Alias"
```

**After deploying:** Republish the Experience Builder page — LWR caches the compiled bundle.

**Permission set:** Assign `B2BInventoryControllerAccess` to community users so they can call the OCI Apex.
