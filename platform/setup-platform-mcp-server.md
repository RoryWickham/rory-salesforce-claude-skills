---
name: setup-platform-mcp-server
description: Use when the user wants to create a Salesforce External Client Application (ECA) with OAuth configuration and set up an MCP server for Claude Code or MCP Inspector against a local, test, sandbox, or production org.
---

# setup-platform-mcp-server

## Description
Automates the complete workflow to create a Salesforce External Client Application (ECA) with OAuth configuration and set up an MCP server connection for Claude Code or MCP Inspector.

## When to Use
Use this skill when the user wants to:
- Create a new Salesforce ECA (External Client Application) for OAuth
- Set up an MCP server to connect to Salesforce APIs

## Questions to Ask
Before starting, ask the user:

1. **Client** (required) - Are you connecting to **Claude Code** or **MCP Inspector**?
   - Claude Code: uses callback URL `http://localhost:8080/callback`
   - MCP Inspector: uses callback URL `http://localhost:6274/oauth/callback/debug`
2. **Environment** (required) - Are you connecting to **local**, **test**, **sandbox**, or **production**?
3. **Server** (required) - What MCP server are you connecting to? (e.g., `platform/sobject-all`, `sales/agentforce-sales`, etc.)
   - **IMPORTANT**: The server path MUST include the domain prefix (e.g., `platform/sobject-all`, NOT just `sobject-all`)
   - If the user provides only the server name without a domain (e.g., `sobject-all`), ask them to specify the full path including the domain (e.g., `platform/sobject-all`)

The skill will automatically use the default org (🍁) from `sf org list` as the deployment target.

## Defaults
All other parameters use defaults:
- **eca_name**: 
  - **Claude Code**: `ClaudeCodeClient_<timestamp>` (e.g., `ClaudeCodeClient_1745350000`)
  - **MCP Inspector**: `McpInspectorClient_<timestamp>` (e.g., `McpInspectorClient_1745350000`)
- **eca_label**: 
  - **Claude Code**: `Claude Code Client <timestamp>` (e.g., `Claude Code Client 1745350000`)
  - **MCP Inspector**: `MCP Inspector Client <timestamp>` (e.g., `MCP Inspector Client 1745350000`)
- **callback_url**: 
  - **Claude Code**: `http://localhost:8080/callback`
  - **MCP Inspector**: `http://localhost:6274/oauth/callback/debug`
- **callback_port**:
  - **Claude Code**: `8080`
  - **MCP Inspector**: `6274`
- **oauth_scopes**: 
  - **local**: `Api, SFApiPlatform, EinsteinGPT, RefreshToken`
  - **non-local** (test, sandbox, production): `MCP, RefreshToken`
- **contact_email**: retrieved from the target org's username

## MCP URL by Environment
- **local**: `http://localhost:7442/mcp/{{server}}`
- **test**: `https://test.api.salesforce.com/platform/mcp/v1/d/{{mydomain}}/test/{{server}}`
  - `{{mydomain}}` is extracted from the org's instance URL (e.g., from `https://orgfarm-b0590668c2.test2.my.pc-rnd.salesforce.com`, extract `orgfarm-b0590668c2.test2`)
- **sandbox**: `https://api.salesforce.com/platform/mcp/v1/sandbox/{{server}}`
- **production**: `https://api.salesforce.com/platform/mcp/v1/{{server}}`
  - Same host and path as sandbox, but **without** the `sandbox/` segment.

## OAuth Settings Applied
The skill automatically configures:
- Callback URL:
  - **Claude Code**: `http://localhost:8080/callback`
  - **MCP Inspector**: `http://localhost:6274/oauth/callback/debug`
- OAuth Scopes:
  - **local environment**: `Api, SFApiPlatform, EinsteinGPT, RefreshToken`
  - **non-local environments** (test, sandbox, production): `MCP, RefreshToken`
- Require Secret for Web Server Flow: **Disabled**
- Require Secret for Refresh Token Flow: **Disabled**
- Require PKCE: **Enabled**
- Issue JWT for Named Users: **Enabled**

## Workflow Steps

**IMPORTANT:** Execute ALL steps in order. Do NOT skip any steps. Each step is critical for the setup to work correctly. If a step fails or encounters an error, handle the error appropriately before proceeding to the next step.

### 1. Validate Prerequisites
- Verify Salesforce CLI (`sf`) is installed by running `which sf`
  - **If not installed:** Help the user install it with:
    ```bash
    brew install sf
    ```
  - Wait for installation to complete before proceeding
- Check if user has a default org authenticated by running `sf org list`
- **If a default org is already set (🍁 symbol present):**
  - Show the user the current default org's username/alias
  - Ask the user: "Do you want to use the existing default org ({{current_default_org}}) or authenticate to a different org?"
  - **If user wants to use the existing default org:**
    - Extract the default org's username or alias to use as the target org for deployment
    - Proceed to the next step
  - **If user wants to use a different org:**
    - Warn the user: "Note: This will set a new default org, replacing the current default."
    - Proceed with authentication steps below
- **If no default org is set (no 🍁 symbol in the org list) OR user wants to use a different org:**
  - Ask the user: "What is your Salesforce login URL?" and provide an example based on the environment they selected:
    - For **production**: "e.g., https://login.salesforce.com or your org's My Domain URL, e.g. https://mycompany.my.salesforce.com"
    - For **sandbox**: "e.g., https://test.salesforce.com"
    - For **test**: "e.g., https://orgfarm-41fdcaac0e.test1.my.pc-rnd.salesforce.com"
    - For **local**: "e.g., https://orgfarm-3212da3903.my.salesforce-com.opyht3y6j07002sx809ixmgr51f7xk5.wa.crm.dev:6101"
  - Wait for user to provide the login URL
  - **If environment is local:**
    - Instruct the user to complete these setup steps:
      1. Go to `{{user_provided_url}}/qa/hoseMyOrgPleaseSir.jsp` to enable CreateConnectedApps permission
      2. Go to `{{user_provided_url}}/qa/initSdxOauth.jsp`
    - Ask the user: "Have you completed these setup steps?"
    - Wait for user confirmation before proceeding
  - Run the command: `sf org login web --instance-url {{user_provided_url}} --set-default`
  - This will open a browser for the user to authenticate
  - If the command succeeds, the org is now set as the default
  - Proceed to the next step

### 2. Create Temporary SFDX Project
```bash
cd /tmp
sf project generate --name eca-setup-<timestamp>
cd eca-setup-<timestamp>
```

### 3. Create ECA Metadata Files
Create three metadata files under `force-app/main/default/`:

Use the appropriate naming based on the client type:
- **Claude Code**: Use `ClaudeCodeClient` as the name and `Claude Code Client` as the label
- **MCP Inspector**: Use `McpInspectorClient` as the name and `MCP Inspector Client` as the label

**a) ExternalClientApplication** (`externalClientApps/{{eca_name}}.eca-meta.xml`):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExternalClientApplication xmlns="http://soap.sforce.com/2006/04/metadata">
    <contactEmail>{{contact_email}}</contactEmail>
    <description>ECA for MCP server integration</description>
    <distributionState>Local</distributionState>
    <isProtected>false</isProtected>
    <label>{{eca_label}}</label>
</ExternalClientApplication>
```

**b) ExtlClntAppOauthSettings** (`extlClntAppOauthSettings/{{eca_name}}.ecaOauth-meta.xml`):

**For local environment:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtlClntAppOauthSettings xmlns="http://soap.sforce.com/2006/04/metadata">
    <commaSeparatedOauthScopes>Api, SFApiPlatform, EinsteinGPT, RefreshToken</commaSeparatedOauthScopes>
    <externalClientApplication>{{eca_name}}</externalClientApplication>
    <label>{{eca_name}} OAuth Settings</label>
</ExtlClntAppOauthSettings>
```

**For non-local environments (test, sandbox, production):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtlClntAppOauthSettings xmlns="http://soap.sforce.com/2006/04/metadata">
    <commaSeparatedOauthScopes>MCP, RefreshToken</commaSeparatedOauthScopes>
    <externalClientApplication>{{eca_name}}</externalClientApplication>
    <label>{{eca_name}} OAuth Settings</label>
</ExtlClntAppOauthSettings>
```

**c) ExtlClntAppGlobalOauthSettings** (`extlClntAppGlobalOauthSettings/{{eca_name}}.ecaGlblOauth-meta.xml`):

**For Claude Code:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtlClntAppGlobalOauthSettings xmlns="http://soap.sforce.com/2006/04/metadata">
    <callbackUrl>http://localhost:8080/callback</callbackUrl>
    <externalClientApplication>{{eca_name}}</externalClientApplication>
    <isConsumerSecretOptional>true</isConsumerSecretOptional>
    <isIntrospectAllTokens>false</isIntrospectAllTokens>
    <isNamedUserJwtEnabled>true</isNamedUserJwtEnabled>
    <isPkceRequired>true</isPkceRequired>
    <isSecretRequiredForRefreshToken>false</isSecretRequiredForRefreshToken>
    <label>{{eca_name}} Global OAuth Settings</label>
    <shouldRotateConsumerKey>false</shouldRotateConsumerKey>
    <shouldRotateConsumerSecret>false</shouldRotateConsumerSecret>
</ExtlClntAppGlobalOauthSettings>
```

**For MCP Inspector:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtlClntAppGlobalOauthSettings xmlns="http://soap.sforce.com/2006/04/metadata">
    <callbackUrl>http://localhost:6274/oauth/callback/debug</callbackUrl>
    <externalClientApplication>{{eca_name}}</externalClientApplication>
    <isConsumerSecretOptional>true</isConsumerSecretOptional>
    <isIntrospectAllTokens>false</isIntrospectAllTokens>
    <isNamedUserJwtEnabled>true</isNamedUserJwtEnabled>
    <isPkceRequired>true</isPkceRequired>
    <isSecretRequiredForRefreshToken>false</isSecretRequiredForRefreshToken>
    <label>{{eca_name}} Global OAuth Settings</label>
    <shouldRotateConsumerKey>false</shouldRotateConsumerKey>
    <shouldRotateConsumerSecret>false</shouldRotateConsumerSecret>
</ExtlClntAppGlobalOauthSettings>
```

### 4. Deploy ECA to Salesforce
```bash
sf project deploy start \
  --source-dir force-app/main/default \
  --json
```

Check deployment status and handle errors if any.

### 5. Retrieve Consumer Key
After successful deployment, retrieve the ECA metadata to get the consumer key:
```bash
sf project retrieve start \
  --metadata ExtlClntAppGlobalOauthSettings:{{eca_name}}
```

Parse the retrieved XML file to extract the `<consumerKey>` value.

### 6. Create McpServerAccess Record
Use the Tooling API to register the MCP server in Salesforce:

1. Query McpServerAccess to check if the server already exists:
```bash
sf data query --query "SELECT Id, DeveloperName, MasterLabel, Active FROM McpServerAccess WHERE DeveloperName = '{{developer_name}}'" --use-tooling-api --json
```

Where `{{developer_name}}` is derived from the server path by replacing `/` with `_` (e.g., `platform/sobject-all` becomes `platform_sobject_all`)

2. If no record exists, create a new McpServerAccess record:
```bash
sf data create record --sobject McpServerAccess --values "DeveloperName={{developer_name}} MasterLabel={{master_label}} Active=true" --use-tooling-api --json
```

Where:
- `{{developer_name}}`: server path with `/` replaced by `_` (e.g., `platform_sobject_all`)
- `{{master_label}}`: the last part of the server path (e.g., `sobject-all` from `platform/sobject-all`)
- `Active`: set to `true`

Example:
- For `platform/sobject-all`:
  - DeveloperName: `platform_sobject_all`
  - MasterLabel: `sobject-all`
  - Active: `true`

### 7. Create MCP Server Configuration

**For test environment only:**
Extract the mydomain from the org's instance URL:
1. Get the org's instance URL using:
   ```bash
   sf org display --json
   ```
2. Extract the mydomain from the `instanceUrl` field. For example:
   - From `https://orgfarm-b0590668c2.test2.my.pc-rnd.salesforce.com`, extract `orgfarm-b0590668c2.test2`
   - The mydomain is everything between `https://` and `.my.` (or before the first domain suffix)

**For Claude Code:**

First, check if an MCP server with the same name already exists:
```bash
claude mcp list --json
```

Parse the output to check if `{{mcp_server_name}}` already exists.

**If the server already exists:**
Update the MCP URL and consumer key (client ID) as needed:
```bash
claude mcp update {{mcp_server_name}} {{mcp_url}} --client-id {{consumer_key}}
```

**If the server does not exist:**
Add a new MCP server:
```bash
claude mcp add {{mcp_server_name}} {{mcp_url}} \
  --transport http \
  --callback-port 8080 \
  --client-id {{consumer_key}}
```

Where:
- `{{mcp_server_name}}` is derived from the server path and environment (e.g., `platform/sobject-all` with `test` environment becomes `salesforce-sobject-all-test`)
- `{{mcp_url}}` is built from the environment and server (see MCP URL by Environment above)
  - For **test** environment: include the extracted mydomain in the URL
- `{{consumer_key}}` is the key retrieved in step 5

### 8. Provide Summary
Output a summary with:
- ECA Name
- Consumer Key
- MCP Server Name
- MCP Server URL
- Environment
- Client (Claude Code or MCP Inspector)
- Callback URL

**For local environment (BOTH Claude Code and MCP Inspector):**
The local agentic-api-service must be started with `oauth.server.base-url` pointing at the target org. Without this, the service serves OAuth discovery metadata (`/.well-known/oauth-authorization-server`) where `authorization_endpoint` and `token_endpoint` are prefixed with the literal string `UNKNOWN_OAUTH_SERVER` (the default value when the property is unset — see `agentic-api-service-shared/src/main/java/com/salesforce/mcp/config/OauthServletsConfiguration.java`). Clients then fail to start the OAuth flow with errors like:

```
Failed to start OAuth flow: ... "format": "url", "path": ["authorization_endpoint"], "message": "Invalid input" ...
```

Instruct the user to start (or restart) the service with the org URL passed in via `JAVA_OPTS`:

```bash
export JAVA_OPTS="-Doauth.server.base-url={{org_instance_url}}"
bazel run projects/services/agentic-api-access/agentic-api-service
```

Where `{{org_instance_url}}` is the org's instance URL (the same URL used during `sf org login web --instance-url`). Verify the metadata is valid before authenticating:

```bash
curl http://localhost:7442/.well-known/oauth-authorization-server | jq
```

The `authorization_endpoint` and `token_endpoint` should be valid URLs pointing at the org, not `UNKNOWN_OAUTH_SERVER`.

**For Claude Code:**
Next steps:
  1. Restart Claude Code to load the MCP server
  2. Run `/mcp` to view and authenticate with the server
  3. Authenticate when prompted. **Note:** The ECA may take up to 30 minutes to become available after creation. If authentication fails immediately, wait a few minutes and try again.
  4. Ask Claude to "list tools for {{mcp_server_name}}" to verify the connection

**For MCP Inspector:**
Next steps:
  1. Run the following command in a new terminal window — it will automatically open MCP Inspector in the browser:
     ```bash
     npx @modelcontextprotocol/inspector@latest
     ```
  2. Once the inspector is open, enter the following values in the left sidebar:
     - **Transport Type**: `Streamable HTTP`
     - **URL**: `{{mcp_url}}`
     - **Connection Type**: `Via Proxy`
  3. Expand the **"Authentication"** section and enter:
     - **Client ID**: `{{consumer_key}}`
     - **Scope**: (space-separated, based on environment)
       - For **local**: `api einstein_gpt_api sfap_api refresh_token`
       - For **non-local** (test, sandbox, production): `mcp_api refresh_token`
  4. Click **"Open Auth Settings"** (in the center of the main screen)
  5. In the modal that appears, click **"Quick OAuth Flow"**
  6. Authenticate when prompted. **Note:** The ECA may take up to 30 minutes to become available after creation. If authentication fails immediately, wait a few minutes and try again.
  7. Back in the left sidebar, click **"Connect"**
  8. Once connected, you can explore available tools and test the MCP server

### 9. Cleanup
After providing the summary and next steps, ask the user: "Do you want me to delete the temporary SFDX project at `/tmp/eca-setup-<timestamp>`?"
- **If user confirms:**
  - Remove the temporary SFDX project:
  ```bash
  rm -rf /tmp/eca-setup-<timestamp>
  ```
- **If user declines:**
  - Skip cleanup and inform the user: "The temporary project has been kept at `/tmp/eca-setup-<timestamp>`. You can manually delete it later with: `rm -rf /tmp/eca-setup-<timestamp>`"

## Error Handling

**If deployment fails:**
- Check that the target org is authenticated
- Verify OAuth scope names are valid
- Check for existing ECA with the same name

**If consumer key retrieval fails:**
- Confirm the deployment succeeded
- Try retrieving after a short delay (metadata propagation)

**If McpServerAccess creation fails:**
- Verify you have Tooling API access permissions
- Check that the DeveloperName format is correct (no special characters except underscore)
- Confirm the org supports the McpServerAccess object

**If OAuth authentication fails during connection:**
- Wait 30 minutes for ECA to propagate (ECA may take time to become available after creation)
- Verify the consumer key is correct
- Check that the OAuth scopes match the environment (local vs non-local)
- Confirm callback URL matches the ECA configuration

**If the client reports `authorization_endpoint`/`token_endpoint` are not valid URLs (local environment only):**
- Symptom: error like `Failed to start OAuth flow: ... "format": "url", "path": ["authorization_endpoint"], "message": "Invalid input"`
- Cause: the local agentic-api-service was started without `oauth.server.base-url`, so its `/.well-known/oauth-authorization-server` response contains `UNKNOWN_OAUTH_SERVER` instead of the org URL
- Fix: restart the service with `export JAVA_OPTS="-Doauth.server.base-url={{org_instance_url}}"` before `bazel run`. Verify with `curl http://localhost:7442/.well-known/oauth-authorization-server`

**If mydomain extraction fails (test environment):**
- Verify `sf org display --json` returns a valid instanceUrl
- Check the URL format matches expected pattern (contains `.my.`)

**If claude mcp add/update fails:**
- Verify Claude Code CLI is installed and up to date
- Check that the MCP server name doesn't contain invalid characters
- Confirm the MCP URL format is correct

## Example Usage

### Example 1: Claude Code with Test Environment

**User:** "Set up a Salesforce MCP server"

**Assistant:** (Invokes skill and asks):
1. Are you connecting to Claude Code or MCP Inspector?
   **User:** Claude Code
2. Are you connecting to local, test, sandbox, or production?
   **User:** test
3. What server are you connecting to? (e.g., `platform/sobject-all`)
   **User:** platform/sobject-all

**Assistant:** (Checks for default org)
- Found default org: user@example.com
- "Do you want to use the existing default org (user@example.com) or authenticate to a different org?"
   **User:** Use existing

**Assistant:** (Executes workflow):
1. ✓ Validates prerequisites (sf CLI installed, org authenticated)
2. ✓ Creates temporary SFDX project in `/tmp/eca-setup-1746200000`
3. ✓ Creates ECA metadata files (ClaudeCodeClient_1746200000)
4. ✓ Deploys ECA to Salesforce
5. ✓ Retrieves consumer key: `3MVG9xyz...`
6. ✓ Creates McpServerAccess record (platform_sobject_all)
7. ✓ Adds MCP server: `salesforce-sobject-all-test`
8. ✓ Provides summary with next steps

### Example 2: MCP Inspector with Local Environment

**User:** "Set up MCP Inspector for local development"

**Assistant:** (Invokes skill and asks):
1. Are you connecting to Claude Code or MCP Inspector?
   **User:** MCP Inspector
2. Are you connecting to local, test, sandbox, or production?
   **User:** local
3. What server are you connecting to?
   **User:** platform/sobject-all

**Assistant:** (Checks for default org - none found)
- "What is your Salesforce login URL?"
- Example: `https://orgfarm-3212da3903.my.salesforce-com.opyht3y6j07002sx809ixmgr51f7xk5.wa.crm.dev:6101`
   **User:** [provides URL]

**Assistant:** (For local environment, instructs user):
- "Please complete these setup steps:
  1. Go to `[URL]/qa/hoseMyOrgPleaseSir.jsp`
  2. Go to `[URL]/qa/initSdxOauth.jsp`
- Have you completed these steps?"
   **User:** Yes

**Assistant:** (Executes workflow):
1. ✓ Authenticates to org with `sf org login web --instance-url [URL] --set-default`
2. ✓ Creates temporary SFDX project
3. ✓ Creates ECA metadata files (McpInspectorClient_1746200000)
4. ✓ Deploys ECA with local OAuth scopes (Api, SFApiPlatform, EinsteinGPT, RefreshToken)
5. ✓ Retrieves consumer key
6. ✓ Creates McpServerAccess record
7. ✓ Provides summary with MCP Inspector UI configuration values and next steps

### Example 3: Sandbox Environment

**User:** "Connect to sandbox MCP server"

**Assistant:** (Invokes skill and asks):
1. Are you connecting to Claude Code or MCP Inspector?
   **User:** Claude Code
2. Are you connecting to local, test, sandbox, or production?
   **User:** sandbox
3. What server are you connecting to?
   **User:** sales/agentforce-sales

**Assistant:** (Executes workflow with sandbox-specific configuration):
- MCP URL: `https://api.salesforce.com/platform/mcp/v1/sandbox/sales/agentforce-sales`
- OAuth Scopes: `MCP, RefreshToken`
- MCP Server Name: `salesforce-agentforce-sales-sandbox`

### Example 4: Production Environment

**User:** "Connect to production MCP server"

**Assistant:** (Invokes skill and asks):
1. Are you connecting to Claude Code or MCP Inspector?
   **User:** Claude Code
2. Are you connecting to local, test, sandbox, or production?
   **User:** production
3. What server are you connecting to?
   **User:** sales/agentforce-sales

**Assistant:** (Executes workflow with production-specific configuration):
- MCP URL: `https://api.salesforce.com/platform/mcp/v1/sales/agentforce-sales`
- OAuth Scopes: `MCP, RefreshToken`
- MCP Server Name: `salesforce-agentforce-sales-production`

## Important Notes

1. **Org Authentication:** User must be authenticated to the target org via `sf org login`
2. **Permissions:** User needs permissions to create External Client Applications
3. **Restart Required:** Claude Code must be restarted to load the new MCP server
