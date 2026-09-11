/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { of, throwError } from 'rxjs';
import type { Datatable } from '@kbn/expressions-plugin/public';
import { expressionsPluginMock } from '@kbn/expressions-plugin/public/mocks';
import { executeEsqlQuery } from './execute_esql_query';

const mockExpressionsService = expressionsPluginMock.createStartContract();

const getEsqlArguments = () => {
  const ast = mockExpressionsService.execute.mock.calls[0][0] as {
    chain: Array<{ function: string; arguments: Record<string, unknown[]> }>;
  };
  const esqlFunction = ast.chain.find(({ function: name }) => name === 'esql');
  return esqlFunction?.arguments ?? {};
};

describe('executeEsqlQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should execute an ES|QL query and return the result', async () => {
    const mockDatatable: Datatable = {
      type: 'datatable',
      columns: [
        { id: 'count', name: 'count', meta: { type: 'number' } },
        { id: 'status', name: 'status', meta: { type: 'string' } },
      ],
      rows: [
        { count: 100, status: 'active' },
        { count: 50, status: 'inactive' },
      ],
    };

    const mockExecutionContract = {
      getData: jest.fn().mockReturnValue(of({ result: mockDatatable, partial: false })),
      cancel: jest.fn(),
    };

    mockExpressionsService.execute.mockReturnValue(mockExecutionContract as any);

    const result = await executeEsqlQuery({
      expressions: mockExpressionsService,
      query: 'FROM index | STATS count() BY status',
      input: null,
    });

    expect(mockExpressionsService.execute).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'expression' }),
      null,
      undefined
    );
    expect(getEsqlArguments()).toEqual(
      expect.objectContaining({ query: ['FROM index | STATS count() BY status'] })
    );
    expect(getEsqlArguments().timeField).toBeUndefined();
    expect(result).toEqual(mockDatatable.rows);
  });

  it('should pass input to the expression execution', async () => {
    const mockDatatable: Datatable = {
      type: 'datatable',
      columns: [],
      rows: [],
    };

    const mockExecutionContract = {
      getData: jest.fn().mockReturnValue(of({ result: mockDatatable, partial: false })),
      cancel: jest.fn(),
    };

    mockExpressionsService.execute.mockReturnValue(mockExecutionContract as any);

    const input = { timeRange: { from: 'now-15m', to: 'now' } };

    await executeEsqlQuery({
      expressions: mockExpressionsService,
      query: 'FROM logs',
      input,
    });

    expect(mockExpressionsService.execute).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'expression' }),
      input,
      undefined
    );
    expect(getEsqlArguments().timeField).toBeUndefined();
  });

  it('should pass timeField to the esql function when provided', async () => {
    const mockDatatable: Datatable = {
      type: 'datatable',
      columns: [],
      rows: [],
    };
    const mockExecutionContract = {
      getData: jest.fn().mockReturnValue(of({ result: mockDatatable, partial: false })),
      cancel: jest.fn(),
    };
    mockExpressionsService.execute.mockReturnValue(mockExecutionContract as any);

    const input = { timeRange: { from: 'now-15m', to: 'now' } };
    await executeEsqlQuery({
      expressions: mockExpressionsService,
      query: 'FROM logs',
      input,
      timeField: '@timestamp',
    });

    expect(getEsqlArguments()).toEqual(
      expect.objectContaining({ query: ['FROM logs'], timeField: ['@timestamp'] })
    );
  });

  it('should pass quotes and backslashes through untouched', async () => {
    const mockDatatable: Datatable = {
      type: 'datatable',
      columns: [],
      rows: [],
    };

    const mockExecutionContract = {
      getData: jest.fn().mockReturnValue(of({ result: mockDatatable, partial: false })),
      cancel: jest.fn(),
    };

    mockExpressionsService.execute.mockReturnValue(mockExecutionContract as any);

    await executeEsqlQuery({
      expressions: mockExpressionsService,
      query: "FROM index | WHERE status == 'active'",
      input: null,
    });

    // The AST carries the query verbatim: no escaping for quotes or backslashes.
    expect(getEsqlArguments().query).toEqual(["FROM index | WHERE status == 'active'"]);
  });

  it('should throw when result type is error', async () => {
    const mockError = new Error('Query execution failed');
    const mockExecutionContract = {
      getData: jest
        .fn()
        .mockReturnValue(of({ result: { type: 'error', error: mockError }, partial: false })),
      cancel: jest.fn(),
    };

    mockExpressionsService.execute.mockReturnValue(mockExecutionContract as any);

    await expect(
      executeEsqlQuery({
        expressions: mockExpressionsService,
        query: 'FROM invalid',
        input: null,
      })
    ).rejects.toThrow('Query execution failed');
  });

  it('should handle observable errors', async () => {
    const mockError = new Error('Observable error');
    const mockExecutionContract = {
      getData: jest.fn().mockReturnValue(throwError(() => mockError)),
      cancel: jest.fn(),
    };

    mockExpressionsService.execute.mockReturnValue(mockExecutionContract as any);

    await expect(
      executeEsqlQuery({
        expressions: mockExpressionsService,
        query: 'FROM index',
        input: null,
      })
    ).rejects.toThrow('Observable error');
  });

  describe('abort signal handling', () => {
    it('should register abort listener when abortSignal is provided', async () => {
      const mockDatatable: Datatable = {
        type: 'datatable',
        columns: [],
        rows: [],
      };

      const mockExecutionContract = {
        getData: jest.fn().mockReturnValue(of({ result: mockDatatable, partial: false })),
        cancel: jest.fn(),
      };

      mockExpressionsService.execute.mockReturnValue(mockExecutionContract as any);

      const abortController = new AbortController();
      const addEventListenerSpy = jest.spyOn(abortController.signal, 'addEventListener');

      await executeEsqlQuery({
        expressions: mockExpressionsService,
        query: 'FROM index',
        input: null,
        abortSignal: abortController.signal,
      });

      expect(addEventListenerSpy).toHaveBeenCalledWith('abort', expect.any(Function));
    });

    it('should cancel execution when abort signal is triggered', async () => {
      const mockDatatable: Datatable = {
        type: 'datatable',
        columns: [],
        rows: [],
      };

      const mockExecutionContract = {
        getData: jest.fn().mockReturnValue(of({ result: mockDatatable, partial: false })),
        cancel: jest.fn(),
      };

      mockExpressionsService.execute.mockReturnValue(mockExecutionContract as any);

      const abortController = new AbortController();

      const executePromise = executeEsqlQuery({
        expressions: mockExpressionsService,
        query: 'FROM index',
        input: null,
        abortSignal: abortController.signal,
      });

      abortController.abort('User cancelled');

      await executePromise;

      expect(mockExecutionContract.cancel).toHaveBeenCalledWith('User cancelled');
    });

    it('should not register listener when abortSignal is not provided', async () => {
      const mockDatatable: Datatable = {
        type: 'datatable',
        columns: [],
        rows: [],
      };

      const mockExecutionContract = {
        getData: jest.fn().mockReturnValue(of({ result: mockDatatable, partial: false })),
        cancel: jest.fn(),
      };

      mockExpressionsService.execute.mockReturnValue(mockExecutionContract as any);

      await executeEsqlQuery({
        expressions: mockExpressionsService,
        query: 'FROM index',
        input: null,
      });

      expect(mockExecutionContract.cancel).not.toHaveBeenCalled();
    });
  });
});
