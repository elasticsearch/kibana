/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Snowflake Connector (v2)
 *
 * Wraps the Snowflake SQL REST API (v2) for SQL execution and the Snowflake
 * REST API v2 resource endpoints for metadata discovery and Cortex Search.
 *
 * Actions are split into agent-facing tools (isTool: true) and a
 * workflow-only escape hatch (isTool: false):
 *
 *  - Read-only SQL (agent-facing): runQuery, getStatementStatus, cancelStatement.
 *  - Full SQL (workflow-only): executeStatement — retained for write / DDL /
 *    privilege / procedure / multi-statement use cases and blocked from agents
 *    by the framework's isToolAction guard.
 *  - Data discovery (agent-facing): listDatabases, listSchemas, listTables,
 *    listViews, describeTable, describeView.
 *  - Semantic search (agent-facing): listCortexSearchServices, cortexSearch.
 *
 * Auth:
 *  - OAuth 2.0 Authorization Code with PKCE (Snowflake managed OAuth)
 *  - Bearer token (PAT — Snowflake programmatic access token or manually obtained OAuth token)
 *
 * API references:
 *  - SQL API: https://docs.snowflake.com/en/developer-guide/sql-api/reference
 *  - REST API v2: https://docs.snowflake.com/en/developer-guide/snowflake-rest-api/reference
 *  - Cortex Search: https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-search/query-cortex-search-service
 */

import { i18n } from '@kbn/i18n';
import { z, lazySchema } from '@kbn/zod/v4';
import type { ActionContext, ConnectorSpec } from '../../connector_spec';
import { normalizeUrl } from '../../connector_utils';
import type {
  ExecuteStatementInput,
  RunQueryInput,
  GetStatementStatusInput,
  CancelStatementInput,
  ListDatabasesInput,
  ListSchemasInput,
  ListTablesInput,
  ListViewsInput,
  DescribeTableInput,
  DescribeViewInput,
  ListCortexSearchServicesInput,
  CortexSearchInput,
} from './types';
import {
  ExecuteStatementInputSchema,
  RunQueryInputSchema,
  GetStatementStatusInputSchema,
  CancelStatementInputSchema,
  ListDatabasesInputSchema,
  ListSchemasInputSchema,
  ListTablesInputSchema,
  ListViewsInputSchema,
  DescribeTableInputSchema,
  DescribeViewInputSchema,
  ListCortexSearchServicesInputSchema,
  CortexSearchInputSchema,
} from './types';

const SNOWFLAKE_SQL_API_PATH = '/api/v2/statements';
const SNOWFLAKE_REST_API_V2 = '/api/v2';
const SNOWFLAKE_USER_AGENT = 'Kibana-Snowflake-Connector/1.0';

const buildListParams = (input: {
  like?: string;
  startsWith?: string;
  showLimit?: number;
  fromName?: string;
}): Record<string, unknown> => {
  const params: Record<string, unknown> = {};
  if (input.like !== undefined) params.like = input.like;
  if (input.startsWith !== undefined) params.startsWith = input.startsWith;
  if (input.showLimit !== undefined) params.showLimit = input.showLimit;
  if (input.fromName !== undefined) params.fromName = input.fromName;
  return params;
};

// ---------------------------------------------------------------------------
// Read-only SQL guardrail for `runQuery`
//
// Strips leading whitespace + SQL comments (line `-- ...` and block `/* ... */`)
// and matches the first remaining token against an allowlist of read-only
// statement keywords. Multi-statement submissions are rejected.
// ---------------------------------------------------------------------------

const READ_ONLY_STATEMENT_PREFIXES = /^(SELECT|WITH|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i;

const stripLeadingCommentsAndWhitespace = (sql: string): string => {
  let remaining = sql;
  // Repeatedly strip whitespace, line comments, and block comments from the start
  // until nothing matches.
  while (true) {
    const before = remaining;
    remaining = remaining.replace(/^\s+/, '');
    remaining = remaining.replace(/^--[^\n]*(?:\n|$)/, '');
    remaining = remaining.replace(/^\/\*[\s\S]*?\*\//, '');
    if (remaining === before) return remaining;
  }
};

const hasTrailingStatement = (sql: string): boolean => {
  // Detect semicolon-delimited multi-statement submissions. Anything after the
  // first `;` that isn't whitespace or a comment counts as a second statement.
  //
  // Note: this is a conservative textual check — it does not parse string
  // literals, so a query containing `;` inside a quoted string will be
  // rejected. That is acceptable for a read-only guardrail; agents can
  // rewrite such queries to avoid embedded semicolons.
  const semicolonIndex = sql.indexOf(';');
  if (semicolonIndex === -1) return false;
  const trailing = stripLeadingCommentsAndWhitespace(sql.slice(semicolonIndex + 1));
  return trailing.length > 0;
};

const isReadOnlyStatement = (sql: string): boolean => {
  if (hasTrailingStatement(sql)) return false;
  const head = stripLeadingCommentsAndWhitespace(sql);
  return READ_ONLY_STATEMENT_PREFIXES.test(head);
};

// ---------------------------------------------------------------------------
// Shared request builder for runQuery + executeStatement
// ---------------------------------------------------------------------------

const submitStatement = async (
  ctx: ActionContext,
  input: ExecuteStatementInput | RunQueryInput
): Promise<unknown> => {
  const {
    accountUrl,
    warehouse: defaultWarehouse,
    database: defaultDatabase,
    defaultSchema,
    role: defaultRole,
  } = ctx.config as {
    accountUrl: string;
    warehouse?: string;
    database?: string;
    defaultSchema?: string;
    role?: string;
  };

  const body: Record<string, unknown> = { statement: input.statement };

  if (input.timeout !== undefined) body.timeout = input.timeout;
  if (input.bindings) body.bindings = input.bindings;

  const warehouse = input.warehouse ?? defaultWarehouse;
  const database = input.database ?? defaultDatabase;
  const schema = input.schema ?? defaultSchema;
  const role = input.role ?? defaultRole;

  if (warehouse) body.warehouse = warehouse;
  if (database) body.database = database;
  if (schema) body.schema = schema;
  if (role) body.role = role;

  const multiStatementCount =
    'multiStatementCount' in input ? input.multiStatementCount : undefined;
  if (multiStatementCount !== undefined) {
    body.parameters = {
      ...(body.parameters as Record<string, unknown> | undefined),
      MULTI_STATEMENT_COUNT: String(multiStatementCount),
    };
  }
  if (input.queryTag) {
    body.parameters = {
      ...(body.parameters as Record<string, unknown> | undefined),
      QUERY_TAG: input.queryTag,
    };
  }

  const url = `${normalizeUrl(accountUrl)}${SNOWFLAKE_SQL_API_PATH}`;

  const response = await ctx.client.post(url, body, {
    params: { async: true },
    validateStatus: (status) => status === 200 || status === 202,
  });

  return response.data;
};

export const Snowflake: ConnectorSpec = {
  metadata: {
    id: '.snowflake',
    displayName: 'Snowflake',
    description: i18n.translate('core.kibanaConnectorSpecs.snowflake.metadata.description', {
      defaultMessage:
        'Run SQL, discover databases, schemas, tables, and views, and run semantic searches through Cortex Search in Snowflake',
    }),
    minimumLicense: 'enterprise',
    isTechnicalPreview: true,
    supportedFeatureIds: ['workflows', 'agentBuilder'],
  },

  auth: {
    types: [
      {
        type: 'oauth_authorization_code',
        defaults: {},
        overrides: {
          meta: {
            authorizationUrl: {
              placeholder: 'https://{account}.snowflakecomputing.com/oauth/authorize',
              helpText: i18n.translate(
                'core.kibanaConnectorSpecs.snowflake.auth.oauth.authorizationUrl.helpText',
                {
                  defaultMessage:
                    "Snowflake OAuth authorization URL. Replace '{account}' with your Snowflake account identifier.",
                  values: {
                    accountPlaceholder: '{account}',
                  },
                }
              ),
            },
            tokenUrl: {
              placeholder: 'https://{account}.snowflakecomputing.com/oauth/token-request',
              helpText: i18n.translate(
                'core.kibanaConnectorSpecs.snowflake.auth.oauth.tokenUrl.helpText',
                {
                  defaultMessage:
                    'Snowflake OAuth token endpoint. Replace {accountPlaceholder} with your Snowflake account identifier.',
                  values: {
                    accountPlaceholder: '{account}',
                  },
                }
              ),
            },
            scope: {
              hidden: true,
            },
          },
        },
      },
      {
        type: 'bearer',
        defaults: {},
        overrides: {
          label: i18n.translate('core.kibanaConnectorSpecs.snowflake.auth.bearer.label', {
            defaultMessage: 'Programmatic access token (PAT)',
          }),
          meta: {
            token: {
              sensitive: true,
              label: i18n.translate('core.kibanaConnectorSpecs.snowflake.auth.pat.label', {
                defaultMessage: 'Snowflake access token',
              }),
              helpText: i18n.translate('core.kibanaConnectorSpecs.snowflake.auth.pat.helpText', {
                defaultMessage:
                  'A Snowflake programmatic access token (PAT) or manually obtained OAuth access token.',
              }),
            },
          },
        },
      },
    ],
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': SNOWFLAKE_USER_AGENT,
    },
  },

  schema: lazySchema(() =>
    z.object({
      accountUrl: z
        .url()
        .describe('Snowflake account URL')
        .meta({
          widget: 'text',
          placeholder: 'https://<account>.snowflakecomputing.com',
          label: i18n.translate('core.kibanaConnectorSpecs.snowflake.config.accountUrl.label', {
            defaultMessage: 'Snowflake Account URL',
          }),
          helpText: i18n.translate(
            'core.kibanaConnectorSpecs.snowflake.config.accountUrl.helpText',
            {
              defaultMessage:
                'The base URL for your Snowflake account (e.g. https://myorg-myaccount.snowflakecomputing.com).',
            }
          ),
        }),
      warehouse: z
        .string()
        .optional()
        .describe('Default warehouse for SQL execution')
        .meta({
          widget: 'text',
          placeholder: 'COMPUTE_WH',
          label: i18n.translate('core.kibanaConnectorSpecs.snowflake.config.warehouse.label', {
            defaultMessage: 'Default Warehouse',
          }),
          helpText: i18n.translate(
            'core.kibanaConnectorSpecs.snowflake.config.warehouse.helpText',
            {
              defaultMessage:
                'Default warehouse to use when executing statements. Case-sensitive. Can be overridden per request.',
            }
          ),
        }),
      database: z
        .string()
        .optional()
        .describe('Default database for SQL execution')
        .meta({
          widget: 'text',
          placeholder: 'MY_DATABASE',
          label: i18n.translate('core.kibanaConnectorSpecs.snowflake.config.database.label', {
            defaultMessage: 'Default Database',
          }),
          helpText: i18n.translate('core.kibanaConnectorSpecs.snowflake.config.database.helpText', {
            defaultMessage:
              'Default database to use when executing statements. Case-sensitive. Can be overridden per request.',
          }),
        }),
      defaultSchema: z
        .string()
        .optional()
        .describe('Default schema for SQL execution')
        .meta({
          widget: 'text',
          placeholder: 'PUBLIC',
          label: i18n.translate('core.kibanaConnectorSpecs.snowflake.config.schema.label', {
            defaultMessage: 'Default Schema',
          }),
          helpText: i18n.translate('core.kibanaConnectorSpecs.snowflake.config.schema.helpText', {
            defaultMessage:
              'Default schema to use when executing statements. Case-sensitive. Can be overridden per request.',
          }),
        }),
      role: z
        .string()
        .optional()
        .describe('Default role for SQL execution')
        .meta({
          widget: 'text',
          placeholder: 'PUBLIC',
          label: i18n.translate('core.kibanaConnectorSpecs.snowflake.config.role.label', {
            defaultMessage: 'Default Role',
          }),
          helpText: i18n.translate('core.kibanaConnectorSpecs.snowflake.config.role.helpText', {
            defaultMessage:
              'Default role to use when executing statements. Case-sensitive. Can be overridden per request.',
          }),
        }),
    })
  ),

  validateUrls: {
    fields: ['accountUrl'],
  },

  actions: {
    runQuery: {
      isTool: true,
      description:
        'Run a read-only SQL query asynchronously in Snowflake. Accepts SELECT, WITH (CTE), SHOW, DESCRIBE / DESC, and EXPLAIN only. Write operations (INSERT, UPDATE, DELETE, MERGE), DDL (CREATE, ALTER, DROP, TRUNCATE), privilege changes (GRANT, REVOKE), stored procedure calls (CALL), and session state changes (USE, SET) are rejected before the request is sent. Returns a statement handle — use getStatementStatus to retrieve results, or cancelStatement to abort. Supports bind variables and session-scoped context (warehouse, database, schema, role). Single-statement only; multi-statement submissions are rejected. For write or DDL operations, ask the user to invoke executeStatement from a workflow.',
      input: RunQueryInputSchema,
      handler: async (ctx, input: RunQueryInput) => {
        if (!isReadOnlyStatement(input.statement)) {
          throw new Error(
            'runQuery only accepts read-only SQL statements (SELECT, WITH, SHOW, DESCRIBE, DESC, EXPLAIN) and rejects semicolon-delimited multi-statement submissions. ' +
              'For write (INSERT / UPDATE / DELETE / MERGE), DDL (CREATE / ALTER / DROP / TRUNCATE), privilege, procedure, or session-state statements, use the executeStatement action from a workflow.'
          );
        }
        return submitStatement(ctx, input);
      },
    },

    executeStatement: {
      isTool: false,
      description:
        'Run any SQL statement asynchronously in Snowflake. Exposed to workflow authors and direct API callers only — not available to agents (agents must use runQuery for read-only access). Can modify or destroy data: accepts SELECT, DML (INSERT, UPDATE, DELETE, MERGE), DDL (CREATE, ALTER, DROP, TRUNCATE), privilege changes, stored procedure calls, and session state statements. Returns a statement handle — use getStatementStatus to poll for results or cancelStatement to abort. Supports bind variables, multi-statement execution (via multiStatementCount), and session-scoped context (warehouse, database, schema, role).',
      input: ExecuteStatementInputSchema,
      handler: async (ctx, input: ExecuteStatementInput) => submitStatement(ctx, input),
    },

    getStatementStatus: {
      isTool: true,
      description:
        'Check the status of a previously submitted SQL statement and retrieve results if execution is complete. Returns HTTP 200 with a ResultSet when finished, or HTTP 202 with a QueryStatus if still running. Use the statementHandle returned by runQuery. For large result sets, use the partition parameter to page through data.',
      input: GetStatementStatusInputSchema,
      handler: async (ctx, input: GetStatementStatusInput) => {
        const { accountUrl } = ctx.config as { accountUrl: string };

        const params: Record<string, unknown> = {};
        if (input.partition !== undefined) params.partition = input.partition;

        const url = `${normalizeUrl(accountUrl)}${SNOWFLAKE_SQL_API_PATH}/${input.statementHandle}`;

        const response = await ctx.client.get(url, {
          params,
          validateStatus: (status) => status === 200 || status === 202,
        });

        return response.data;
      },
    },

    cancelStatement: {
      isTool: true,
      description:
        'Cancel a running SQL statement in Snowflake. Use the statementHandle returned by runQuery. Returns a confirmation with the cancellation status. Only works on statements that are still executing.',
      input: CancelStatementInputSchema,
      handler: async (ctx, input: CancelStatementInput) => {
        const { accountUrl } = ctx.config as { accountUrl: string };

        const url = `${normalizeUrl(accountUrl)}${SNOWFLAKE_SQL_API_PATH}/${
          input.statementHandle
        }/cancel`;

        const response = await ctx.client.post(
          url,
          {},
          {
            validateStatus: (status) => status === 200 || status === 422,
          }
        );

        return response.data;
      },
    },

    listDatabases: {
      isTool: true,
      description:
        'List Snowflake databases visible to the connector\'s role. Returns JSON objects (not SQL row arrays) with name, kind, owner, comment, created_on, and other metadata. Does not require a warehouse. Use this as the starting point for data discovery when the target database is unknown. Supports case-insensitive name filtering via "like" (SQL wildcards) and case-sensitive prefix filtering via "startsWith".',
      input: ListDatabasesInputSchema,
      handler: async (ctx, input: ListDatabasesInput) => {
        const { accountUrl } = ctx.config as { accountUrl: string };
        const params = buildListParams(input);
        if (input.history !== undefined) params.history = input.history;

        const url = `${normalizeUrl(accountUrl)}${SNOWFLAKE_REST_API_V2}/databases`;
        const response = await ctx.client.get(url, { params });
        return response.data;
      },
    },

    listSchemas: {
      isTool: true,
      description:
        'List schemas inside a Snowflake database. Returns JSON objects with name, database_name, owner, comment, and other metadata. Does not require a warehouse. Use after listDatabases to narrow down the target before listing tables or views. Database name is case-sensitive and must match exactly what listDatabases returned.',
      input: ListSchemasInputSchema,
      handler: async (ctx, input: ListSchemasInput) => {
        const { accountUrl } = ctx.config as { accountUrl: string };
        const params = buildListParams(input);

        const url = `${normalizeUrl(
          accountUrl
        )}${SNOWFLAKE_REST_API_V2}/databases/${encodeURIComponent(input.database)}/schemas`;
        const response = await ctx.client.get(url, { params });
        return response.data;
      },
    },

    listTables: {
      isTool: true,
      description:
        'List tables inside a Snowflake schema. Returns JSON objects with name, database_name, schema_name, kind, rows, bytes, cluster_by, comment, and other metadata. Does not require a warehouse. Use after listSchemas to find the specific table to describe or query. Database and schema names are case-sensitive. Optional: "history" to include dropped tables.',
      input: ListTablesInputSchema,
      handler: async (ctx, input: ListTablesInput) => {
        const { accountUrl } = ctx.config as { accountUrl: string };
        const params = buildListParams(input);
        if (input.history !== undefined) params.history = input.history;

        const url = `${normalizeUrl(
          accountUrl
        )}${SNOWFLAKE_REST_API_V2}/databases/${encodeURIComponent(
          input.database
        )}/schemas/${encodeURIComponent(input.schema)}/tables`;
        const response = await ctx.client.get(url, { params });
        return response.data;
      },
    },

    listViews: {
      isTool: true,
      description:
        "List views inside a Snowflake schema. Returns JSON objects with name, database_name, schema_name, owner, comment, and other metadata. Does not require a warehouse. Database and schema names are case-sensitive. Use describeView to retrieve a view's columns and underlying query text.",
      input: ListViewsInputSchema,
      handler: async (ctx, input: ListViewsInput) => {
        const { accountUrl } = ctx.config as { accountUrl: string };
        const params = buildListParams(input);

        const url = `${normalizeUrl(
          accountUrl
        )}${SNOWFLAKE_REST_API_V2}/databases/${encodeURIComponent(
          input.database
        )}/schemas/${encodeURIComponent(input.schema)}/views`;
        const response = await ctx.client.get(url, { params });
        return response.data;
      },
    },

    describeTable: {
      isTool: true,
      description:
        'Get the full definition of a Snowflake table, including columns (name, type, nullable, default, comment), clustering keys, row count, size in bytes, owner, and other metadata. Returns a clean JSON Table object (not SQL row arrays). Does not require a warehouse. Use this before runQuery to build correct SELECT or JOIN queries against the table. Database, schema, and table names are all case-sensitive.',
      input: DescribeTableInputSchema,
      handler: async (ctx, input: DescribeTableInput) => {
        const { accountUrl } = ctx.config as { accountUrl: string };

        const url = `${normalizeUrl(
          accountUrl
        )}${SNOWFLAKE_REST_API_V2}/databases/${encodeURIComponent(
          input.database
        )}/schemas/${encodeURIComponent(input.schema)}/tables/${encodeURIComponent(input.name)}`;
        const response = await ctx.client.get(url);
        return response.data;
      },
    },

    describeView: {
      isTool: true,
      description:
        'Get the full definition of a Snowflake view, including columns, the underlying SELECT query text, owner, comment, and other metadata. Returns a clean JSON View object. Does not require a warehouse. Use to understand what a view exposes before querying it or building dependent logic. Database, schema, and view names are all case-sensitive.',
      input: DescribeViewInputSchema,
      handler: async (ctx, input: DescribeViewInput) => {
        const { accountUrl } = ctx.config as { accountUrl: string };

        const url = `${normalizeUrl(
          accountUrl
        )}${SNOWFLAKE_REST_API_V2}/databases/${encodeURIComponent(
          input.database
        )}/schemas/${encodeURIComponent(input.schema)}/views/${encodeURIComponent(input.name)}`;
        const response = await ctx.client.get(url);
        return response.data;
      },
    },

    listCortexSearchServices: {
      isTool: true,
      description:
        'List Cortex Search services defined in a Snowflake schema. Cortex Search provides semantic + lexical search over indexed text columns. Returns JSON objects with name, database_name, schema_name, target_lag, warehouse, comment, and the underlying source query. Use before cortexSearch to discover what search services are available. Database and schema names are case-sensitive.',
      input: ListCortexSearchServicesInputSchema,
      handler: async (ctx, input: ListCortexSearchServicesInput) => {
        const { accountUrl } = ctx.config as { accountUrl: string };
        const params = buildListParams(input);

        const url = `${normalizeUrl(
          accountUrl
        )}${SNOWFLAKE_REST_API_V2}/databases/${encodeURIComponent(
          input.database
        )}/schemas/${encodeURIComponent(input.schema)}/cortex-search-services`;
        const response = await ctx.client.get(url, { params });
        return response.data;
      },
    },

    cortexSearch: {
      isTool: true,
      description:
        'Run a natural-language query against a Snowflake Cortex Search service. Cortex Search performs hybrid semantic + lexical matching over the service\'s indexed search column and returns ranked results as JSON. Use for unstructured text retrieval (support docs, product catalogs, chat logs) — much better than LIKE or CONTAINS in SQL. Supports additional attribute filtering via the "filter" DSL (@eq, @contains, @gte, @lte, @and, @or, @not). Example filter: {"@and": [{"@eq": {"REGION": "US"}}, {"@gte": {"YEAR": 2024}}]}. Prefer limit<=20 to keep LLM context small.',
      input: CortexSearchInputSchema,
      handler: async (ctx, input: CortexSearchInput) => {
        const { accountUrl } = ctx.config as { accountUrl: string };

        const body: Record<string, unknown> = { query: input.query };
        if (input.columns !== undefined) body.columns = input.columns;
        if (input.filter !== undefined) body.filter = input.filter;
        if (input.limit !== undefined) body.limit = input.limit;

        const url = `${normalizeUrl(
          accountUrl
        )}${SNOWFLAKE_REST_API_V2}/databases/${encodeURIComponent(
          input.database
        )}/schemas/${encodeURIComponent(input.schema)}/cortex-search-services/${encodeURIComponent(
          input.serviceName
        )}:query`;
        const response = await ctx.client.post(url, body);
        return response.data;
      },
    },
  },

  test: {
    description: i18n.translate('core.kibanaConnectorSpecs.snowflake.test.description', {
      defaultMessage:
        'Verifies connection to Snowflake by executing SELECT CURRENT_VERSION() and returning the result.',
    }),
    handler: async (ctx) => {
      const { accountUrl } = ctx.config as { accountUrl: string };
      const url = `${normalizeUrl(accountUrl)}${SNOWFLAKE_SQL_API_PATH}`;

      const response = await ctx.client.post(
        url,
        { statement: 'SELECT CURRENT_VERSION()' },
        {
          validateStatus: (status) => status === 200 || status === 202,
        }
      );

      if (response.status === 200 && response.data?.data) {
        return {
          ok: true,
          message: `Connected to Snowflake. Version: ${response.data.data[0]?.[0] ?? 'unknown'}`,
        };
      }

      return {
        ok: true,
        message: `Connected to Snowflake. Statement submitted (handle: ${
          response.data?.statementHandle ?? 'unknown'
        }).`,
      };
    },
  },

  skill: [
    '## Snowflake Connector',
    '',
    'This connector exposes three capability groups against Snowflake:',
    '',
    '1. **Read-only SQL** — `runQuery`, `getStatementStatus`, `cancelStatement` (Snowflake SQL REST API).',
    '2. **Data discovery** — `listDatabases`, `listSchemas`, `listTables`, `listViews`, `describeTable`, `describeView` (Snowflake REST API v2 resources).',
    '3. **Semantic search** — `listCortexSearchServices`, `cortexSearch` (Cortex Search).',
    '',
    'Write and DDL operations (INSERT, UPDATE, DELETE, MERGE, CREATE, ALTER, DROP, TRUNCATE, GRANT, REVOKE, CALL, USE, SET) are not available as tools. If a user asks to modify or destroy data, explain that they need to run the statement from a workflow using the `executeStatement` action, and do not attempt to work around the restriction.',
    '',
    '### Discovery pattern (agents without prior knowledge)',
    'When the target database, schema, or table is unknown, discover before querying:',
    '',
    '1. `listDatabases` → pick a database.',
    '2. `listSchemas` for that database → pick a schema.',
    '3. `listTables` (or `listViews`) for that schema → pick an object.',
    '4. `describeTable` (or `describeView`) to learn its columns, types, and constraints.',
    '5. `runQuery` to run a SELECT — now you can build a correct, well-scoped query.',
    '',
    'Discovery actions hit REST v2 resource endpoints. They return clean JSON (not SQL row arrays), do not require a warehouse, and are cheaper than firing `SHOW` / `DESCRIBE` through `runQuery`. Prefer them over SQL equivalents whenever possible.',
    '',
    '### Semantic search pattern',
    'For unstructured text retrieval (product catalogs, support docs, chat logs), use Cortex Search instead of `LIKE`/`CONTAINS` in SQL:',
    '',
    '1. `listCortexSearchServices` for the target schema → pick a service.',
    '2. `cortexSearch` with a natural-language `query`.',
    '',
    'Prefer `limit <= 20` and request only the columns you actually need to keep LLM context small.',
    '',
    '### Query execution pattern',
    '1. Call `runQuery` with a read-only SQL statement (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN). It returns a `statementHandle`.',
    '2. Call `getStatementStatus` with that handle to poll for results.',
    '   - HTTP 202 means still running — wait and poll again.',
    '   - HTTP 200 means complete — the response contains `data` (array of row arrays) and `resultSetMetaData` (column definitions).',
    '3. If the query is no longer needed, call `cancelStatement` with the handle.',
    '',
    '`runQuery` rejects write statements, DDL, privilege changes, stored procedure calls, session state changes, and semicolon-delimited multi-statement submissions before the request is sent.',
    '',
    '### Bind variables',
    'Use `?` placeholders in the SQL and provide `bindings` with 1-based keys. All binding values are strings. Example: `{"1": {"type": "TEXT", "value": "hello"}}`.',
    '',
    '### Context defaults',
    'The connector config provides default warehouse, database, schema, and role. Per-request values in runQuery override these defaults. Discovery actions require the database / schema to be passed explicitly — they do not fall back to the config defaults.',
    '',
    '### Result set pagination',
    'Large SQL result sets are split into partitions by Snowflake. Use `getStatementStatus` with different `partition` values (0-based) to retrieve each partition. The `resultSetMetaData.partitionInfo` array describes the row count and size of each partition. List endpoints paginate via `fromName` (cursor) + `showLimit`.',
    '',
    '### Important notes',
    '- Snowflake identifiers (database, schema, table, view, warehouse, role, Cortex Search service) are case-sensitive and must match the casing returned by the list endpoints.',
    '- Discovery actions and Cortex Search do not require a warehouse. Only `runQuery` (and therefore `getStatementStatus` / `cancelStatement`) does.',
    '- `like` uses SQL wildcards (`%`, `_`) and is case-insensitive. `startsWith` is a literal prefix and case-sensitive.',
    '- The SQL API does not support all Snowflake SQL — see Snowflake docs for limitations.',
  ].join('\n'),
};
