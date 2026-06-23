---
navigation_title: "Box"
type: reference
description: "Box connector reference for searching files and folders, retrieving file content and metadata, and querying enterprise content with Box AI through the remote Box MCP server."
applies_to:
  stack: preview 9.4
  serverless: preview
---

# Box connector [box-action-type]

The Box connector integrates with Box through the official remote MCP server at `https://mcp.box.com`. It searches files and folders, retrieves file content and metadata, and uses Box AI to answer questions about enterprise content. It uses OAuth 2.0 Authorization Code flow to authenticate.

## Create connectors in {{kib}} [define-box-ui]

You can create connectors in **{{stack-manage-app}} > {{connectors-ui}}**.

### Connector configuration [box-connector-configuration]

Box connectors have the following configuration properties:

MCP Server URL
:   The URL of the remote Box MCP server. Defaults to `https://mcp.box.com`.

Authentication
:   Connects through Box's OAuth 2.0 Authorization Code flow. Requires a Client ID and Client Secret from the Box MCP server integration in the Admin Console. Refer to [OAuth credentials](#box-oauth-credentials) for setup instructions.

## Test connectors [box-test-connector]

You can test connectors when you create or edit the connector in {{kib}}.

## Connector actions [box-connector-actions]

The Box connector exposes the following actions:

### File and folder discovery

`searchFilesKeyword`
:   Search for files in Box by keyword. Box searches across file names, content, descriptions, and metadata. Returns file IDs, names, and paths.

`searchFoldersByName`
:   Search for folders in Box by name. Returns folder IDs, names, and parent paths.

`listFolderContent`
:   List files and subfolders inside a specific Box folder. Use folder ID `0` for the root folder.

`listRecentItems`
:   List files and folders recently accessed or modified by the authenticated user. Useful for surfacing active content without a search query.

`searchByMetadata`
:   Search for Box files and folders using metadata template fields and a structured query expression (for example, `amount >= 100 AND currency = "USD"`).

### File and folder details

`getFileContent`
:   Retrieve the text content of a file stored in Box. Works with documents, spreadsheets, PDFs, and other text-extractable formats. Check the file size with `getFileDetails` before retrieving large files.

`getFileDetails`
:   Get detailed metadata for a specific Box file, including size, owner, modification date, permissions, and shared link status.

`getFolderDetails`
:   Get detailed metadata for a specific Box folder, including owner, permissions, and collaboration settings.

`getComments`
:   Retrieve all comments posted on a specific Box file, including comment text, author details, and timestamps.

### Box AI

`aiQaSingleFile`
:   Ask Box AI a question about a single file. Returns an answer with citations. Files must have fewer than 1 MB of extracted text.

`aiQaMultiFile`
:   Ask Box AI a question across multiple files simultaneously. Returns a unified answer with citations.

`aiQaHub`
:   Ask Box AI a question about the contents of a Box Hub. Returns an answer with citations from the hub's content.

`aiExtractFreeform`
:   Extract metadata from a Box file using a natural-language prompt. Returns structured key-value pairs for the described fields. Files must have fewer than 1 MB of extracted text.

`aiExtractStructuredFromMetadataTemplate`
:   Extract structured metadata from a Box file using an existing enterprise metadata template. Box AI fills in the template fields automatically.

### Box Hubs

Box Hubs are curated collections of files and folders organized around a topic or project. Content in a Hub can come from anywhere in Box regardless of folder structure.

`listHubs`
:   List all Box Hubs accessible to the authenticated user. Returns hub IDs, titles, and descriptions.

`getHubDetails`
:   Get metadata and details for a specific Box Hub.

`getHubItems`
:   List files and folders associated with a specific Box Hub.

### Utilities

`whoAmI`
:   Retrieve details about the currently authenticated Box user, including name, email, and account type. Use this to confirm authentication is working.

`listTools`
:   List all tools available on the Box MCP server. Use this to discover capabilities not exposed as named actions, such as write operations and admin operations.

`callTool`
:   Call any tool on the Box MCP server directly by name. Use this as a fallback for tools not yet exposed as named actions (such as `upload_file`, `create_folder`, or `create_collaboration`). Use `listTools` first to discover available tool names and their arguments.

## Connector networking configuration [box-connector-networking-configuration]

Use the [Action configuration settings](/reference/configuration-reference/alerting-settings.md#action-settings) to customize connector networking, such as proxies, certificates, or TLS settings. You can set configurations that apply to all your connectors or use `xpack.actions.customHostSettings` to set per-host configurations.

## Get OAuth credentials [box-oauth-credentials]

The Box MCP server authenticates through the Box Admin Console integration, not a custom OAuth app. To get your credentials:

1. Log in to your [Box Admin Console](https://app.box.com/master).
2. Go to **Integrations** and search for **Box MCP server**.
3. Open the integration and select **Configure**.
4. Under **Additional Configuration**, select **Add Integration Credentials**, 
5. Enter a name and **Redirect URI** as `https://<your-kibana-host>/api/actions/connector/_oauth_callback`, then select **Save**.
6. Make sure the **Manage AI Requests** scope is enabled.
7. Copy the generated **Client ID** and **Client Secret**.
8. In {{kib}}, enter the **Client ID** and **Client Secret**. Kibana preconfigures the authorization URL and token URL.
9. Complete the authorization flow to connect your Box account.
