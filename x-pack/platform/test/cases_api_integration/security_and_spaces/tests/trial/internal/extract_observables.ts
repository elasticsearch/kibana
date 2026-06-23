/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import { OBSERVABLE_TYPE_IPV4 } from '@kbn/cases-plugin/common/constants';
import { AttachmentType } from '@kbn/cases-plugin/common';
import { getPostCaseRequest } from '../../../../common/lib/mock';
import {
  createCase,
  deleteAllCaseItems,
  bulkCreateAttachments,
  getCase,
} from '../../../../common/lib/api';

import type { FtrProviderContext } from '../../../../common/ftr_provider_context';

/**
 * Integration tests for the server-side observable extraction side effect that
 * fires when alert/event attachments are created via bulkCreateAttachments with
 * case.settings.extractObservables === true (Platinum license required).
 *
 * Uses synthetic ES documents (plain index with ECS fields) as alert sources so
 * the tests do not require a running detection engine or real alert documents.
 * AlertService.getAlerts performs a plain mget by {_id, _index}, so any ES doc
 * in any index is a valid source.
 */
export default ({ getService }: FtrProviderContext): void => {
  const es = getService('es');
  const supertest = getService('supertest');

  describe('observable extraction on attachment bulkCreate', () => {
    const alertIndex = 'synthetic-cases-extract-observables-alerts';

    before(async () => {
      // Index synthetic alert documents with ECS fields for all tests in this suite.
      await es.index({
        index: alertIndex,
        id: 'ext-alert-1',
        refresh: 'true',
        document: { 'source.ip': '1.2.3.4', 'destination.ip': '10.0.0.1' },
      });
      await es.index({
        index: alertIndex,
        id: 'ext-alert-2',
        refresh: 'true',
        document: { 'source.ip': '5.6.7.8' },
      });
      await es.index({
        index: alertIndex,
        id: 'ext-alert-no-ecs',
        refresh: 'true',
        document: { message: 'no ECS fields here', severity: 'high' },
      });
    });

    after(async () => {
      await es.indices.delete({ index: alertIndex, ignore_unavailable: true });
    });

    afterEach(async () => {
      await deleteAllCaseItems(es);
    });

    describe('with extractObservables: true', () => {
      it('auto-extracts source.ip and destination.ip from an alert attachment', async () => {
        const theCase = await createCase(
          supertest,
          getPostCaseRequest({ settings: { syncAlerts: false, extractObservables: true } })
        );

        expect(theCase.observables).to.eql([]);

        await bulkCreateAttachments({
          supertest,
          caseId: theCase.id,
          params: [
            {
              type: AttachmentType.alert,
              alertId: 'ext-alert-1',
              index: alertIndex,
              rule: { id: 'rule-1', name: 'Rule 1' },
              owner: 'securitySolutionFixture',
            },
          ],
          expectedHttpCode: 200,
        });

        const refreshedCase = await getCase({ supertest, caseId: theCase.id });

        expect(refreshedCase.observables.length).to.be(2);
        expect(
          refreshedCase.observables.some(
            (o) => o.typeKey === OBSERVABLE_TYPE_IPV4.key && o.value === '1.2.3.4'
          )
        ).to.be(true);
        expect(
          refreshedCase.observables.some(
            (o) => o.typeKey === OBSERVABLE_TYPE_IPV4.key && o.value === '10.0.0.1'
          )
        ).to.be(true);
      });

      it('deduplicates observables when the same alert is attached more than once', async () => {
        const theCase = await createCase(
          supertest,
          getPostCaseRequest({ settings: { syncAlerts: false, extractObservables: true } })
        );

        // First attachment: produces source.ip 5.6.7.8
        await bulkCreateAttachments({
          supertest,
          caseId: theCase.id,
          params: [
            {
              type: AttachmentType.alert,
              alertId: 'ext-alert-2',
              index: alertIndex,
              rule: { id: 'rule-1', name: 'Rule 1' },
              owner: 'securitySolutionFixture',
            },
          ],
          expectedHttpCode: 200,
        });

        // Second attachment of the same alert: observable already exists, no new SO write
        await bulkCreateAttachments({
          supertest,
          caseId: theCase.id,
          params: [
            {
              type: AttachmentType.alert,
              alertId: 'ext-alert-2',
              index: alertIndex,
              rule: { id: 'rule-1', name: 'Rule 1' },
              owner: 'securitySolutionFixture',
            },
          ],
          expectedHttpCode: 200,
        });

        const refreshedCase = await getCase({ supertest, caseId: theCase.id });

        // Should only have one observable despite two attachments of the same alert
        expect(refreshedCase.observables.length).to.be(1);
        expect(refreshedCase.observables[0].value).to.be('5.6.7.8');
      });

      it('skips extraction gracefully when the alert doc has no ECS observable fields', async () => {
        const theCase = await createCase(
          supertest,
          getPostCaseRequest({ settings: { syncAlerts: false, extractObservables: true } })
        );

        // The attachment creation itself must succeed (extraction never throws)
        await bulkCreateAttachments({
          supertest,
          caseId: theCase.id,
          params: [
            {
              type: AttachmentType.alert,
              alertId: 'ext-alert-no-ecs',
              index: alertIndex,
              rule: { id: 'rule-1', name: 'Rule 1' },
              owner: 'securitySolutionFixture',
            },
          ],
          expectedHttpCode: 200,
        });

        const refreshedCase = await getCase({ supertest, caseId: theCase.id });
        // No observables — alert doc had no ECS fields
        expect(refreshedCase.observables).to.eql([]);
      });

      it('merges observables from multiple alerts in the same bulkCreate call', async () => {
        const theCase = await createCase(
          supertest,
          getPostCaseRequest({ settings: { syncAlerts: false, extractObservables: true } })
        );

        await bulkCreateAttachments({
          supertest,
          caseId: theCase.id,
          params: [
            {
              type: AttachmentType.alert,
              alertId: 'ext-alert-1',
              index: alertIndex,
              rule: { id: 'rule-1', name: 'Rule 1' },
              owner: 'securitySolutionFixture',
            },
            {
              type: AttachmentType.alert,
              alertId: 'ext-alert-2',
              index: alertIndex,
              rule: { id: 'rule-2', name: 'Rule 2' },
              owner: 'securitySolutionFixture',
            },
          ],
          expectedHttpCode: 200,
        });

        const refreshedCase = await getCase({ supertest, caseId: theCase.id });

        // ext-alert-1 contributes source.ip 1.2.3.4 + destination.ip 10.0.0.1,
        // ext-alert-2 contributes source.ip 5.6.7.8 → 3 distinct observables total
        expect(refreshedCase.observables.length).to.be(3);
      });
    });

    describe('with extractObservables: false', () => {
      it('does not extract observables when the setting is disabled', async () => {
        const theCase = await createCase(
          supertest,
          getPostCaseRequest({ settings: { syncAlerts: false, extractObservables: false } })
        );

        await bulkCreateAttachments({
          supertest,
          caseId: theCase.id,
          params: [
            {
              type: AttachmentType.alert,
              alertId: 'ext-alert-1',
              index: alertIndex,
              rule: { id: 'rule-1', name: 'Rule 1' },
              owner: 'securitySolutionFixture',
            },
          ],
          expectedHttpCode: 200,
        });

        const refreshedCase = await getCase({ supertest, caseId: theCase.id });
        expect(refreshedCase.observables).to.eql([]);
      });
    });
  });
};
