/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import { elasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import { coreMock, elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { ExecutionError } from '@kbn/workflows/server';
import { createVerifyKiStepDefinition } from './verify_ki_step';
import { ESQL_VALID_RUNTIME_VERIFIER_ID, ESQL_VALID_SYNTAX_VERIFIER_ID } from '../ki_verification';
import { mockKiStepTelemetry } from './test_utils';

type VerifyKiHandler = ReturnType<typeof createVerifyKiStepDefinition>['handler'];
type VerifyKiHandlerContext = Parameters<VerifyKiHandler>[0];
type EsClientMock = ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;

const esResponseError = (type: string, reason: string) =>
  new errors.ResponseError(
    elasticsearchClientMock.createApiResponse({
      statusCode: 400,
      body: { error: { type, reason } },
    })
  );

const makeHandlerContext = (
  ki: VerifyKiHandlerContext['input']['ki'],
  esClient: EsClientMock,
  {
    verifiers,
    getScopedEsClient,
  }: {
    verifiers?: string[];
    getScopedEsClient?: () => unknown;
  } = {}
): VerifyKiHandlerContext =>
  ({
    input: { ki, verifiers },
    config: {},
    rawInput: { ki, verifiers },
    contextManager: {
      getFakeRequest: jest.fn(),
      getContext: jest.fn().mockReturnValue({ workflow: { spaceId: 'default' } }),
      getScopedEsClient: getScopedEsClient ?? jest.fn().mockReturnValue(esClient),
    },
    logger: loggingSystemMock.createLogger(),
    abortSignal: new AbortController().signal,
    stepId: 'verify_ki',
    stepType: 'context-engine.verifyKi',
  } as unknown as VerifyKiHandlerContext);

describe('verify_ki workflow step', () => {
  let coreSetup: ReturnType<typeof coreMock.createSetup>;
  let uiSettingsGet: jest.Mock;
  let esClient: EsClientMock;
  let telemetry: ReturnType<typeof mockKiStepTelemetry>;

  const setContextEngineEnabled = (isEnabled: boolean) => {
    uiSettingsGet.mockResolvedValue(isEnabled);
  };

  beforeEach(() => {
    coreSetup = coreMock.createSetup();
    const startServices = coreMock.createStart();
    uiSettingsGet = jest.fn();
    startServices.uiSettings.asScopedToClient.mockReturnValue({
      get: uiSettingsGet,
    } as unknown as ReturnType<typeof startServices.uiSettings.asScopedToClient>);
    coreSetup.getStartServices.mockResolvedValue([startServices, {}, undefined]);
    esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.esql.query.mockResolvedValue({ columns: [], values: [] });
    telemetry = mockKiStepTelemetry();
  });

  const makeDefinition = () =>
    createVerifyKiStepDefinition(coreSetup, telemetry.logger, telemetry.analyticsService);

  const runHandler = async (
    ki: VerifyKiHandlerContext['input']['ki'],
    opts: { verifiers?: string[] } = {}
  ) => {
    const { output } = await makeDefinition().handler(makeHandlerContext(ki, esClient, opts));
    if (!output) {
      throw new Error('step returned no output');
    }
    return output;
  };

  const ALL_ESQL_VERIFIERS = [ESQL_VALID_SYNTAX_VERIFIER_ID, ESQL_VALID_RUNTIME_VERIFIER_ID];

  it.each([
    {
      caseName: 'missing',
      verifiers: undefined,
      message: 'verifiers must list at least one verifier id',
    },
    {
      caseName: 'duplicate',
      verifiers: [ESQL_VALID_SYNTAX_VERIFIER_ID, ESQL_VALID_SYNTAX_VERIFIER_ID],
      message: `Duplicate verifier id: "${ESQL_VALID_SYNTAX_VERIFIER_ID}"`,
    },
    {
      caseName: 'unknown',
      verifiers: ['unknown-verifier'],
      message: 'Unknown verifier id: "unknown-verifier"',
    },
  ])(
    'reports $caseName verifier selection as an input validation error',
    async ({ verifiers, message }) => {
      setContextEngineEnabled(true);

      const thrown = await runHandler(
        { attributes: { esql: 'FROM logs-* | LIMIT 10' } },
        { verifiers }
      ).catch((error) => error);

      expect(thrown).toBeInstanceOf(ExecutionError);
      expect(thrown.type).toBe('InputValidationError');
      expect(thrown.message).toBe(message);
      expect(telemetry.analyticsService.reportKiVerification).toHaveBeenCalledWith({
        outcome: 'failure',
        errorType: 'InputValidationError',
      });
    }
  );

  it('reports both verifiers passing when syntax and runtime validation succeed', async () => {
    setContextEngineEnabled(true);

    const output = await runHandler(
      {
        type: 'detection',
        attributes: { esql: 'FROM logs-* | WHERE event.outcome == "failure" | LIMIT 10' },
      },
      { verifiers: ALL_ESQL_VERIFIERS }
    );

    expect(output.passed).toBe(true);
    expect(output.results).toEqual([
      { verifier: ESQL_VALID_SYNTAX_VERIFIER_ID, passed: true },
      { verifier: ESQL_VALID_RUNTIME_VERIFIER_ID, passed: true },
    ]);
  });

  it('hands the scoped Elasticsearch client to the verifiers that need one', async () => {
    setContextEngineEnabled(true);

    await runHandler(
      { attributes: { esql: 'FROM logs-* | LIMIT 10' } },
      { verifiers: [ESQL_VALID_RUNTIME_VERIFIER_ID] }
    );

    expect(esClient.esql.query).toHaveBeenCalledTimes(1);
  });

  it('reports both verifiers failing when syntax and runtime validation fail', async () => {
    setContextEngineEnabled(true);
    esClient.esql.query.mockRejectedValue(
      esResponseError('parsing_exception', 'Unknown function [NOT_A_FUNCTION]')
    );

    const output = await runHandler(
      { attributes: { esql: 'FROM logs-* | EVAL x = NOT_A_FUNCTION(1)' } },
      { verifiers: ALL_ESQL_VERIFIERS }
    );

    expect(output.passed).toBe(false);
    expect(output.results).toEqual([
      {
        verifier: ESQL_VALID_SYNTAX_VERIFIER_ID,
        passed: false,
        reason: expect.stringContaining('NOT_A_FUNCTION'),
      },
      {
        verifier: ESQL_VALID_RUNTIME_VERIFIER_ID,
        passed: false,
        reason: expect.stringContaining('Unknown function [NOT_A_FUNCTION]'),
      },
    ]);
  });

  it('reports mixed results when syntax passes but runtime validation fails', async () => {
    setContextEngineEnabled(true);
    esClient.esql.query.mockRejectedValue(
      esResponseError('verification_exception', 'Unknown column [made_up_field]')
    );

    const output = await runHandler(
      { attributes: { esql: 'FROM logs-* | WHERE made_up_field > 1' } },
      { verifiers: ALL_ESQL_VERIFIERS }
    );

    expect(output.passed).toBe(false);
    expect(output.results).toEqual([
      { verifier: ESQL_VALID_SYNTAX_VERIFIER_ID, passed: true },
      {
        verifier: ESQL_VALID_RUNTIME_VERIFIER_ID,
        passed: false,
        reason: expect.stringContaining('Unknown column [made_up_field]'),
      },
    ]);
  });

  it('skips KIs with no applicable verifiers', async () => {
    setContextEngineEnabled(true);

    const output = await runHandler({ title: 'no esql here' }, { verifiers: ALL_ESQL_VERIFIERS });

    expect(output).toEqual({ passed: true, results: [] });
  });

  it('runs only the listed verifier when a subset is specified', async () => {
    setContextEngineEnabled(true);

    const output = await runHandler(
      { attributes: { esql: 'FROM logs-* | LIMIT 10' } },
      { verifiers: [ESQL_VALID_SYNTAX_VERIFIER_ID] }
    );

    expect(output.results).toEqual([{ verifier: ESQL_VALID_SYNTAX_VERIFIER_ID, passed: true }]);
    expect(esClient.esql.query).not.toHaveBeenCalled();
  });

  it('throws when the Context Engine setting is off', async () => {
    setContextEngineEnabled(false);

    await expect(
      runHandler({ attributes: { esql: 'FROM logs-* | EVAL x = NOT_A_FUNCTION(1)' } })
    ).rejects.toThrow('Context Engine is disabled');
  });

  it('reports a passed verification', async () => {
    setContextEngineEnabled(true);

    await runHandler(
      { attributes: { esql: 'FROM logs-* | WHERE event.outcome == "failure" | LIMIT 10' } },
      { verifiers: [ESQL_VALID_SYNTAX_VERIFIER_ID] }
    );

    expect(telemetry.analyticsService.reportKiVerification).toHaveBeenCalledTimes(1);
    expect(telemetry.analyticsService.reportKiVerification).toHaveBeenCalledWith({
      outcome: 'success',
      passed: true,
      verifiersRun: 1,
      failedVerifierIds: [],
    });
    expect(telemetry.logger.debug).toHaveBeenCalledTimes(1);
    expect(telemetry.logger.debug).toHaveBeenCalledWith(
      'KI verification passed (verifiers run: 1)'
    );
  });

  it('reports failed verifier ids on failure', async () => {
    setContextEngineEnabled(true);

    await runHandler(
      { attributes: { esql: 'FROM logs-* | EVAL x = NOT_A_FUNCTION(1)' } },
      { verifiers: [ESQL_VALID_SYNTAX_VERIFIER_ID] }
    );

    expect(telemetry.analyticsService.reportKiVerification).toHaveBeenCalledTimes(1);
    expect(telemetry.analyticsService.reportKiVerification).toHaveBeenCalledWith({
      outcome: 'success',
      passed: false,
      verifiersRun: 1,
      failedVerifierIds: [ESQL_VALID_SYNTAX_VERIFIER_ID],
    });
  });

  it('logs failing verifier ids on failure', async () => {
    setContextEngineEnabled(true);

    await runHandler(
      { attributes: { esql: 'FROM logs-* | EVAL x = NOT_A_FUNCTION(1)' } },
      { verifiers: [ESQL_VALID_SYNTAX_VERIFIER_ID] }
    );

    expect(telemetry.logger.debug).toHaveBeenCalledTimes(1);
    const [message] = (telemetry.logger.debug as jest.Mock).mock.calls[0];
    expect(message).toContain(ESQL_VALID_SYNTAX_VERIFIER_ID);
    expect(message).not.toContain('NOT_A_FUNCTION');
  });

  it('reports a zero verifier count when no verifier applied', async () => {
    setContextEngineEnabled(true);

    await runHandler({ title: 'no esql here' }, { verifiers: [ESQL_VALID_SYNTAX_VERIFIER_ID] });

    expect(telemetry.analyticsService.reportKiVerification).toHaveBeenCalledWith({
      outcome: 'success',
      passed: true,
      verifiersRun: 0,
      failedVerifierIds: [],
    });
  });

  it('reports an aborted run when cancelled', async () => {
    setContextEngineEnabled(true);
    const abortError = new Error('Request aborted');
    abortError.name = 'AbortError';
    const context = makeHandlerContext({ attributes: { esql: 'FROM logs-*' } }, esClient, {
      verifiers: [ESQL_VALID_RUNTIME_VERIFIER_ID],
      getScopedEsClient: () => {
        throw abortError;
      },
    });

    await expect(makeDefinition().handler(context)).rejects.toThrow(abortError);

    expect(telemetry.analyticsService.reportKiVerification).toHaveBeenCalledWith({
      outcome: 'aborted',
      errorType: undefined,
    });
    expect(telemetry.logger.debug).toHaveBeenCalledWith('KI verification aborted');
  });

  it('reports a failure when the run errors', async () => {
    setContextEngineEnabled(true);
    const context = makeHandlerContext({ attributes: { esql: 'FROM logs-*' } }, esClient, {
      verifiers: [ESQL_VALID_RUNTIME_VERIFIER_ID],
      getScopedEsClient: () => {
        throw new TypeError('boom');
      },
    });

    await expect(makeDefinition().handler(context)).rejects.toThrow('boom');

    expect(telemetry.analyticsService.reportKiVerification).toHaveBeenCalledWith({
      outcome: 'failure',
      errorType: 'TypeError',
    });
    expect(telemetry.logger.debug).toHaveBeenCalledWith('KI verification errored: TypeError');
  });

  it('reports no event when the setting is off', async () => {
    setContextEngineEnabled(false);

    await expect(runHandler({ attributes: { esql: 'FROM logs-*' } })).rejects.toThrow();

    expect(telemetry.analyticsService.reportKiVerification).not.toHaveBeenCalled();
  });
});
