/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * SharePoint Online Connector
 *
 * This connector provides integration with Microsoft SharePoint Online via
 * the Microsoft Graph API. Features include:
 * - Site listing and retrieval
 * - Page listing within sites
 * - Cross-site search functionality
 *
 * Supports three Microsoft Entra ID auth flows:
 * - Delegated: OAuth 2.0 Authorization Code (per-user access)
 * - App-only:
 *    - certificate-based OAuth 2.0 client credentials, signed with a
 *   JWT assertion (PS256 + x5t#S256), per Microsoft's recommendation for
 *   production app-only access to Graph/SharePoint
 *   - secret-based OAuth 2.0 client credentials
 */

import { i18n } from '@kbn/i18n';
import { z, lazySchema } from '@kbn/zod/v4';
import type { ActionContext, ConnectorSpec } from '../../connector_spec';
/**
 * Common output schema for Microsoft Graph API responses that return a collection.
 * Uses z.any() for the array items to avoid over-specifying the response structure.
 */
const GraphCollectionOutputSchema = lazySchema(() =>
  z.object({
    value: z.array(z.any()).describe('Array of items returned from the API'),
    '@odata.nextLink': z.string().optional().describe('URL to fetch next page of results'),
  })
);

const APP_ONLY_AUTH_TYPES = new Set([
  'oauth_client_credentials',
  'oauth_client_credentials_private_key_jwt',
]);

const isAppOnlyAuth = (ctx: ActionContext): boolean => {
  const authType = ctx.secrets?.authType;
  return typeof authType === 'string' && APP_ONLY_AUTH_TYPES.has(authType);
};

export const SharepointOnline: ConnectorSpec = {
  metadata: {
    id: '.sharepoint-online',
    displayName: 'SharePoint Online',
    description: i18n.translate('core.kibanaConnectorSpecs.sharepointOnline.metadata.description', {
      defaultMessage:
        'Search content, browse sites and document libraries, and download files from SharePoint Online',
    }),
    minimumLicense: 'enterprise',
    isTechnicalPreview: true,
    supportedFeatureIds: ['workflows', 'agentBuilder'],
  },

  auth: {
    types: [
      {
        type: 'ears',
        isRecommended: true,
        overrides: {
          meta: { scope: { disabled: true } },
        },
        defaults: {
          provider: 'microsoft',
          scope: 'Sites.Selected Files.Read.All offline_access',
        },
      },
      {
        type: 'oauth_authorization_code',
        defaults: {
          scope: 'Sites.Selected Files.Read.All offline_access',
        },
        overrides: {
          meta: {
            authorizationUrl: {
              placeholder: 'https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/authorize',
              helpText: i18n.translate(
                'core.kibanaConnectorSpecs.sharepointOnline.auth.oauthCode.authorizationUrl.helpText',
                {
                  defaultMessage: "Replace '{tenant-id}' with your Azure AD tenant ID.",
                }
              ),
            },
            tokenUrl: {
              placeholder: 'https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token',
              helpText: i18n.translate(
                'core.kibanaConnectorSpecs.sharepointOnline.auth.oauthCode.tokenUrl.helpText',
                {
                  defaultMessage: "Replace '{tenant-id}' with your Azure AD tenant ID.",
                }
              ),
            },
            scope: { hidden: true },
          },
        },
      },
      {
        type: 'oauth_client_credentials',
        defaults: {
          scope: 'https://graph.microsoft.com/.default',
        },
        overrides: {
          meta: {
            scope: { hidden: true },
            tokenUrl: {
              label: i18n.translate(
                'core.kibanaConnectorSpecs.sharepointOnline.auth.oauth.tokenUrl.label',
                { defaultMessage: 'Token URL' }
              ),
              placeholder: 'https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token',
              helpText: i18n.translate(
                'core.kibanaConnectorSpecs.sharepointOnline.auth.oauth.tokenUrl.helpText',
                {
                  defaultMessage:
                    "Replace '{tenantId}' with your Azure AD tenant ID. For example: https://login.microsoftonline.com/your-tenant-id/oauth2/v2.0/token",
                  values: { tenantId: '{tenant-id}' },
                }
              ),
            },
          },
        },
      },
      {
        type: 'oauth_client_credentials_private_key_jwt',
        defaults: {
          scope: 'https://graph.microsoft.com/.default',
          algorithm: 'PS256',
          certificateBinding: 'x5t#S256',
        },
        overrides: {
          meta: {
            scope: { hidden: true },
            algorithm: { hidden: true },
            certificateBinding: { hidden: true },
            keyId: { hidden: true },
            tokenUrl: {
              placeholder: 'https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token',
              helpText: i18n.translate(
                'core.kibanaConnectorSpecs.sharepointOnline.auth.oauthCert.tokenUrl.helpText',
                {
                  defaultMessage:
                    "Replace '{tenant-id}' with your Microsoft Entra tenant ID. Before using this auth method, register an application in Microsoft Entra ID, grant it Microsoft Graph application permissions (Sites.Selected, Files.Read.All), and upload a self-signed or CA-issued X.509 certificate under Certificates & secrets > Certificates.",
                }
              ),
            },
            clientId: {
              helpText: i18n.translate(
                'core.kibanaConnectorSpecs.sharepointOnline.auth.oauthCert.clientId.helpText',
                {
                  defaultMessage:
                    'The Application (client) ID of the Entra app registration (Azure Portal > Entra ID > App registrations > your app > Overview).',
                }
              ),
            },
            certificate: {
              helpText: i18n.translate(
                'core.kibanaConnectorSpecs.sharepointOnline.auth.oauthCert.certificate.helpText',
                {
                  defaultMessage:
                    'Upload the PEM-encoded public certificate you uploaded to the Entra app registration. Must begin with -----BEGIN CERTIFICATE-----.',
                }
              ),
            },
            privateKey: {
              helpText: i18n.translate(
                'core.kibanaConnectorSpecs.sharepointOnline.auth.oauthCert.privateKey.helpText',
                {
                  defaultMessage:
                    'Upload the PEM-encoded private key that matches the uploaded certificate. Must begin with -----BEGIN PRIVATE KEY-----, -----BEGIN RSA PRIVATE KEY-----, or -----BEGIN ENCRYPTED PRIVATE KEY-----.',
                }
              ),
            },
            passphrase: {
              helpText: i18n.translate(
                'core.kibanaConnectorSpecs.sharepointOnline.auth.oauthCert.passphrase.helpText',
                {
                  defaultMessage:
                    'Only required if the private key is encrypted (ENCRYPTED PRIVATE KEY).',
                }
              ),
            },
          },
        },
      },
    ],
  },

  actions: {
    getAllSites: {
      isTool: true,
      description:
        'List all SharePoint sites the connector has access to. With app-only (client credentials) auth, returns all sites via /sites/getAllSites. With delegated (authorization code) auth, falls back to /sites?search= because getAllSites requires application permissions. Use this to discover site IDs needed by getSite, getSitePages, getSiteDrives, getSiteLists, and getSiteListItems.',
      input: z
        .object({
          search: z
            .string()
            .optional()
            .describe(
              'Optional search keyword to filter sites by name. Only used with delegated auth (oauth_authorization_code) where /sites/getAllSites is unavailable. With app-only auth this field is ignored. Omit or pass "*" for a wildcard that returns all accessible sites.'
            ),
        })
        .optional(),
      output: GraphCollectionOutputSchema,
      handler: async (ctx, input) => {
        const typedInput = input as { search?: string } | undefined;

        if (isAppOnlyAuth(ctx)) {
          ctx.log.debug('SharePoint listing all sites (app-only auth)');
          const response = await ctx.client.get(
            'https://graph.microsoft.com/v1.0/sites/getAllSites/',
            {
              params: {
                $select: 'id,displayName,webUrl,siteCollection',
              },
            }
          );
          return response.data;
        }

        // Delegated auth: /sites/getAllSites is application-only, so fall back to
        // /sites?search={query} which supports delegated permissions.
        const search = typedInput?.search || '*';
        ctx.log.debug(`SharePoint searching sites with keyword: ${search} (delegated auth)`);
        const response = await ctx.client.get('https://graph.microsoft.com/v1.0/sites', {
          params: {
            search,
            $select: 'id,displayName,webUrl,siteCollection',
          },
        });
        return response.data;
      },
    },

    getSitePages: {
      isTool: true,
      description:
        'List all pages in a SharePoint site. Returns page metadata (id, title, description, webUrl, createdDateTime, lastModifiedDateTime). Use getAllSites to discover siteId values, and then use getSitePageContents to fetch the full content of a specific page.',
      input: lazySchema(() =>
        z.object({
          siteId: z
            .string()
            .describe(
              'The ID of the SharePoint site whose pages you want to list. Use getAllSites to discover site IDs.'
            ),
        })
      ),
      output: GraphCollectionOutputSchema,
      handler: async (ctx, input) => {
        const typedInput = input as {
          siteId: string;
        };
        if (!typedInput.siteId) {
          throw new Error(
            'getSitePages requires a siteId. Use getAllSites to list available sites.'
          );
        }
        ctx.log.debug(`SharePoint listing all pages from siteId ${typedInput.siteId}`);
        const response = await ctx.client.get(
          `https://graph.microsoft.com/v1.0/sites/${typedInput.siteId}/pages/`,
          {
            params: {
              $select: 'id,title,description,webUrl,createdDateTime,lastModifiedDateTime',
            },
          }
        );
        return response.data;
      },
    },

    getSitePageContents: {
      isTool: true,
      description:
        'Fetch the full HTML content of a SharePoint site page, including its canvas layout. Use this to read wiki/news pages. Use getAllSites to discover siteId values, and getSitePages to discover pageId values for a given site.',
      input: lazySchema(() =>
        z.object({
          siteId: z
            .string()
            .describe(
              'The ID of the SharePoint site that contains the page. Use getAllSites to discover site IDs.'
            ),
          pageId: z
            .string()
            .describe(
              'The ID of the page to fetch. Use getSitePages to list pages and discover their IDs for a given site.'
            ),
        })
      ),
      output: z.any(),
      handler: async (ctx, input) => {
        const typedInput = input as {
          siteId: string;
          pageId: string;
        };
        if (!typedInput.siteId) {
          throw new Error(
            'getSitePageContents requires a siteId. Use getAllSites to list available sites.'
          );
        }
        if (!typedInput.pageId) {
          throw new Error(
            'getSitePageContents requires a pageId. Use getSitePages to list available pages for a site.'
          );
        }
        const url = `https://graph.microsoft.com/v1.0/sites/${typedInput.siteId}/pages/${typedInput.pageId}/microsoft.graph.sitePage`;

        ctx.log.debug(`SharePoint getting page contents from ${url}`);
        const response = await ctx.client.get(url, {
          params: {
            $expand: 'canvasLayout',
            $select:
              'id,title,description,webUrl,createdDateTime,lastModifiedDateTime,canvasLayout',
          },
        });
        return response.data;
      },
    },

    getSite: {
      isTool: true,
      description:
        'Retrieve details for a single SharePoint site by either its site ID or its relative URL. Returns id, displayName, webUrl, siteCollection, createdDateTime, and lastModifiedDateTime. Use getAllSites to discover site IDs, or provide a relativeUrl in the format "contoso.sharepoint.com:/sites/hr:".',
      input: lazySchema(() =>
        z.union([
          z
            .object({
              siteId: z
                .string()
                .describe(
                  'The ID of the SharePoint site to retrieve. Use getAllSites to discover site IDs.'
                ),
            })
            .strict(),
          z
            .object({
              relativeUrl: z
                .string()
                .describe(
                  'The relative URL of the site as a path in the format "hostname:/path:", e.g. "contoso.sharepoint.com:/sites/hr:". Use this as an alternative to siteId when you know the URL but not the ID.'
                ),
            })
            .strict(),
        ])
      ),
      handler: async (ctx, input) => {
        const typedInput = input as { siteId: string } | { relativeUrl: string };
        const hasSiteId = 'siteId' in typedInput && typedInput.siteId;
        const hasRelativeUrl = 'relativeUrl' in typedInput && typedInput.relativeUrl;
        if (!hasSiteId && !hasRelativeUrl) {
          throw new Error(
            'getSite requires either a siteId or a relativeUrl. Use getAllSites to discover sites.'
          );
        }

        let url = 'https://graph.microsoft.com/v1.0/sites/';
        if ('siteId' in typedInput) {
          url += typedInput.siteId;
        } else {
          url += typedInput.relativeUrl;
        }

        ctx.log.debug(`SharePoint getting site info via ${url}`);
        const response = await ctx.client.get(url, {
          params: {
            $select: 'id,displayName,webUrl,siteCollection,createdDateTime,lastModifiedDateTime',
          },
        });
        return response.data;
      },
    },

    getSiteDrives: {
      isTool: true,
      description:
        'List all document libraries (drives) within a SharePoint site. Returns drive metadata including id, name, driveType, webUrl, and owner. Use getAllSites to discover siteId values. Drive IDs returned here are required by getDriveItems and downloadDriveItem.',
      input: lazySchema(() =>
        z.object({
          siteId: z
            .string()
            .describe(
              'The ID of the SharePoint site whose document libraries (drives) you want to list. Use getAllSites to discover site IDs.'
            ),
        })
      ),
      output: GraphCollectionOutputSchema,
      handler: async (ctx, input) => {
        const typedInput = input as {
          siteId: string;
        };

        if (!typedInput.siteId) {
          throw new Error(
            'getSiteDrives requires a siteId. Use getAllSites to list available sites.'
          );
        }
        ctx.log.debug(`SharePoint getting all drives of site ${typedInput.siteId}`);
        const response = await ctx.client.get(
          `https://graph.microsoft.com/v1.0/sites/${typedInput.siteId}/drives/`,
          {
            params: {
              $select:
                'id,name,driveType,webUrl,createdDateTime,lastModifiedDateTime,description,owner',
            },
          }
        );
        return response.data;
      },
    },

    getSiteLists: {
      isTool: true,
      description:
        'List all SharePoint lists within a site (e.g., custom lists, document libraries represented as lists). Returns id, displayName, name, webUrl, and description for each list. Use getAllSites to discover siteId values. List IDs returned here are required by getSiteListItems.',
      input: lazySchema(() =>
        z
          .object({
            siteId: z
              .string()
              .describe(
                'The ID of the SharePoint site whose lists you want to enumerate. Use getAllSites to discover site IDs.'
              ),
          })
          .strict()
      ),
      output: GraphCollectionOutputSchema,
      handler: async (ctx, input) => {
        const typedInput = input as {
          siteId: string;
        };

        if (!typedInput.siteId) {
          throw new Error(
            'getSiteLists requires a siteId. Use getAllSites to list available sites.'
          );
        }
        ctx.log.debug(`SharePoint getting all lists of site ${typedInput.siteId}`);
        const response = await ctx.client.get(
          `https://graph.microsoft.com/v1.0/sites/${typedInput.siteId}/lists/`,
          {
            params: {
              $select:
                'id,displayName,name,webUrl,description,createdDateTime,lastModifiedDateTime',
            },
          }
        );
        return response.data;
      },
    },

    getSiteListItems: {
      isTool: true,
      description:
        'Fetch all items from a specific list within a SharePoint site. Returns item metadata (id, webUrl, createdDateTime, lastModifiedDateTime, createdBy, lastModifiedBy). Use getAllSites to discover siteId values and getSiteLists to discover listId values.',
      input: lazySchema(() =>
        z.object({
          siteId: z
            .string()
            .describe(
              'The ID of the SharePoint site that owns the list. Use getAllSites to discover site IDs.'
            ),
          listId: z
            .string()
            .describe(
              'The ID of the list whose items you want to retrieve. Use getSiteLists to discover list IDs for a given site.'
            ),
        })
      ),
      output: GraphCollectionOutputSchema,
      handler: async (ctx, input) => {
        const typedInput = input as {
          siteId: string;
          listId: string;
        };

        if (!typedInput.siteId) {
          throw new Error(
            'getSiteListItems requires a siteId. Use getAllSites to list available sites.'
          );
        }
        if (!typedInput.listId) {
          throw new Error(
            'getSiteListItems requires a listId. Use getSiteLists to list available lists for a site.'
          );
        }
        ctx.log.debug(
          `SharePoint getting all items of list ${typedInput.listId} of site ${typedInput.siteId}`
        );
        const response = await ctx.client.get(
          `https://graph.microsoft.com/v1.0/sites/${typedInput.siteId}/lists/${typedInput.listId}/items/`,
          {
            params: {
              $select: 'id,webUrl,createdDateTime,lastModifiedDateTime,createdBy,lastModifiedBy',
            },
          }
        );
        return response.data;
      },
    },

    getDriveItems: {
      isTool: true,
      description:
        'List files and folders within a SharePoint document library (drive), optionally scoped to a subfolder path. Returns item metadata including id, name, webUrl, size, and @microsoft.graph.downloadUrl. Use getSiteDrives to discover driveId values. The @microsoft.graph.downloadUrl field can be passed to downloadItemFromURL.',
      input: lazySchema(() =>
        z.object({
          driveId: z
            .string()
            .describe(
              'The ID of the document library (drive) to browse. Use getSiteDrives to discover drive IDs for a site.'
            ),
          path: z
            .string()
            .optional()
            .describe(
              'Optional relative path within the drive root to scope the listing (e.g. "Folder/Subfolder"). Omit to list the root of the drive.'
            ),
        })
      ),
      handler: async (ctx, input) => {
        const typedInput = input as { driveId: string; path?: string };
        if (!typedInput.driveId) {
          throw new Error(
            'getDriveItems requires a driveId. Use getSiteDrives to list available drives for a site.'
          );
        }
        const baseUrl = `https://graph.microsoft.com/v1.0/drives/${typedInput.driveId}`;
        const url = typedInput.path
          ? `${baseUrl}/root:/${typedInput.path}:/children`
          : `${baseUrl}/root/children`;

        ctx.log.debug(`SharePoint getting drive items from ${url}`);
        const response = await ctx.client.get(url, {
          params: {
            $select:
              'id,name,webUrl,createdDateTime,lastModifiedDateTime,size,@microsoft.graph.downloadUrl',
          },
        });
        return response.data;
      },
    },

    downloadDriveItem: {
      isTool: true,
      description:
        'Download the content of a file from a SharePoint document library and return it as UTF-8 text. Best suited for plain-text or markdown files. For PDFs, .docx, and other binary formats that require preprocessing, use downloadItemFromURL instead (which returns base64 for Elasticsearch ingest pipeline extraction). Use getSiteDrives to find driveId and getDriveItems to find itemId.',
      input: lazySchema(() =>
        z.object({
          driveId: z
            .string()
            .describe(
              'The ID of the document library (drive) that contains the file. Use getSiteDrives to discover drive IDs.'
            ),
          itemId: z
            .string()
            .describe(
              'The ID of the file item to download. Use getDriveItems to list items in a drive and discover their IDs.'
            ),
        })
      ),
      output: lazySchema(() =>
        z.object({
          contentType: z.string().optional().describe('Content-Type header'),
          contentLength: z.string().optional().describe('Content-Length header'),
          text: z.string().describe('File content as UTF-8 text'),
        })
      ),
      handler: async (ctx, input) => {
        const typedInput = input as {
          driveId: string;
          itemId: string;
        };
        if (!typedInput.driveId) {
          throw new Error(
            'downloadDriveItem requires a driveId. Use getSiteDrives to list available drives for a site.'
          );
        }
        if (!typedInput.itemId) {
          throw new Error(
            'downloadDriveItem requires an itemId. Use getDriveItems to list available items in a drive.'
          );
        }
        const baseUrl = `https://graph.microsoft.com/v1.0/drives/${typedInput.driveId}/items/${typedInput.itemId}`;

        const contentUrl = `${baseUrl}/content`;
        ctx.log.debug(`SharePoint downloading drive item content from ${contentUrl}`);
        const response = await ctx.client.get(contentUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        return {
          contentType: response.headers?.['content-type'],
          contentLength: response.headers?.['content-length'],
          text: buffer.toString('utf8'),
        };
      },
    },

    downloadItemFromURL: {
      isTool: true,
      description:
        'Download a SharePoint file using its pre-authenticated @microsoft.graph.downloadUrl and return the content as a base64-encoded string. Use this for PDFs, .docx, and other binary formats that require preprocessing via an Elasticsearch ingest pipeline attachment processor. For plain-text or markdown files you can use downloadDriveItem instead. Use getDriveItems to find the @microsoft.graph.downloadUrl field on a file item.',
      input: lazySchema(() =>
        z.object({
          downloadUrl: z
            .string()
            .url()
            .describe(
              'The pre-authenticated download URL for the file. This is the @microsoft.graph.downloadUrl property returned by getDriveItems. Note: these URLs are time-limited and should be used promptly.'
            ),
        })
      ),
      output: lazySchema(() =>
        z.object({
          contentType: z.string().optional().describe('Content-Type header'),
          contentLength: z.string().optional().describe('Content-Length header'),
          base64: z.string().describe('File content as base64-encoded string'),
        })
      ),
      handler: async (ctx, input) => {
        const typedInput = input as {
          downloadUrl: string;
        };

        if (!typedInput.downloadUrl) {
          throw new Error(
            'downloadItemFromURL requires a downloadUrl. Use getDriveItems to find items with @microsoft.graph.downloadUrl.'
          );
        }
        ctx.log.debug(`SharePoint downloading item from URL ${typedInput.downloadUrl}`);
        const response = await ctx.client.get(typedInput.downloadUrl, {
          responseType: 'arraybuffer',
        });
        const buffer = Buffer.from(response.data);
        return {
          contentType: response.headers?.['content-type'],
          contentLength: response.headers?.['content-length'],
          base64: buffer.toString('base64'),
        };
      },
    },

    callGraphAPI: {
      isTool: true,
      description: 'Call a Microsoft Graph v1.0 endpoint by path only (e.g., /v1.0/me).',
      input: lazySchema(() =>
        z.object({
          method: z.enum(['GET', 'POST']).describe('HTTP method'),
          path: z
            .string()
            .describe("Graph path starting with '/v1.0/' (e.g., '/v1.0/me')")
            .refine((value) => value.startsWith('/v1.0/'), {
              message: "Path must start with '/v1.0/'",
            })
            .refine((value) => !/^https?:\/\//i.test(value), {
              message: 'Path must not be a full URL',
            }),
          query: z
            .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
            .optional()
            .describe('Query parameters (e.g., $top, $filter)'),
          body: z.any().optional().describe('Request body (for POST)'),
        })
      ),
      output: z.any(),
      handler: async (ctx, input) => {
        const typedInput = input as {
          method: 'GET' | 'POST';
          path: string;
          query?: Record<string, string | number | boolean>;
          body?: unknown;
        };

        const url = `https://graph.microsoft.com${typedInput.path}`;
        ctx.log.debug(`SharePoint callGraphAPI ${typedInput.method} ${url}`);

        const response = await ctx.client.request({
          method: typedInput.method,
          url,
          params: typedInput.query,
          data: typedInput.body,
        });

        return {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: response.data,
        };
      },
    },

    search: {
      isTool: true,
      description:
        'Search SharePoint content using the Microsoft Graph Search API with Keyword Query Language (KQL). Supports searching across sites, lists, list items, drives, and drive items. Note: not all entity type combinations can be mixed in a single request — valid groupings are (driveItem, listItem), (site, list), or (drive) alone.',
      input: lazySchema(() =>
        z.object({
          query: z
            .string()
            .describe(
              'KQL search query string. Examples: "contoso product", "filename:budget filetype:xlsx", "author:jane AND filetype:docx". Supports standard KQL operators (AND, OR, NOT) and property restrictions.'
            ),
          entityTypes: z
            .array(z.enum(['site', 'list', 'listItem', 'drive', 'driveItem']))
            .optional()
            .describe(
              'Entity types to include in the search. Valid groupings (cannot be mixed arbitrarily): (driveItem, listItem), (site, list), or (drive) alone. Defaults to ["site"] if omitted.'
            ),
          region: z
            .enum(['NAM', 'EUR', 'APC', 'LAM', 'MEA'])
            .optional()
            .describe(
              'Search region. Only used with app-only (client credentials) auth — ignored for delegated auth. NAM=North America, EUR=Europe, APC=Asia Pacific, LAM=Latin America, MEA=Middle East/Africa. Defaults to NAM when using app-only auth.'
            ),
          from: z
            .number()
            .default(0)
            .describe('Zero-based pagination offset (number of results to skip). Defaults to 0.'),
          size: z
            .number()
            .min(1)
            .max(500)
            .default(25)
            .describe(
              'Number of results to return per page. Must be between 1 and 500. Defaults to 25.'
            ),
        })
      ),
      output: z.any(),
      handler: async (ctx, input) => {
        const typedInput = input as {
          query: string;
          entityTypes?: Array<'site' | 'list' | 'listItem' | 'drive' | 'driveItem'>;
          from?: number;
          size?: number;
          region?: 'NAM' | 'EUR' | 'APC' | 'LAM' | 'MEA';
        };

        if (!typedInput.query) {
          throw new Error(
            'search requires a query string. Provide a KQL query to search SharePoint content.'
          );
        }

        // region is only required for app-only (client credentials) auth.
        // Sending region with delegated auth can cause a 400 error.
        const searchRequest = {
          requests: [
            {
              entityTypes: typedInput.entityTypes ?? ['site'],
              query: {
                queryString: typedInput.query,
              },
              ...(isAppOnlyAuth(ctx) && { region: typedInput.region ?? 'NAM' }),
              ...(typedInput.from !== undefined && { from: typedInput.from }),
              ...(typedInput.size !== undefined && { size: typedInput.size }),
            },
          ],
        };

        const response = await ctx.client.post(
          'https://graph.microsoft.com/v1.0/search/query',
          searchRequest
        );
        return response.data;
      },
    },
  },

  test: {
    description: i18n.translate('core.kibanaConnectorSpecs.sharepointOnline.test.description', {
      defaultMessage: 'Verifies SharePoint Online connection by checking API access',
    }),
    handler: async (ctx) => {
      ctx.log.debug('SharePoint Online test handler');

      try {
        const response = await ctx.client.get('https://graph.microsoft.com/v1.0/');
        const siteName = response.data.displayName || 'Unknown';
        return {
          ok: true,
          message: `Successfully connected to SharePoint Online: ${siteName}`,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { ok: false, message };
      }
    },
  },

  skill: [
    '## SharePoint Online Connector Usage Guide',
    '',
    '### Navigation Pattern',
    'Use this hierarchy to browse SharePoint content:',
    '1. `getAllSites` — discover sites and their IDs',
    '2. `getSiteDrives` / `getSiteLists` — discover document libraries (drives) or custom lists within a site',
    '3. `getDriveItems` / `getSiteListItems` — list files/folders in a drive or items in a list',
    '4. `downloadDriveItem` / `downloadItemFromURL` — download file content',
    '',
    'For wiki/news pages: `getAllSites` → `getSitePages` → `getSitePageContents`',
    '',
    '### Search vs Browse',
    '- **Use `search`** when you have a keyword or phrase and want to find matching content across SharePoint (KQL syntax). Good for "find all budget spreadsheets" or "documents by author Jane".',
    '- **Use browse** (`getAllSites` → `getSiteDrives` → `getDriveItems`) when you need structured navigation — e.g., listing everything in a specific folder or enumerating all items in a library.',
    '',
    '### Auth Mode Differences',
    '- **App-only auth (`oauth_client_credentials` or `oauth_client_credentials_private_key_jwt`)**: `getAllSites` calls `/sites/getAllSites` and returns all sites the app has access to. The `search` parameter is ignored. The `search` action requires a `region` parameter (defaults to `NAM`).',
    '- **Delegated auth (`oauth_authorization_code` or `ears`)**: `getAllSites` falls back to `/sites?search=` — provide a keyword or omit for wildcard (`*`). The `search` action does not use `region` (omit it to avoid 400 errors).',
    '',
    '### Escape Hatch',
    'Use `callGraphAPI` to call any Microsoft Graph v1.0 endpoint not covered by the named actions. Paths must start with `/v1.0/`. Useful for accessing user profiles, calendar data, or other Graph resources.',
    '',
    '### Common Gotchas',
    '- `@microsoft.graph.downloadUrl` values are time-limited pre-authenticated URLs — use them promptly after calling `getDriveItems`.',
    '- `getSite` accepts either a `siteId` or a `relativeUrl` (format: `"contoso.sharepoint.com:/sites/hr:"`) — provide one or the other, not both.',
    '- Drive IDs and site IDs are different — always use `getSiteDrives` to get drive IDs for a given site.',
  ].join('\n'),
};
