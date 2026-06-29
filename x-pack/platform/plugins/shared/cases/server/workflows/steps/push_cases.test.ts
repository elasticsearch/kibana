/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import pRetry from 'p-retry';
import { createCaseResponseFixture } from '../../../common/fixtures/create_case';
import { pushCasesStepDefinition } from './push_cases';
import { createStepHandlerContext } from './test_utils';
import type { CasesClient } from '../../client';

// Avoid real retry delays in tests; the onFailedAttempt callback is tested separately below.
jest.mock('p-retry', () => jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()));

const caseWithConnector = {
  ...createCaseResponseFixture,
  connector: { id: 'connector-1', name: 'My Connector', type: '.jira', fields: null },
};

const createContext = (input: unknown) =>
  createStepHandlerContext({ input, stepType: 'cases.pushCases' });

const makeCasesClient = (overrides: Partial<{ get: jest.Mock; push: jest.Mock }> = {}) => {
  const get = overrides.get ?? jest.fn().mockResolvedValue(caseWithConnector);
  const push = overrides.push ?? jest.fn().mockResolvedValue(caseWithConnector);
  return jest.fn().mockResolvedValue({ cases: { get, push } } as unknown as CasesClient);
};

describe('pushCasesStepDefinition', () => {
  beforeEach(() => {
    (pRetry as unknown as jest.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());
  });

  it('pushes a single case to its connector and returns the result', async () => {
    const pushedCase = { ...caseWithConnector, external_service: { connector_id: 'connector-1' } };
    const push = jest.fn().mockResolvedValue(pushedCase);
    const definition = pushCasesStepDefinition(makeCasesClient({ push }));

    const result = await definition.handler(createContext({ case_ids: ['case-1'] }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({
      caseId: 'case-1',
      connectorId: 'connector-1',
      pushType: 'automatic',
    });
    expect(result).toMatchObject({
      output: { cases: [expect.objectContaining({ id: 'case-1' })] },
    });
  });

  it('pushes all cases to their connectors', async () => {
    const case1 = { ...caseWithConnector, id: 'case-1' };
    const case2 = { ...caseWithConnector, id: 'case-2' };
    const get = jest
      .fn()
      .mockResolvedValueOnce({ ...caseWithConnector, id: 'case-1' })
      .mockResolvedValueOnce({ ...caseWithConnector, id: 'case-2' });
    const push = jest.fn().mockResolvedValueOnce(case1).mockResolvedValueOnce(case2);
    const definition = pushCasesStepDefinition(makeCasesClient({ get, push }));

    const result = await definition.handler(createContext({ case_ids: ['case-1', 'case-2'] }));

    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledWith({
      caseId: 'case-1',
      connectorId: 'connector-1',
      pushType: 'automatic',
    });
    expect(push).toHaveBeenCalledWith({
      caseId: 'case-2',
      connectorId: 'connector-1',
      pushType: 'automatic',
    });
    const output = result as { output: { cases: unknown[] } };
    expect(output.output.cases).toHaveLength(2);
  });

  it('skips push and returns the case as-is when no connector is configured', async () => {
    const caseWithoutConnector = { ...createCaseResponseFixture, connector: null };
    const get = jest.fn().mockResolvedValue(caseWithoutConnector);
    const push = jest.fn();
    const definition = pushCasesStepDefinition(makeCasesClient({ get, push }));

    await definition.handler(createContext({ case_ids: ['case-1'] }));

    expect(push).not.toHaveBeenCalled();
  });

  it('skips push and returns the case as-is when a .none connector is configured', async () => {
    const caseWithoutNoneConnector = { ...createCaseResponseFixture };
    const get = jest.fn().mockResolvedValue(caseWithoutNoneConnector);
    const push = jest.fn();
    const definition = pushCasesStepDefinition(makeCasesClient({ get, push }));

    await definition.handler(createContext({ case_ids: ['case-1'] }));

    expect(push).not.toHaveBeenCalled();
  });

  it('returns null in the output for a failed case push and logs the error', async () => {
    const push = jest.fn().mockRejectedValue(new Error('push failed'));
    const context = createContext({ case_ids: ['case-1'] });
    const definition = pushCasesStepDefinition(makeCasesClient({ push }));

    const result = await definition.handler(context);

    expect(result).toEqual({ output: { cases: [null] } });
    expect(context.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error pushing case case-1')
    );
  });

  it('continues processing remaining cases when one push fails', async () => {
    const successCase = { ...caseWithConnector, id: 'case-2' };
    const get = jest.fn().mockResolvedValue(caseWithConnector);
    const push = jest
      .fn()
      .mockRejectedValueOnce(new Error('push failed'))
      .mockResolvedValueOnce(successCase);
    const context = createContext({ case_ids: ['case-1', 'case-2'] });
    const definition = pushCasesStepDefinition(makeCasesClient({ get, push }));

    const result = await definition.handler(context);

    const output = result as { output: { cases: unknown[] } };
    expect(output.output.cases[0]).toBeNull();
    expect(output.output.cases[1]).toEqual(expect.objectContaining({ id: 'case-2' }));
    expect(context.logger.error).toHaveBeenCalledTimes(1);
  });

  it('logs a warning via onFailedAttempt for each failed push attempt', async () => {
    (pRetry as unknown as jest.Mock).mockImplementationOnce(
      (
        fn: () => Promise<unknown>,
        opts: { onFailedAttempt: (err: { attemptNumber: number; retriesLeft: number }) => void }
      ) =>
        fn().catch((err: Error) => {
          opts.onFailedAttempt({ attemptNumber: 2, retriesLeft: 1 });
          throw err;
        })
    );

    const push = jest.fn().mockRejectedValue(new Error('timeout'));
    const context = createContext({ case_ids: ['case-1'] });
    const definition = pushCasesStepDefinition(makeCasesClient({ push }));

    await definition.handler(context);

    expect(context.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Pushing case (case-1)')
    );
    expect(context.logger.warn).toHaveBeenCalledWith(expect.stringContaining('connector-1'));
    expect(context.logger.warn).toHaveBeenCalledWith(expect.stringContaining('try #2'));
    expect(context.logger.warn).toHaveBeenCalledWith(expect.stringContaining('1 retries left'));
  });

  it('returns { error } when the cases client cannot be obtained', async () => {
    const clientError = new Error('unauthorized');
    const definition = pushCasesStepDefinition(jest.fn().mockRejectedValue(clientError));

    const result = await definition.handler(createContext({ case_ids: ['case-1'] }));

    expect(result).toEqual({ error: clientError });
  });
});
