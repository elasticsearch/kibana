/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * ServiceNow Search Connector
 *
 * This connector provides integration with ServiceNow via the Table API
 * for federated search. Features include:
 * - Full-text search across ServiceNow tables (incidents, knowledge articles, etc.)
 * - Retrieve individual records by sys_id
 * - List records from any ServiceNow table with filtering
 * - Download attachment content as base64
 *
 * Requires OAuth2 client credentials authentication.
 */

import { i18n } from '@kbn/i18n';
import { z, lazySchema } from '@kbn/zod/v4';
import type { ConnectorSpec } from '../../connector_spec';
import {
  SearchInputSchema,
  GetRecordInputSchema,
  ListRecordsInputSchema,
  ListTablesInputSchema,
  ListKnowledgeBasesInputSchema,
  GetCommentsInputSchema,
  GetAttachmentInputSchema,
  DescribeTableInputSchema,
} from './types';
import type {
  SearchInput,
  GetRecordInput,
  ListRecordsInput,
  ListTablesInput,
  ListKnowledgeBasesInput,
  GetCommentsInput,
  GetAttachmentInput,
  DescribeTableInput,
} from './types';
export const ServicenowSearch: ConnectorSpec = {
  metadata: {
    id: '.servicenow_search',
    displayName: 'ServiceNow',
    description: i18n.translate('core.kibanaConnectorSpecs.servicenowSearch.metadata.description', {
      defaultMessage: 'Search and retrieve records from ServiceNow',
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
        defaults: {},
        overrides: {
          meta: {
            authorizationUrl: {
              placeholder: 'https://your-instance.service-now.com/oauth_auth.do',
            },
            tokenUrl: {
              placeholder: 'https://your-instance.service-now.com/oauth_token.do',
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
            tokenUrl: {
              placeholder: 'https://your-instance.service-now.com/oauth_token.do',
            },
            scope: { hidden: true },
          },
        },
      },
    ],
  },

  schema: lazySchema(() =>
    z.object({
      instanceUrl: z
        .string()
        .url()
        .describe('ServiceNow instance URL (e.g., https://your-instance.service-now.com)')
        .meta({
          label: 'Instance URL',
          widget: 'text',
          placeholder: 'https://your-instance.service-now.com',
        }),
    })
  ),

  actions: {
    search: {
      isTool: true,
      description: 'Search ServiceNow records using full-text search across a given table',
      input: SearchInputSchema,
      handler: async (ctx, input: SearchInput) => {
        const { instanceUrl } = ctx.config as { instanceUrl: string };
        const url = `${instanceUrl}/api/now/table/${input.table}`;
        const limit = input.limit ?? 20;

        // GOTO123TEXTQUERY321 is ServiceNow's undocumented full-text search parameter
        const sysparmQuery = input.encodedQuery
          ? `GOTO123TEXTQUERY321=${input.query}^${input.encodedQuery}`
          : `GOTO123TEXTQUERY321=${input.query}`;

        const response = await ctx.client.get(url, {
          params: {
            sysparm_query: sysparmQuery,
            sysparm_limit: limit,
            ...(input.offset !== undefined && { sysparm_offset: input.offset }),
            ...(input.fields && { sysparm_fields: input.fields }),
            sysparm_display_value: 'true',
          },
        });

        return response.data;
      },
    },

    getRecord: {
      isTool: true,
      description:
        'Retrieve a specific ServiceNow record by its sys_id. Works for any table. ' +
        'For knowledge articles (kb_knowledge table), request fields: sys_id,number,short_description,text,topic,category,author,sys_created_on,sys_updated_on,workflow_state,kb_knowledge_base,kb_category',
      input: GetRecordInputSchema,
      handler: async (ctx, input: GetRecordInput) => {
        const { instanceUrl } = ctx.config as { instanceUrl: string };
        const url = `${instanceUrl}/api/now/table/${input.table}/${input.sysId}`;

        const response = await ctx.client.get(url, {
          params: {
            sysparm_display_value: 'true',
            ...(input.fields && { sysparm_fields: input.fields }),
          },
        });

        return response.data;
      },
    },

    listRecords: {
      isTool: true,
      description: 'List records from a ServiceNow table with optional encoded query filter',
      input: ListRecordsInputSchema,
      handler: async (ctx, input: ListRecordsInput) => {
        const { instanceUrl } = ctx.config as { instanceUrl: string };
        const url = `${instanceUrl}/api/now/table/${input.table}`;
        const limit = input.limit ?? 20;

        const response = await ctx.client.get(url, {
          params: {
            sysparm_limit: limit,
            sysparm_display_value: 'true',
            ...(input.encodedQuery && { sysparm_query: input.encodedQuery }),
            ...(input.fields && { sysparm_fields: input.fields }),
            ...(input.offset !== undefined && { sysparm_offset: input.offset }),
            ...(input.orderBy && { sysparm_orderby: input.orderBy }),
          },
        });

        return response.data;
      },
    },

    listTables: {
      isTool: true,
      description:
        'List available ServiceNow tables with their labels and descriptions. Use this to discover what tables exist in the instance before querying them.',
      input: ListTablesInputSchema,
      handler: async (ctx, input: ListTablesInput) => {
        const { instanceUrl } = ctx.config as { instanceUrl: string };
        const url = `${instanceUrl}/api/now/table/sys_db_object`;
        const limit = input.limit ?? 50;

        const response = await ctx.client.get(url, {
          params: {
            sysparm_limit: limit,
            sysparm_fields: 'name,label,super_class,sys_package',
            sysparm_display_value: 'true',
            ...(input.query && {
              sysparm_query: `nameLIKE${input.query}^ORlabelLIKE${input.query}`,
            }),
            ...(input.offset !== undefined && { sysparm_offset: input.offset }),
          },
        });

        return response.data;
      },
    },

    listKnowledgeBases: {
      isTool: true,
      description:
        'List available ServiceNow knowledge bases with their titles and descriptions. Use this to discover what knowledge bases exist before searching for articles.',
      input: ListKnowledgeBasesInputSchema,
      handler: async (ctx, input: ListKnowledgeBasesInput) => {
        const { instanceUrl } = ctx.config as { instanceUrl: string };
        const url = `${instanceUrl}/api/now/table/kb_knowledge_base`;
        const limit = input.limit ?? 20;

        const response = await ctx.client.get(url, {
          params: {
            sysparm_limit: limit,
            sysparm_fields: 'sys_id,title,description,active,kb_managers',
            sysparm_display_value: 'true',
            sysparm_query: 'active=true',
            ...(input.offset !== undefined && { sysparm_offset: input.offset }),
          },
        });

        return response.data;
      },
    },

    getComments: {
      isTool: true,
      description:
        'Retrieve comments and work notes for a ServiceNow record (e.g., an incident or change request). ' +
        'Returns journal entries in chronological order. Call this after retrieving a record to understand its history.',
      input: GetCommentsInputSchema,
      handler: async (ctx, input: GetCommentsInput) => {
        const { instanceUrl } = ctx.config as { instanceUrl: string };
        const url = `${instanceUrl}/api/now/table/sys_journal_field`;
        const limit = input.limit ?? 20;

        const response = await ctx.client.get(url, {
          params: {
            sysparm_query: `element_id=${input.recordSysId}^name=${input.tableName}^element=comments^NQelement_id=${input.recordSysId}^name=${input.tableName}^element=work_notes^ORDERBYsys_created_on`,
            sysparm_limit: limit,
            sysparm_fields: 'sys_id,element,value,sys_created_on,sys_created_by',
            sysparm_display_value: 'true',
            ...(input.offset !== undefined && { sysparm_offset: input.offset }),
          },
        });

        return response.data;
      },
    },

    getAttachment: {
      isTool: true,
      description:
        'Download a ServiceNow attachment as base64-encoded content by its attachment sys_id. ' +
        'Attachment sys_ids can be found by querying the sys_attachment table: ' +
        'use listRecords with table=sys_attachment and encodedQuery=table_name=<table>^table_sys_id=<record_sys_id>.',
      input: GetAttachmentInputSchema,
      output: lazySchema(() =>
        z.object({
          fileName: z.string().describe('Name of the attachment file'),
          contentType: z.string().describe('MIME type of the attachment'),
          base64: z.string().describe('Base64-encoded attachment content'),
        })
      ),
      handler: async (ctx, input: GetAttachmentInput) => {
        const { instanceUrl } = ctx.config as { instanceUrl: string };

        // First get attachment metadata
        const metaResponse = await ctx.client.get(
          `${instanceUrl}/api/now/attachment/${input.sysId}`,
          {}
        );
        const { file_name: fileName, content_type: contentType } = metaResponse.data.result;

        // Then download the content
        const contentResponse = await ctx.client.get(
          `${instanceUrl}/api/now/attachment/${input.sysId}/file`,
          { responseType: 'arraybuffer' }
        );
        const buffer = Buffer.from(contentResponse.data);

        return {
          fileName,
          contentType,
          base64: buffer.toString('base64'),
        };
      },
    },

    describeTable: {
      isTool: true,
      description:
        'Describe the schema of a ServiceNow table by listing all its fields (including inherited fields), ' +
        'their types, labels, and constraints. Use this to understand the structure of a table before ' +
        'querying it — for example, to know which fields to request or filter on.',
      input: DescribeTableInputSchema,
      handler: async (ctx, input: DescribeTableInput) => {
        const { instanceUrl } = ctx.config as { instanceUrl: string };
        // The /api/now/doc/table/schema endpoint returns the full flattened schema
        // including inherited fields from parent tables, and is accessible to non-admin users.
        const url = `${instanceUrl}/api/now/doc/table/schema/${input.table}`;

        const response = await ctx.client.get(url, {});

        return response.data;
      },
    },
  },

  skill: [
    'ServiceNow connector — cross-action usage guidance for LLMs.',
    '',
    '## Discovery pattern',
    'When the target table is unknown, start with listTables (optionally filter by query keyword),',
    'then call describeTable on the chosen table to understand available fields before querying.',
    '',
    '## Knowledge articles',
    'listKnowledgeBases → search (or listRecords) on kb_knowledge table.',
    'Useful fields: sys_id, number, short_description, text, topic, category, author,',
    'sys_created_on, sys_updated_on, workflow_state, kb_knowledge_base, kb_category.',
    'To filter by knowledge base: include kb_knowledge_base=<kb_sys_id> in encodedQuery.',
    '',
    '## Attachments',
    'Attachment sys_ids are not stored on the parent record. Find them first:',
    '  listRecords(table=sys_attachment, encodedQuery=table_name=<table>^table_sys_id=<record_sys_id>)',
    'Then call getAttachment with the attachment sys_id to retrieve base64-encoded content.',
  ].join('\n'),

  test: {
    description: i18n.translate('core.kibanaConnectorSpecs.servicenowSearch.test.description', {
      defaultMessage: 'Verifies ServiceNow connection by fetching the current user record',
    }),
    handler: async (ctx) => {
      try {
        const { instanceUrl } = ctx.config as { instanceUrl: string };
        // Fetch the authenticated user's own record — readable by any authenticated user
        // regardless of role. Avoids relying on admin-only tables like sys_properties.
        const response = await ctx.client.get(`${instanceUrl}/api/now/table/sys_user`, {
          params: {
            sysparm_query: 'sys_created_on!=NULL',
            sysparm_limit: 1,
            sysparm_fields: 'sys_id',
          },
        });
        const results = response.data?.result ?? [];
        if (results.length > 0) {
          return {
            ok: true,
            message: 'Successfully connected to ServiceNow',
          };
        }
        return {
          ok: true,
          message: 'Successfully connected to ServiceNow (no user records visible)',
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { ok: false, message };
      }
    },
  },
};
