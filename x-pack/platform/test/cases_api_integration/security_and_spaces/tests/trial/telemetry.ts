/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import { AttachmentType } from '@kbn/cases-plugin/common';
import { OBSERVABLE_TYPE_IPV4 } from '@kbn/cases-plugin/common/constants';
import type { CasesTelemetry } from '@kbn/cases-plugin/server/telemetry/types';
import { getPostCaseRequest, postCommentAlertReq } from '../../../common/lib/mock';
import {
  deleteAllCaseItems,
  createCase,
  getTelemetry,
  runTelemetryTask,
  createComment,
  bulkCreateAttachments,
  addObservable,
} from '../../../common/lib/api';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { superUser } from '../../../common/lib/authentication/users';

// Helper function to extract cases telemetry data from the response
const getCasesTelemetry = (telemetryResponse: any): CasesTelemetry => {
  return telemetryResponse.stats.stack_stats.kibana.plugins.cases;
};

export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const es = getService('es');
  const retry = getService('retry');

  describe('Cases telemetry', () => {
    before(async () => {
      await deleteAllCaseItems(es);
    });

    afterEach(async () => {
      await deleteAllCaseItems(es);
    });

    it('should count cases from all spaces', async () => {
      await createCase(supertest, getPostCaseRequest(), 200, {
        user: superUser,
        space: 'space1',
      });

      await createCase(supertest, getPostCaseRequest(), 200, {
        user: superUser,
        space: 'space2',
      });

      await runTelemetryTask(supertest);

      await retry.try(async () => {
        const res = await getTelemetry(supertest);
        const casesTelemetry = getCasesTelemetry(res);
        expect(casesTelemetry.cases.all.total).toBe(2);
      });
    });

    it('should return the correct total number of alerts attached to cases', async () => {
      const firstCase = await createCase(
        supertest,
        getPostCaseRequest({ owner: 'securitySolution' })
      );
      const secondCase = await createCase(
        supertest,
        getPostCaseRequest({ owner: 'securitySolution' })
      );

      const firstCaseAlerts = [...Array(3).keys()].map((num) => `test-case-1-${num}`);
      const secondCaseAlerts = [...Array(2).keys()].map((num) => `test-case-2-${num}`);

      await bulkCreateAttachments({
        supertest,
        caseId: firstCase.id,
        params: [
          {
            ...postCommentAlertReq,
            alertId: firstCaseAlerts,
            index: firstCaseAlerts,
            owner: 'securitySolution',
          },
        ],
        expectedHttpCode: 200,
      });

      await bulkCreateAttachments({
        supertest,
        caseId: firstCase.id,
        params: [
          {
            ...postCommentAlertReq,
            alertId: secondCaseAlerts,
            index: secondCaseAlerts,
            owner: 'securitySolution',
          },
        ],
        expectedHttpCode: 200,
      });

      await createComment({
        supertest,
        caseId: secondCase.id,
        params: {
          ...postCommentAlertReq,
          alertId: 'test-case-2-3',
          index: 'test-case-2-3',
          owner: 'securitySolution',
        },
      });

      await runTelemetryTask(supertest);

      await retry.try(async () => {
        const res = await getTelemetry(supertest);
        const casesTelemetry = getCasesTelemetry(res);
        expect(casesTelemetry.alerts.all.total).toBe(6);
      });
    });

    it('should return the correct telemetry for cases with observables', async () => {
      // Index synthetic alert docs with ECS source.ip fields.  The server-side
      // extraction path fetches these via mget so we can control exactly which
      // observables are produced without needing real detection-engine alerts.
      const alertIndex = 'synthetic-cases-telemetry-alerts';

      // First case: one alert whose source.ip produces 1 auto-extracted observable
      await es.index({
        index: alertIndex,
        id: 'alert-telemetry-1',
        refresh: 'true',
        document: { 'source.ip': '127.0.0.2' },
      });

      // Second case: 50 alerts each with a distinct source.ip so they produce
      // 50 distinct observables — hitting MAX_OBSERVABLES_PER_CASE exactly.
      const bulkOps: Array<Record<string, unknown>> = [];
      for (let i = 0; i < 50; i++) {
        bulkOps.push({ index: { _index: alertIndex, _id: `alert-telemetry-2-${i}` } });
        bulkOps.push({ 'source.ip': `10.0.0.${i}` });
      }
      await es.bulk({ operations: bulkOps, refresh: 'true' });

      const caseSettings = { syncAlerts: false, extractObservables: true };

      const firstCase = await createCase(
        supertest,
        getPostCaseRequest({ owner: 'securitySolution', settings: caseSettings }),
        200,
        { user: superUser, space: 'space1' }
      );

      const secondCase = await createCase(
        supertest,
        getPostCaseRequest({ owner: 'securitySolution', settings: caseSettings }),
        200,
        { user: superUser, space: 'space2' }
      );

      // 1 manual observable on the first case
      await addObservable({
        supertest,
        caseId: firstCase.id,
        params: {
          observable: {
            typeKey: OBSERVABLE_TYPE_IPV4.key,
            value: '127.0.0.1',
            description: 'Manually added observable',
          },
        },
        auth: { user: superUser, space: 'space1' },
      });

      // 1 auto-extracted observable: attach the first alert to the first case.
      // extractAndAddObservables fires on bulkCreate and pulls source.ip from the doc.
      await bulkCreateAttachments({
        supertest,
        caseId: firstCase.id,
        params: [
          {
            type: AttachmentType.alert,
            alertId: 'alert-telemetry-1',
            index: alertIndex,
            rule: { id: 'rule-1', name: 'Rule 1' },
            owner: 'securitySolution',
          },
        ],
        auth: { user: superUser, space: 'space1' },
        expectedHttpCode: 200,
      });

      // 50 auto-extracted observables: one attachment per alert on the second case.
      // This reaches MAX_OBSERVABLES_PER_CASE (50) making totalWithMaxObservables = 1.
      const secondCaseAttachments = Array.from({ length: 50 }, (_, i) => ({
        type: AttachmentType.alert as const,
        alertId: `alert-telemetry-2-${i}`,
        index: alertIndex,
        rule: { id: 'rule-2', name: 'Rule 2' },
        owner: 'securitySolution',
      }));
      await bulkCreateAttachments({
        supertest,
        caseId: secondCase.id,
        params: secondCaseAttachments,
        auth: { user: superUser, space: 'space2' },
        expectedHttpCode: 200,
      });

      await runTelemetryTask(supertest);

      await retry.try(async () => {
        const res = await getTelemetry(supertest);
        const casesTelemetry = getCasesTelemetry(res);
        const allCasesTelemetry = casesTelemetry.cases.all;
        const securityCasesTelemetry = casesTelemetry.cases.sec;

        for (const telemetry of [allCasesTelemetry, securityCasesTelemetry]) {
          // 1 manual (addObservable call)
          expect(telemetry.observables.manual.default).toBe(1);
          // 1 from first case + 50 from second case = 51 auto-extracted
          expect(telemetry.observables.auto.default).toBe(51);
          expect(telemetry.observables.total).toBe(52);
          // second case has exactly MAX_OBSERVABLES_PER_CASE observables
          expect(telemetry.totalWithMaxObservables).toBe(1);
        }
      });

      // Clean up synthetic index
      await es.indices.delete({ index: alertIndex, ignore_unavailable: true });
    });
  });
};
