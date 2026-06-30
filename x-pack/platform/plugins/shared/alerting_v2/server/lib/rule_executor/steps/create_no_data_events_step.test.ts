/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DiagnosticResult } from '@elastic/elasticsearch';
import { errors } from '@elastic/elasticsearch';
import { TaskErrorSource } from '@kbn/task-manager-plugin/server';
import { getErrorSource } from '@kbn/task-manager-plugin/server/task_running';
import {
  collectStreamResults,
  createPipelineStream,
  createRuleExecutionInput,
  createRulePipelineState,
  createAlertEvent,
  createRuleResponse,
  createEsqlResponse,
  getStepError,
} from '../test_utils';
import { createLoggerService } from '../../services/logger_service/logger_service.mock';
import { createQueryService } from '../../services/query_service/query_service.mock';
import { buildGroupHash } from '../build_alert_events';
import type { AlertEvent } from '../../../resources/datastreams/alert_events';
import type { RuleResponse } from '../../rules_client';
import { CreateNoDataEventsStep } from './create_no_data_events_step';

const HOST = 'abc';

const groupingFields = ['host.name'];

const hostHash = buildGroupHash({
  rowDoc: { 'host.name': HOST },
  groupKeyFields: groupingFields,
  fallbackSeed: 'unused',
});

describe('CreateNoDataEventsStep', () => {
  const { loggerService } = createLoggerService();

  function createStep() {
    const internal = createQueryService();
    const scoped = createQueryService();
    const step = new CreateNoDataEventsStep(
      loggerService,
      internal.queryService,
      scoped.queryService
    );
    return { step, internalEsClient: internal.mockEsClient, scopedEsClient: scoped.mockEsClient };
  }

  function mockActiveAbcGroup(internalEsClient: ReturnType<typeof createStep>['internalEsClient']) {
    internalEsClient.esql.query.mockResolvedValue(
      createEsqlResponse([{ name: 'group_hash', type: 'keyword' }], [[hostHash]])
    );
  }

  function mockNoDataQueryHasHost(
    scopedEsClient: ReturnType<typeof createStep>['scopedEsClient'],
    present: boolean
  ) {
    scopedEsClient.esql.query.mockResolvedValue(
      present
        ? createEsqlResponse([{ name: 'host.name', type: 'keyword' }], [[HOST]])
        : createEsqlResponse([], [])
    );
  }

  function buildRule(overrides: Partial<RuleResponse> = {}): RuleResponse {
    return createRuleResponse({
      kind: 'alert',
      grouping: { fields: groupingFields },
      query: {
        format: 'standalone',
        breach: { query: 'FROM metrics-* | WHERE avg_cpu > 90' },
        recovery: { query: 'FROM metrics-* | WHERE avg_cpu < 80' },
        no_data: { query: 'FROM metrics-* | STATS COUNT(*) BY host.name' },
      },
      ...overrides,
    });
  }

  function recoveredEvent(): AlertEvent {
    return createAlertEvent({ group_hash: hostHash, status: 'recovered' });
  }

  async function runStep({
    step,
    rule,
    incomingEvents,
  }: {
    step: CreateNoDataEventsStep;
    rule: RuleResponse;
    incomingEvents: AlertEvent[];
  }) {
    const state = createRulePipelineState({ rule, alertEventsBatch: incomingEvents });
    const [result] = await collectStreamResults(step.executeStream(createPipelineStream([state])));
    return { result, initialState: state };
  }

  function statusesByGroup(
    events: ReadonlyArray<AlertEvent>
  ): Record<string, AlertEvent['status']> {
    return Object.fromEntries(events.map((e) => [e.group_hash, e.status]));
  }

  describe.each([['emit'], ['last_known_status']] as const)(
    "no_data_strategy: '%s'",
    (no_data_strategy) => {
      describe('Scenario: avg_cpu = 85%, recovery and breach queries are not met, host present', () => {
        it('recovery_strategy: no_breach — passes through the recovered event', async () => {
          const { step, internalEsClient, scopedEsClient } = createStep();

          mockActiveAbcGroup(internalEsClient);
          mockNoDataQueryHasHost(scopedEsClient, true);

          const incoming = recoveredEvent();
          const { result } = await runStep({
            step,
            rule: buildRule({ recovery_strategy: 'no_breach', no_data_strategy }),
            incomingEvents: [incoming],
          });

          expect(result.state.alertEventsBatch).toEqual([incoming]);
        });

        it('recovery_strategy: query — writes no event', async () => {
          const { step, internalEsClient, scopedEsClient } = createStep();

          mockActiveAbcGroup(internalEsClient);
          mockNoDataQueryHasHost(scopedEsClient, true);

          const { result, initialState } = await runStep({
            step,
            rule: buildRule({ recovery_strategy: 'query', no_data_strategy }),
            incomingEvents: [],
          });

          expect(result.state.alertEventsBatch).toEqual(initialState.alertEventsBatch);
        });

        it('recovery_strategy: none — writes no event', async () => {
          const { step, internalEsClient, scopedEsClient } = createStep();

          mockActiveAbcGroup(internalEsClient);
          mockNoDataQueryHasHost(scopedEsClient, true);

          const { result, initialState } = await runStep({
            step,
            rule: buildRule({ recovery_strategy: 'none', no_data_strategy }),
            incomingEvents: [],
          });

          expect(result.state.alertEventsBatch).toEqual(initialState.alertEventsBatch);
        });
      });

      describe('Scenario: host absent, no-data path', () => {
        it('recovery_strategy: no_breach — passes through the recovered event (recovery takes priority, no no_data event written)', async () => {
          const { step, internalEsClient, scopedEsClient } = createStep();

          mockActiveAbcGroup(internalEsClient);
          mockNoDataQueryHasHost(scopedEsClient, false);

          const incoming = recoveredEvent();
          const { result } = await runStep({
            step,
            rule: buildRule({ recovery_strategy: 'no_breach', no_data_strategy }),
            incomingEvents: [incoming],
          });

          expect(result.state.alertEventsBatch).toEqual([incoming]);
        });

        it('recovery_strategy: query — emits a no_data event', async () => {
          const { step, internalEsClient, scopedEsClient } = createStep();

          mockActiveAbcGroup(internalEsClient);
          mockNoDataQueryHasHost(scopedEsClient, false);

          const { result } = await runStep({
            step,
            rule: buildRule({ recovery_strategy: 'query', no_data_strategy }),
            incomingEvents: [],
          });

          expect(statusesByGroup(result.state.alertEventsBatch!)).toEqual({
            [hostHash]: 'no_data',
          });
        });

        it('recovery_strategy: none — emits a no_data event', async () => {
          const { step, internalEsClient, scopedEsClient } = createStep();

          mockActiveAbcGroup(internalEsClient);
          mockNoDataQueryHasHost(scopedEsClient, false);

          const { result } = await runStep({
            step,
            rule: buildRule({ recovery_strategy: 'none', no_data_strategy }),
            incomingEvents: [],
          });

          expect(statusesByGroup(result.state.alertEventsBatch!)).toEqual({
            [hostHash]: 'no_data',
          });
        });
      });
    }
  );

  describe("no_data_strategy: 'recover'", () => {
    describe('Scenario: host absent, no-data path', () => {
      it.each([['no_breach'], ['query']] as const)(
        'recovery_strategy: %s — passes through the recovered event',
        async (recovery_strategy) => {
          const { step, internalEsClient, scopedEsClient } = createStep();

          mockActiveAbcGroup(internalEsClient);
          mockNoDataQueryHasHost(scopedEsClient, false);

          const incoming = recoveredEvent();
          const { result } = await runStep({
            step,
            rule: buildRule({ recovery_strategy, no_data_strategy: 'recover' }),
            incomingEvents: [incoming],
          });

          expect(result.state.alertEventsBatch).toEqual([incoming]);
        }
      );

      it('recovery_strategy: none — emits a no_data event so the director can drive recovery', async () => {
        const { step, internalEsClient, scopedEsClient } = createStep();

        mockActiveAbcGroup(internalEsClient);
        mockNoDataQueryHasHost(scopedEsClient, false);

        const { result } = await runStep({
          step,
          rule: buildRule({ recovery_strategy: 'none', no_data_strategy: 'recover' }),
          incomingEvents: [],
        });

        expect(statusesByGroup(result.state.alertEventsBatch!)).toEqual({
          [hostHash]: 'no_data',
        });
      });
    });
  });

  describe("no_data_strategy: 'none'", () => {
    describe('Scenario: host absent, no-data path', () => {
      it('recovery_strategy: none — writes no event', async () => {
        const { step, internalEsClient, scopedEsClient } = createStep();

        const { result, initialState } = await runStep({
          step,
          rule: buildRule({ recovery_strategy: 'none', no_data_strategy: 'none' }),
          incomingEvents: [],
        });

        expect(internalEsClient.esql.query).not.toHaveBeenCalled();
        expect(scopedEsClient.esql.query).not.toHaveBeenCalled();
        expect(result.state.alertEventsBatch).toEqual(initialState.alertEventsBatch);
      });
    });

    it("treats an omitted no_data_strategy the same as 'none'", async () => {
      const { step, internalEsClient, scopedEsClient } = createStep();

      const incoming = recoveredEvent();
      const { result } = await runStep({
        step,
        rule: buildRule({ recovery_strategy: 'no_breach', no_data_strategy: undefined }),
        incomingEvents: [incoming],
      });

      expect(internalEsClient.esql.query).not.toHaveBeenCalled();
      expect(scopedEsClient.esql.query).not.toHaveBeenCalled();
      expect(result.state.alertEventsBatch).toEqual([incoming]);
    });
  });

  describe('composed format', () => {
    it("Scenario: host absent, no-data path — uses base query and emits no_data when the group isn't in the result", async () => {
      const { step, internalEsClient, scopedEsClient } = createStep();

      mockActiveAbcGroup(internalEsClient);
      scopedEsClient.esql.query.mockResolvedValue(createEsqlResponse([], []));

      const baseQuery = 'FROM metrics-* | STATS AVG(cpu) BY host.name';
      const composedRule = createRuleResponse({
        kind: 'alert',
        recovery_strategy: 'none',
        no_data_strategy: 'emit',
        grouping: { fields: groupingFields },
        query: {
          format: 'composed',
          base: baseQuery,
          breach: { segment: 'WHERE AVG(cpu) > 0.9' },
        },
      });

      const { result } = await runStep({
        step,
        rule: composedRule,
        incomingEvents: [],
      });

      expect(scopedEsClient.esql.query).toHaveBeenCalledWith(
        expect.objectContaining({ query: baseQuery }),
        expect.any(Object)
      );
      expect(statusesByGroup(result.state.alertEventsBatch!)).toEqual({ [hostHash]: 'no_data' });
    });
  });

  it('skips for non-alert rules (signal rules have no episode lifecycle)', async () => {
    const { step, internalEsClient, scopedEsClient } = createStep();

    const { result, initialState } = await runStep({
      step,
      rule: createRuleResponse({ kind: 'signal', no_data_strategy: 'emit' }),
      incomingEvents: [createAlertEvent()],
    });

    expect(internalEsClient.esql.query).not.toHaveBeenCalled();
    expect(scopedEsClient.esql.query).not.toHaveBeenCalled();
    expect(result.state.alertEventsBatch).toEqual(initialState.alertEventsBatch);
  });

  it('does not query the no-data ES|QL when there are no active groups for the rule', async () => {
    const { step, internalEsClient, scopedEsClient } = createStep();

    internalEsClient.esql.query.mockResolvedValue(
      createEsqlResponse([{ name: 'group_hash', type: 'keyword' }], [])
    );

    const { result } = await runStep({
      step,
      rule: buildRule({ recovery_strategy: 'no_breach', no_data_strategy: 'emit' }),
      incomingEvents: [],
    });

    expect(internalEsClient.esql.query).toHaveBeenCalledTimes(1);
    expect(scopedEsClient.esql.query).not.toHaveBeenCalled();
    expect(result.state.alertEventsBatch).toEqual([]);
  });

  it('skips when every active group is still breaching (no candidates left for the no-data check)', async () => {
    const { step, internalEsClient, scopedEsClient } = createStep();

    mockActiveAbcGroup(internalEsClient);

    const breached = createAlertEvent({ group_hash: hostHash, status: 'breached' });
    const { result } = await runStep({
      step,
      rule: buildRule({ recovery_strategy: 'no_breach', no_data_strategy: 'emit' }),
      incomingEvents: [breached],
    });

    expect(scopedEsClient.esql.query).not.toHaveBeenCalled();
    expect(result.state.alertEventsBatch).toEqual([breached]);
  });

  it('skips no-data handling when a standalone rule omits the `query.no_data` block (stale saved object)', async () => {
    const { step, internalEsClient, scopedEsClient } = createStep();

    mockActiveAbcGroup(internalEsClient);

    const incoming = recoveredEvent();
    const ruleWithoutNoData = createRuleResponse({
      kind: 'alert',
      recovery_strategy: 'no_breach',
      no_data_strategy: 'emit',
      grouping: { fields: groupingFields },
      query: { format: 'standalone', breach: { query: 'FROM metrics-*' } },
    });

    const { result } = await runStep({
      step,
      rule: ruleWithoutNoData,
      incomingEvents: [incoming],
    });

    expect(scopedEsClient.esql.query).not.toHaveBeenCalled();
    expect(result.state.alertEventsBatch).toEqual([incoming]);
  });

  it('surfaces ES|QL 4xx errors from the no-data query as TaskErrorSource.USER', async () => {
    const { step, internalEsClient, scopedEsClient } = createStep();

    mockActiveAbcGroup(internalEsClient);
    scopedEsClient.esql.query.mockRejectedValue(
      // @ts-expect-error: Not all params are needed for the test.
      new errors.ResponseError({ statusCode: 400 })
    );

    const state = createRulePipelineState({
      rule: buildRule({ recovery_strategy: 'no_breach', no_data_strategy: 'emit' }),
      alertEventsBatch: [],
    });

    const error = await getStepError(step, state);

    expect(error).toBeInstanceOf(Error);
    expect(getErrorSource(error!)).toBe(TaskErrorSource.USER);
  });

  it('does not classify ES|QL 5xx errors as user errors (server-side, retryable)', async () => {
    const { step, internalEsClient, scopedEsClient } = createStep();

    mockActiveAbcGroup(internalEsClient);
    scopedEsClient.esql.query.mockRejectedValue(
      new errors.ResponseError({ statusCode: 503 } as DiagnosticResult)
    );

    const state = createRulePipelineState({
      rule: buildRule({ recovery_strategy: 'no_breach', no_data_strategy: 'emit' }),
      alertEventsBatch: [],
    });

    const error = await getStepError(step, state);

    expect(error).toBeInstanceOf(Error);
    expect(getErrorSource(error!)).toBeUndefined();
  });

  it('forwards the executionContext abort signal to the active-groups ES|QL call', async () => {
    const { step, internalEsClient } = createStep();

    internalEsClient.esql.query.mockResolvedValue(
      createEsqlResponse([{ name: 'group_hash', type: 'keyword' }], [])
    );

    const abortController = new AbortController();
    const input = createRuleExecutionInput({ abortSignal: abortController.signal });

    const state = createRulePipelineState({
      input,
      rule: buildRule({ recovery_strategy: 'no_breach', no_data_strategy: 'emit' }),
      alertEventsBatch: [createAlertEvent()],
    });

    await collectStreamResults(step.executeStream(createPipelineStream([state])));

    expect(internalEsClient.esql.query).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ signal: abortController.signal })
    );
  });

  it('halts with state_not_ready when `rule` is missing from pipeline state', async () => {
    const { step } = createStep();

    const state = createRulePipelineState({ alertEventsBatch: [createAlertEvent()] });
    const [result] = await collectStreamResults(step.executeStream(createPipelineStream([state])));

    expect(result).toEqual({ type: 'halt', reason: 'state_not_ready', state });
  });

  it('halts with state_not_ready when `alertEventsBatch` is missing from pipeline state', async () => {
    const { step } = createStep();

    const state = createRulePipelineState({ rule: createRuleResponse() });
    const [result] = await collectStreamResults(step.executeStream(createPipelineStream([state])));

    expect(result).toEqual({ type: 'halt', reason: 'state_not_ready', state });
  });
});
