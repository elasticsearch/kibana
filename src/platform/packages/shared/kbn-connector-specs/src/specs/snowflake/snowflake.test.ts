/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ActionContext } from '../../connector_spec';
import { generateSecretsSchemaFromSpec } from '../../lib/generate_secrets_schema_from_spec';
import { Snowflake } from './snowflake';

const ACCOUNT_URL = 'https://myorg-myaccount.snowflakecomputing.com';

describe('Snowflake', () => {
  const mockClient = {
    get: jest.fn(),
    post: jest.fn(),
  };

  const baseConfig = {
    accountUrl: ACCOUNT_URL,
    warehouse: 'COMPUTE_WH',
    database: 'PROD_DB',
    defaultSchema: 'PUBLIC',
    role: 'ANALYST',
  };

  const mockContext = {
    client: mockClient,
    config: baseConfig,
    log: { debug: jest.fn(), error: jest.fn() },
  } as unknown as ActionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('metadata', () => {
    it('should have correct connector id', () => {
      expect(Snowflake.metadata.id).toBe('.snowflake');
    });

    it('should support workflows and agentBuilder features', () => {
      expect(Snowflake.metadata.supportedFeatureIds).toContain('workflows');
      expect(Snowflake.metadata.supportedFeatureIds).toContain('agentBuilder');
    });
  });

  describe('auth', () => {
    it('supports bearer auth for PAT tokens', () => {
      const types = (Snowflake.auth?.types as Array<string | { type: string }>).map((t) =>
        typeof t === 'string' ? t : t.type
      );
      expect(types).toContain('bearer');
    });

    it('supports oauth_authorization_code', () => {
      const oauthType = (Snowflake.auth?.types as Array<string | { type: string }>).find(
        (t) => typeof t === 'object' && t.type === 'oauth_authorization_code'
      );
      expect(oauthType).toBeDefined();
    });

    it('existing connectors with bearer auth still pass schema validation', () => {
      const schema = generateSecretsSchemaFromSpec(Snowflake.auth, {
        isEarsEnabled: true,
        isEarsExperimentalEnabled: true,
      });
      const result = schema.safeParse({ authType: 'bearer', token: 'some-legacy-token' });
      expect(result.success).toBe(true);
    });

    it('sets required headers', () => {
      expect(Snowflake.auth?.headers).toMatchObject({
        Accept: 'application/json',
        'Content-Type': 'application/json',
      });
    });
  });

  describe('accountUrl normalization', () => {
    const snowflakeSchema = Snowflake.schema;
    if (!snowflakeSchema) {
      throw new Error('Snowflake spec is missing a config schema');
    }

    it('should strip a trailing slash from accountUrl so URLs do not double-slash', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: [] });

      const parsedConfig = snowflakeSchema.parse({
        ...baseConfig,
        accountUrl: `${ACCOUNT_URL}/`,
      });
      const trailingSlashContext = {
        ...mockContext,
        config: parsedConfig,
      } as unknown as ActionContext;

      await Snowflake.actions.listDatabases.handler(trailingSlashContext, {});

      expect(mockClient.get).toHaveBeenCalledWith(
        `${ACCOUNT_URL}/api/v2/databases`,
        expect.any(Object)
      );
    });

    it('should strip multiple trailing slashes', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: [] });

      const parsedConfig = snowflakeSchema.parse({
        ...baseConfig,
        accountUrl: `${ACCOUNT_URL}///`,
      });
      const manySlashesContext = {
        ...mockContext,
        config: parsedConfig,
      } as unknown as ActionContext;

      await Snowflake.actions.listDatabases.handler(manySlashesContext, {});

      expect(mockClient.get).toHaveBeenCalledWith(
        `${ACCOUNT_URL}/api/v2/databases`,
        expect.any(Object)
      );
    });
  });

  describe('tool exposure (isTool flags)', () => {
    it('exposes runQuery as an agent-facing tool', () => {
      expect(Snowflake.actions.runQuery.isTool).toBe(true);
    });

    it('does not expose executeStatement as an agent-facing tool', () => {
      expect(Snowflake.actions.executeStatement.isTool).toBe(false);
    });

    it('exposes getStatementStatus and cancelStatement as tools so agents can poll/abort runQuery handles', () => {
      expect(Snowflake.actions.getStatementStatus.isTool).toBe(true);
      expect(Snowflake.actions.cancelStatement.isTool).toBe(true);
    });
  });

  describe('runQuery action', () => {
    describe('allowed read-only statements', () => {
      const allowedStatements: Array<[string, string]> = [
        ['SELECT', 'SELECT * FROM customers LIMIT 10'],
        ['WITH', 'WITH recent AS (SELECT * FROM orders) SELECT * FROM recent'],
        ['SHOW', 'SHOW TABLES IN SCHEMA PROD_DB.PUBLIC'],
        ['DESCRIBE', 'DESCRIBE TABLE PROD_DB.PUBLIC.ORDERS'],
        ['DESC', 'DESC VIEW PROD_DB.PUBLIC.ORDERS_VW'],
        ['EXPLAIN', 'EXPLAIN SELECT * FROM orders'],
      ];

      it.each(allowedStatements)(
        'accepts %s and submits to the SQL API',
        async (_label, statement) => {
          mockClient.post.mockResolvedValue({ status: 202, data: { statementHandle: 'h' } });

          await Snowflake.actions.runQuery.handler(mockContext, { statement });

          expect(mockClient.post).toHaveBeenCalledTimes(1);
          expect(mockClient.post).toHaveBeenCalledWith(
            `${ACCOUNT_URL}/api/v2/statements`,
            expect.objectContaining({ statement }),
            expect.objectContaining({ params: { async: true } })
          );
        }
      );

      it('applies config defaults and bind variables just like executeStatement', async () => {
        mockClient.post.mockResolvedValue({ status: 202, data: { statementHandle: 'h' } });

        await Snowflake.actions.runQuery.handler(mockContext, {
          statement: 'SELECT * FROM users WHERE id = ?',
          bindings: { '1': { type: 'FIXED', value: '42' } },
        });

        expect(mockClient.post).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            warehouse: 'COMPUTE_WH',
            database: 'PROD_DB',
            schema: 'PUBLIC',
            role: 'ANALYST',
            bindings: { '1': { type: 'FIXED', value: '42' } },
          }),
          expect.any(Object)
        );
      });

      it('tolerates leading whitespace, line comments, and block comments before the keyword', async () => {
        mockClient.post.mockResolvedValue({ status: 202, data: { statementHandle: 'h' } });

        const statements = [
          '   SELECT 1',
          '-- a note\nSELECT 1',
          '/* a note */ SELECT 1',
          '-- one\n/* two */\n  select 1',
        ];
        for (const statement of statements) {
          await Snowflake.actions.runQuery.handler(mockContext, { statement });
        }

        expect(mockClient.post).toHaveBeenCalledTimes(statements.length);
      });

      it('is case-insensitive on the leading keyword', async () => {
        mockClient.post.mockResolvedValue({ status: 202, data: { statementHandle: 'h' } });

        await Snowflake.actions.runQuery.handler(mockContext, { statement: 'select 1' });
        await Snowflake.actions.runQuery.handler(mockContext, { statement: 'Select 1' });

        expect(mockClient.post).toHaveBeenCalledTimes(2);
      });

      it('tolerates a trailing semicolon when nothing follows it', async () => {
        mockClient.post.mockResolvedValue({ status: 202, data: { statementHandle: 'h' } });

        await Snowflake.actions.runQuery.handler(mockContext, { statement: 'SELECT 1;' });
        await Snowflake.actions.runQuery.handler(mockContext, { statement: 'SELECT 1; -- done' });
        await Snowflake.actions.runQuery.handler(mockContext, {
          statement: 'SELECT 1; /* also done */',
        });

        expect(mockClient.post).toHaveBeenCalledTimes(3);
      });
    });

    describe('rejected non-read-only statements', () => {
      const rejectedStatements: Array<[string, string]> = [
        ['INSERT', 'INSERT INTO t VALUES (1)'],
        ['UPDATE', 'UPDATE t SET a = 1'],
        ['DELETE', 'DELETE FROM t'],
        ['MERGE', 'MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET a = 1'],
        ['CREATE', 'CREATE TABLE t(id INT)'],
        ['DROP', 'DROP TABLE t'],
        ['ALTER', 'ALTER TABLE t ADD COLUMN c INT'],
        ['TRUNCATE', 'TRUNCATE TABLE t'],
        ['GRANT', 'GRANT SELECT ON t TO ROLE r'],
        ['REVOKE', 'REVOKE SELECT ON t FROM ROLE r'],
        ['CALL', 'CALL my_procedure()'],
        ['USE', 'USE DATABASE PROD_DB'],
        ['SET', 'SET foo = 1'],
      ];

      it.each(rejectedStatements)(
        'rejects %s without making a network call',
        async (_label, statement) => {
          await expect(
            Snowflake.actions.runQuery.handler(mockContext, { statement })
          ).rejects.toThrow(/read-only/i);
          expect(mockClient.post).not.toHaveBeenCalled();
        }
      );

      it('rejection guidance points users at executeStatement for write / DDL', async () => {
        await expect(
          Snowflake.actions.runQuery.handler(mockContext, { statement: 'DROP TABLE t' })
        ).rejects.toThrow(/executeStatement/);
      });

      it('rejects multi-statement submissions even when the first statement is read-only', async () => {
        await expect(
          Snowflake.actions.runQuery.handler(mockContext, {
            statement: 'SELECT 1; DROP TABLE t',
          })
        ).rejects.toThrow(/multi-statement/i);
        expect(mockClient.post).not.toHaveBeenCalled();
      });

      it('rejects write statements that hide behind leading comments', async () => {
        await expect(
          Snowflake.actions.runQuery.handler(mockContext, {
            statement: '-- looks fine\nINSERT INTO t VALUES (1)',
          })
        ).rejects.toThrow(/read-only/i);
        expect(mockClient.post).not.toHaveBeenCalled();
      });
    });

    it('propagates API errors from the SQL endpoint', async () => {
      mockClient.post.mockRejectedValue(new Error('SQL compilation error'));

      await expect(
        Snowflake.actions.runQuery.handler(mockContext, { statement: 'SELECT 1' })
      ).rejects.toThrow('SQL compilation error');
    });
  });

  describe('executeStatement action', () => {
    it('should execute a simple SQL statement asynchronously', async () => {
      const mockResponse = {
        status: 202,
        data: {
          code: '333334',
          message: 'Asynchronous execution in progress.',
          statementHandle: '019c06a4-0000-df4f-0000-00100006589e',
          statementStatusUrl: '/api/v2/statements/019c06a4-0000-df4f-0000-00100006589e',
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      const result = await Snowflake.actions.executeStatement.handler(mockContext, {
        statement: 'SELECT * FROM customers LIMIT 10',
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        `${ACCOUNT_URL}/api/v2/statements`,
        expect.objectContaining({
          statement: 'SELECT * FROM customers LIMIT 10',
          warehouse: 'COMPUTE_WH',
          database: 'PROD_DB',
          schema: 'PUBLIC',
          role: 'ANALYST',
        }),
        expect.objectContaining({
          params: { async: true },
        })
      );
      expect(result.statementHandle).toBe('019c06a4-0000-df4f-0000-00100006589e');
    });

    it('should override config defaults with per-request values', async () => {
      const mockResponse = {
        status: 202,
        data: { statementHandle: 'handle-123' },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      await Snowflake.actions.executeStatement.handler(mockContext, {
        statement: 'SELECT 1',
        warehouse: 'OVERRIDE_WH',
        database: 'OVERRIDE_DB',
        schema: 'OVERRIDE_SCHEMA',
        role: 'OVERRIDE_ROLE',
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          warehouse: 'OVERRIDE_WH',
          database: 'OVERRIDE_DB',
          schema: 'OVERRIDE_SCHEMA',
          role: 'OVERRIDE_ROLE',
        }),
        expect.any(Object)
      );
    });

    it('should include bind variables when provided', async () => {
      const mockResponse = { status: 202, data: { statementHandle: 'handle-456' } };
      mockClient.post.mockResolvedValue(mockResponse);

      await Snowflake.actions.executeStatement.handler(mockContext, {
        statement: 'SELECT * FROM users WHERE id = ?',
        bindings: {
          '1': { type: 'FIXED', value: '42' },
        },
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          bindings: { '1': { type: 'FIXED', value: '42' } },
        }),
        expect.any(Object)
      );
    });

    it('should set multi-statement count and query tag as parameters', async () => {
      const mockResponse = { status: 202, data: { statementHandle: 'handle-789' } };
      mockClient.post.mockResolvedValue(mockResponse);

      await Snowflake.actions.executeStatement.handler(mockContext, {
        statement: 'CREATE TABLE t(id INT); INSERT INTO t VALUES(1)',
        multiStatementCount: 2,
        queryTag: 'kibana-agent-query',
      });

      const [, body] = mockClient.post.mock.calls[0];
      expect(body.parameters).toEqual({
        MULTI_STATEMENT_COUNT: '2',
        QUERY_TAG: 'kibana-agent-query',
      });
    });

    it('should propagate API errors', async () => {
      mockClient.post.mockRejectedValue(new Error('SQL compilation error'));

      await expect(
        Snowflake.actions.executeStatement.handler(mockContext, {
          statement: 'SELECT * FROM nonexistent',
        })
      ).rejects.toThrow('SQL compilation error');
    });
  });

  describe('getStatementStatus action', () => {
    it('should check status of a running statement (202)', async () => {
      const mockResponse = {
        status: 202,
        data: {
          code: '333334',
          message: 'Asynchronous execution in progress.',
          statementHandle: 'handle-123',
          statementStatusUrl: '/api/v2/statements/handle-123',
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Snowflake.actions.getStatementStatus.handler(mockContext, {
        statementHandle: 'handle-123',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        `${ACCOUNT_URL}/api/v2/statements/handle-123`,
        expect.objectContaining({
          params: {},
        })
      );
      expect(result.code).toBe('333334');
    });

    it('should return results for a completed statement (200)', async () => {
      const mockResponse = {
        status: 200,
        data: {
          resultSetMetaData: {
            numRows: 2,
            rowType: [
              { name: 'ID', type: 'fixed' },
              { name: 'NAME', type: 'text' },
            ],
          },
          data: [
            ['1', 'Alice'],
            ['2', 'Bob'],
          ],
          code: '090001',
          message: 'Statement executed successfully.',
          statementHandle: 'handle-123',
        },
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Snowflake.actions.getStatementStatus.handler(mockContext, {
        statementHandle: 'handle-123',
      });

      expect(result.data).toEqual([
        ['1', 'Alice'],
        ['2', 'Bob'],
      ]);
    });

    it('should pass partition parameter when provided', async () => {
      const mockResponse = { status: 200, data: { data: [] } };
      mockClient.get.mockResolvedValue(mockResponse);

      await Snowflake.actions.getStatementStatus.handler(mockContext, {
        statementHandle: 'handle-123',
        partition: 2,
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: { partition: 2 } })
      );
    });

    it('should propagate API errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Statement not found'));

      await expect(
        Snowflake.actions.getStatementStatus.handler(mockContext, {
          statementHandle: 'invalid-handle',
        })
      ).rejects.toThrow('Statement not found');
    });
  });

  describe('cancelStatement action', () => {
    it('should cancel a running statement', async () => {
      const mockResponse = {
        status: 200,
        data: {
          code: '000604',
          sqlState: '57014',
          message: 'SQL execution canceled',
          statementHandle: 'handle-123',
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      const result = await Snowflake.actions.cancelStatement.handler(mockContext, {
        statementHandle: 'handle-123',
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        `${ACCOUNT_URL}/api/v2/statements/handle-123/cancel`,
        {},
        expect.any(Object)
      );
      expect(result.message).toBe('SQL execution canceled');
    });

    it('should handle cancellation of already completed statement (422)', async () => {
      const mockResponse = {
        status: 422,
        data: {
          code: '000709',
          message: 'Statement handle-finished not found',
          statementHandle: 'handle-finished',
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      const result = await Snowflake.actions.cancelStatement.handler(mockContext, {
        statementHandle: 'handle-finished',
      });

      expect(result.code).toBe('000709');
    });

    it('should propagate API errors', async () => {
      mockClient.post.mockRejectedValue(new Error('Unauthorized'));

      await expect(
        Snowflake.actions.cancelStatement.handler(mockContext, {
          statementHandle: 'handle-123',
        })
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('test handler', () => {
    const testHandler = Snowflake.test?.handler;

    it('should have a test handler defined', () => {
      expect(testHandler).toBeDefined();
    });

    it('should return success when Snowflake is reachable with immediate result', async () => {
      const mockResponse = {
        status: 200,
        data: {
          data: [['8.44.0']],
          code: '090001',
          message: 'Statement executed successfully.',
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      const result = await testHandler?.(mockContext);

      expect(mockClient.post).toHaveBeenCalledWith(
        `${ACCOUNT_URL}/api/v2/statements`,
        { statement: 'SELECT CURRENT_VERSION()' },
        expect.any(Object)
      );
      expect(result?.ok).toBe(true);
      expect(result?.message).toContain('8.44.0');
    });

    it('should return success when statement is accepted asynchronously', async () => {
      const mockResponse = {
        status: 202,
        data: {
          statementHandle: 'handle-test',
          message: 'Asynchronous execution in progress.',
        },
      };
      mockClient.post.mockResolvedValue(mockResponse);

      const result = await testHandler?.(mockContext);

      expect(result?.ok).toBe(true);
      expect(result?.message).toContain('handle-test');
    });
  });

  describe('listDatabases action', () => {
    it('should GET /api/v2/databases with list query params', async () => {
      const mockResponse = {
        status: 200,
        data: [{ name: 'PROD_DB' }, { name: 'DEV_DB' }],
      };
      mockClient.get.mockResolvedValue(mockResponse);

      const result = await Snowflake.actions.listDatabases.handler(mockContext, {
        like: 'PROD%',
        showLimit: 50,
        history: true,
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        `${ACCOUNT_URL}/api/v2/databases`,
        expect.objectContaining({
          params: { like: 'PROD%', showLimit: 50, history: true },
        })
      );
      expect(result).toEqual([{ name: 'PROD_DB' }, { name: 'DEV_DB' }]);
    });

    it('should propagate API errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Forbidden'));

      await expect(Snowflake.actions.listDatabases.handler(mockContext, {})).rejects.toThrow(
        'Forbidden'
      );
    });
  });

  describe('listSchemas action', () => {
    it('should GET /api/v2/databases/{database}/schemas with common params', async () => {
      const mockResponse = {
        status: 200,
        data: [{ name: 'PUBLIC' }, { name: 'ANALYTICS' }],
      };
      mockClient.get.mockResolvedValue(mockResponse);

      await Snowflake.actions.listSchemas.handler(mockContext, {
        database: 'PROD_DB',
        startsWith: 'ANAL',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        `${ACCOUNT_URL}/api/v2/databases/PROD_DB/schemas`,
        expect.objectContaining({ params: { startsWith: 'ANAL' } })
      );
    });

    it('should URL-encode database name', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: [] });

      await Snowflake.actions.listSchemas.handler(mockContext, {
        database: 'DB with space',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        `${ACCOUNT_URL}/api/v2/databases/DB%20with%20space/schemas`,
        expect.any(Object)
      );
    });

    it('should propagate API errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Database not found'));

      await expect(
        Snowflake.actions.listSchemas.handler(mockContext, { database: 'MISSING' })
      ).rejects.toThrow('Database not found');
    });
  });

  describe('listTables action', () => {
    it('should GET the schema tables endpoint and pass the history flag', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: [] });

      await Snowflake.actions.listTables.handler(mockContext, {
        database: 'PROD_DB',
        schema: 'PUBLIC',
        like: '%LOG',
        history: true,
        showLimit: 25,
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        `${ACCOUNT_URL}/api/v2/databases/PROD_DB/schemas/PUBLIC/tables`,
        expect.objectContaining({
          params: { like: '%LOG', showLimit: 25, history: true },
        })
      );
    });

    it('should propagate API errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Schema not found'));

      await expect(
        Snowflake.actions.listTables.handler(mockContext, {
          database: 'PROD_DB',
          schema: 'MISSING',
        })
      ).rejects.toThrow('Schema not found');
    });
  });

  describe('listViews action', () => {
    it('should GET the schema views endpoint', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: [{ name: 'SALES_BY_REGION' }],
      });

      const result = await Snowflake.actions.listViews.handler(mockContext, {
        database: 'PROD_DB',
        schema: 'PUBLIC',
        fromName: 'A',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        `${ACCOUNT_URL}/api/v2/databases/PROD_DB/schemas/PUBLIC/views`,
        expect.objectContaining({ params: { fromName: 'A' } })
      );
      expect(result).toEqual([{ name: 'SALES_BY_REGION' }]);
    });

    it('should propagate API errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Unauthorized'));

      await expect(
        Snowflake.actions.listViews.handler(mockContext, {
          database: 'PROD_DB',
          schema: 'PUBLIC',
        })
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('describeTable action', () => {
    it('should GET the single-table endpoint', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: { name: 'ORDERS', columns: [{ name: 'ID', type: 'NUMBER' }] },
      });

      const result = await Snowflake.actions.describeTable.handler(mockContext, {
        database: 'PROD_DB',
        schema: 'PUBLIC',
        name: 'ORDERS',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        `${ACCOUNT_URL}/api/v2/databases/PROD_DB/schemas/PUBLIC/tables/ORDERS`
      );
      expect(result.columns).toEqual([{ name: 'ID', type: 'NUMBER' }]);
    });

    it('should propagate API errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Table not found'));

      await expect(
        Snowflake.actions.describeTable.handler(mockContext, {
          database: 'PROD_DB',
          schema: 'PUBLIC',
          name: 'MISSING',
        })
      ).rejects.toThrow('Table not found');
    });
  });

  describe('describeView action', () => {
    it('should GET the single-view endpoint', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: { name: 'SALES_BY_REGION', text: 'SELECT ...' },
      });

      const result = await Snowflake.actions.describeView.handler(mockContext, {
        database: 'PROD_DB',
        schema: 'PUBLIC',
        name: 'SALES_BY_REGION',
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        `${ACCOUNT_URL}/api/v2/databases/PROD_DB/schemas/PUBLIC/views/SALES_BY_REGION`
      );
      expect(result.text).toBe('SELECT ...');
    });

    it('should propagate API errors', async () => {
      mockClient.get.mockRejectedValue(new Error('View not found'));

      await expect(
        Snowflake.actions.describeView.handler(mockContext, {
          database: 'PROD_DB',
          schema: 'PUBLIC',
          name: 'MISSING',
        })
      ).rejects.toThrow('View not found');
    });
  });

  describe('listCortexSearchServices action', () => {
    it('should GET the cortex-search-services endpoint', async () => {
      mockClient.get.mockResolvedValue({
        status: 200,
        data: [{ name: 'PRODUCT_SEARCH' }],
      });

      const result = await Snowflake.actions.listCortexSearchServices.handler(mockContext, {
        database: 'PROD_DB',
        schema: 'PUBLIC',
        like: 'PRODUCT%',
        showLimit: 10,
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        `${ACCOUNT_URL}/api/v2/databases/PROD_DB/schemas/PUBLIC/cortex-search-services`,
        expect.objectContaining({ params: { like: 'PRODUCT%', showLimit: 10 } })
      );
      expect(result).toEqual([{ name: 'PRODUCT_SEARCH' }]);
    });

    it('should propagate API errors', async () => {
      mockClient.get.mockRejectedValue(new Error('Feature not enabled'));

      await expect(
        Snowflake.actions.listCortexSearchServices.handler(mockContext, {
          database: 'PROD_DB',
          schema: 'PUBLIC',
        })
      ).rejects.toThrow('Feature not enabled');
    });
  });

  describe('cortexSearch action', () => {
    it('should POST to the cortex-search :query endpoint with the query body', async () => {
      mockClient.post.mockResolvedValue({
        status: 200,
        data: { results: [{ TITLE: 'Wireless headphones', score: 0.91 }] },
      });

      const result = await Snowflake.actions.cortexSearch.handler(mockContext, {
        database: 'PROD_DB',
        schema: 'PUBLIC',
        serviceName: 'PRODUCT_SEARCH',
        query: 'noise cancelling headphones',
        columns: ['TITLE', 'PRICE'],
        filter: { '@eq': { REGION: 'US' } },
        limit: 5,
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        `${ACCOUNT_URL}/api/v2/databases/PROD_DB/schemas/PUBLIC/cortex-search-services/PRODUCT_SEARCH:query`,
        {
          query: 'noise cancelling headphones',
          columns: ['TITLE', 'PRICE'],
          filter: { '@eq': { REGION: 'US' } },
          limit: 5,
        }
      );
      expect(result.results[0].TITLE).toBe('Wireless headphones');
    });

    it('should send only the query when optional fields are omitted', async () => {
      mockClient.post.mockResolvedValue({ status: 200, data: { results: [] } });

      await Snowflake.actions.cortexSearch.handler(mockContext, {
        database: 'PROD_DB',
        schema: 'PUBLIC',
        serviceName: 'PRODUCT_SEARCH',
        query: 'red shoes',
      });

      const [, body] = mockClient.post.mock.calls[0];
      expect(body).toEqual({ query: 'red shoes' });
    });

    it('should propagate API errors', async () => {
      mockClient.post.mockRejectedValue(new Error('Service not found'));

      await expect(
        Snowflake.actions.cortexSearch.handler(mockContext, {
          database: 'PROD_DB',
          schema: 'PUBLIC',
          serviceName: 'MISSING',
          query: 'hello',
        })
      ).rejects.toThrow('Service not found');
    });
  });
});
