---
navigation_title: "OneDrive"
type: reference
description: "Use the OneDrive connector to search, browse, and read files and folders from Microsoft OneDrive."
applies_to:
  stack: preview 9.5
  serverless: preview
---

# OneDrive connector [one-drive-action-type]

The OneDrive connector enables searching files and folders, browsing drives, reading file content, and listing files shared with you in Microsoft OneDrive.

## Create connectors in {{kib}} [define-one-drive-ui]

You can create connectors in **{{stack-manage-app}} > {{connectors-ui}}**.

### Connector configuration [one-drive-connector-configuration]

OneDrive connectors use **OAuth 2.0 authorization code** (Microsoft Entra ID). In {{kib}}, you provide:

Client ID
:   The Application (client) ID from your Azure App registration.

Client Secret
:   A client secret generated for your Azure App registration.

Authorization URL
:   The Microsoft Entra ID authorization endpoint for your tenant.
    Replace `{tenant-id}` with your Directory (tenant) ID:
    `https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/authorize`

Token URL
:   The Microsoft Entra ID token endpoint for your tenant.
    Replace `{tenant-id}` with your Directory (tenant) ID:
    `https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token`

## Test connectors [one-drive-action-configuration]

The OneDrive connector has the following actions:

Get me
:   Retrieve details about the authenticated Microsoft account, including display name, email address, and user ID.

Get drive
:   Retrieve metadata about the authenticated user's personal OneDrive, including quota information (used space and total capacity), drive ID, and owner details.

Get item children
:   List the files and subfolders within a OneDrive folder.
    - `itemId` (optional): ID of the folder to list. Omit or pass an empty string to list the root of the drive.
    - `top` (optional): Maximum number of items to return (1–200). Defaults to 50.
    - `pageToken` (optional): Continuation token from a previous response's `nextPageToken` field to fetch the next page.

Search
:   Search for files and folders in OneDrive by keyword. Searches across file names and content.
    - `query` (required on the first page): Keyword or phrase to search for. For example, `Q3 budget report`. Must be re-passed alongside `pageToken` on subsequent pages.
    - `top` (optional): Maximum number of results to return (1–200). Defaults to 25.
    - `pageToken` (optional): Continuation token from a previous response's `nextPageToken` field to fetch the next page.

Get file metadata
:   Get detailed metadata for a specific file or folder by its item ID, including name, size, content type, modification date, path, and a time-limited download URL.
    - `itemId` (required): ID of the file or folder. Use item IDs returned by search or Get item children. For shared or recent items with a `remoteItem`, use `remoteItem.id`.
    - `driveId` (optional): Drive ID that owns the item. Required for shared or recent items that have a `remoteItem` — use `remoteItem.parentReference.driveId`. Omit for items from your own drive.

Get file content
:   Download the content of a file from OneDrive. For text files (`.txt`, `.md`, `.csv`, `.json`), the connector returns a plain UTF-8 string. For binary files (PDFs, `.docx`, `.xlsx`, images), the connector returns base64-encoded content. The response includes an `encoding` field (`utf-8` or `base64`) and a `mimeType` field.

    ::::{warning}
    Large files and binary formats produce very large payloads. Only use this action when you have a plan to process the data, for example through an Elasticsearch ingest pipeline attachment processor.
    ::::

    - `itemId` (required): ID of the file to download. Use item IDs returned by search or Get item children. For shared or recent items with a `remoteItem`, use `remoteItem.id`.
    - `driveId` (optional): Drive ID that owns the item. Required for shared or recent items that have a `remoteItem` — use `remoteItem.parentReference.driveId`. Omit for items from your own drive.

List shared with me
:   List files that others have shared with the authenticated user, including name, URL, size, and sharing owner.
    - `pageToken` (optional): Continuation token from a previous response's `nextPageToken` field to fetch the next page.

List recent files
:   List files the authenticated user has recently accessed or modified.
    - `pageToken` (optional): Continuation token from a previous response's `nextPageToken` field to fetch the next page.

## Get API credentials [one-drive-api-credentials]

To use the OneDrive connector, register an application in Microsoft Azure and grant it the required Microsoft Graph API permissions.

1. Sign in to the [Azure portal](https://portal.azure.com/).
2. Navigate to **Microsoft Entra ID** > **App registrations** > **New registration**.
   - Give the application a name, for example `Elastic Kibana OneDrive`.
   - Under **Supported account types**, select **Accounts in this organizational directory only** (single tenant).
   - Under **Redirect URI**, select **Web** and enter {{kib}}'s connector OAuth callback:
     ```text
     https://<your-kibana-host>/api/actions/connector/_oauth_callback
     ```
   - Select **Register**.
3. On the **Overview** page, copy the **Application (client) ID** and the **Directory (tenant) ID**.
4. Navigate to **Certificates & secrets** > **New client secret**. Enter a description and choose an expiry. Copy the secret **Value** (it is only shown once).
5. Navigate to **API permissions** > **Add a permission** > **Microsoft Graph** > **Delegated permissions**. Add the following permissions:
   - `Files.Read.All`
   - `User.Read`
   - `offline_access`
6. Select **Grant admin consent** for your organization if your admin policy requires it.

In {{kib}}, create the connector with:
- **Client ID**: the Application (client) ID from step 3
- **Client Secret**: the client secret value from step 4
- **Authorization URL**: `https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/authorize` (replace `{tenant-id}` with the Directory (tenant) ID from step 3)
- **Token URL**: `https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token` (replace `{tenant-id}` with the Directory (tenant) ID from step 3)
