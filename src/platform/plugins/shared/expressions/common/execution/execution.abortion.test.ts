/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { waitFor } from '@testing-library/react';
import { lastValueFrom } from 'rxjs';
import { AbortReason } from '@kbn/kibana-utils-plugin/common';
import { Execution } from './execution';
import { parseExpression } from '../ast';
import { createUnitTestExecutor } from '../test_helpers';
import type { ExpressionFunctionDefinition } from '../expression_functions';

jest.useFakeTimers({ legacyFakeTimers: true });

beforeEach(() => {
  jest.clearAllTimers();
});

const createExecution = (
  expression: string = 'foo bar=123',
  context: Record<string, unknown> = {},
  debug: boolean = false
) => {
  const executor = createUnitTestExecutor();
  const execution = new Execution({
    executor,
    ast: parseExpression(expression),
    params: { ...context, debug },
  });
  return execution;
};

describe('Execution abortion tests', () => {
  test('can abort an expression immediately', async () => {
    const execution = createExecution('sleep 10');

    execution.start();
    execution.cancel();

    const result = await execution.result.toPromise();

    expect(result).toHaveProperty('result', {
      type: 'error',
      error: {
        message: 'The expression was aborted.',
        name: 'AbortError',
      },
    });
  });

  test('can abort an expression which has function running mid flight', async () => {
    const execution = createExecution('sleep 300');

    execution.start();
    jest.advanceTimersByTime(100);
    execution.cancel();

    const result = await execution.result.toPromise();

    expect(result).toHaveProperty('result', {
      type: 'error',
      error: {
        message: 'The expression was aborted.',
        name: 'AbortError',
      },
    });
  });

  test('cancelling execution after it completed has no effect', async () => {
    jest.useRealTimers();

    const execution = createExecution('sleep 1');

    execution.start();

    const { result } = await lastValueFrom(execution.result);

    execution.cancel();

    expect(result).toBe(null);

    jest.useFakeTimers({ legacyFakeTimers: true });
  });

  test('nested expressions are aborted when parent aborted', async () => {
    jest.useRealTimers();
    const started = jest.fn();
    const completed = jest.fn();
    const aborted = jest.fn();

    const defer: ExpressionFunctionDefinition<'defer', unknown, { time: number }, unknown> = {
      name: 'defer',
      args: {
        time: {
          aliases: ['_'],
          help: 'Calls function from a context after delay unless aborted',
          types: ['number'],
        },
      },
      help: '',
      fn: async (input, args, { abortSignal }) => {
        started();
        await new Promise((r) => {
          const timeout = setTimeout(() => {
            if (!abortSignal.aborted) {
              completed();
            }
            r(undefined);
          }, args.time);

          abortSignal.addEventListener('abort', () => {
            aborted();
            clearTimeout(timeout);
            r(undefined);
          });
        });

        return args.time;
      },
    };

    const expression = 'defer time={defer time={defer time=300}}';
    const executor = createUnitTestExecutor();
    executor.registerFunction(defer);
    const execution = new Execution({
      executor,
      ast: parseExpression(expression),
      params: {},
    });

    execution.start().toPromise();

    await waitFor(() => expect(started).toHaveBeenCalledTimes(1));

    execution.cancel();
    const { result } = await lastValueFrom(execution.result);
    expect(result).toMatchObject({
      type: 'error',
      error: {
        message: 'The expression was aborted.',
        name: 'AbortError',
      },
    });

    await waitFor(() => expect(aborted).toHaveBeenCalledTimes(1));

    expect(started).toHaveBeenCalledTimes(1);
    expect(aborted).toHaveBeenCalledTimes(1);
    expect(completed).toHaveBeenCalledTimes(0);

    jest.useFakeTimers({ legacyFakeTimers: true });
  });

  test('nested expressions are aborted when parent cancelled with CANCELED reason', async () => {
    jest.useRealTimers();
    const started = jest.fn();
    const completed = jest.fn();
    const aborted = jest.fn();
    const abortedReasons: unknown[] = [];

    const defer: ExpressionFunctionDefinition<'defer', unknown, { time: number }, unknown> = {
      name: 'defer',
      args: {
        time: {
          aliases: ['_'],
          help: 'Calls function from a context after delay unless aborted',
          types: ['number'],
        },
      },
      help: '',
      fn: async (input, args, { abortSignal }) => {
        started();
        await new Promise((r) => {
          const timeout = setTimeout(() => {
            if (!abortSignal.aborted) {
              completed();
            }
            r(undefined);
          }, args.time);

          abortSignal.addEventListener('abort', () => {
            aborted();
            abortedReasons.push(abortSignal.reason);
            clearTimeout(timeout);
            r(undefined);
          });
        });

        return args.time;
      },
    };

    const expression = 'defer time={defer time={defer time=300}}';
    const executor = createUnitTestExecutor();
    executor.registerFunction(defer);
    const execution = new Execution({
      executor,
      ast: parseExpression(expression),
      params: {},
    });

    execution.start().toPromise();

    await waitFor(() => expect(started).toHaveBeenCalledTimes(1));

    execution.cancel(AbortReason.CANCELED);

    const { result } = await lastValueFrom(execution.result);

    // CANCELED should not produce an AbortError — the expression completes with a numeric result
    expect(result).not.toEqual(
      expect.objectContaining({
        type: 'error',
        error: expect.objectContaining({ name: 'AbortError' }),
      })
    );

    // The innermost child's abort signal should have fired with the CANCELED reason
    await waitFor(() => expect(aborted).toHaveBeenCalledTimes(1));
    expect(abortedReasons[0]).toBe(AbortReason.CANCELED);
    expect(completed).toHaveBeenCalledTimes(0);

    jest.useFakeTimers({ legacyFakeTimers: true });
  });
});
