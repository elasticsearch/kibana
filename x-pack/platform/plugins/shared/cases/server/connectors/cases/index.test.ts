/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SubActionConnectorType } from '@kbn/actions-plugin/server/sub_action_framework/types';
import type { CasesConnectorConfig, CasesConnectorSecrets } from './types';
import { getCasesConnectorAdapter, getCasesConnectorType } from '.';
import { AlertConsumers } from '@kbn/rule-data-utils';
import {
  DEFAULT_MAX_OPEN_CASES,
  ABSOLUTE_MAX_CASES_PER_RUN,
  OBSERVABILITY_PROJECT_TYPE_ID,
  SECURITY_PROJECT_TYPE_ID,
} from '../../../common/constants';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { Logger } from '@kbn/core/server';
import { ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID } from '@kbn/elastic-assistant-common';
import { attackDiscoveryAlerts } from './attack_discovery/group_alerts.mock';
import type { AttackDiscoveryExpandedAlert } from './attack_discovery';
import { ATTACK_DISCOVERY_MAX_OPEN_CASES } from './attack_discovery';

describe('getCasesConnectorType', () => {
  const mockLogger = loggingSystemMock.create().get() as jest.Mocked<Logger>;
  let caseConnectorType: SubActionConnectorType<CasesConnectorConfig, CasesConnectorSecrets>;

  beforeEach(() => {
    caseConnectorType = getCasesConnectorType({
      getCasesClient: jest.fn(),
      getUnsecuredSavedObjectsClient: jest.fn(),
      getUiSettingsClient: jest.fn(),
      getSpaceId: jest.fn(),
      isCasesAttachmentsEnabled: false,
    });
  });

  describe('getKibanaPrivileges', () => {
    it('construct the kibana privileges correctly', () => {
      expect(
        caseConnectorType.getKibanaPrivileges?.({
          params: { subAction: 'run', subActionParams: { owner: 'my-owner' } },
        })
      ).toEqual([
        'cases:my-owner/createCase',
        'cases:my-owner/updateCase',
        'cases:my-owner/deleteCase',
        'cases:my-owner/pushCase',
        'cases:my-owner/createComment',
        'cases:my-owner/updateComment',
        'cases:my-owner/deleteComment',
        'cases:my-owner/findConfigurations',
        'cases:my-owner/reopenCase',
        'cases:my-owner/assignCase',
      ]);
    });

    it('throws if the owner is undefined', () => {
      expect(() => caseConnectorType.getKibanaPrivileges?.()).toThrowErrorMatchingInlineSnapshot(
        `"Cannot authorize cases. Owner is not defined in the subActionParams."`
      );
    });
  });

  describe('getCasesConnectorAdapter', () => {
    const alerts = {
      all: {
        data: [
          { _id: 'alert-id-1', _index: 'alert-index-1' },
          { _id: 'alert-id-2', _index: 'alert-index-2' },
        ],
        count: 2,
      },
      new: { data: [{ _id: 'alert-id-1', _index: 'alert-index-1' }], count: 1 },
      ongoing: { data: [{ _id: 'alert-id-2', _index: 'alert-index-2' }], count: 1 },
      recovered: { data: [], count: 0 },
    };

    const rule = {
      id: 'rule-id',
      name: 'my rule name',
      tags: ['my-tag'],
      consumer: 'test-consumer',
      producer: 'test-producer',
      ruleTypeId: 'test-rule-1',
    };

    const getParams = (overrides = {}) => ({
      subAction: 'run' as const,
      subActionParams: {
        groupingBy: [],
        reopenClosedCases: false,
        timeWindow: '7d',
        templateId: null,
        templateVersion: null,
        autoPushCase: null,
        maximumCasesToOpen: null,
        ...overrides,
      },
    });

    it('sets the correct connectorTypeId', () => {
      const adapter = getCasesConnectorAdapter({ logger: mockLogger });

      expect(adapter.connectorTypeId).toEqual('.cases');
    });

    describe('ruleActionParamsSchema', () => {
      it('validates getParams() correctly', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        expect(adapter.ruleActionParamsSchema.validate(getParams())).toEqual(getParams());
      });

      it('throws if missing getParams()', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        expect(() => adapter.ruleActionParamsSchema.validate({})).toThrow();
      });

      it('does not accept more than one groupingBy key', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        expect(() =>
          adapter.ruleActionParamsSchema.validate(
            getParams({ groupingBy: ['host.name', 'source.ip'] })
          )
        ).toThrow();
      });

      it('should fail with not valid time window', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        expect(() =>
          adapter.ruleActionParamsSchema.validate(getParams({ timeWindow: '10d+3d' }))
        ).toThrow();
      });

      it('accepts maximumCasesToOpen values above the default maximum', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        expect(
          adapter.ruleActionParamsSchema.validate(getParams({ maximumCasesToOpen: 21 }))
        ).toEqual(getParams({ maximumCasesToOpen: 21 }));
      });

      it('does not accept maximumCasesToOpen above ABSOLUTE_MAX_CASES_PER_RUN', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        expect(() =>
          adapter.ruleActionParamsSchema.validate(
            getParams({ maximumCasesToOpen: ABSOLUTE_MAX_CASES_PER_RUN + 1 })
          )
        ).toThrow();
      });
    });

    describe('buildActionParams', () => {
      it('builds the action getParams() correctly', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        expect(
          adapter.buildActionParams({
            // @ts-expect-error: not all fields are needed
            alerts,
            rule,
            params: getParams(),
            spaceId: 'default',
            ruleUrl: 'https://example.com',
          })
        ).toMatchInlineSnapshot(`
          Object {
            "subAction": "run",
            "subActionParams": Object {
              "alerts": Array [
                Object {
                  "_id": "alert-id-1",
                  "_index": "alert-index-1",
                },
                Object {
                  "_id": "alert-id-2",
                  "_index": "alert-index-2",
                },
              ],
              "autoPushCase": null,
              "groupedAlerts": null,
              "groupingBy": Array [],
              "internallyManagedAlerts": false,
              "maximumCasesToOpen": 5,
              "owner": "cases",
              "reopenClosedCases": false,
              "rule": Object {
                "id": "rule-id",
                "name": "my rule name",
                "ruleUrl": "https://example.com",
                "tags": Array [
                  "my-tag",
                ],
              },
              "templateId": null,
              "templateVersion": null,
              "timeWindow": "7d",
            },
          }
        `);
      });

      it('builds the action getParams() and preserves maximumCasesToOpen', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        expect(
          adapter.buildActionParams({
            // @ts-expect-error: not all fields are needed
            alerts,
            rule,
            params: getParams({ maximumCasesToOpen: 10 }),
            spaceId: 'default',
            ruleUrl: 'https://example.com',
          })
        ).toMatchInlineSnapshot(`
          Object {
            "subAction": "run",
            "subActionParams": Object {
              "alerts": Array [
                Object {
                  "_id": "alert-id-1",
                  "_index": "alert-index-1",
                },
                Object {
                  "_id": "alert-id-2",
                  "_index": "alert-index-2",
                },
              ],
              "autoPushCase": null,
              "groupedAlerts": null,
              "groupingBy": Array [],
              "internallyManagedAlerts": false,
              "maximumCasesToOpen": 10,
              "owner": "cases",
              "reopenClosedCases": false,
              "rule": Object {
                "id": "rule-id",
                "name": "my rule name",
                "ruleUrl": "https://example.com",
                "tags": Array [
                  "my-tag",
                ],
              },
              "templateId": null,
              "templateVersion": null,
              "timeWindow": "7d",
            },
          }
        `);
      });

      it('builds the action getParams() and templateId correctly', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        expect(
          adapter.buildActionParams({
            // @ts-expect-error: not all fields are needed
            alerts,
            rule,
            params: getParams({ templateId: 'template_key_1' }),
            spaceId: 'default',
            ruleUrl: 'https://example.com',
          })
        ).toMatchInlineSnapshot(`
          Object {
            "subAction": "run",
            "subActionParams": Object {
              "alerts": Array [
                Object {
                  "_id": "alert-id-1",
                  "_index": "alert-index-1",
                },
                Object {
                  "_id": "alert-id-2",
                  "_index": "alert-index-2",
                },
              ],
              "autoPushCase": null,
              "groupedAlerts": null,
              "groupingBy": Array [],
              "internallyManagedAlerts": false,
              "maximumCasesToOpen": 5,
              "owner": "cases",
              "reopenClosedCases": false,
              "rule": Object {
                "id": "rule-id",
                "name": "my rule name",
                "ruleUrl": "https://example.com",
                "tags": Array [
                  "my-tag",
                ],
              },
              "templateId": "template_key_1",
              "templateVersion": null,
              "timeWindow": "7d",
            },
          }
        `);
      });

      it('builds the action getParams() correctly without ruleUrl', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });
        expect(
          adapter.buildActionParams({
            // @ts-expect-error: not all fields are needed
            alerts,
            rule,
            params: getParams(),
            spaceId: 'default',
          })
        ).toMatchInlineSnapshot(`
          Object {
            "subAction": "run",
            "subActionParams": Object {
              "alerts": Array [
                Object {
                  "_id": "alert-id-1",
                  "_index": "alert-index-1",
                },
                Object {
                  "_id": "alert-id-2",
                  "_index": "alert-index-2",
                },
              ],
              "autoPushCase": null,
              "groupedAlerts": null,
              "groupingBy": Array [],
              "internallyManagedAlerts": false,
              "maximumCasesToOpen": 5,
              "owner": "cases",
              "reopenClosedCases": false,
              "rule": Object {
                "id": "rule-id",
                "name": "my rule name",
                "ruleUrl": null,
                "tags": Array [
                  "my-tag",
                ],
              },
              "templateId": null,
              "templateVersion": null,
              "timeWindow": "7d",
            },
          }
        `);
      });

      it('maps observability consumers to the correct owner', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        for (const consumer of [
          AlertConsumers.OBSERVABILITY,
          AlertConsumers.APM,
          AlertConsumers.INFRASTRUCTURE,
          AlertConsumers.LOGS,
          AlertConsumers.SLO,
          AlertConsumers.UPTIME,
          AlertConsumers.MONITORING,
        ]) {
          const connectorParams = adapter.buildActionParams({
            // @ts-expect-error: not all fields are needed
            alerts,
            rule: { ...rule, consumer },
            params: getParams(),
            spaceId: 'default',
          });

          expect(connectorParams.subActionParams.owner).toBe('observability');
        }
      });

      it('maps security solution consumers to the correct owner', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        for (const consumer of [AlertConsumers.SIEM]) {
          const connectorParams = adapter.buildActionParams({
            // @ts-expect-error: not all fields are needed
            alerts,
            rule: { ...rule, consumer },
            params: getParams(),
            spaceId: 'default',
          });

          expect(connectorParams.subActionParams.owner).toBe('securitySolution');
        }
      });

      it('maps stack consumers to the correct owner', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        for (const consumer of [AlertConsumers.ML, AlertConsumers.STACK_ALERTS]) {
          const connectorParams = adapter.buildActionParams({
            // @ts-expect-error: not all fields are needed
            alerts,
            rule: { ...rule, consumer },
            params: getParams(),
            spaceId: 'default',
          });

          expect(connectorParams.subActionParams.owner).toBe('cases');
        }
      });

      it('fallback to the cases owner if the consumer is not in the mapping', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        const connectorParams = adapter.buildActionParams({
          // @ts-expect-error: not all fields are needed
          alerts,
          rule: { ...rule, consumer: 'not-valid' },
          params: getParams(),
          spaceId: 'default',
        });

        expect(connectorParams.subActionParams.owner).toBe('cases');
      });

      it('correctly fallsback to security owner if the project is serverless security', () => {
        const adapter = getCasesConnectorAdapter({
          serverlessProjectType: SECURITY_PROJECT_TYPE_ID,
          logger: mockLogger,
        });

        for (const consumer of [AlertConsumers.ML, AlertConsumers.STACK_ALERTS]) {
          const connectorParams = adapter.buildActionParams({
            // @ts-expect-error: not all fields are needed
            alerts,
            rule: { ...rule, consumer },
            params: getParams(),
            spaceId: 'default',
          });

          expect(connectorParams.subActionParams.owner).toBe('securitySolution');
        }
      });

      it('correctly returns `internallyManagedAlerts` as `false` if rule type is not attack discovery', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        for (const consumer of [AlertConsumers.SIEM]) {
          const connectorParams = adapter.buildActionParams({
            // @ts-expect-error: not all fields are needed
            alerts,
            rule: { ...rule, consumer },
            params: getParams(),
            spaceId: 'default',
          });

          expect(connectorParams.subActionParams.internallyManagedAlerts).toBe(false);
        }
      });

      it('correctly returns `groupedAlerts` as `null` if rule type is not attack discovery', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        for (const consumer of [AlertConsumers.SIEM]) {
          const connectorParams = adapter.buildActionParams({
            // @ts-expect-error: not all fields are needed
            alerts,
            rule: { ...rule, consumer },
            params: getParams(),
            spaceId: 'default',
          });

          expect(connectorParams.subActionParams.groupedAlerts).toBeNull();
        }
      });

      it('correctly returns `groupedAlerts` as `null` in case there are no alerts', () => {
        const noAlerts = {
          all: { data: [], count: 0 },
          new: { data: [], count: 0 },
          ongoing: { data: [], count: 0 },
          recovered: { data: [], count: 0 },
        };
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        for (const consumer of [AlertConsumers.SIEM]) {
          const connectorParams = adapter.buildActionParams({
            alerts: noAlerts,
            rule: { ...rule, consumer },
            params: getParams(),
            spaceId: 'default',
          });

          expect(connectorParams.subActionParams.groupedAlerts).toBeNull();
        }
      });
    });

    describe('Attack discovery rule type', () => {
      const attackDiscoveryRule = {
        id: 'rule-id',
        name: 'my rule name',
        tags: ['my-tag'],
        consumer: AlertConsumers.SIEM,
        producer: 'test-producer',
        ruleTypeId: ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID,
      };
      const alertsMock = {
        all: { data: attackDiscoveryAlerts, count: attackDiscoveryAlerts.length },
        new: { data: attackDiscoveryAlerts, count: attackDiscoveryAlerts.length },
        ongoing: { data: [], count: 0 },
        recovered: { data: [], count: 0 },
      };

      it('returns `internallyManagedAlerts` set to `true`', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        const connectorParams = adapter.buildActionParams({
          // @ts-expect-error: not all fields are needed
          alerts: alertsMock,
          rule: attackDiscoveryRule,
          params: getParams(),
          spaceId: 'default',
        });

        expect(connectorParams.subActionParams.internallyManagedAlerts).toBe(true);
      });

      it('returns `maximumCasesToOpen` set to `ATTACK_DISCOVERY_MAX_OPEN_CASES`', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        const connectorParams = adapter.buildActionParams({
          // @ts-expect-error: not all fields are needed
          alerts: alertsMock,
          rule: attackDiscoveryRule,
          params: getParams(),
          spaceId: 'default',
        });

        expect(connectorParams.subActionParams.maximumCasesToOpen).toBe(
          ATTACK_DISCOVERY_MAX_OPEN_CASES
        );
      });

      it('correctly groups attack discovery alerts', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        const connectorParams = adapter.buildActionParams({
          // @ts-expect-error: not all fields are needed
          alerts: alertsMock,
          rule: attackDiscoveryRule,
          params: getParams(),
          spaceId: 'default',
        });

        expect(connectorParams.subActionParams.groupedAlerts).toEqual([
          {
            alerts: [
              {
                _id: '5dd43c0aa62e75fa7613ae9345384fd402fc9b074a82c89c01c3e8075a4b1e5d',
                _index: '.alerts-security.alerts-default',
              },
              {
                _id: '83047a3ca7e9d852aa48f46fb6329884ed25d5155642c551629402228657ef37',
                _index: '.alerts-security.alerts-default',
              },
              {
                _id: '854da5fb177c06630de28e87bb9c0baeee3143e1fc37f8755d83075af59a22e0',
                _index: '.alerts-security.alerts-default',
              },
            ],
            comments: expect.anything(),
            grouping: { attack_discovery: '012479c7-bcb6-4945-a6cf-65e40931a156' },
            title: 'Coordinated credential access across hosts',
          },
          {
            alerts: [
              {
                _id: '2a15777907cd95ec65a97a505c3d522c0342ae4d3bf2aee610e5ab72bdb5825a',
                _index: '.alerts-security.alerts-default',
              },
              {
                _id: '4a61c1e09acad151735ad557cf45f8c08bea2ac668e346f86af92de35c79a505',
                _index: '.alerts-security.alerts-default',
              },
            ],
            comments: expect.anything(),
            grouping: { attack_discovery: 'ee0f98c7-6a0d-4a87-ad15-4128daf53c84' },
            title: 'Coordinated multi-host malware campaign',
          },
        ]);
        expect(connectorParams.subActionParams.internallyManagedAlerts).toBe(true);
      });

      it('correctly returns `groupedAlerts` as empty array in case there are no alerts', () => {
        const noAlerts = {
          all: { data: [], count: 0 },
          new: { data: [], count: 0 },
          ongoing: { data: [], count: 0 },
          recovered: { data: [], count: 0 },
        };
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        const connectorParams = adapter.buildActionParams({
          alerts: noAlerts,
          rule: attackDiscoveryRule,
          params: getParams(),
          spaceId: 'default',
        });

        expect(connectorParams.subActionParams.groupedAlerts).toEqual([]);
        expect(connectorParams.subActionParams.internallyManagedAlerts).toBe(true);
      });

      it('keeps attack discovery grouping when alerts count is above the default ceiling', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        const manyAttackDiscoveryAlerts = new Array<AttackDiscoveryExpandedAlert>(
          ATTACK_DISCOVERY_MAX_OPEN_CASES + 1
        ).fill(attackDiscoveryAlerts[0]);
        const manyAlerts = {
          all: { data: [...manyAttackDiscoveryAlerts], count: manyAttackDiscoveryAlerts.length },
          new: { data: [...manyAttackDiscoveryAlerts], count: manyAttackDiscoveryAlerts.length },
          ongoing: { data: [], count: 0 },
          recovered: { data: [], count: 0 },
        };

        const connectorParams = adapter.buildActionParams({
          // @ts-expect-error: not all fields are needed
          alerts: manyAlerts,
          rule: attackDiscoveryRule,
          params: getParams(),
          spaceId: 'default',
        });

        expect(connectorParams.subActionParams.groupedAlerts).toHaveLength(
          ATTACK_DISCOVERY_MAX_OPEN_CASES + 1
        );
        expect(connectorParams.subActionParams.internallyManagedAlerts).toBe(true);
        expect(connectorParams.subActionParams.maximumCasesToOpen).toBe(
          ATTACK_DISCOVERY_MAX_OPEN_CASES
        );
        expect(mockLogger.error).not.toBeCalled();
      });

      it('correctly fallsback to general flow if alerts schema does not pass validation', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        const connectorParams = adapter.buildActionParams({
          // @ts-expect-error: not all fields are needed
          alerts,
          rule: attackDiscoveryRule,
          params: getParams(),
          spaceId: 'default',
        });

        expect(connectorParams.subActionParams.groupedAlerts).toBeNull();
        expect(connectorParams.subActionParams.internallyManagedAlerts).toBe(false);
        expect(connectorParams.subActionParams.maximumCasesToOpen).toBe(DEFAULT_MAX_OPEN_CASES);
        expect(mockLogger.error).toBeCalledWith(
          'Could not setup grouped Attack Discovery alerts, because of error: Error: [0.kibana.alert.attack_discovery.alert_ids]: expected value of type [array] but got [undefined]'
        );
      });
    });

    describe('getKibanaPrivileges', () => {
      it('constructs the correct privileges from the consumer', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        expect(
          adapter.getKibanaPrivileges?.({
            consumer: AlertConsumers.SIEM,
            producer: AlertConsumers.SIEM,
          })
        ).toEqual([
          'cases:securitySolution/createCase',
          'cases:securitySolution/updateCase',
          'cases:securitySolution/deleteCase',
          'cases:securitySolution/pushCase',
          'cases:securitySolution/createComment',
          'cases:securitySolution/updateComment',
          'cases:securitySolution/deleteComment',
          'cases:securitySolution/findConfigurations',
          'cases:securitySolution/reopenCase',
          'cases:securitySolution/assignCase',
        ]);
      });

      it('constructs the correct privileges from the producer if the consumer is not found', () => {
        const adapter = getCasesConnectorAdapter({ logger: mockLogger });

        expect(
          adapter.getKibanaPrivileges?.({
            consumer: 'not-exist',
            producer: AlertConsumers.LOGS,
          })
        ).toEqual([
          'cases:observability/createCase',
          'cases:observability/updateCase',
          'cases:observability/deleteCase',
          'cases:observability/pushCase',
          'cases:observability/createComment',
          'cases:observability/updateComment',
          'cases:observability/deleteComment',
          'cases:observability/findConfigurations',
          'cases:observability/reopenCase',
          'cases:observability/assignCase',
        ]);
      });

      it('correctly overrides the consumer and producer if the project is serverless security', () => {
        const adapter = getCasesConnectorAdapter({
          serverlessProjectType: SECURITY_PROJECT_TYPE_ID,
          logger: mockLogger,
        });

        expect(
          adapter.getKibanaPrivileges?.({
            consumer: 'alerts',
            producer: AlertConsumers.LOGS,
          })
        ).toEqual([
          'cases:securitySolution/createCase',
          'cases:securitySolution/updateCase',
          'cases:securitySolution/deleteCase',
          'cases:securitySolution/pushCase',
          'cases:securitySolution/createComment',
          'cases:securitySolution/updateComment',
          'cases:securitySolution/deleteComment',
          'cases:securitySolution/findConfigurations',
          'cases:securitySolution/reopenCase',
          'cases:securitySolution/assignCase',
        ]);
      });

      it('correctly overrides the consumer and producer if the project is serverless observability', () => {
        const adapter = getCasesConnectorAdapter({
          serverlessProjectType: OBSERVABILITY_PROJECT_TYPE_ID,
          logger: mockLogger,
        });

        expect(
          adapter.getKibanaPrivileges?.({
            consumer: 'alerts',
            producer: AlertConsumers.SIEM,
          })
        ).toEqual([
          'cases:observability/createCase',
          'cases:observability/updateCase',
          'cases:observability/deleteCase',
          'cases:observability/pushCase',
          'cases:observability/createComment',
          'cases:observability/updateComment',
          'cases:observability/deleteComment',
          'cases:observability/findConfigurations',
          'cases:observability/reopenCase',
          'cases:observability/assignCase',
        ]);
      });
    });
  });
});
