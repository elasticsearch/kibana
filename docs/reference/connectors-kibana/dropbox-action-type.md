---
navigation_title: "Dropbox"
type: reference
description: "Dropbox connector reference for searching files and folders, retrieving file content and metadata, and managing shared links through the official remote Dropbox MCP server."
applies_to:
  stack: preview 9.5
  serverless: preview
---

# Dropbox connector [dropbox-action-type]

The Dropbox connector connects to Dropbox through the official remote Model Context Protocol (MCP) server at `https://mcp.dropbox.com/mcp`. Agents and workflows use the connector to locate files by keyword or path, inspect metadata, read content, and create or list shared links. Authentication uses Dropbox OAuth 2.0, so each connector instance is scoped to a specific Dropbox account.

## Create connectors in {{kib}} [define-dropbox-ui]

You can create connectors in **{{stack-manage-app}} > {{connectors-ui}}**.

### Connector configuration [dropbox-connector-configuration]

Dropbox connectors have the following configuration properties:

**Authentication**
:   Authenticates through Dropbox OAuth 2.0 Authorization Code flow. Requires a Client ID and Client Secret from a registered Dropbox app. For setup instructions, see [OAuth credentials](#dropbox-oauth-credentials).

## Test connectors [dropbox-test-connector]

You can test connectors when you create or edit the connector in {{kib}}.

## Connector actions [dropbox-connector-actions]

The Dropbox connector exposes the following actions:

### File and folder discovery

`search`
:   Search for files and folders in Dropbox by keyword. Searches across file names and content. Returns file paths, names, and metadata. Optionally filter by path, file extension, or file category.

`listFolder`
:   List files and subfolders within a specific Dropbox folder. Use an empty string `""` for the root folder, or provide a path such as `/Documents`. Supports recursive listing and pagination.

### File details and content

`getFileMetadata`
:   Get detailed metadata for a specific file or folder, including size, modification date, content hash, and sharing information. Use this to inspect a file before you download its content.

`getFileContent`
:   Download the content of a file from Dropbox. Dropbox extracts text from documents up to 5 MB. For binary files, Dropbox returns base64-encoded content. Check file size with `getFileMetadata` before retrieving large files.

### Shared links

`createSharedLink`
:   Create a shared link for a file or folder. Returns a shareable URL. Defaults to `team_only` visibility (Dropbox team members only). The other option is `public` (anyone with the link).

`listSharedLinks`
:   List existing shared links in Dropbox. Optionally filter to links for a specific file or folder. Returns URLs, visibility settings, and expiration dates.

### Utilities

`whoAmI`
:   Retrieve details about the currently authenticated Dropbox user, including name, email, and account type. Use this to verify that authentication succeeded.

`listTools`
:   List all tools available on the Dropbox MCP server. Use this to discover capabilities not exposed as named actions, such as write operations (upload, move, copy, delete) and file versioning tools.

`callTool`
:   Call any tool on the Dropbox MCP server directly by name. Use this as a fallback for tools not yet exposed as named actions (such as `create_file`, `create_folder`, `copy`, `move`, `delete`, or `restore_file_revision`). Use `listTools` first to discover available tool names and their arguments.

## Connector networking configuration [dropbox-connector-networking-configuration]

Use the [Action configuration settings](/reference/configuration-reference/alerting-settings.md#action-settings) to customize connector networking, such as proxies, certificates, or TLS settings. You can set configurations that apply to all your connectors or use `xpack.actions.customHostSettings` to set per-host configurations.

## Get OAuth credentials [dropbox-oauth-credentials]

To use the Dropbox connector, you must register an app in the Dropbox App Console to obtain a Client ID and Client Secret.

1. Go to the [Dropbox App Console](https://www.dropbox.com/developers/apps) and sign in with your Dropbox account.
2. Select **Create app**.
3. Select **Scoped access**, then select **Full Dropbox**. To restrict access to a single folder, select **App folder** instead.
4. Enter a name for your app and select **Create app**.
5. In the **OAuth 2** section, under **Redirect URIs**, add `https://<your-kibana-host>/api/actions/connector/_oauth_callback`.
6. Open the **Permissions** tab and enable the following scopes:
   - `account_info.read`
   - `files.metadata.read`
   - `files.content.read`
   - `sharing.read`
   - `sharing.write`
7. Note the following values for use in {{kib}}:

   | Dropbox App Console label | {{kib}} field |
   |---------------------------|---------------|
   | **App key**               | Client ID     |
   | **App secret**            | Client Secret |

8. In {{kib}}, enter the values from the preceding table.
9. Complete the authorization flow to connect your Dropbox account.
