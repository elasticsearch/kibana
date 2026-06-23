/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { OrStringRecursive } from '@kbn/utility-types';
import { dataFindStepDefinition } from './data_find_step';
import type { StepHandlerContext } from '../../step_registry/types';

describe('dataFindStepDefinition', () => {
  const createMockContext = (
    config: {
      items: unknown[];
    },
    input: {
      condition: string;
      errorIfEmpty?: boolean;
    }
  ): StepHandlerContext<any, any> => ({
    config,
    input,
    rawInput: input as OrStringRecursive<{ condition: string; errorIfEmpty?: boolean }>,
    contextManager: {
      getContext: jest.fn(),
      getFakeRequest: jest.fn(),
      getScopedEsClient: jest.fn(),
      renderInputTemplate: jest.fn((val) => val),
      callKibanaApi: jest.fn(),
    },
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    abortSignal: new AbortController().signal,
    stepId: 'test-find-step',
    stepType: 'data.find',
  });

  describe('basic finding', () => {
    it('should find first matching item and return { item, index }', async () => {
      const config = {
        items: [
          { status: 'inactive', id: 1 },
          { status: 'active', id: 2 },
          { status: 'active', id: 3 },
        ],
      };
      const input = {
        condition: 'item.status: active',
      };

      const context = createMockContext(config, input);
      const result = await dataFindStepDefinition.handler(context);

      expect(result.output).toEqual({ item: { status: 'active', id: 2 }, index: 1 });
    });

    it('should find first item matching complex KQL condition', async () => {
      const config = {
        items: [
          { status: 'active', severity: 1 },
          { status: 'active', severity: 3 },
          { status: 'active', severity: 5 },
        ],
      };
      const input = {
        condition: 'item.status: active AND item.severity > 2',
      };

      const context = createMockContext(config, input);
      const result = await dataFindStepDefinition.handler(context);

      expect(result.output).toEqual({ item: { status: 'active', severity: 3 }, index: 1 });
    });

    it('should return { item: null, index: null } when no items match', async () => {
      const config = {
        items: [
          { status: 'active', severity: 1 },
          { status: 'active', severity: 2 },
        ],
      };
      const input = {
        condition: 'item.severity > 5',
      };

      const context = createMockContext(config, input);
      const result = await dataFindStepDefinition.handler(context);

      expect(result.output).toEqual({ item: null, index: null });
    });
  });

  describe('errorIfEmpty handling', () => {
    it('should return error when no match found and errorIfEmpty is true', async () => {
      const config = {
        items: [{ status: 'inactive' }],
      };
      const input = {
        condition: 'item.status: active',
        errorIfEmpty: true,
      };

      const context = createMockContext(config, input);
      const result = await dataFindStepDefinition.handler(context);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('No item matching the condition was found');
    });

    it('should return { item: null, index: null } when no match found and errorIfEmpty is false', async () => {
      const config = {
        items: [{ status: 'inactive' }],
      };
      const input = {
        condition: 'item.status: active',
        errorIfEmpty: false,
      };

      const context = createMockContext(config, input);
      const result = await dataFindStepDefinition.handler(context);

      expect(result.output).toEqual({ item: null, index: null });
      expect(result.error).toBeUndefined();
    });

    it('should return { item: null, index: null } by default when no match found', async () => {
      const config = {
        items: [{ status: 'inactive' }],
      };
      const input = {
        condition: 'item.status: active',
      };

      const context = createMockContext(config, input);
      const result = await dataFindStepDefinition.handler(context);

      expect(result.output).toEqual({ item: null, index: null });
      expect(result.error).toBeUndefined();
    });
  });

  describe('empty condition handling', () => {
    it('should return first item with index 0 when condition is empty', async () => {
      const config = {
        items: [{ id: 1 }, { id: 2 }, { id: 3 }],
      };
      const input = {
        condition: '',
      };

      const context = createMockContext(config, input);
      const result = await dataFindStepDefinition.handler(context);

      expect(result.output).toEqual({ item: { id: 1 }, index: 0 });
    });

    it('should return { item: null, index: null } when condition is empty and items array is empty', async () => {
      const config = {
        items: [],
      };
      const input = {
        condition: '',
      };

      const context = createMockContext(config, input);
      const result = await dataFindStepDefinition.handler(context);

      expect(result.output).toEqual({ item: null, index: null });
    });

    it('should return error when condition is empty, items array is empty, and errorIfEmpty is true', async () => {
      const config = {
        items: [],
      };
      const input = {
        condition: '',
        errorIfEmpty: true,
      };

      const context = createMockContext(config, input);
      const result = await dataFindStepDefinition.handler(context);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('No items found');
    });

    it('should return first item when condition is whitespace', async () => {
      const config = {
        items: [{ id: 10 }, { id: 20 }],
      };
      const input = {
        condition: '   ',
      };

      const context = createMockContext(config, input);
      const result = await dataFindStepDefinition.handler(context);

      expect(result.output).toEqual({ item: { id: 10 }, index: 0 });
    });
  });

  describe('error handling', () => {
    it('should return error for invalid KQL syntax', async () => {
      const config = {
        items: [{ status: 'active' }],
      };
      const input = {
        condition: 'invalid ( unclosed',
      };

      const context = createMockContext(config, input);
      const result = await dataFindStepDefinition.handler(context);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Invalid KQL condition');
    });

    it('should return error for non-array items', async () => {
      const config = {
        items: { status: 'active' } as any,
      };
      const input = {
        condition: 'item.status: active',
      };

      const context = createMockContext(config, input);
      const result = await dataFindStepDefinition.handler(context);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Expected items to be an array');
    });

    it('should skip non-object items with a warning and keep searching', async () => {
      const config = {
        items: [null, { status: 'active', id: 2 }],
      };
      const input = {
        condition: 'item.status: active',
      };

      const context = createMockContext(config, input);
      const result = await dataFindStepDefinition.handler(context);

      // A `null` item cannot satisfy an `item.<field>` condition; it is skipped
      // with a warning and the search continues to the next, matching item.
      expect(result.output).toEqual({ item: { status: 'active', id: 2 }, index: 1 });
      expect(context.logger.warn).toHaveBeenCalled();
    });
  });

  describe('index access in KQL', () => {
    it('should support index in KQL condition', async () => {
      const config = {
        items: [{ value: 'a' }, { value: 'b' }, { value: 'c' }],
      };
      const input = {
        condition: 'index >= 2',
      };

      const context = createMockContext(config, input);
      const result = await dataFindStepDefinition.handler(context);

      expect(result.output).toEqual({ item: { value: 'c' }, index: 2 });
    });
  });

  describe('abort signal', () => {
    it('should respect abort signal', async () => {
      const abortController = new AbortController();
      const config = {
        items: [{ id: 1 }, { id: 2 }],
      };
      const input = {
        condition: 'item.id > 0',
      };

      const context = createMockContext(config, input);
      context.abortSignal = abortController.signal;

      abortController.abort();

      const result = await dataFindStepDefinition.handler(context);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('aborted');
    });
  });

  describe('performance - early exit', () => {
    it('should stop searching after finding first match', async () => {
      const config = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          status: i === 5 ? 'active' : 'inactive',
        })),
      };
      const input = {
        condition: 'item.status: active',
      };

      const context = createMockContext(config, input);
      const result = await dataFindStepDefinition.handler(context);

      expect(result.output).toEqual({ item: { id: 5, status: 'active' }, index: 5 });
      expect(context.logger.debug).toHaveBeenCalledWith('Found match at index 5');
    });
  });
});
