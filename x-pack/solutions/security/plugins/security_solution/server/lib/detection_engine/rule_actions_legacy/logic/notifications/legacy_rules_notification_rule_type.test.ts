/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { asSpaceId } from '@kbn/core-spaces-common';
import type { RuleExecutorServicesMock } from '@kbn/alerting-plugin/server/mocks';
import { alertsMock } from '@kbn/alerting-plugin/server/mocks';
import { DEFAULT_FLAPPING_SETTINGS } from '@kbn/alerting-plugin/common';

import { getRuleMock } from '../../../routes/__mocks__/request_responses';
// eslint-disable-next-line no-restricted-imports
import { legacyRulesNotificationRuleType } from './legacy_rules_notification_rule_type';
import { buildSignalsSearchQuery } from './build_signals_query';
// eslint-disable-next-line no-restricted-imports
import type { LegacyNotificationExecutorOptions } from './legacy_types';
import {
  sampleDocSearchResultsNoSortIdNoVersion,
  sampleDocSearchResultsWithSortId,
  sampleEmptyDocSearchResults,
} from '../../../rule_types/__mocks__/es_results';
import { DEFAULT_RULE_NOTIFICATION_QUERY_SIZE } from '../../../../../../common/constants';
import { getQueryRuleParams } from '../../../rule_schema/mocks';

jest.mock('./build_signals_query');

const reported = {
  actionGroup: 'default',
  context: {
    alerts: [
      {
        '@timestamp': expect.any(String),
        destination: {
          ip: '127.0.0.1',
        },
        someKey: 'someValue',
        source: {
          ip: '127.0.0.1',
        },
      },
    ],
    results_link:
      '/app/security/rules/id/rule-id?timerange=(global:(linkTo:!(timeline),timerange:(from:1576255233400,kind:absolute,to:1576341633400)),timeline:(linkTo:!(global),timerange:(from:1576255233400,kind:absolute,to:1576341633400)))',
    rule: {
      alert_suppression: undefined,
      author: ['Elastic'],
      building_block_type: 'default',
      data_view_id: undefined,
      description: 'Detecting root and admin users',
      exceptions_list: [
        {
          id: 'some_uuid',
          list_id: 'list_id_single',
          namespace_type: 'single',
          type: 'detection',
        },
        {
          id: 'endpoint_list',
          list_id: 'endpoint_list',
          namespace_type: 'agnostic',
          type: 'endpoint',
        },
      ],
      false_positives: [],
      filters: [
        {
          query: {
            match_phrase: {
              'host.name': 'some-host',
            },
          },
        },
      ],
      from: 'now-6m',
      id: 'rule-id',
      immutable: false,
      rule_source: {
        type: 'internal',
      },
      index: ['auditbeat-*', 'filebeat-*', 'packetbeat-*', 'winlogbeat-*'],
      investigation_fields: undefined,
      language: 'kuery',
      license: 'Elastic License',
      max_signals: 10000,
      name: 'Detect Root/Admin Users',
      namespace: undefined,
      note: '# Investigative notes',
      output_index: '.siem-signals',
      query: 'user.name: root or user.name: admin',
      references: ['http://example.com', 'https://example.com'],
      related_integrations: [],
      required_fields: [],
      response_actions: undefined,
      risk_score: 50,
      risk_score_mapping: [],
      rule_id: 'rule-1',
      rule_name_override: undefined,
      saved_id: undefined,
      setup: '',
      severity: 'high',
      severity_mapping: [],
      threat: [
        {
          framework: 'MITRE ATT&CK',
          tactic: {
            id: 'TA0000',
            name: 'test tactic',
            reference: 'https://attack.mitre.org/tactics/TA0000/',
          },
          technique: [
            {
              id: 'T0000',
              name: 'test technique',
              reference: 'https://attack.mitre.org/techniques/T0000/',
              subtechnique: [
                {
                  id: 'T0000.000',
                  name: 'test subtechnique',
                  reference: 'https://attack.mitre.org/techniques/T0000/000/',
                },
              ],
            },
          ],
        },
      ],
      timeline_id: 'some-timeline-id',
      timeline_title: 'some-timeline-title',
      timestamp_override: undefined,
      timestamp_override_fallback_disabled: undefined,
      to: 'now',
      type: 'query',
      version: 1,
    },
  },
  id: '1111',
  state: {
    signals_count: 1,
  },
};

/**
 * @deprecated Once we are confident all rules relying on side-car actions SO's have been migrated to SO references we should remove this function
 */
describe('legacyRules_notification_rule_type', () => {
  let payload: LegacyNotificationExecutorOptions;
  let rule: ReturnType<typeof legacyRulesNotificationRuleType>;
  let logger: ReturnType<typeof loggingSystemMock.createLogger>;
  let alertServices: RuleExecutorServicesMock;

  beforeEach(() => {
    alertServices = alertsMock.createRuleExecutorServices();
    logger = loggingSystemMock.createLogger();

    payload = {
      executionId: 'b33f65d7-b33f-4aae-8d20-c93613dec9f9',
      services: alertServices,
      params: { ruleAlertId: '2222' },
      state: {},
      spaceId: asSpaceId('default'),
      startedAt: new Date('2019-12-14T16:40:33.400Z'),
      startedAtOverridden: false,
      previousStartedAt: new Date('2019-12-13T16:40:33.400Z'),
      rule: {
        id: '1111',
        name: 'name',
        tags: [],
        consumer: 'foo',
        producer: 'foo',
        revision: 0,
        ruleTypeId: 'ruleType',
        ruleTypeName: 'Name of rule',
        enabled: true,
        schedule: {
          interval: '1h',
        },
        actions: [],
        createdBy: 'elastic',
        updatedBy: 'elastic',
        createdAt: new Date('2019-12-14T16:40:33.400Z'),
        updatedAt: new Date('2019-12-14T16:40:33.400Z'),
        throttle: null,
        notifyWhen: null,
        muteAll: false,
        snoozeSchedule: [],
      },
      logger,
      flappingSettings: DEFAULT_FLAPPING_SETTINGS,
      getTimeRange: () => {
        const date = new Date('2019-12-14T16:40:33.400Z').toISOString();
        return { dateStart: date, dateEnd: date };
      },
      isServerless: false,
    };

    rule = legacyRulesNotificationRuleType({
      logger,
    });
  });

  describe('executor', () => {
    it('throws an error if rule alert was not found', async () => {
      alertServices.savedObjectsClient.get.mockResolvedValue({
        id: 'id',
        attributes: {},
        type: 'type',
        references: [],
      });
      await rule.executor(payload);
      expect(logger.error).toHaveBeenCalledWith(
        `Security Solution notification (Legacy) saved object for alert ${payload.params.ruleAlertId} was not found with id: \"1111\". space id: \"default\" This indicates a dangling (Legacy) notification alert. You should delete this rule through \"Kibana UI -> Stack Management -> Rules and Connectors\" to remove this error message.`
      );
    });

    it('should call buildSignalsSearchQuery with proper params', async () => {
      const ruleAlert = getRuleMock(getQueryRuleParams());
      alertServices.savedObjectsClient.get.mockResolvedValue({
        id: 'id',
        type: 'type',
        references: [],
        attributes: ruleAlert,
      });
      alertServices.scopedClusterClient.asCurrentUser.search.mockResponse(
        sampleDocSearchResultsWithSortId()
      );

      await rule.executor(payload);

      expect(buildSignalsSearchQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '1576255233400',
          index: '.siem-signals',
          ruleId: 'rule-1',
          to: '1576341633400',
          size: DEFAULT_RULE_NOTIFICATION_QUERY_SIZE,
        })
      );
    });

    it('should resolve results_link when meta is undefined to use "/app/security"', async () => {
      const ruleAlert = getRuleMock(getQueryRuleParams());
      delete ruleAlert.params.meta;
      alertServices.savedObjectsClient.get.mockResolvedValue({
        id: 'rule-id',
        type: 'type',
        references: [],
        attributes: ruleAlert,
      });
      alertServices.scopedClusterClient.asCurrentUser.search.mockResponse(
        sampleDocSearchResultsWithSortId()
      );

      await rule.executor(payload);
      expect(alertServices.alertsClient.report).toHaveBeenCalledWith(reported);
    });

    it('should resolve results_link when meta is an empty object to use "/app/security"', async () => {
      const ruleAlert = getRuleMock(getQueryRuleParams());
      ruleAlert.params.meta = {};
      alertServices.savedObjectsClient.get.mockResolvedValue({
        id: 'rule-id',
        type: 'type',
        references: [],
        attributes: ruleAlert,
      });
      alertServices.scopedClusterClient.asCurrentUser.search.mockResponse(
        sampleDocSearchResultsWithSortId()
      );
      await rule.executor(payload);
      expect(alertServices.alertsClient.report).toHaveBeenCalledWith({
        ...reported,
        context: { ...reported.context, rule: { ...reported.context.rule, meta: {} } },
      });
    });

    it('should resolve results_link to custom kibana link when given one', async () => {
      const ruleAlert = getRuleMock(getQueryRuleParams());
      ruleAlert.params.meta = {
        kibana_siem_app_url: 'http://localhost',
      };
      alertServices.savedObjectsClient.get.mockResolvedValue({
        id: 'rule-id',
        type: 'type',
        references: [],
        attributes: ruleAlert,
      });
      alertServices.scopedClusterClient.asCurrentUser.search.mockResponse(
        sampleDocSearchResultsWithSortId()
      );
      await rule.executor(payload);
      expect(alertServices.alertsClient.report).toHaveBeenCalledWith({
        ...reported,
        context: {
          ...reported.context,
          results_link:
            'http://localhost/rules/id/rule-id?timerange=(global:(linkTo:!(timeline),timerange:(from:1576255233400,kind:absolute,to:1576341633400)),timeline:(linkTo:!(global),timerange:(from:1576255233400,kind:absolute,to:1576341633400)))',
          rule: {
            ...reported.context.rule,
            meta: {
              kibana_siem_app_url: 'http://localhost',
            },
          },
        },
      });
    });

    it('should not call alertsClient.report if signalsCount was 0', async () => {
      const ruleAlert = getRuleMock(getQueryRuleParams());
      alertServices.savedObjectsClient.get.mockResolvedValue({
        id: 'id',
        type: 'type',
        references: [],
        attributes: ruleAlert,
      });
      alertServices.scopedClusterClient.asCurrentUser.search.mockResponse(
        sampleEmptyDocSearchResults()
      );

      await rule.executor(payload);

      expect(alertServices.alertsClient.report).not.toHaveBeenCalled();
    });

    it('should call scheduleActions if signalsCount was greater than 0', async () => {
      const ruleAlert = getRuleMock(getQueryRuleParams());
      alertServices.savedObjectsClient.get.mockResolvedValue({
        id: 'id',
        type: 'type',
        references: [],
        attributes: ruleAlert,
      });
      alertServices.scopedClusterClient.asCurrentUser.search.mockResponse(
        sampleDocSearchResultsNoSortIdNoVersion()
      );

      await rule.executor(payload);

      expect(alertServices.alertsClient.report).toHaveBeenCalledWith({
        ...reported,
        context: {
          ...reported.context,
          alerts: [
            {
              '@timestamp': expect.any(String),
              someKey: 'someValue',
            },
          ],
          results_link:
            '/app/security/rules/id/id?timerange=(global:(linkTo:!(timeline),timerange:(from:1576255233400,kind:absolute,to:1576341633400)),timeline:(linkTo:!(global),timerange:(from:1576255233400,kind:absolute,to:1576341633400)))',
          rule: {
            ...reported.context.rule,
            id: 'id',
            meta: {
              someMeta: 'someField',
            },
          },
        },
        state: {
          signals_count: 100,
        },
      });
    });
  });
});
