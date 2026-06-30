/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type SuperTest from 'supertest';
import { createHash } from 'node:crypto';
import { stableStringify } from '@kbn/std';
import type {
  CasesConnectorRunParams,
  OracleRecordAttributes,
} from '@kbn/cases-plugin/server/connectors/cases/types';
import type { CasePostRequest } from '@kbn/cases-plugin/common';
import { AttachmentType } from '@kbn/cases-plugin/common';
import type { AlertAttachment, Attachments, Case } from '@kbn/cases-plugin/common/types/domain';
import {
  CaseStatuses,
  CaseSeverity,
  ConnectorTypes,
  CustomFieldTypes,
} from '@kbn/cases-plugin/common/types/domain';
import type { KbnClient } from '@kbn/test';
import type { CasePersistedAttributes } from '@kbn/cases-plugin/server/common/types/case';
import {
  SEVERITY_EXTERNAL_TO_ESMODEL,
  STATUS_EXTERNAL_TO_ESMODEL,
} from '@kbn/cases-plugin/server/common/constants';
import type { Client } from '@elastic/elasticsearch';
import { ALERTING_CASES_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import {
  CASE_RULES_SAVED_OBJECT,
  MAX_OPEN_CASES_DEFAULT_MAXIMUM,
  MAX_OPEN_CASES_ADVANCED_SETTING,
} from '@kbn/cases-plugin/common/constants';
import type { User } from '../../../../../common/lib/authentication/types';
import {
  globalRead,
  noKibanaPrivileges,
  onlyActions,
} from '../../../../../common/lib/authentication/users';
import {
  deleteAllCaseItems,
  executeSystemConnector,
  findCases,
  getAllComments,
  updateCase,
  getCase,
  getConfigurationRequest,
  createConfiguration,
  createComment,
  elasticUserProfileId,
} from '../../../../../common/lib/api';
import { getPostCaseRequest, postCommentAlertReq } from '../../../../../common/lib/mock';
import type { FtrProviderContext } from '../../../../../common/ftr_provider_context';
import { roles as api_int_roles } from '../../../../../common/roles';
import {
  casesAllUser,
  obsCasesAllUser,
  obsCasesReadUser,
  obsSecCasesAllUser,
  obsSecCasesReadUser,
  secAllCasesReadUser,
  secAllSpace1User,
  secAllUser,
  users as api_int_users,
} from '../../../../../common/users';
import { createUsersAndRoles, deleteUsersAndRoles } from '../../../../../common/lib/authentication';

export default ({ getService }: FtrProviderContext): void => {
  const es = getService('es');
  const supertest = getService('supertest');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const kibanaServer = getService('kibanaServer');

  describe('Case connector', () => {
    const connectorId = 'system-connector-.cases';

    afterEach(async () => {
      await deleteAllCaseItems(es);
      await clearOracleRecords(es, kibanaServer);
      await kibanaServer.uiSettings.update({
        [MAX_OPEN_CASES_ADVANCED_SETTING]: MAX_OPEN_CASES_DEFAULT_MAXIMUM,
      });
    });

    describe('validation', () => {
      it('returns 400 if the alerts do not contain _id and _index', async () => {
        const res = await executeSystemConnector({
          supertest,
          connectorId,
          // @ts-expect-error: need to test schema validation
          req: getRequest({ alerts: [{ foo: 'bar' }] }),
        });

        expect(res.status).to.be('error');
        expect(res.serviceMessage).to.match(
          /^Request validation failed \([\s\S]*Alert ID and index must be defined[\s\S]*→ at alerts\[0\][\s\S]*\)$/
        );
      });

      it('returns 400 when groupingBy has more than one value', async () => {
        const res = await executeSystemConnector({
          supertest,
          connectorId,
          req: getRequest({ groupingBy: ['host.name', 'source.ip'] }),
        });

        expect(res.status).to.be('error');
        expect(res.serviceMessage).to.match(
          /^Request validation failed \([\s\S]*(expected array to have <=1 items|Array must contain at most 1 element\(s\))[\s\S]*→ at groupingBy[\s\S]*\)$/
        );
      });

      it('returns 400 when timeWindow is invalid', async () => {
        const res = await executeSystemConnector({
          supertest,
          connectorId,
          req: getRequest({ timeWindow: 'not-valid' }),
        });

        expect(res.status).to.be('error');
        expect(res.serviceMessage).to.match(
          /^Request validation failed \([\s\S]*Not a valid time window[\s\S]*→ at timeWindow[\s\S]*\)$/
        );
      });

      it('returns 400 for valid date math but not valid time window', async () => {
        const res = await executeSystemConnector({
          supertest,
          connectorId,
          req: getRequest({ timeWindow: '10d+3d' }),
        });

        expect(res.status).to.be('error');
        expect(res.serviceMessage).to.match(
          /^Request validation failed \([\s\S]*Not a valid time window[\s\S]*→ at timeWindow[\s\S]*\)$/
        );
      });

      it('returns 400 for unsupported time units', async () => {
        const res1 = await executeSystemConnector({
          supertest,
          connectorId,
          req: getRequest({ timeWindow: `5s` }),
        });

        expect(res1.status).to.be('error');
        expect(res1.serviceMessage).to.match(
          /^Request validation failed \([\s\S]*Not a valid time window[\s\S]*→ at timeWindow[\s\S]*\)$/
        );

        const res2 = await executeSystemConnector({
          supertest,
          connectorId,
          req: getRequest({ timeWindow: `5H` }),
        });

        expect(res2.status).to.be('error');
        expect(res2.serviceMessage).to.contain('Request validation failed');
        expect(res2.serviceMessage).to.contain('Not a valid time window');
        expect(res2.serviceMessage).to.contain('→ at timeWindow');
      });

      it('returns 400 for timeWindow < 5m ', async () => {
        const res = await executeSystemConnector({
          supertest,
          connectorId,
          req: getRequest({ timeWindow: '4m' }),
        });
        expect(res.status).to.be('error');
        expect(res.serviceMessage).to.contain('Request validation failed');
        expect(res.serviceMessage).to.contain('Time window should be at least 5 minutes');
        expect(res.serviceMessage).to.contain('→ at timeWindow');
      });

      it('returns 400 when maximumCasesToOpen exceeds the configured maximum', async () => {
        await kibanaServer.uiSettings.update({
          [MAX_OPEN_CASES_ADVANCED_SETTING]: 30,
        });

        const res = await executeSystemConnector({
          supertest,
          connectorId,
          req: getRequest({ maximumCasesToOpen: 31 }),
        });

        expect(res.status).to.be('error');
        expect(res.serviceMessage).to.be('Maximum cases to open must be between 1 and 30.');
      });

      it('returns 400 when maximumCasesToOpen < 1', async () => {
        const res = await executeSystemConnector({
          supertest,
          connectorId,
          req: getRequest({ maximumCasesToOpen: 0 }),
        });

        expect(res.status).to.be('error');
        expect(res.serviceMessage).to.contain('Request validation failed');
        expect(res.serviceMessage).to.match(
          /(Too small: expected number to be >=1|Number must be greater than or equal to 1)/
        );
        expect(res.serviceMessage).to.contain('→ at maximumCasesToOpen');
      });
    });

    describe('execution', () => {
      describe('Without grouping', () => {
        const req = getRequest();

        it('should create an oracle record correctly', async () => {
          await executeConnectorAndVerifyCorrectness({
            supertest,
            connectorId,
            req,
          });

          const oracleRecord = await getOracleRecord({
            kibanaServer,
            oracleId: generateOracleId({ ruleId: req.params.subActionParams.rule.id }),
          });

          expect(oracleRecord.counter).to.be(1);
          expect(oracleRecord.rules[0]).to.eql({ id: req.params.subActionParams.rule.id });
        });

        it('should increase the oracle counter when the case is closed', async () => {
          const reqClosedCase = getRequest({ reopenClosedCases: false });

          const theCase = await createCaseWithId({
            kibanaServer,
            caseId: generateCaseId({ ruleId: reqClosedCase.params.subActionParams.rule.id }),
          });

          const closedCase = await updateCase({
            supertest,
            params: {
              cases: [
                { id: theCase.id, version: theCase.version ?? '', status: CaseStatuses.closed },
              ],
            },
          });

          expect(closedCase[0].status).to.be('closed');

          await executeConnectorAndVerifyCorrectness({
            supertest,
            connectorId,
            req: reqClosedCase,
          });

          const oracleRecord = await getOracleRecord({
            kibanaServer,
            oracleId: generateOracleId({ ruleId: req.params.subActionParams.rule.id }),
          });

          expect(oracleRecord.counter).to.be(2);
        });

        it('should increase the counter when the time window has elapsed', async () => {
          const reqTimeWindow = getRequest({ timeWindow: '7d' });
          const oracleId = generateOracleId({ ruleId: req.params.subActionParams.rule.id });

          await createOracleRecord({
            es,
            oracleId,
            attributes: { date: '2024-02-10T11:00:00.000Z' },
          });

          await executeConnectorAndVerifyCorrectness({
            supertest,
            connectorId,
            req: reqTimeWindow,
          });

          const oracleRecord = await getOracleRecord({
            kibanaServer,
            oracleId,
          });

          expect(oracleRecord.counter).to.be(2);
        });

        it('should not create another oracle record if it exists', async () => {
          const oracleId = generateOracleId({ ruleId: req.params.subActionParams.rule.id });

          await executeConnectorAndVerifyCorrectness({
            supertest,
            connectorId,
            req,
          });

          await executeConnectorAndVerifyCorrectness({
            supertest,
            connectorId,
            req,
          });

          const records = await getAllOracleRecords({
            kibanaServer,
          });

          expect(records.total).to.be(1);
          expect(records.records[0].id).to.eql(oracleId);

          return true;
        });

        it('should create a case correctly', async () => {
          await executeConnectorAndVerifyCorrectness({ supertest, connectorId, req });

          const cases = await findCases({ supertest });
          expect(cases.total).to.be(1);
        });

        it('should create a case with the correct ID', async () => {
          await executeConnectorAndVerifyCorrectness({ supertest, connectorId, req });

          const cases = await findCases({ supertest });
          expect(cases.total).to.be(1);

          const theCase = cases.cases[0];

          expect(theCase.id).to.be(generateCaseId({ ruleId: req.params.subActionParams.rule.id }));
        });

        it('should create a case with the correct attributes', async () => {
          await executeConnectorAndVerifyCorrectness({ supertest, connectorId, req });

          const cases = await findCases({ supertest });
          expect(cases.total).to.be(1);

          const theCase = removeServerGeneratedData(cases.cases[0]);

          expect(theCase).to.eql({
            assignees: [],
            category: null,
            closed_at: null,
            closed_by: null,
            comments: [],
            connector: {
              fields: null,
              id: 'none',
              name: 'none',
              type: '.none',
            },
            created_by: expectedUser,
            customFields: [],
            description:
              "This case was created by the rule ['Test rule'](https://example.com/rules/rule-test-id).",
            duration: null,
            external_service: null,
            id: theCase.id,
            owner: 'securitySolutionFixture',
            settings: {
              syncAlerts: false,
              extractObservables: false,
            },
            severity: 'low',
            status: 'open',
            tags: ['auto-generated', 'rule:rule-test-id', 'rule', 'test'],
            title: 'Test rule (Auto-created)',
            totalAlerts: 5,
            totalComment: 0,
            totalEvents: 0,
            updated_by: expectedUser,
            observables: [],
            total_observables: 0,
          });
        });

        it('should create a case with template', async () => {
          const customFields = [
            {
              key: 'first_custom_field_key',
              label: 'text 1',
              type: CustomFieldTypes.TEXT,
              required: true,
            },
          ];

          const connector = {
            id: 'jira-1',
            name: 'Jira',
            type: ConnectorTypes.jira,
            fields: { issueType: 'Task', priority: 'Low', parent: null },
          };

          const templates = [
            {
              key: 'test_template',
              name: 'Test template',
              description: 'This is a test template',
              tags: ['foo', 'bar'],
              caseFields: {
                title: 'Case with sample template',
                description: 'case desc',
                severity: CaseSeverity.HIGH,
                category: 'my category',
                tags: ['sample'],
                assignees: [{ uid: 'u_J41Oh6L9ki-Vo2tOogS8WRTENzhHurGtRc87NgEAlkc_0' }],
                customFields: [
                  {
                    key: 'first_custom_field_key',
                    type: CustomFieldTypes.TEXT,
                    value: 'this is a text field value',
                  },
                ],
                connector,
              },
            },
          ];

          const newReq = getRequest({ templateId: 'test_template' });

          await createConfiguration(
            supertest,
            getConfigurationRequest({
              overrides: { templates, customFields, connector },
            })
          );

          await executeConnectorAndVerifyCorrectness({ supertest, connectorId, req: newReq });

          const cases = await findCases({ supertest });
          expect(cases.total).to.be(1);

          const theCase = removeServerGeneratedData(cases.cases[0]);

          expect(theCase).to.eql({
            assignees: [
              {
                uid: 'u_J41Oh6L9ki-Vo2tOogS8WRTENzhHurGtRc87NgEAlkc_0',
              },
            ],
            category: 'my category',
            closed_at: null,
            closed_by: null,
            comments: [],
            connector: {
              fields: {
                issueType: 'Task',
                parent: null,
                priority: 'Low',
              },
              id: 'jira-1',
              name: 'Jira',
              type: '.jira',
            },
            created_by: expectedUser,
            customFields: [
              {
                key: 'first_custom_field_key',
                type: 'text',
                value: 'this is a text field value',
              },
            ],
            description: 'case desc',
            duration: null,
            external_service: null,
            id: theCase.id,
            owner: 'securitySolutionFixture',
            settings: {
              syncAlerts: false,
              extractObservables: false,
            },
            severity: 'high',
            status: 'open',
            tags: ['auto-generated', 'rule:rule-test-id', 'rule', 'test', 'sample'],
            title: 'Case with sample template',
            totalAlerts: 5,
            totalComment: 0,
            totalEvents: 0,
            updated_by: expectedUser,
            observables: [],
            total_observables: 0,
          });
        });

        it('should reopen a closed case', async () => {
          const reqClosedCase = getRequest({ reopenClosedCases: true });

          const theCase = await createCaseWithId({
            kibanaServer,
            caseId: generateCaseId({ ruleId: reqClosedCase.params.subActionParams.rule.id }),
          });

          const closedCase = await updateCase({
            supertest,
            params: {
              cases: [
                { id: theCase.id, version: theCase.version ?? '', status: CaseStatuses.closed },
              ],
            },
          });

          expect(closedCase[0].status).to.be('closed');

          await executeConnectorAndVerifyCorrectness({
            supertest,
            connectorId,
            req: reqClosedCase,
          });

          const updatedCase = await getCase({ supertest, caseId: theCase.id });
          expect(updatedCase.status).to.be('open');
        });

        it('should create an new case when the time window has elapsed and attach alerts correctly', async () => {
          const reqTimeWindow = getRequest({ timeWindow: '7d' });
          const oracleId = generateOracleId({ ruleId: req.params.subActionParams.rule.id });

          await createOracleRecord({
            es,
            oracleId,
            attributes: { date: '2024-02-10T11:00:00.000Z' },
          });

          const theCase = await createCaseWithId({
            kibanaServer,
            caseId: generateCaseId({ ruleId: reqTimeWindow.params.subActionParams.rule.id }),
          });

          const closedCase = await updateCase({
            supertest,
            params: {
              cases: [
                { id: theCase.id, version: theCase.version ?? '', status: CaseStatuses.closed },
              ],
            },
          });

          expect(closedCase[0].status).to.be('closed');

          await executeConnectorAndVerifyCorrectness({
            supertest,
            connectorId,
            req: reqTimeWindow,
          });

          const oldCase = await getCase({ supertest, caseId: theCase.id });

          expect(oldCase.status).to.be('closed');

          const newCase = await getCase({
            supertest,
            caseId: generateCaseId({
              ruleId: reqTimeWindow.params.subActionParams.rule.id,
              counter: 2,
            }),
          });

          expect(newCase.status).to.be('open');

          const attachments = await getAllComments({ supertest, caseId: newCase.id });

          verifyAlertsAttachedToCase({
            caseAttachments: attachments,
            expectedAlertIdsToBeAttachedToCase: new Set(
              req.params.subActionParams.alerts.map((alert) => alert._id)
            ),
            rule: {
              id: req.params.subActionParams.rule.id,
              name: req.params.subActionParams.rule.name,
            },
          });
        });

        it('should not create a new case if it exists', async () => {
          const theCase = await createCaseWithId({
            kibanaServer,
            caseId: generateCaseId({ ruleId: req.params.subActionParams.rule.id }),
          });

          await executeConnectorAndVerifyCorrectness({ supertest, connectorId, req });

          const cases = await findCases({ supertest });
          expect(cases.total).to.be(1);

          expect(theCase.id).to.be(cases.cases[0].id);
        });

        it('should create the correct case if the oracle record exists', async () => {
          const oracleId = generateOracleId({
            ruleId: req.params.subActionParams.rule.id,
          });

          await createOracleRecord({ es, oracleId, attributes: { counter: 3 } });
          const caseId = generateCaseId({ ruleId: req.params.subActionParams.rule.id, counter: 3 });

          await executeConnectorAndVerifyCorrectness({ supertest, connectorId, req });

          const cases = await findCases({ supertest });
          expect(cases.total).to.be(1);

          expect(caseId).to.be(cases.cases[0].id);
        });

        it('should attach the correct number of alerts', async () => {
          await executeConnectorAndVerifyCorrectness({ supertest, connectorId, req });
          const cases = await findCases({ supertest });
          expect(cases.total).to.be(1);

          const theCase = cases.cases[0];

          expect(theCase.totalAlerts).to.be(req.params.subActionParams.alerts.length);
        });

        it('should attach the correct alerts', async () => {
          await executeConnectorAndVerifyCorrectness({ supertest, connectorId, req });
          const cases = await findCases({ supertest });
          expect(cases.total).to.be(1);

          const theCase = cases.cases[0];

          const attachments = await getAllComments({ supertest, caseId: theCase.id });

          verifyAlertsAttachedToCase({
            caseAttachments: attachments,
            expectedAlertIdsToBeAttachedToCase: new Set(
              req.params.subActionParams.alerts.map((alert) => alert._id)
            ),
            rule: {
              id: req.params.subActionParams.rule.id,
              name: req.params.subActionParams.rule.name,
            },
          });
        });

        it('create case with custom fields correctly', async () => {
          const customFields = {
            customFields: [
              { key: 'text_1', label: 'text 1', type: CustomFieldTypes.TEXT, required: true },
            ],
          };

          await createConfiguration(
            supertest,
            getConfigurationRequest({
              overrides: customFields,
            })
          );

          await executeConnectorAndVerifyCorrectness({ supertest, connectorId, req });

          const cases = await findCases({ supertest });
          expect(cases.total).to.be(1);
          expect(cases.cases[0].customFields).to.eql([
            { key: 'text_1', type: CustomFieldTypes.TEXT, value: 'N/A' },
          ]);
        });

        it('should add more alerts to the same case', async () => {
          const alerts = Array.from(Array(5).keys()).map((index) => ({
            _id: `alert-id-new-${index}`,
            _index: 'alert-index-0',
          }));

          await executeConnectorAndVerifyCorrectness({ supertest, connectorId, req });

          const cases = await findCases({ supertest });
          expect(cases.total).to.be(1);

          await executeConnectorAndVerifyCorrectness({
            supertest,
            connectorId,
            req: getRequest({ alerts }),
          });

          const theCase = cases.cases[0];

          const attachments = await getAllComments({ supertest, caseId: theCase.id });

          verifyAlertsAttachedToCase({
            caseAttachments: attachments,
            expectedAlertIdsToBeAttachedToCase: new Set([
              ...req.params.subActionParams.alerts.map((alert) => alert._id),
              ...alerts.map((alert) => alert._id),
            ]),
            rule: {
              id: req.params.subActionParams.rule.id,
              name: req.params.subActionParams.rule.name,
            },
          });
        });

        it('should attach the alerts to an existing case', async () => {
          const theCase = await createCaseWithId({
            kibanaServer,
            caseId: generateCaseId({ ruleId: req.params.subActionParams.rule.id }),
          });

          await executeConnectorAndVerifyCorrectness({ supertest, connectorId, req });

          const cases = await findCases({ supertest });
          expect(cases.total).to.be(1);

          const attachments = await getAllComments({ supertest, caseId: theCase.id });

          verifyAlertsAttachedToCase({
            caseAttachments: attachments,
            expectedAlertIdsToBeAttachedToCase: new Set([
              ...req.params.subActionParams.alerts.map((alert) => alert._id),
            ]),
            rule: {
              id: req.params.subActionParams.rule.id,
              name: req.params.subActionParams.rule.name,
            },
          });
        });

        it('should not attach alerts to a case with more that 1K alerts and should not throw', async () => {
          const alerts = [...Array(1000).keys()].map((num) => `test-${num}`);

          const theCase = await createCaseWithId({
            kibanaServer,
            caseId: generateCaseId({ ruleId: req.params.subActionParams.rule.id }),
          });

          await createComment({
            supertest,
            caseId: theCase.id,
            params: { ...postCommentAlertReq, alertId: alerts, index: alerts },
          });

          await executeConnectorAndVerifyCorrectness({ supertest, connectorId, req });

          const cases = await findCases({ supertest });
          expect(cases.total).to.be(1);

          const attachments = await getAllComments({ supertest, caseId: theCase.id });
          expect(attachments.length).to.be(1);
          expect((attachments[0] as AlertAttachment).alertId.length).to.be(1000);
        });
      });

      describe('With grouping', () => {
        const req = getRequest({ groupingBy: ['host.name'] });

        describe('Oracle', () => {
          it('should create the oracle records correctly with grouping', async () => {
            await executeConnectorAndVerifyCorrectness({
              supertest,
              connectorId,
              req,
            });

            const firstOracleId = generateOracleId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { 'host.name': 'A' },
            });

            const secondOracleId = generateOracleId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { 'host.name': 'B' },
            });

            const firstOracleRecord = await getOracleRecord({
              kibanaServer,
              oracleId: firstOracleId,
            });

            const secondOracleRecord = await getOracleRecord({
              kibanaServer,
              oracleId: secondOracleId,
            });

            expect(firstOracleRecord.counter).to.be(1);
            expect(firstOracleRecord.rules[0]).to.eql({
              id: req.params.subActionParams.rule.id,
            });

            expect(secondOracleRecord.counter).to.be(1);
            expect(secondOracleRecord.rules[0]).to.eql({
              id: req.params.subActionParams.rule.id,
            });
          });
        });

        describe('Cases & alerts', () => {
          it('should create cases correctly', async () => {
            await executeConnectorAndVerifyCorrectness({
              supertest,
              connectorId,
              req,
            });

            const cases = await findCases({ supertest });

            expect(cases.total).to.be(2);

            const firstCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { 'host.name': 'A' },
            });
            const secondCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { 'host.name': 'B' },
            });

            const firstCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === firstCaseId)!
            );

            const secondCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === secondCaseId)!
            );

            expect(firstCase).to.eql({
              assignees: [],
              category: null,
              closed_at: null,
              closed_by: null,
              comments: [],
              connector: {
                fields: null,
                id: 'none',
                name: 'none',
                type: '.none',
              },
              created_by: expectedUser,
              customFields: [],
              description:
                "This case was created by the rule ['Test rule'](https://example.com/rules/rule-test-id). The assigned alerts are grouped by `host.name: A`.",
              duration: null,
              external_service: null,
              id: firstCaseId,
              owner: 'securitySolutionFixture',
              settings: {
                syncAlerts: false,
                extractObservables: false,
              },
              severity: 'low',
              status: 'open',
              tags: [
                'auto-generated',
                'rule:rule-test-id',
                'host.name',
                'host.name:A',
                'rule',
                'test',
              ],
              title: 'Test rule - Grouping by A (Auto-created)',
              totalAlerts: 3,
              totalComment: 0,
              totalEvents: 0,
              updated_by: expectedUser,
              observables: [],
              total_observables: 0,
            });

            expect(secondCase).to.eql({
              assignees: [],
              category: null,
              closed_at: null,
              closed_by: null,
              comments: [],
              connector: {
                fields: null,
                id: 'none',
                name: 'none',
                type: '.none',
              },
              created_by: expectedUser,
              customFields: [],
              description:
                "This case was created by the rule ['Test rule'](https://example.com/rules/rule-test-id). The assigned alerts are grouped by `host.name: B`.",
              duration: null,
              external_service: null,
              id: secondCaseId,
              owner: 'securitySolutionFixture',
              settings: {
                syncAlerts: false,
                extractObservables: false,
              },
              severity: 'low',
              status: 'open',
              tags: [
                'auto-generated',
                'rule:rule-test-id',
                'host.name',
                'host.name:B',
                'rule',
                'test',
              ],
              title: 'Test rule - Grouping by B (Auto-created)',
              totalAlerts: 2,
              totalComment: 0,
              totalEvents: 0,
              updated_by: expectedUser,
              observables: [],
              total_observables: 0,
            });
          });

          it('fallback to one case when a lot of cases will be generated', async () => {
            const alerts = Array.from(Array(10).keys()).map((index) => ({
              _id: `alert-id-${index}`,
              _index: 'alert-index-0',
              'host.name': index,
            }));

            await executeConnectorAndVerifyCorrectness({
              supertest,
              connectorId,
              req: getRequest({ groupingBy: ['host.name'], alerts }),
            });

            const cases = await findCases({ supertest });
            expect(cases.total).to.be(1);
          });

          it('should attach the alerts to the correct cases', async () => {
            await executeConnectorAndVerifyCorrectness({
              supertest,
              connectorId,
              req,
            });

            const cases = await findCases({ supertest });

            expect(cases.total).to.be(2);

            const firstCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { 'host.name': 'A' },
            });
            const secondCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { 'host.name': 'B' },
            });

            const firstCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === firstCaseId)!
            );

            const firstCaseAttachments = await getAllComments({ supertest, caseId: firstCase.id });

            verifyAlertsAttachedToCase({
              caseAttachments: firstCaseAttachments,
              expectedAlertIdsToBeAttachedToCase: new Set([
                'alert-id-0',
                'alert-id-2',
                'alert-id-4',
              ]),
              rule: {
                id: req.params.subActionParams.rule.id,
                name: req.params.subActionParams.rule.name,
              },
            });

            const secondCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === secondCaseId)!
            );

            const secondCaseAttachments = await getAllComments({
              supertest,
              caseId: secondCase.id,
            });

            verifyAlertsAttachedToCase({
              caseAttachments: secondCaseAttachments,
              expectedAlertIdsToBeAttachedToCase: new Set(['alert-id-1', 'alert-id-3']),
              rule: {
                id: req.params.subActionParams.rule.id,
                name: req.params.subActionParams.rule.name,
              },
            });
          });

          it('should add more alerts to the same case', async () => {
            const hostAAlerts = Array.from(Array(3).keys()).map((index) => ({
              _id: `alert-id-host-A-${index}`,
              _index: 'alert-index-0',
              'host.name': 'A',
            }));

            const hostBAlerts = Array.from(Array(3).keys()).map((index) => ({
              _id: `alert-id-host-B-${index}`,
              _index: 'alert-index-0',
              'host.name': 'B',
            }));

            const totalAlerts = [...hostAAlerts, ...hostBAlerts];

            await executeConnectorAndVerifyCorrectness({
              supertest,
              connectorId,
              req: getRequest({
                alerts: req.params.subActionParams.alerts,
                groupingBy: req.params.subActionParams.groupingBy,
              }),
            });

            const cases = await findCases({ supertest });
            expect(cases.total).to.be(2);

            await executeConnectorAndVerifyCorrectness({
              supertest,
              connectorId,
              req: getRequest({
                alerts: totalAlerts,
                groupingBy: req.params.subActionParams.groupingBy,
              }),
            });

            const firstCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { 'host.name': 'A' },
            });

            const secondCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { 'host.name': 'B' },
            });

            const firstCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === firstCaseId)!
            );

            const secondCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === secondCaseId)!
            );

            const firstCaseAttachments = await getAllComments({
              supertest,
              caseId: firstCase.id,
            });

            const secondCaseAttachments = await getAllComments({
              supertest,
              caseId: secondCase.id,
            });

            verifyAlertsAttachedToCase({
              caseAttachments: firstCaseAttachments,
              expectedAlertIdsToBeAttachedToCase: new Set([
                ...['alert-id-0', 'alert-id-2', 'alert-id-4'],
                ...hostAAlerts.map((alert) => alert._id),
              ]),
              rule: {
                id: req.params.subActionParams.rule.id,
                name: req.params.subActionParams.rule.name,
              },
            });

            verifyAlertsAttachedToCase({
              caseAttachments: secondCaseAttachments,
              expectedAlertIdsToBeAttachedToCase: new Set([
                ...['alert-id-1', 'alert-id-3'],
                ...hostBAlerts.map((alert) => alert._id),
              ]),
              rule: {
                id: req.params.subActionParams.rule.id,
                name: req.params.subActionParams.rule.name,
              },
            });
          });

          it('sets rule info to null when `internallyManagedAlerts` is `true`', async () => {
            await executeConnectorAndVerifyCorrectness({
              supertest,
              connectorId,
              req: getRequest({ groupingBy: ['host.name'], internallyManagedAlerts: true }),
            });

            const cases = await findCases({ supertest });

            expect(cases.total).to.be(2);

            const firstCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { 'host.name': 'A' },
            });
            const secondCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { 'host.name': 'B' },
            });

            const firstCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === firstCaseId)!
            );

            const firstCaseAttachments = await getAllComments({ supertest, caseId: firstCase.id });

            verifyAlertsAttachedToCase({
              caseAttachments: firstCaseAttachments,
              expectedAlertIdsToBeAttachedToCase: new Set([
                'alert-id-0',
                'alert-id-2',
                'alert-id-4',
              ]),
              rule: { id: null, name: null },
            });

            const secondCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === secondCaseId)!
            );

            const secondCaseAttachments = await getAllComments({
              supertest,
              caseId: secondCase.id,
            });

            verifyAlertsAttachedToCase({
              caseAttachments: secondCaseAttachments,
              expectedAlertIdsToBeAttachedToCase: new Set(['alert-id-1', 'alert-id-3']),
              rule: { id: null, name: null },
            });
          });
        });

        describe('Non grouped alerts', () => {
          it('should attach non grouped alerts correctly', async () => {
            await executeConnectorAndVerifyCorrectness({
              supertest,
              connectorId,
              req: getRequest({
                alerts: [
                  { _id: 'alert-id-0', _index: 'alert-index-0', 'host.name': 'A' },
                  { _id: 'alert-id-1', _index: 'alert-index-1', 'dest.ip': '0.0.0.1' },
                  { _id: `alert-id-2`, _index: 'alert-index-2' },
                ],
                groupingBy: ['host.name'],
              }),
            });

            const cases = await findCases({ supertest });

            expect(cases.total).to.be(2);

            const firstOracleId = generateOracleId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { 'host.name': 'A' },
            });

            const secondOracleId = generateOracleId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { 'host.name': 'unknown' },
            });

            const firstOracleRecord = await getOracleRecord({
              kibanaServer,
              oracleId: firstOracleId,
            });

            const secondOracleRecord = await getOracleRecord({
              kibanaServer,
              oracleId: secondOracleId,
            });

            expect(firstOracleRecord.grouping).to.eql({ 'host.name': 'A' });
            expect(secondOracleRecord.grouping).to.eql({ 'host.name': 'unknown' });

            const firstCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { 'host.name': 'A' },
            });

            const secondCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { 'host.name': 'unknown' },
            });

            const firstCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === firstCaseId)!
            );

            const secondCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === secondCaseId)!
            );

            expect(firstCase.description).to.be(
              "This case was created by the rule ['Test rule'](https://example.com/rules/rule-test-id). The assigned alerts are grouped by `host.name: A`."
            );
            expect(secondCase.description).to.be(
              "This case was created by the rule ['Test rule'](https://example.com/rules/rule-test-id). The assigned alerts are grouped by `host.name: unknown`."
            );

            const firstCaseAttachments = await getAllComments({
              supertest,
              caseId: firstCase.id,
            });

            const secondCaseAttachments = await getAllComments({
              supertest,
              caseId: secondCase.id,
            });

            verifyAlertsAttachedToCase({
              caseAttachments: firstCaseAttachments,
              expectedAlertIdsToBeAttachedToCase: new Set(['alert-id-0']),
              rule: {
                id: req.params.subActionParams.rule.id,
                name: req.params.subActionParams.rule.name,
              },
            });

            verifyAlertsAttachedToCase({
              caseAttachments: secondCaseAttachments,
              expectedAlertIdsToBeAttachedToCase: new Set(['alert-id-1', 'alert-id-2']),
              rule: {
                id: req.params.subActionParams.rule.id,
                name: req.params.subActionParams.rule.name,
              },
            });
          });
        });
      });

      describe('With predefined grouping via `groupedAlerts`', () => {
        const groupedAlerts = [
          {
            alerts: [
              { _id: 'alert-id-1', _index: 'alert-index-1' },
              { _id: 'alert-id-2', _index: 'alert-index-1' },
            ],
            comments: ['comment-1'],
            grouping: { field_name_1: 'field_value_1' },
            title: 'custom-title',
          },
          {
            alerts: [
              { _id: 'alert-id-3', _index: 'alert-index-2' },
              { _id: 'alert-id-4', _index: 'alert-index-2' },
            ],
            comments: ['comment-2', 'comment-3'],
            grouping: { field_name_2: 'field_value_2' },
          },
          {
            alerts: [{ _id: 'alert-id-5', _index: 'alert-index-3' }],
            grouping: { field_name_1: 'field_value_3' },
          },
        ];
        const req = getRequest({ groupedAlerts, internallyManagedAlerts: true });

        describe('Oracle', () => {
          it('should create the oracle records correctly with grouping', async () => {
            await executeConnectorAndVerifyCorrectness({
              supertest,
              connectorId,
              req,
            });

            const firstOracleId = generateOracleId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { field_name_1: 'field_value_1' },
            });

            const secondOracleId = generateOracleId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { field_name_2: 'field_value_2' },
            });

            const firstOracleRecord = await getOracleRecord({
              kibanaServer,
              oracleId: firstOracleId,
            });

            const secondOracleRecord = await getOracleRecord({
              kibanaServer,
              oracleId: secondOracleId,
            });

            expect(firstOracleRecord.counter).to.be(1);
            expect(firstOracleRecord.rules[0]).to.eql({
              id: req.params.subActionParams.rule.id,
            });

            expect(secondOracleRecord.counter).to.be(1);
            expect(secondOracleRecord.rules[0]).to.eql({
              id: req.params.subActionParams.rule.id,
            });
          });
        });

        describe('Cases & alerts', () => {
          it('should create cases correctly', async () => {
            await executeConnectorAndVerifyCorrectness({
              supertest,
              connectorId,
              req,
            });

            const cases = await findCases({ supertest });

            expect(cases.total).to.be(3);

            const firstCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { field_name_1: 'field_value_1' },
            });
            const secondCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { field_name_2: 'field_value_2' },
            });
            const thirdCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { field_name_1: 'field_value_3' },
            });

            const firstCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === firstCaseId)!
            );

            const secondCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === secondCaseId)!
            );

            const thirdCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === thirdCaseId)!
            );

            expect(firstCase).to.eql({
              assignees: [],
              category: null,
              closed_at: null,
              closed_by: null,
              comments: [],
              connector: {
                fields: null,
                id: 'none',
                name: 'none',
                type: '.none',
              },
              created_by: expectedUser,
              customFields: [],
              description:
                "This case was created by the rule ['Test rule'](https://example.com/rules/rule-test-id). The assigned alerts are grouped by `field_name_1: field_value_1`.",
              duration: null,
              external_service: null,
              id: firstCaseId,
              owner: 'securitySolutionFixture',
              settings: {
                syncAlerts: false,
                extractObservables: false,
              },
              severity: 'low',
              status: 'open',
              tags: [
                'auto-generated',
                'rule:rule-test-id',
                'field_name_1',
                'field_name_1:field_value_1',
                'rule',
                'test',
              ],
              title: 'custom-title',
              totalEvents: 0,
              totalAlerts: 2,
              totalComment: 1,
              updated_by: expectedUser,
              observables: [],
              total_observables: 0,
            });

            expect(secondCase).to.eql({
              assignees: [],
              category: null,
              closed_at: null,
              closed_by: null,
              comments: [],
              connector: {
                fields: null,
                id: 'none',
                name: 'none',
                type: '.none',
              },
              created_by: expectedUser,
              customFields: [],
              description:
                "This case was created by the rule ['Test rule'](https://example.com/rules/rule-test-id). The assigned alerts are grouped by `field_name_2: field_value_2`.",
              duration: null,
              external_service: null,
              id: secondCaseId,
              owner: 'securitySolutionFixture',
              settings: {
                syncAlerts: false,
                extractObservables: false,
              },
              severity: 'low',
              status: 'open',
              tags: [
                'auto-generated',
                'rule:rule-test-id',
                'field_name_2',
                'field_name_2:field_value_2',
                'rule',
                'test',
              ],
              title: 'Test rule - Grouping by field_value_2 (Auto-created)',
              totalAlerts: 2,
              totalComment: 2,
              totalEvents: 0,
              updated_by: expectedUser,
              observables: [],
              total_observables: 0,
            });

            expect(thirdCase).to.eql({
              assignees: [],
              category: null,
              closed_at: null,
              closed_by: null,
              comments: [],
              connector: {
                fields: null,
                id: 'none',
                name: 'none',
                type: '.none',
              },
              created_by: expectedUser,
              customFields: [],
              description:
                "This case was created by the rule ['Test rule'](https://example.com/rules/rule-test-id). The assigned alerts are grouped by `field_name_1: field_value_3`.",
              duration: null,
              external_service: null,
              id: thirdCaseId,
              owner: 'securitySolutionFixture',
              settings: {
                syncAlerts: false,
                extractObservables: false,
              },
              severity: 'low',
              status: 'open',
              tags: [
                'auto-generated',
                'rule:rule-test-id',
                'field_name_1',
                'field_name_1:field_value_3',
                'rule',
                'test',
              ],
              title: 'Test rule - Grouping by field_value_3 (Auto-created)',
              totalAlerts: 1,
              totalComment: 0,
              totalEvents: 0,
              updated_by: expectedUser,
              observables: [],
              total_observables: 0,
            });
          });

          it('should attach the alerts to the correct cases', async () => {
            await executeConnectorAndVerifyCorrectness({
              supertest,
              connectorId,
              req,
            });

            const cases = await findCases({ supertest });

            expect(cases.total).to.be(3);

            const firstCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { field_name_1: 'field_value_1' },
            });
            const secondCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { field_name_2: 'field_value_2' },
            });
            const thirdCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { field_name_1: 'field_value_3' },
            });

            const firstCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === firstCaseId)!
            );

            const firstCaseAttachments = await getAllComments({ supertest, caseId: firstCase.id });

            verifyAlertsAttachedToCase({
              caseAttachments: firstCaseAttachments,
              expectedAlertIdsToBeAttachedToCase: new Set(['alert-id-1', 'alert-id-2']),
              rule: { id: null, name: null },
            });

            const secondCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === secondCaseId)!
            );

            const secondCaseAttachments = await getAllComments({
              supertest,
              caseId: secondCase.id,
            });

            verifyAlertsAttachedToCase({
              caseAttachments: secondCaseAttachments,
              expectedAlertIdsToBeAttachedToCase: new Set(['alert-id-3', 'alert-id-4']),
              rule: { id: null, name: null },
            });

            const thirdCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === thirdCaseId)!
            );

            const thirdCaseAttachments = await getAllComments({
              supertest,
              caseId: thirdCase.id,
            });

            verifyAlertsAttachedToCase({
              caseAttachments: thirdCaseAttachments,
              expectedAlertIdsToBeAttachedToCase: new Set(['alert-id-5']),
              rule: { id: null, name: null },
            });
          });

          it('should add more alerts to the same case', async () => {
            const additionalGroupedAlerts1 = [
              {
                alerts: [
                  { _id: 'alert-id-extra-1', _index: 'alert-index-1' },
                  { _id: 'alert-id-extra-2', _index: 'alert-index-1' },
                ],
                comments: ['comment-2'],
                grouping: { field_name_1: 'field_value_1' },
                title: 'custom-title',
              },
            ];
            const additionalGroupedAlerts2 = [
              {
                alerts: [{ _id: 'alert-id-extra-5', _index: 'alert-index-2' }],
                grouping: { field_name_2: 'field_value_2' },
              },
            ];

            const totalGroupedAlerts = [...additionalGroupedAlerts1, ...additionalGroupedAlerts2];

            await executeConnectorAndVerifyCorrectness({
              supertest,
              connectorId,
              req,
            });

            const cases = await findCases({ supertest });
            expect(cases.total).to.be(3);

            await executeConnectorAndVerifyCorrectness({
              supertest,
              connectorId,
              req: getRequest({
                groupedAlerts: totalGroupedAlerts,
                internallyManagedAlerts: true,
              }),
            });

            const firstCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { field_name_1: 'field_value_1' },
            });

            const secondCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { field_name_2: 'field_value_2' },
            });

            const thirdCaseId = generateCaseId({
              ruleId: req.params.subActionParams.rule.id,
              grouping: { field_name_1: 'field_value_3' },
            });

            const firstCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === firstCaseId)!
            );

            const secondCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === secondCaseId)!
            );

            const thirdCase = removeServerGeneratedData(
              cases.cases.find((theCase) => theCase.id === thirdCaseId)!
            );

            const firstCaseAttachments = await getAllComments({
              supertest,
              caseId: firstCase.id,
            });

            const secondCaseAttachments = await getAllComments({
              supertest,
              caseId: secondCase.id,
            });

            const thirdCaseAttachments = await getAllComments({
              supertest,
              caseId: thirdCase.id,
            });

            verifyAlertsAttachedToCase({
              caseAttachments: firstCaseAttachments,
              expectedAlertIdsToBeAttachedToCase: new Set([
                'alert-id-1',
                'alert-id-2',
                'alert-id-extra-1',
                'alert-id-extra-2',
              ]),
              rule: { id: null, name: null },
            });

            verifyAlertsAttachedToCase({
              caseAttachments: secondCaseAttachments,
              expectedAlertIdsToBeAttachedToCase: new Set([
                'alert-id-3',
                'alert-id-4',
                'alert-id-extra-5',
              ]),
              rule: { id: null, name: null },
            });

            verifyAlertsAttachedToCase({
              caseAttachments: thirdCaseAttachments,
              expectedAlertIdsToBeAttachedToCase: new Set(['alert-id-5']),
              rule: { id: null, name: null },
            });
          });
        });
      });
    });

    describe('rbac', () => {
      before(async () => {
        await createUsersAndRoles(getService, api_int_users, api_int_roles);
      });

      after(async () => {
        await deleteUsersAndRoles(getService, api_int_users, api_int_roles);
      });

      it('should not execute without permission to cases for all owners', async () => {
        for (const owner of ['cases', 'securitySolution', 'observability']) {
          const req = getRequest({ owner });
          await executeSystemConnector({
            supertest: supertestWithoutAuth,
            connectorId,
            req,
            auth: { user: onlyActions, space: null },
            expectedHttpCode: 403,
          });
        }
      });

      it('should not execute in a space with no permissions', async () => {
        const req = getRequest({ owner: 'securitySolution' });
        await executeSystemConnector({
          supertest: supertestWithoutAuth,
          connectorId,
          req,
          auth: { user: secAllSpace1User, space: 'space2' },
          expectedHttpCode: 403,
        });
      });

      it('should not execute with read permission to cases', async () => {
        for (const user of [
          globalRead,
          secAllCasesReadUser,
          obsCasesReadUser,
          obsSecCasesReadUser,
          noKibanaPrivileges,
        ]) {
          const req = getRequest({ owner: 'securitySolution' });
          await executeSystemConnector({
            supertest: supertestWithoutAuth,
            connectorId,
            req,
            auth: { user, space: null },
            expectedHttpCode: 403,
          });
        }
      });

      it('should execute correctly for users with permissions to cases', async () => {
        const usersToTest: Array<[User, string]> = [
          [secAllUser, 'securitySolution'],
          [obsCasesAllUser, 'observability'],
          [casesAllUser, 'cases'],
          [obsSecCasesAllUser, 'securitySolution'],
          [obsSecCasesAllUser, 'observability'],
        ];

        for (const [user, owner] of usersToTest) {
          const req = getRequest({ owner });
          const res = await executeSystemConnector({
            supertest: supertestWithoutAuth,
            connectorId,
            req,
            auth: { user, space: null },
            expectedHttpCode: 200,
          });

          expect(res.status).to.be('ok');
        }
      });

      it('should not execute when users have permission to cases but for different owners', async () => {
        const usersToTest: Array<[User, string]> = [
          [secAllUser, 'observability'],
          [obsCasesAllUser, 'securitySolution'],
          [casesAllUser, 'securitySolution'],
          [obsSecCasesAllUser, 'cases'],
          [obsSecCasesAllUser, 'cases'],
        ];

        for (const [user, owner] of usersToTest) {
          const req = getRequest({ owner });
          await executeSystemConnector({
            supertest: supertestWithoutAuth,
            connectorId,
            req,
            auth: { user, space: null },
            expectedHttpCode: 403,
          });
        }
      });
    });
  });
};

const getRequest = (params: Partial<CasesConnectorRunParams> = {}) => {
  const alerts = [
    {
      _id: 'alert-id-0',
      _index: 'alert-index-0',
      'host.name': 'A',
      'dest.ip': '0.0.0.1',
      'source.ip': '0.0.0.2',
    },
    {
      _id: 'alert-id-1',
      _index: 'alert-index-1',
      'host.name': 'B',
      'dest.ip': '0.0.0.1',
      'file.hash': '12345',
    },
    { _id: 'alert-id-2', _index: 'alert-index-2', 'host.name': 'A', 'dest.ip': '0.0.0.1' },
    { _id: 'alert-id-3', _index: 'alert-index-3', 'host.name': 'B', 'dest.ip': '0.0.0.3' },
    { _id: 'alert-id-4', _index: 'alert-index-4', 'host.name': 'A', 'source.ip': '0.0.0.5' },
  ];

  const rule = {
    id: 'rule-test-id',
    name: 'Test rule',
    tags: ['rule', 'test'],
    ruleUrl: 'https://example.com/rules/rule-test-id',
  };

  const owner = 'securitySolutionFixture';
  const timeWindow = '7d';
  const reopenClosedCases = false;

  const req: { subAction: 'run'; subActionParams: CasesConnectorRunParams } = {
    subAction: 'run',
    subActionParams: {
      alerts,
      groupedAlerts: null,
      groupingBy: [],
      rule,
      owner,
      timeWindow,
      reopenClosedCases,
      maximumCasesToOpen: 5,
      templateId: null,
      templateVersion: null,
      internallyManagedAlerts: null,
      autoPushCase: null,
      ...params,
    },
  };

  return { params: req };
};

const generateCaseId = ({
  ruleId,
  grouping = {},
  counter = 1,
  spaceId = 'default',
  owner = 'securitySolutionFixture',
}: {
  ruleId: string;
  grouping?: Record<string, unknown>;
  counter?: number;
  spaceId?: string;
  owner?: string;
}) => {
  return generateId({ ruleId, counter, grouping, spaceId, owner });
};

const generateOracleId = ({
  ruleId,
  grouping = {},
  spaceId = 'default',
  owner = 'securitySolutionFixture',
}: {
  ruleId: string;
  grouping?: Record<string, unknown>;
  spaceId?: string;
  owner?: string;
}) => {
  return generateId({ ruleId, grouping, spaceId, owner });
};

const generateId = ({
  ruleId,
  grouping,
  counter,
  spaceId,
  owner,
}: {
  ruleId?: string;
  grouping?: Record<string, unknown>;
  counter?: number;
  spaceId?: string;
  owner?: string;
}) => {
  const payload = [ruleId, spaceId, owner, stableStringify(grouping), counter]
    .filter(Boolean)
    .join(':');
  const hash = createHash('sha256');

  hash.update(payload);
  return hash.digest('hex');
};

const removeServerGeneratedData = (
  theCase: Case
): Omit<Case, 'created_at' | 'updated_at' | 'version'> => {
  const { created_at, updated_at, version, ...restCase } = theCase;

  return restCase;
};

const verifyAlertsAttachedToCase = ({
  expectedAlertIdsToBeAttachedToCase,
  caseAttachments,
  rule,
}: {
  expectedAlertIdsToBeAttachedToCase: Set<string>;
  caseAttachments: Attachments;
  rule: { id: string | null; name: string | null };
}) => {
  const alertsAttachedToCase = caseAttachments.filter(
    (attachment): attachment is AlertAttachment => attachment.type === AttachmentType.alert
  );

  const alertIdsAttachedToCase = new Set(alertsAttachedToCase.map((alert) => alert.alertId).flat());

  expect(alertIdsAttachedToCase.size).to.be(expectedAlertIdsToBeAttachedToCase.size);

  for (const alert of alertsAttachedToCase) {
    const alertIdAsArray = Array.isArray(alert.alertId) ? alert.alertId : [alert.alertId];
    expect(
      alertIdAsArray.every((alertId) => expectedAlertIdsToBeAttachedToCase.has(alertId))
    ).to.be(true);
    expect(alert.rule.id).to.be(rule.id);
    expect(alert.rule.name).to.be(rule.name);
  }
};

const expectedUser = {
  username: 'elastic',
  full_name: null,
  email: null,
  profile_uid: elasticUserProfileId,
};

const createCaseWithId = async ({
  kibanaServer,
  caseId,
  req,
}: {
  kibanaServer: KbnClient;
  caseId: string;
  req?: Partial<CasePostRequest>;
}) => {
  const res = await kibanaServer.savedObjects.create<CasePersistedAttributes>({
    id: caseId,
    type: 'cases',
    attributes: {
      ...getPostCaseRequest(),
      ...req,
      assignees: [],
      connector: {
        name: 'none',
        type: ConnectorTypes.none,
        fields: null,
      },
      settings: {
        syncAlerts: req?.settings?.syncAlerts ?? false,
        extractObservables: req?.settings?.extractObservables ?? false,
      },
      // @ts-ignore
      status: STATUS_EXTERNAL_TO_ESMODEL[req?.status ?? CaseStatuses.open],
      // @ts-ignore
      severity: SEVERITY_EXTERNAL_TO_ESMODEL[req?.severity ?? CaseSeverity.LOW],
      closed_at: null,
      closed_by: null,
      updated_at: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      created_by: expectedUser,
      duration: 0,
      external_service: null,
      total_alerts: 0,
      total_comments: 0,
      total_events: 0,
      observables: [],
      total_observables: 0,
      incremental_id: undefined,
    },
    overwrite: false,
  });

  return { id: res.id, version: res.version, ...res.attributes };
};

const getOracleRecord = async ({
  kibanaServer,
  oracleId,
}: {
  kibanaServer: KbnClient;
  oracleId: string;
}) => {
  const res = await kibanaServer.savedObjects.get<OracleRecordAttributes>({
    id: oracleId,
    type: CASE_RULES_SAVED_OBJECT,
  });

  return { id: res.id, version: res.version, ...res.attributes };
};

const getAllOracleRecords = async ({ kibanaServer }: { kibanaServer: KbnClient }) => {
  const res = await kibanaServer.savedObjects.find<OracleRecordAttributes>({
    type: CASE_RULES_SAVED_OBJECT,
  });

  return {
    total: res.total,
    records: res.saved_objects.map((so) => ({ id: so.id, version: so.version, ...so.attributes })),
  };
};

const clearOracleRecords = async (es: Client, kibanaServer: KbnClient) => {
  await kibanaServer.savedObjects.clean({ types: [CASE_RULES_SAVED_OBJECT] });
  await es.deleteByQuery({
    index: ALERTING_CASES_SAVED_OBJECT_INDEX,
    q: 'type:cases-rules',
    wait_for_completion: true,
    refresh: true,
    body: {},
    conflicts: 'proceed',
  });
};

const executeConnectorAndVerifyCorrectness = async ({
  supertest,
  connectorId,
  req,
}: {
  supertest: SuperTest.Agent;
  connectorId: string;
  req: Record<string, unknown>;
}) => {
  const res = await executeSystemConnector({ supertest, connectorId, req });

  expect(res.status).to.be('ok');

  return res;
};

const createOracleRecord = async ({
  es,
  oracleId,
  attributes: { counter, date } = {},
}: {
  es: Client;
  oracleId: string;
  attributes?: { counter?: number; date?: string };
}) => {
  const creationDate = date ?? new Date().toISOString();

  await es.create({
    id: `cases-rules:${oracleId}`,
    index: ALERTING_CASES_SAVED_OBJECT_INDEX,
    document: {
      [CASE_RULES_SAVED_OBJECT]: {
        createdAt: creationDate,
        updatedAt: null,
        cases: [],
        grouping: {},
        rules: [{ id: 'rule-test-id' }],
        counter: counter ?? 1,
      },
      coreMigrationVersion: '8.8.0',
      created_at: creationDate,
      managed: false,
      namespaces: ['default'],
      type: CASE_RULES_SAVED_OBJECT,
      typeMigrationVersion: '10.1.0',
      references: [],
    },
  });
};
