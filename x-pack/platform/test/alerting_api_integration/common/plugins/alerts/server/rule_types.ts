/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Logger } from '@kbn/logging';
import type { CoreSetup, ElasticsearchClient } from '@kbn/core/server';
import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import { curry, range, times } from 'lodash';
import type {
  RuleType,
  AlertInstanceState,
  AlertInstanceContext,
  RuleTypeState,
  RuleTypeParams,
} from '@kbn/alerting-plugin/server';
import { ES_TEST_INDEX_NAME } from '@kbn/alerting-api-integration-helpers';
import { Dataset, createPersistenceRuleTypeWrapper } from '@kbn/rule-registry-plugin/server';
import { mappingFromFieldMap } from '@kbn/alerting-plugin/common';
import { alertFieldMap } from '@kbn/alerts-as-data-utils';
import {
  ENHANCED_ES_SEARCH_STRATEGY,
  ESQL_ASYNC_SEARCH_STRATEGY,
  EQL_SEARCH_STRATEGY,
} from '@kbn/data-plugin/common';
import type { AsyncSearchStrategies } from '@kbn/alerting-plugin/server/types';
import type { FixtureStartDeps, FixtureSetupDeps } from './plugin';

export const EscapableStrings = {
  escapableBold: '*bold*',
  escapableBacktic: 'back`tic',
  escapableBackticBold: '`*bold*`',
  escapableHtml: '<&>',
  escapableDoubleQuote: '"double quote"',
  escapableLineFeed: 'line\x0afeed',
  escapableLink: 'https://te_st.com/',
};

export const DeepContextVariables = {
  objectA: {
    stringB: 'B',
    arrayC: [
      { stringD: 'D1', numberE: 42 },
      { stringD: 'D2', numberE: 43 },
    ],
    objectF: {
      stringG: 'G',
      nullG: null,
      undefinedG: undefined,
    },
  },
  stringH: 'H',
  arrayI: [44, 45],
  nullJ: null,
  undefinedK: undefined,
  dateL: '2023-04-20T04:13:17.858Z',
  encodeableUrl: 'https://www.elastic.co?foo=bar&baz= qux',
};

function getAlwaysFiringRuleType() {
  const paramsSchema = schema.object({
    index: schema.string(),
    reference: schema.string(),
    groupsToScheduleActionsInSeries: schema.maybe(schema.arrayOf(schema.nullable(schema.string()))),
  });
  type ParamsType = TypeOf<typeof paramsSchema>;
  interface State extends RuleTypeState {
    groupInSeriesIndex?: number;
  }
  interface InstanceState extends AlertInstanceState {
    instanceStateValue: boolean;
  }
  interface InstanceContext extends AlertInstanceContext {
    instanceContextValue: boolean;
  }
  const result: RuleType<
    ParamsType & RuleTypeParams,
    never, // Only use if defining useSavedObjectReferences hook
    State,
    InstanceState,
    InstanceContext,
    'default' | 'other'
  > = {
    id: 'test.always-firing',
    name: 'Test: Always Firing',
    actionGroups: [
      { id: 'default', name: 'Default' },
      { id: 'other', name: 'Other' },
    ],
    validate: {
      params: paramsSchema,
    },
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    actionVariables: {
      state: [{ name: 'instanceStateValue', description: 'the instance state value' }],
      params: [{ name: 'instanceParamsValue', description: 'the instance params value' }],
      context: [{ name: 'instanceContextValue', description: 'the instance context value' }],
    },
    executor: curry(alwaysFiringExecutor)(),
  };
  return result;
}

async function alwaysFiringExecutor(alertExecutorOptions: any) {
  const { services, params, state, spaceId, namespace, rule } = alertExecutorOptions;
  let group: string | null = 'default';
  const alertInfo = { spaceId, namespace, ...rule };

  if (params.groupsToScheduleActionsInSeries) {
    const index = state.groupInSeriesIndex || 0;
    const [scheduledGroup] = (params.groupsToScheduleActionsInSeries[index] ?? '').split(':');

    group = scheduledGroup;
  }

  if (group) {
    const instance = services.alertFactory.create('1').replaceState({ instanceStateValue: true });

    instance.scheduleActions(group, {
      instanceContextValue: true,
    });
  }

  await services.scopedClusterClient.asCurrentUser.index({
    index: params.index,
    refresh: 'wait_for',
    document: {
      state,
      params,
      reference: params.reference,
      source: 'alert:test.always-firing',
      alertInfo,
    },
  });
  return {
    state: {
      globalStateValue: true,
      groupInSeriesIndex: (state.groupInSeriesIndex || 0) + 1,
    },
  };
}

function getCumulativeFiringRuleType() {
  interface State extends RuleTypeState {
    runCount?: number;
  }
  interface InstanceState extends AlertInstanceState {
    instanceStateValue: boolean;
  }
  const result: RuleType<{}, {}, State, InstanceState, {}, 'default' | 'other'> = {
    id: 'test.cumulative-firing',
    name: 'Test: Cumulative Firing',
    actionGroups: [
      { id: 'default', name: 'Default' },
      { id: 'other', name: 'Other' },
    ],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    async executor(alertExecutorOptions) {
      const { services, state } = alertExecutorOptions;
      const group = 'default';

      const runCount = (state.runCount || 0) + 1;

      times(runCount, (index) => {
        services.alertFactory
          .create(`instance-${index}`)
          .replaceState({ instanceStateValue: true })
          .scheduleActions(group);
      });

      return {
        state: {
          runCount,
        },
      };
    },
    validate: {
      params: schema.any(),
    },
  };
  return result;
}

function getConsumerMetricsRuleType() {
  const paramsSchema = schema.object({
    index: schema.string(),
    reference: schema.string(),
  });
  type ParamsType = TypeOf<typeof paramsSchema>;
  const result: RuleType<ParamsType, never, {}, {}, {}, 'default'> = {
    id: 'test.consumer-metrics',
    name: 'Test: Consumer metrics',
    actionGroups: [{ id: 'default', name: 'Default' }],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    autoRecoverAlerts: false,
    async executor({ services, params }) {
      services.ruleMonitoringService?.setMetrics({
        alerts_candidate_count: 90357,
        alerts_suppressed_count: 42,
        total_indexing_duration_ms: 987,
        total_enrichment_duration_ms: 654,
        frozen_indices_queried_count: 3,
      });
      await services.scopedClusterClient.asCurrentUser.index({
        index: params.index,
        refresh: 'wait_for',
        document: {
          reference: params.reference,
          source: 'alert:test.consumer-metrics',
        },
      });
      return { state: {} };
    },
    validate: {
      params: paramsSchema,
    },
  };
  return result;
}

function getNeverFiringRuleType() {
  const paramsSchema = schema.object({
    index: schema.string(),
    reference: schema.string(),
  });
  type ParamsType = TypeOf<typeof paramsSchema>;
  interface State extends RuleTypeState {
    globalStateValue: boolean;
  }
  const result: RuleType<ParamsType, never, State, {}, {}, 'default'> = {
    id: 'test.never-firing',
    name: 'Test: Never firing',
    actionGroups: [
      {
        id: 'default',
        name: 'Default',
      },
    ],
    validate: {
      params: paramsSchema,
    },
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    async executor({ services, params, state }) {
      await services.scopedClusterClient.asCurrentUser.index({
        index: params.index,
        refresh: 'wait_for',
        body: {
          state,
          params,
          reference: params.reference,
          source: 'alert:test.never-firing',
        },
      });
      return {
        state: {
          globalStateValue: true,
        },
      };
    },
  };
  return result;
}

function getFailingRuleType() {
  const paramsSchema = schema.object({
    index: schema.string(),
    reference: schema.string(),
  });
  type ParamsType = TypeOf<typeof paramsSchema>;
  const result: RuleType<ParamsType, never, {}, {}, {}, 'default'> = {
    id: 'test.failing',
    name: 'Test: Failing',
    validate: {
      params: paramsSchema,
    },
    actionGroups: [
      {
        id: 'default',
        name: 'Default',
      },
    ],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    async executor({ services, params, state }) {
      await services.scopedClusterClient.asCurrentUser.index({
        index: params.index,
        refresh: 'wait_for',
        body: {
          state,
          params,
          reference: params.reference,
          source: 'alert:test.failing',
        },
      });
      throw new Error('Failed to execute alert type');
    },
  };
  return result;
}

function getExceedsAlertLimitRuleType() {
  const paramsSchema = schema.object({
    index: schema.string(),
    getsLimit: schema.boolean(),
    reportsLimitReached: schema.boolean(),
  });
  type ParamsType = TypeOf<typeof paramsSchema>;
  const result: RuleType<ParamsType, never, {}, {}, {}, 'default'> = {
    id: 'test.exceedsAlertLimit',
    name: 'Test: ExceedsAlertLimit',
    validate: {
      params: paramsSchema,
    },
    actionGroups: [
      {
        id: 'default',
        name: 'Default',
      },
    ],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    async executor({ services, params, state }) {
      let limit: number | null = null;
      if (params.getsLimit) {
        limit = services.alertFactory.alertLimit.getValue();
      }

      const alertsToCreate = limit ? limit : 115;

      range(alertsToCreate)
        .map(() => uuidv4())
        .forEach((id: string) => {
          services.alertFactory.create(id).scheduleActions('default');
        });

      if (params.reportsLimitReached) {
        services.alertFactory.alertLimit.setLimitReached(true);
      }

      // Index something
      await services.scopedClusterClient.asCurrentUser.index({
        index: params.index,
        refresh: 'wait_for',
        body: {
          numAlerts: alertsToCreate,
        },
      });

      return { state: {} };
    },
  };
  return result;
}

function getAuthorizationRuleType(core: CoreSetup<FixtureStartDeps>) {
  const paramsSchema = schema.object({
    callClusterAuthorizationIndex: schema.string(),
    savedObjectsClientType: schema.string(),
    savedObjectsClientId: schema.string(),
    index: schema.string(),
    reference: schema.string(),
  });
  type ParamsType = TypeOf<typeof paramsSchema>;
  const result: RuleType<ParamsType, never, {}, {}, {}, 'default'> = {
    id: 'test.authorization',
    name: 'Test: Authorization',
    actionGroups: [
      {
        id: 'default',
        name: 'Default',
      },
    ],
    defaultActionGroupId: 'default',
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    validate: {
      params: paramsSchema,
    },
    async executor({ services, params, state }) {
      // Call cluster
      let callClusterSuccess = false;
      let callClusterError;
      try {
        await services.scopedClusterClient.asCurrentUser.index({
          index: params.callClusterAuthorizationIndex,
          refresh: 'wait_for',
          body: {
            param1: 'test',
          },
        });
        callClusterSuccess = true;
      } catch (e) {
        callClusterError = e;
      }
      // Call scoped cluster
      const scopedClusterClient = services.scopedClusterClient;
      let callScopedClusterSuccess = false;
      let callScopedClusterError;
      try {
        await scopedClusterClient.asCurrentUser.index({
          index: params.callClusterAuthorizationIndex,
          refresh: 'wait_for',
          body: {
            param1: 'test',
          },
        });
        callScopedClusterSuccess = true;
      } catch (e) {
        callScopedClusterError = e;
      }
      // Saved objects client
      let savedObjectsClientSuccess = false;
      let savedObjectsClientError;
      try {
        await services.savedObjectsClient.get(
          params.savedObjectsClientType,
          params.savedObjectsClientId
        );
        savedObjectsClientSuccess = true;
      } catch (e) {
        savedObjectsClientError = e;
      }
      // Save the result
      await services.scopedClusterClient.asCurrentUser.index({
        index: params.index,
        refresh: 'wait_for',
        body: {
          state: {
            callClusterSuccess,
            callClusterError,
            callScopedClusterSuccess,
            callScopedClusterError,
            savedObjectsClientSuccess,
            savedObjectsClientError,
          },
          params,
          reference: params.reference,
          source: 'alert:test.authorization',
        },
      });

      return { state: {} };
    },
  };
  return result;
}

function getValidationRuleType() {
  const paramsSchema = schema.object({
    param1: schema.string(),
  });
  type ParamsType = TypeOf<typeof paramsSchema>;
  const result: RuleType<ParamsType, never, {}, {}, {}, 'default'> = {
    id: 'test.validation',
    name: 'Test: Validation',
    actionGroups: [
      {
        id: 'default',
        name: 'Default',
      },
    ],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    defaultActionGroupId: 'default',
    validate: {
      params: paramsSchema,
    },
    async executor() {
      return { state: {} };
    },
  };
  return result;
}

function getPatternFiringRuleType() {
  const paramsSchema = schema.object({
    pattern: schema.recordOf(
      schema.string(),
      schema.arrayOf(schema.oneOf([schema.boolean(), schema.string()]))
    ),
    reference: schema.maybe(schema.string()),
  });
  type ParamsType = TypeOf<typeof paramsSchema>;
  interface State extends RuleTypeState {
    patternIndex?: number;
  }
  const result: RuleType<ParamsType, never, State, {}, {}, 'default'> = {
    id: 'test.patternFiring',
    name: 'Test: Firing on a Pattern',
    actionGroups: [{ id: 'default', name: 'Default' }],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    async executor(alertExecutorOptions) {
      const { services, state, params } = alertExecutorOptions;
      const pattern = params.pattern;
      if (typeof pattern !== 'object') throw new Error('pattern is not an object');
      let maxPatternLength = 0;
      for (const [instanceId, instancePattern] of Object.entries(pattern)) {
        if (!Array.isArray(instancePattern)) {
          throw new Error(`pattern for instance ${instanceId} is not an array`);
        }
        maxPatternLength = Math.max(maxPatternLength, instancePattern.length);
      }

      if (params.reference) {
        await services.scopedClusterClient.asCurrentUser.index({
          index: ES_TEST_INDEX_NAME,
          refresh: 'wait_for',
          body: {
            reference: params.reference,
            source: 'alert:test.patternFiring',
            ...alertExecutorOptions,
          },
        });
      }

      // get the pattern index, return if past it
      const patternIndex = state.patternIndex ?? 0;
      if (patternIndex >= maxPatternLength) {
        return { state: { patternIndex } };
      }

      // fire if pattern says to
      for (const [instanceId, instancePattern] of Object.entries(pattern)) {
        const scheduleByPattern = instancePattern[patternIndex];
        if (scheduleByPattern === true) {
          services.alertFactory.create(instanceId).scheduleActions('default', {
            ...EscapableStrings,
            deep: DeepContextVariables,
          });
        } else if (typeof scheduleByPattern === 'string') {
          services.alertFactory.create(instanceId).scheduleActions('default', scheduleByPattern);
        }
      }

      return {
        state: {
          patternIndex: patternIndex + 1,
        },
      };
    },
    validate: {
      params: paramsSchema,
    },
  };
  return result;
}

function getPatternFiringAlertsAsDataRuleType() {
  const paramsSchema = schema.object({
    pattern: schema.recordOf(
      schema.string(),
      schema.arrayOf(schema.oneOf([schema.boolean(), schema.string()]))
    ),
    // Per-instance severity values indexed by run number (patternIndex).
    // When provided, the value at position [patternIndex] is emitted as
    // `kibana.alert.severity` in the alert payload for that run.
    severityPattern: schema.maybe(
      schema.recordOf(schema.string(), schema.arrayOf(schema.maybe(schema.string())))
    ),
    // Tests that need an empty `cleanedPayload` on the run that recovers an
    // alert (e.g. to assert the alert builder falls back to the predecessor
    // doc) can opt out of the default recovery payload.
    setRecoveryPayload: schema.maybe(schema.boolean()),
  });
  type ParamsType = TypeOf<typeof paramsSchema>;
  interface State extends RuleTypeState {
    patternIndex?: number;
  }
  const result: RuleType<
    ParamsType,
    never,
    State,
    {},
    {},
    'default',
    'recovered',
    { patternIndex: number; instancePattern: boolean[]; 'kibana.alert.severity'?: string }
  > = {
    id: 'test.patternFiringAad',
    name: 'Test: Firing on a Pattern and writing Alerts as Data',
    actionGroups: [{ id: 'default', name: 'Default' }],
    category: 'management',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    doesSetRecoveryContext: true,
    validate: {
      params: paramsSchema,
    },
    async executor(alertExecutorOptions) {
      const { services, state, params } = alertExecutorOptions;
      const pattern = params.pattern;
      if (typeof pattern !== 'object') throw new Error('pattern is not an object');
      let maxPatternLength = 0;
      for (const [instanceId, instancePattern] of Object.entries(pattern)) {
        if (!Array.isArray(instancePattern)) {
          throw new Error(`pattern for instance ${instanceId} is not an array`);
        }
        maxPatternLength = Math.max(maxPatternLength, instancePattern.length);
      }

      const alertsClient = services.alertsClient;
      if (!alertsClient) {
        throw new Error(`Expected alertsClient to be defined but it is not`);
      }

      // get the pattern index, return if past it
      const patternIndex = state.patternIndex ?? 0;
      if (patternIndex >= maxPatternLength) {
        return { state: { patternIndex } };
      }

      // fire if pattern says to
      for (const [instanceId, instancePattern] of Object.entries(pattern)) {
        const scheduleByPattern = instancePattern[patternIndex];
        const severity = params.severityPattern?.[instanceId]?.[patternIndex];
        const severityField: { 'kibana.alert.severity'?: string } =
          severity !== undefined && severity !== null ? { 'kibana.alert.severity': severity } : {};
        if (scheduleByPattern === true) {
          alertsClient.report({
            id: instanceId,
            actionGroup: 'default',
            state: { patternIndex },
            payload: {
              patternIndex,
              instancePattern: instancePattern as boolean[],
              ...severityField,
            },
          });
        } else if (typeof scheduleByPattern === 'string') {
          alertsClient.report({
            id: instanceId,
            actionGroup: 'default',
            state: { patternIndex },
            payload: { patternIndex, instancePattern: [true], ...severityField },
          });
        }
      }

      // set recovery payload
      if (params.setRecoveryPayload !== false) {
        for (const recoveredAlert of alertsClient.getRecoveredAlerts()) {
          alertsClient.setAlertData({
            id: recoveredAlert.alert.getId(),
            payload: { patternIndex: -1, instancePattern: [] },
          });
        }
      }

      return {
        state: {
          patternIndex: patternIndex + 1,
        },
      };
    },
    alerts: {
      context: 'test.patternfiring',
      shouldWrite: true,
      mappings: {
        fieldMap: {
          patternIndex: {
            required: false,
            type: 'long',
          },
          instancePattern: {
            required: false,
            type: 'boolean',
            array: true,
          },
        },
      },
    },
  };
  return result;
}

function getPatternSuccessOrFailureRuleType() {
  const paramsSchema = schema.object({
    pattern: schema.arrayOf(schema.oneOf([schema.boolean(), schema.string()])),
  });
  type ParamsType = TypeOf<typeof paramsSchema>;
  interface State extends RuleTypeState {
    patternIndex?: number;
  }
  const result: RuleType<ParamsType, never, State, {}, {}, 'default'> = {
    id: 'test.patternSuccessOrFailure',
    name: 'Test: Succeeding or failing on a Pattern',
    actionGroups: [{ id: 'default', name: 'Default' }],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    async executor(alertExecutorOptions) {
      const { state, params } = alertExecutorOptions;
      const pattern = params.pattern;
      if (!Array.isArray(pattern)) throw new Error('pattern is not an array');

      // get the pattern index, return if past it
      const patternIndex = state.patternIndex ?? 0;
      if (patternIndex >= pattern.length) {
        return { state: { patternIndex } };
      }

      if (!pattern[patternIndex]) {
        throw new Error('Failed to execute alert type');
      }

      return {
        state: {
          patternIndex: patternIndex + 1,
        },
      };
    },
    validate: {
      params: paramsSchema,
    },
  };
  return result;
}

function getPatternFiringAutoRecoverFalseRuleType() {
  const paramsSchema = schema.object({
    pattern: schema.recordOf(
      schema.string(),
      schema.arrayOf(schema.oneOf([schema.boolean(), schema.string()]))
    ),
    reference: schema.maybe(schema.string()),
  });
  type ParamsType = TypeOf<typeof paramsSchema>;
  interface State extends RuleTypeState {
    patternIndex?: number;
  }
  const result: RuleType<ParamsType, never, State, {}, {}, 'default'> = {
    id: 'test.patternFiringAutoRecoverFalse',
    name: 'Test: Firing on a Pattern with Auto Recover: false',
    actionGroups: [{ id: 'default', name: 'Default' }],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    ruleTaskTimeout: '10s',
    autoRecoverAlerts: false,
    async executor(alertExecutorOptions) {
      const { services, state, params } = alertExecutorOptions;
      const pattern = params.pattern;
      if (typeof pattern !== 'object') throw new Error('pattern is not an object');
      let maxPatternLength = 0;
      for (const [instanceId, instancePattern] of Object.entries(pattern)) {
        if (!Array.isArray(instancePattern)) {
          throw new Error(`pattern for instance ${instanceId} is not an array`);
        }
        maxPatternLength = Math.max(maxPatternLength, instancePattern.length);
      }

      if (params.reference) {
        await services.scopedClusterClient.asCurrentUser.index({
          index: ES_TEST_INDEX_NAME,
          refresh: 'wait_for',
          body: {
            reference: params.reference,
            source: 'alert:test.patternFiringAutoRecoverFalse',
            ...alertExecutorOptions,
          },
        });
      }

      // get the pattern index, return if past it
      const patternIndex = state.patternIndex ?? 0;
      if (patternIndex >= maxPatternLength) {
        return { state: { patternIndex } };
      }

      // fire if pattern says to
      for (const [instanceId, instancePattern] of Object.entries(pattern)) {
        const scheduleByPattern = instancePattern[patternIndex];
        if (scheduleByPattern === true) {
          services.alertFactory.create(instanceId).scheduleActions('default', {
            ...EscapableStrings,
            deep: DeepContextVariables,
          });
        } else if (typeof scheduleByPattern === 'string') {
          if (scheduleByPattern === 'error') {
            throw new Error('rule executor error');
          } else if (scheduleByPattern === 'timeout') {
            // delay longer than the timeout
            await new Promise((r) => setTimeout(r, 15000));
          } else if (scheduleByPattern === 'run_long') {
            // delay so rule runs a little longer
            await new Promise((r) => setTimeout(r, 4000));
          } else {
            services.alertFactory.create(instanceId).scheduleActions('default', scheduleByPattern);
          }
        }
      }

      return {
        state: {
          patternIndex: patternIndex + 1,
        },
      };
    },
    validate: {
      params: paramsSchema,
    },
  };
  return result;
}

function getLongRunningPatternRuleType(cancelAlertsOnRuleTimeout: boolean = true) {
  let globalPatternIndex = 0;
  const paramsSchema = schema.object({
    pattern: schema.arrayOf(schema.boolean()),
  });
  type ParamsType = TypeOf<typeof paramsSchema>;
  interface State extends RuleTypeState {
    patternIndex?: number;
  }
  const result: RuleType<ParamsType, never, State, {}, {}, 'default'> = {
    id: `test.patternLongRunning${
      cancelAlertsOnRuleTimeout === true ? '.cancelAlertsOnRuleTimeout' : ''
    }`,
    name: 'Test: Run Long on a Pattern',
    actionGroups: [{ id: 'default', name: 'Default' }],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    ruleTaskTimeout: '3s',
    cancelAlertsOnRuleTimeout,
    autoRecoverAlerts: false,
    alerts: {
      context: 'test.patternfiring',
      shouldWrite: true,
      mappings: {
        fieldMap: {
          patternIndex: {
            required: false,
            type: 'long',
          },
          instancePattern: {
            required: false,
            type: 'boolean',
            array: true,
          },
        },
      },
    },
    async executor(ruleExecutorOptions) {
      const { services, params } = ruleExecutorOptions;
      const pattern = params.pattern;
      if (!Array.isArray(pattern)) {
        throw new Error(`pattern is not an array`);
      }

      const alertsClient = services.alertsClient;
      if (!alertsClient) {
        throw new Error(`Expected alertsClient to be defined but it is not`);
      }

      // get the pattern index, return if past it
      if (globalPatternIndex >= pattern.length) {
        globalPatternIndex = 0;
        return { state: {} };
      }

      alertsClient.report({ id: `alert_${globalPatternIndex}`, actionGroup: 'default' });

      // run long if pattern says to
      if (pattern[globalPatternIndex++] === true) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
      return { state: {} };
    },
    validate: {
      params: paramsSchema,
    },
  };
  return result;
}

function getCancellableRuleType() {
  const paramsSchema = schema.object({
    doLongSearch: schema.boolean(),
    doLongPostProcessing: schema.boolean(),
  });
  type ParamsType = TypeOf<typeof paramsSchema>;
  const result: RuleType<ParamsType, never, {}, {}, {}, 'default'> = {
    id: 'test.cancellableRule',
    name: 'Test: Rule That Implements Cancellation',
    actionGroups: [{ id: 'default', name: 'Default' }],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    ruleTaskTimeout: '3s',
    async executor(ruleExecutorOptions) {
      const { services, params } = ruleExecutorOptions;
      const doLongSearch = params.doLongSearch;
      const doLongPostProcessing = params.doLongPostProcessing;

      const aggs = doLongSearch
        ? {
            delay: {
              shard_delay: {
                value: '10s',
              },
            },
          }
        : {};

      const query = {
        index: ES_TEST_INDEX_NAME,
        body: {
          query: {
            bool: {
              filter: {
                match_all: {},
              },
            },
          },
          ...(aggs ? { aggs } : {}),
        },
      };

      await services.scopedClusterClient.asCurrentUser.search(query as any);

      if (doLongPostProcessing) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }

      if (services.shouldStopExecution()) {
        throw new Error('execution short circuited!');
      }

      return { state: {} };
    },
    validate: {
      params: paramsSchema,
    },
  };
  return result;
}

function getAsyncSearchRuleType() {
  const result: RuleType<
    { strategy: AsyncSearchStrategies },
    never,
    {},
    {},
    {},
    'default',
    'recovered',
    { number_of_docs: number }
  > = {
    id: 'test.ruleWithAsyncSearch',
    name: 'Test: Rule That uses async search client',
    actionGroups: [{ id: 'default', name: 'Default' }],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    ruleTaskTimeout: '3s',
    alerts: {
      context: 'test.async.search',
      shouldWrite: true,
      mappings: {
        fieldMap: {
          number_of_docs: {
            required: false,
            type: 'long',
          },
        },
      },
    },
    async executor(ruleExecutorOptions) {
      const { services, params } = ruleExecutorOptions;
      const strategy = params.strategy || ENHANCED_ES_SEARCH_STRATEGY;
      const client = services.getAsyncSearchClient(strategy);

      const strategies = {
        [ENHANCED_ES_SEARCH_STRATEGY]: {
          request: {
            params: {
              query: { match_all: {} },
            },
          },
          count: (response: any) => {
            return response.hits.total;
          },
        },
        [ESQL_ASYNC_SEARCH_STRATEGY]: {
          request: {
            params: {
              query: `FROM ${ES_TEST_INDEX_NAME}`,
            },
          },
          count: (response: any) => {
            return response.documents_found;
          },
        },
        [EQL_SEARCH_STRATEGY]: {
          request: {
            params: {
              index: ES_TEST_INDEX_NAME,
              query: `any where true`,
            },
          },
          count: (response: any) => {
            return response.hits.total.value;
          },
        },
      };

      const response = await client.search({
        request: strategies[strategy].request,
      });

      const numberOfDocs = strategies[strategy].count(response);

      if (numberOfDocs > 0) {
        services.alertsClient?.report({
          id: 'async-search-rule-alert-1',
          actionGroup: 'default',
          payload: { number_of_docs: numberOfDocs },
        });
      }

      return { state: {} };
    },
    validate: {
      params: schema.any(),
    },
  };
  return result;
}

function getAlwaysFiringAlertAsDataRuleType() {
  const paramsSchema = schema.object({
    index: schema.string(),
    reference: schema.string(),
  });
  type ParamsType = TypeOf<typeof paramsSchema>;

  const result: RuleType<ParamsType, never, {}, {}, {}, 'default'> = {
    id: 'test.always-firing-alert-as-data',
    name: 'Test: Always Firing Alert As Data',
    actionGroups: [{ id: 'default', name: 'Default' }],
    validate: {
      params: paramsSchema,
    },
    category: 'management',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    async executor(ruleExecutorOptions) {
      const { services, params, state, spaceId, namespace, rule } = ruleExecutorOptions;
      const ruleInfo = { spaceId, namespace, ...rule };

      services.alertsClient?.report({ id: '1', actionGroup: 'default' });
      services.alertsClient?.report({ id: '2', actionGroup: 'default' });

      await services.scopedClusterClient.asCurrentUser.index({
        index: params.index,
        refresh: 'wait_for',
        body: {
          state,
          params,
          reference: params.reference,
          source: 'rule:test.always-firing-alert-as-data',
          ruleInfo,
        },
      });

      return { state: {} };
    },
    alerts: {
      context: 'observability.test.alerts',
      mappings: {
        fieldMap: {},
      },
      useLegacyAlerts: true,
      shouldWrite: true,
    },
  };
  return result;
}

function getAlwaysFiringAlertAsDataWithDynamicTemplatesRuleType() {
  const paramsSchema = schema.object({
    dynamic_fields: schema.recordOf(schema.string(), schema.any(), { defaultValue: {} }),
  });
  type ParamsType = TypeOf<typeof paramsSchema>;

  const result: RuleType<
    ParamsType,
    never,
    RuleTypeState,
    {},
    {},
    'default',
    'recovered',
    { 'kibana.alert.dynamic': { [key: string]: any } }
  > = {
    id: 'test.always-firing-alert-as-data-with-dynamic-templates',
    name: 'Test: Rule with dynamicTemplates and writing Alerts as Data',
    actionGroups: [{ id: 'default', name: 'Default' }],
    category: 'management',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    doesSetRecoveryContext: true,
    validate: {
      params: paramsSchema,
    },
    async executor(ruleExecutorOptions) {
      const { services, params } = ruleExecutorOptions;

      services.alertsClient?.report({
        id: '1',
        actionGroup: 'default',
        payload: { 'kibana.alert.dynamic': params.dynamic_fields },
      });

      return { state: {} };
    },
    alerts: {
      context: 'observability.test.alerts.dynamic.templates',
      mappings: {
        dynamic: false,
        fieldMap: {
          ['kibana.alert.dynamic']: {
            type: 'object',
            dynamic: true,
            array: false,
            required: false,
          },
        },
        dynamicTemplates: [
          {
            strings_as_keywords: {
              path_match: 'kibana.alert.dynamic.*',
              match_mapping_type: 'string',
              mapping: {
                type: 'keyword',
                ignore_above: 1024,
              },
            },
          },
        ],
      },
      useLegacyAlerts: false,
      useEcs: false,
      shouldWrite: true,
    },
  };
  return result;
}

function getWaitingRuleType(logger: Logger) {
  const ParamsType = schema.object({
    source: schema.string(),
    alerts: schema.number(),
  });
  type ParamsType = TypeOf<typeof ParamsType>;
  interface State extends RuleTypeState {
    runCount?: number;
  }
  const id = 'test.waitingRule';

  const result: RuleType<
    ParamsType,
    never,
    State,
    {},
    {},
    'default',
    'recovered',
    { runCount: number }
  > = {
    id,
    name: 'Test: Rule that waits for a signal before finishing',
    actionGroups: [{ id: 'default', name: 'Default' }],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    doesSetRecoveryContext: true,
    validate: { params: ParamsType },
    alerts: {
      context: id.toLowerCase(),
      shouldWrite: true,
      mappings: {
        fieldMap: {
          runCount: { required: false, type: 'long' },
        },
      },
    },
    async executor(alertExecutorOptions) {
      const { services, state, params } = alertExecutorOptions;
      const { source, alerts } = params;

      const alertsClient = services.alertsClient;
      if (!alertsClient) throw new Error(`Expected alertsClient!`);

      const runCount = (state.runCount || 0) + 1;
      const es = services.scopedClusterClient.asInternalUser;

      await sendSignal(logger, es, id, source, `rule-starting-${runCount}`);
      await waitForSignal(logger, es, id, source, `rule-complete-${runCount}`);

      for (let i = 0; i < alerts; i++) {
        alertsClient.report({
          id: `alert-${i}`,
          actionGroup: 'default',
          payload: { runCount },
        });
      }

      return { state: { runCount } };
    },
  };

  return result;
}

function getSeverityRuleType() {
  const paramsSchema = schema.object({
    pattern: schema.arrayOf(
      schema.oneOf([schema.literal('low'), schema.literal('medium'), schema.literal('high')])
    ),
  });
  type ParamsType = TypeOf<typeof paramsSchema>;
  interface State extends RuleTypeState {
    patternIndex?: number;
  }
  const result: RuleType<
    ParamsType,
    never,
    State,
    {},
    {},
    'low' | 'medium' | 'high',
    'recovered',
    { patternIndex: number; instancePattern: boolean[] }
  > = {
    id: 'test.severity',
    name: 'Test: Rule type with severity',
    actionGroups: [
      { id: 'low', name: 'Low', severity: { level: 0 } },
      { id: 'medium', name: 'Medium', severity: { level: 1 } },
      { id: 'high', name: 'High', severity: { level: 2 } },
    ],
    category: 'management',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'low',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    doesSetRecoveryContext: true,
    validate: { params: paramsSchema },
    async executor(executorOptions) {
      const { services, state, params } = executorOptions;
      const pattern = params.pattern;
      if (!Array.isArray(pattern)) throw new Error('pattern is not an array');

      const alertsClient = services.alertsClient;
      if (!alertsClient) {
        throw new Error(`Expected alertsClient to be defined but it is not`);
      }

      // get the pattern index, return if past it
      const patternIndex = state.patternIndex ?? 0;
      if (patternIndex >= pattern.length) {
        return { state: { patternIndex } };
      }

      alertsClient.report({ id: '*', actionGroup: pattern[patternIndex] });

      // set recovery payload
      for (const recoveredAlert of alertsClient.getRecoveredAlerts()) {
        alertsClient.setAlertData({ id: recoveredAlert.alert.getId() });
      }

      return {
        state: {
          patternIndex: patternIndex + 1,
        },
      };
    },
    alerts: {
      context: 'test.severity',
      shouldWrite: true,
      mappings: { fieldMap: {} },
    },
  };
  return result;
}

const getInternalRuleType = () => {
  const result: RuleType<{}, never, {}, {}, {}, 'default'> = {
    id: 'test.internal-rule-type',
    name: 'Test: Internal Rule Type',
    actionGroups: [{ id: 'default', name: 'Default' }],
    validate: {
      params: schema.any(),
    },
    category: 'management',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    internallyManaged: true,
    async executor(ruleExecutorOptions) {
      const { services } = ruleExecutorOptions;

      services.alertsClient?.report({ id: '1', actionGroup: 'default' });
      services.alertsClient?.report({ id: '2', actionGroup: 'default' });

      return { state: {} };
    },
    alerts: {
      context: 'observability.test.alerts',
      mappings: {
        fieldMap: {},
      },
      useLegacyAlerts: true,
      shouldWrite: true,
    },
  };
  return result;
};

async function sendSignal(
  logger: Logger,
  es: ElasticsearchClient,
  id: string,
  source: string,
  reference: string
) {
  logger.info(`rule type ${id} sending signal ${reference}`);
  await es.index({ index: ES_TEST_INDEX_NAME, refresh: 'true', body: { source, reference } });
}

async function waitForSignal(
  logger: Logger,
  es: ElasticsearchClient,
  id: string,
  source: string,
  reference: string
) {
  let docs: unknown[] = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    docs = await getSignalDocs(es, source, reference);
    if (docs.length > 0) {
      logger.info(`rule type ${id} received signal ${reference}`);
      break;
    }

    logger.info(`rule type ${id} waiting for signal ${reference}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (docs.length === 0) {
    throw new Error(`Expected to find docs with source ${source}`);
  }
}

async function getSignalDocs(es: ElasticsearchClient, source: string, reference: string) {
  const body = {
    query: {
      bool: {
        must: [
          {
            term: {
              source,
            },
          },
          {
            term: {
              reference,
            },
          },
        ],
      },
    },
  };
  const params = {
    index: ES_TEST_INDEX_NAME,
    size: 1000,
    _source: false,
    ...body,
  };
  const result = await es.search(params, { meta: true });
  return result?.body?.hits?.hits || [];
}

export function defineRuleTypes(
  core: CoreSetup<FixtureStartDeps>,
  { alerting, ruleRegistry }: Pick<FixtureSetupDeps, 'alerting' | 'ruleRegistry'>,
  logger: Logger
) {
  const ruleDataClient = ruleRegistry.ruleDataService.initializeIndex({
    feature: 'AlertingExample',
    registrationContext: 'test.dangerouslycreatealertsinallspaces',
    dataset: Dataset.alerts,
    componentTemplateRefs: [],
    componentTemplates: [
      {
        name: 'mappings',
        mappings: mappingFromFieldMap(alertFieldMap, false),
      },
    ],
  });

  const persistenceRuleTypeWrapper = createPersistenceRuleTypeWrapper({
    ruleDataClient,
    logger,
    formatAlert: undefined,
  });

  const dangerouslyCreateAlertsInAllSpacesPersistenceRuleType = persistenceRuleTypeWrapper({
    id: 'test.persistenceDangerouslyCreateAlertsInAllSpaces',
    name: 'Test Persistence Rule Type - All Spaces',
    validate: { params: schema.any() },
    defaultActionGroupId: 'default',
    actionGroups: [{ id: 'default', name: 'Default' }],
    minimumLicenseRequired: 'basic',
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    isExportable: true,
    async executor(ruleExecutorOptions) {
      const { services } = ruleExecutorOptions;
      const { alertWithPersistence } = services;

      // generate some alerts
      const alerts = range(0, 5).map((i) => {
        const id = uuidv4();
        return {
          _id: id,
          _source: {
            original_source: {
              _id: `${id}-${i}`,
              '@timestamp': new Date().toISOString(),
            },
          },
        };
      });

      await alertWithPersistence(alerts, true, 100);

      return { state: {} };
    },
    autoRecoverAlerts: false,
    alerts: {
      context: 'test.dangerouslycreatealertsinallspaces',
      mappings: { dynamic: false, fieldMap: { ...alertFieldMap } },
      shouldWrite: false,
      isSpaceAware: false,
      dangerouslyCreateAlertsInAllSpaces: true,
    },
  });

  const dangerouslyCreateAlertsInAllSpacesRuleType: RuleType<
    {},
    {},
    {},
    {},
    {},
    'default',
    'recovered',
    { original_source: { _id: string } }
  > = {
    id: 'test.dangerouslyCreateAlertsInAllSpaces',
    name: 'Test Alerts Client Rule Type - All Spaces',
    validate: { params: schema.any() },
    defaultActionGroupId: 'default',
    actionGroups: [{ id: 'default', name: 'Default' }],
    minimumLicenseRequired: 'basic',
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    isExportable: true,
    async executor(ruleExecutorOptions) {
      const { services } = ruleExecutorOptions;
      const { alertsClient } = services;

      range(0, 5).forEach((i) => {
        alertsClient?.report({
          id: `instance-${i}`,
          actionGroup: 'default',
          payload: { original_source: { _id: `instance-${i}` } },
        });
      });

      return { state: {} };
    },
    autoRecoverAlerts: false,
    alerts: {
      context: 'test.dangerouslycreatealertsinallspaces',
      mappings: { dynamic: false, fieldMap: { ...alertFieldMap } },
      shouldWrite: true,
      isSpaceAware: false,
      dangerouslyCreateAlertsInAllSpaces: true,
    },
  };

  const noopRuleType: RuleType<{}, {}, {}, {}, {}, 'default'> = {
    id: 'test.noop',
    name: 'Test: Noop',
    actionGroups: [{ id: 'default', name: 'Default' }],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    async executor() {
      return { state: {} };
    },
    validate: {
      params: schema.any(),
    },
  };
  const artifactsRuleType: RuleType<{}, {}, {}, {}, {}, 'default'> = {
    id: 'test.artifacts',
    name: 'Test: Artifacts',
    actionGroups: [{ id: 'default', name: 'Default' }],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    async executor() {
      return { state: {} };
    },
    validate: {
      params: schema.any(),
    },
  };
  const artifactsAndActionsRuleType: RuleType<{}, {}, {}, {}, {}, 'default'> = {
    id: 'test.artifactsAndActions',
    name: 'Test: Artifacts and Actions',
    actionGroups: [{ id: 'default', name: 'Default' }],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    async executor() {
      return { state: {} };
    },
    validate: {
      params: schema.any(),
    },
  };
  const goldNoopRuleType: RuleType<{}, {}, {}, {}, {}, 'default'> = {
    id: 'test.gold.noop',
    name: 'Test: Noop',
    actionGroups: [{ id: 'default', name: 'Default' }],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'gold',
    isExportable: true,
    async executor() {
      return { state: {} };
    },
    validate: {
      params: schema.any(),
    },
  };
  const onlyContextVariablesRuleType: RuleType<{}, {}, {}, {}, {}, 'default'> = {
    id: 'test.onlyContextVariables',
    name: 'Test: Only Context Variables',
    actionGroups: [{ id: 'default', name: 'Default' }],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    actionVariables: {
      context: [{ name: 'aContextVariable', description: 'this is a context variable' }],
    },
    async executor() {
      return { state: {} };
    },
    validate: {
      params: schema.any(),
    },
  };
  const onlyStateVariablesRuleType: RuleType<{}, {}, {}, {}, {}, 'default'> = {
    id: 'test.onlyStateVariables',
    name: 'Test: Only State Variables',
    actionGroups: [{ id: 'default', name: 'Default' }],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    actionVariables: {
      state: [{ name: 'aStateVariable', description: 'this is a state variable' }],
    },
    minimumLicenseRequired: 'basic',
    isExportable: true,
    async executor() {
      return { state: {} };
    },
    validate: {
      params: schema.any(),
    },
  };
  const throwRuleType: RuleType<{}, {}, {}, {}, {}, 'default'> = {
    id: 'test.throw',
    name: 'Test: Throw',
    actionGroups: [
      {
        id: 'default',
        name: 'Default',
      },
    ],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    async executor() {
      throw new Error('this alert is intended to fail');
    },
    validate: {
      params: schema.any(),
    },
  };
  function getLongRunningRuleType() {
    const paramsSchema = schema.object({
      delay: schema.maybe(schema.number({ defaultValue: 5000 })),
    });
    type ParamsType = TypeOf<typeof paramsSchema>;

    const result: RuleType<ParamsType, {}, {}, {}, {}, 'default'> = {
      id: 'test.longRunning',
      name: 'Test: Long Running',
      actionGroups: [
        {
          id: 'default',
          name: 'Default',
        },
      ],
      category: 'kibana',
      producer: 'alertsFixture',
      solution: 'stack',
      defaultActionGroupId: 'default',
      minimumLicenseRequired: 'basic',
      isExportable: true,
      async executor(ruleExecutorOptions) {
        const { params } = ruleExecutorOptions;
        await new Promise((resolve) => setTimeout(resolve, params.delay ?? 5000));
        return { state: {} };
      },
      validate: {
        params: schema.any(),
      },
    };
    return result;
  }
  const exampleAlwaysFiringRuleType: RuleType<{}, {}, {}, {}, {}, 'small' | 'medium' | 'large'> = {
    id: 'example.always-firing',
    name: 'Always firing',
    actionGroups: [
      { id: 'small', name: 'Small t-shirt' },
      { id: 'medium', name: 'Medium t-shirt' },
      { id: 'large', name: 'Large t-shirt' },
    ],
    defaultActionGroupId: 'small',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    async executor() {
      return { state: {} };
    },
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    validate: {
      params: schema.any(),
    },
  };

  const multipleSearchesRuleType: RuleType<
    { numSearches: number; delay: string },
    {},
    {},
    {},
    {},
    'default'
  > = {
    id: 'test.multipleSearches',
    name: 'Test: MultipleSearches',
    actionGroups: [
      {
        id: 'default',
        name: 'Default',
      },
    ],
    category: 'kibana',
    producer: 'alertsFixture',
    solution: 'stack',
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    async executor(ruleExecutorOptions) {
      const { services, params } = ruleExecutorOptions;
      const numSearches = params.numSearches ?? 1;
      const delay = params.delay ?? '10s';

      const query = {
        index: ES_TEST_INDEX_NAME,
        body: {
          query: {
            bool: {
              filter: {
                match_all: {},
              },
            },
          },
          aggs: {
            delay: {
              shard_delay: {
                value: delay,
              },
            },
          },
        },
      };

      let i: number = 0;
      for (i = 0; i < numSearches; ++i) {
        await services.scopedClusterClient.asCurrentUser.search(query as any);
      }

      return { state: {} };
    },
    validate: {
      params: schema.object({ numSearches: schema.number(), delay: schema.string() }),
    },
  };

  alerting.registerType(getAlwaysFiringRuleType());
  alerting.registerType(getCumulativeFiringRuleType());
  alerting.registerType(getConsumerMetricsRuleType());
  alerting.registerType(getNeverFiringRuleType());
  alerting.registerType(getFailingRuleType());
  alerting.registerType(getValidationRuleType());
  alerting.registerType(getAuthorizationRuleType(core));
  alerting.registerType(noopRuleType);
  alerting.registerType(artifactsRuleType);
  alerting.registerType(artifactsAndActionsRuleType);
  alerting.registerType(onlyContextVariablesRuleType);
  alerting.registerType(onlyStateVariablesRuleType);
  alerting.registerType(getPatternFiringRuleType());
  alerting.registerType(throwRuleType);
  alerting.registerType(getLongRunningRuleType());
  alerting.registerType(goldNoopRuleType);
  alerting.registerType(exampleAlwaysFiringRuleType);
  alerting.registerType(multipleSearchesRuleType);
  alerting.registerType(getLongRunningPatternRuleType());
  alerting.registerType(getLongRunningPatternRuleType(false));
  alerting.registerType(getCancellableRuleType());
  alerting.registerType(getPatternSuccessOrFailureRuleType());
  alerting.registerType(getExceedsAlertLimitRuleType());
  alerting.registerType(getAlwaysFiringAlertAsDataRuleType());
  alerting.registerType(getAlwaysFiringAlertAsDataWithDynamicTemplatesRuleType());
  alerting.registerType(getPatternFiringAutoRecoverFalseRuleType());
  alerting.registerType(getPatternFiringAlertsAsDataRuleType());
  alerting.registerType(getWaitingRuleType(logger));
  alerting.registerType(getSeverityRuleType());
  alerting.registerType(getInternalRuleType());
  alerting.registerType(dangerouslyCreateAlertsInAllSpacesPersistenceRuleType);
  alerting.registerType(dangerouslyCreateAlertsInAllSpacesRuleType);
  alerting.registerType(getAsyncSearchRuleType());
}
