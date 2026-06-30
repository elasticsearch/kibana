/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { i18n } from '@kbn/i18n';
import { z, lazySchema } from '@kbn/zod/v4';
import type { ConnectorSpec } from '../../connector_spec';
const SALESFORCE_API_VERSION = 'v66.0';

/** Derive instance base URL from the full token URL (strip /services/oauth2/token and any path). */
function getBaseUrl(tokenUrl: string | undefined): string {
  if (!tokenUrl || tokenUrl.trim() === '') {
    throw new Error(
      'Salesforce connector is not configured: tokenUrl (OAuth token endpoint) is required.'
    );
  }
  const base = tokenUrl.includes('/services/oauth2/token')
    ? tokenUrl.replace(/\/services\/oauth2\/token.*$/, '')
    : tokenUrl;
  return base.replace(/\/+$/, '');
}

/** Resolve Salesforce nextRecordsUrl (relative path) to a full URL. */
function createPaginationUrl(baseUrl: string, nextRecordsUrl: string): string {
  return `${baseUrl}${nextRecordsUrl}`;
}

/** Salesforce object API names: letters, numbers, underscore only. Throws if invalid (SOQL injection safety). */
const SOBJECT_NAME_REGEX = /^[A-Za-z0-9_]+$/;
function validateSobjectName(name: string): void {
  if (!name || !SOBJECT_NAME_REGEX.test(name.trim())) {
    throw new Error(
      `Invalid sobject name: must contain only letters, numbers, and underscore (e.g. Account, MyObject__c). Got: ${
        name?.substring(0, 50) ?? ''
      }`
    );
  }
}

export const SalesforceConnector: ConnectorSpec = {
  metadata: {
    id: '.salesforce',
    displayName: 'Salesforce',
    description: i18n.translate('core.kibanaConnectorSpecs.salesforce.metadata.description', {
      defaultMessage: 'Query records, search, describe objects, and download files in Salesforce',
    }),
    minimumLicense: 'enterprise',
    isTechnicalPreview: true,
    supportedFeatureIds: ['workflows', 'agentBuilder'],
  },

  auth: {
    types: [
      {
        type: 'oauth_authorization_code',
        isRecommended: true,
        defaults: {
          scope: 'api refresh_token',
        },
        overrides: {
          meta: {
            authorizationUrl: {
              placeholder: 'https://login.salesforce.com/services/oauth2/authorize',
            },
            tokenUrl: {
              placeholder: 'https://login.salesforce.com/services/oauth2/token',
            },
            scope: { hidden: true },
          },
        },
      },
      {
        type: 'oauth_client_credentials',
        defaults: {},
        overrides: {
          meta: {
            scope: { hidden: true },
          },
        },
      },
    ],
  },

  actions: {
    query: {
      isTool: true,
      input: lazySchema(() =>
        z.object({
          soql: z
            .string()
            .describe(
              'SOQL query. Prefer LIMIT 10-20 and WHERE to narrow results; use nextRecordsUrl from response for more.'
            ),
          nextRecordsUrl: z.string().optional().describe('Pagination URL from previous response'),
        })
      ),
      handler: async (ctx, input) => {
        const typedInput = input as { soql: string; nextRecordsUrl?: string };
        const baseUrl = getBaseUrl(ctx.secrets?.tokenUrl as string | undefined);
        if (typedInput.nextRecordsUrl) {
          const url = createPaginationUrl(baseUrl, typedInput.nextRecordsUrl);
          const response = await ctx.client.get(url, {});
          return response.data;
        }
        const response = await ctx.client.get(
          `${baseUrl}/services/data/${SALESFORCE_API_VERSION}/query`,
          { params: { q: typedInput.soql } }
        );
        return response.data;
      },
    },

    get_record: {
      isTool: true,
      input: lazySchema(() =>
        z.object({
          sobjectName: z
            .string()
            .describe(
              'SObject API name (standard or custom, e.g. Account, Contact, MyObject__c). Must match the object that owns the record.'
            ),
          recordId: z
            .string()
            .describe(
              'Record Id (15- or 18-char). Get from query, list_records, or search results.'
            ),
        })
      ),
      handler: async (ctx, input) => {
        const typedInput = input as { sobjectName: string; recordId: string };
        validateSobjectName(typedInput.sobjectName);
        const baseUrl = getBaseUrl(ctx.secrets?.tokenUrl as string | undefined);
        const sobjectSegment = encodeURIComponent(typedInput.sobjectName.trim());
        const recordIdSegment = encodeURIComponent(typedInput.recordId);
        const response = await ctx.client.get(
          `${baseUrl}/services/data/${SALESFORCE_API_VERSION}/sobjects/${sobjectSegment}/${recordIdSegment}`,
          {}
        );
        return response.data;
      },
    },

    list_records: {
      isTool: true,
      input: lazySchema(() =>
        z.object({
          sobjectName: z.string().describe('SObject API name (e.g. Account, Contact, MyObject__c)'),
          limit: z
            .number()
            .default(10)
            .describe('Max records to return (1-2000). Prefer 10-20 to keep context small.'),
          nextRecordsUrl: z.string().optional().describe('Pagination URL from previous response'),
        })
      ),
      handler: async (ctx, input) => {
        const typedInput = input as {
          sobjectName: string;
          limit: number;
          nextRecordsUrl?: string;
        };
        const baseUrl = getBaseUrl(ctx.secrets?.tokenUrl as string | undefined);
        if (typedInput.nextRecordsUrl) {
          const url = createPaginationUrl(baseUrl, typedInput.nextRecordsUrl);
          const response = await ctx.client.get(url, {});
          return response.data;
        }
        validateSobjectName(typedInput.sobjectName);
        const limit = Math.min(typedInput.limit ?? 10, 2000);
        const soql = `SELECT Id FROM ${typedInput.sobjectName.trim()} LIMIT ${limit}`;
        const response = await ctx.client.get(
          `${baseUrl}/services/data/${SALESFORCE_API_VERSION}/query`,
          { params: { q: soql } }
        );
        return response.data;
      },
    },

    search: {
      isTool: true,
      input: lazySchema(() =>
        z.object({
          searchTerm: z
            .string()
            .describe(
              'Search phrase for SOSL full-text search (e.g. "Acme Corp" or "Q4 renewal"). Only searches objects listed in returning; not all text fields are indexed; results capped at ~2000. Prefer query (SOQL) for structured filtering; use search for broad text discovery.'
            ),
          returning: z
            .string()
            .describe(
              'Object API names to search, comma-separated (e.g. Account,Contact). Prefer 1-3 types to keep result size down. Custom objects require "Allow Search" enabled. Use describe to discover object names.'
            ),
          nextRecordsUrl: z.string().optional().describe('Pagination URL from previous response'),
        })
      ),
      handler: async (ctx, input) => {
        const typedInput = input as {
          searchTerm: string;
          returning: string;
          nextRecordsUrl?: string;
        };
        const baseUrl = getBaseUrl(ctx.secrets?.tokenUrl as string);
        if (typedInput.nextRecordsUrl) {
          const url = createPaginationUrl(baseUrl, typedInput.nextRecordsUrl);
          const response = await ctx.client.get(url, {});
          return response.data;
        }
        const soslQuery = `FIND {${
          typedInput.searchTerm
        }} RETURNING ${typedInput.returning.trim()}`;
        const response = await ctx.client.get(
          `${baseUrl}/services/data/${SALESFORCE_API_VERSION}/search`,
          { params: { q: soslQuery } }
        );
        return response.data;
      },
    },

    describe: {
      isTool: true,
      input: lazySchema(() =>
        z.object({
          sobjectName: z
            .string()
            .describe(
              'SObject API name. Use before query or search to discover field names, relationships, and picklist values. Common standard objects you can describe without prior discovery: Account (companies/orgs), Contact (people linked to Account), Opportunity (sales deals with stage/amount/close date), Case (support tickets), Lead (unqualified prospects), Task (action items/follow-ups), ContentVersion (file/attachment versions; use with ContentDocumentLink for downloads). Custom objects always end with __c (e.g. MyObject__c).'
            ),
        })
      ),
      handler: async (ctx, input) => {
        const typedInput = input as { sobjectName: string };
        validateSobjectName(typedInput.sobjectName);
        const baseUrl = getBaseUrl(ctx.secrets?.tokenUrl as string | undefined);
        const sobjectSegment = encodeURIComponent(typedInput.sobjectName.trim());
        const response = await ctx.client.get(
          `${baseUrl}/services/data/${SALESFORCE_API_VERSION}/sobjects/${sobjectSegment}/describe`,
          {}
        );
        return response.data;
      },
    },

    download_file: {
      isTool: true,
      description:
        'Download a file from Salesforce by its ContentVersion Id. Returns the file as base64-encoded data with its content type. WARNING: Returns potentially large base64 payloads. Only call this when you have a plan to process the binary data (e.g. via an Elasticsearch ingest pipeline attachment processor). Use SOQL on ContentDocumentLink and ContentVersion to discover file Ids first.',
      input: lazySchema(() =>
        z.object({
          contentVersionId: z
            .string()
            .describe(
              'ContentVersion record Id (15 or 18 chars). Get from SOQL on ContentVersion or ContentDocumentLink. Returns base64-encoded file content and content-type.'
            ),
        })
      ),
      handler: async (ctx, input) => {
        const typedInput = input as { contentVersionId: string };
        const baseUrl = getBaseUrl(ctx.secrets?.tokenUrl as string | undefined);
        const id = encodeURIComponent(typedInput.contentVersionId.trim());
        const url = `${baseUrl}/services/data/${SALESFORCE_API_VERSION}/sobjects/ContentVersion/${id}/VersionData`;
        const response = await ctx.client.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data as ArrayBuffer);
        return {
          base64: buffer.toString('base64'),
          contentType: (response.headers as { 'content-type'?: string })?.['content-type'],
        };
      },
    },
  },

  test: {
    description: i18n.translate('core.kibanaConnectorSpecs.salesforce.test.description', {
      defaultMessage: 'Verifies Salesforce connection by running a simple query',
    }),
    handler: async (ctx) => {
      ctx.log.debug('Salesforce test handler');

      try {
        const baseUrl = getBaseUrl(ctx.secrets?.tokenUrl as string | undefined);
        await ctx.client.get(`${baseUrl}/services/data/${SALESFORCE_API_VERSION}/query`, {
          params: { q: 'SELECT Id FROM User LIMIT 1' },
        });
        return {
          ok: true,
          message: 'Successfully connected to Salesforce',
        };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  },

  skill: [
    '## Salesforce connector — LLM usage guide',
    '',
    '### Discovery: always describe before querying',
    'Before writing a SOQL query or SOSL search against an unfamiliar object, call `describe` with the SObject API name.',
    '`describe` returns every field name, its type, relationships to other objects, and picklist values.',
    '',
    '### Choosing between get_record, list_records, and query',
    '- `get_record`: use when you already have a record Id and want all fields for that single record.',
    '- `list_records`: use when you need a quick list of Ids for a known object type with no filtering.',
    '  Returns only `Id` by default; follow up with `get_record` or `query` for field details.',
    '- `query`: use when you need filtering (`WHERE`), specific field selection, sorting, or joins across objects.',
    '  This is the most flexible option and should be preferred when more than just Ids are needed.',
    '',
    '### File downloads',
    'Salesforce stores files as `ContentVersion` records linked to any object via `ContentDocumentLink`.',
    'Workflow to download a file:',
    '1. Query `ContentDocumentLink` to find file links for a record:',
    "   `SELECT ContentDocumentId FROM ContentDocumentLink WHERE LinkedEntityId = '<recordId>'`",
    '2. Query `ContentVersion` to get the version Id:',
    "   `SELECT Id, Title, FileType FROM ContentVersion WHERE ContentDocumentId = '<docId>' AND IsLatest = true LIMIT 1`",
    '3. Call `download_file` with the `ContentVersion` Id.',
    '   The response includes `base64`-encoded file content and `contentType`.',
    '   WARNING: download_file returns potentially large base64 payloads. Only call it when you',
    '   have a plan to process the binary data (e.g. via an Elasticsearch ingest pipeline',
    '   attachment processor to extract text).',
  ].join('\n'),
};
