/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import {
  SECURITY_ALERT_ATTACHMENT_TYPE,
  SECURITY_ATTACK_ATTACHMENT_TYPE,
} from '@kbn/cases-plugin/common/constants';
import { CaseStatuses } from '@kbn/cases-plugin/common/types/domain';
import { ALERT_WORKFLOW_REASON, ALERT_WORKFLOW_STATUS } from '@kbn/rule-data-utils';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { getPostCaseRequest } from '../../../../common/lib/mock';
import {
  bulkCreateAttachments,
  createCase,
  deleteAllCaseItems,
  updateCase,
} from '../../../../common/lib/api';

const OWNER = 'securitySolutionFixture';

/**
 * Stand-ins for `alerts-security.attack.discovery.alerts` and
 * `.alerts-security.alerts-default`. The status sync is index-agnostic — it writes to
 * whatever index the attachment's `metadata.index` names — so plain test indices exercise
 * the same code path without depending on the detection engine's index templates.
 */
const ATTACK_INDEX = 'test-cases-attack-discovery-alerts';
const ALERT_INDEX = 'test-cases-attack-constituent-alerts';

export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const es = getService('es');

  describe('Attack attachments — case status sync', () => {
    const attackId = 'attack-doc-1';
    const alertIds = ['attack-alert-1', 'attack-alert-2'];

    const attackAttachment = {
      type: SECURITY_ATTACK_ATTACHMENT_TYPE,
      owner: OWNER,
      attachmentId: attackId,
      metadata: {
        title: 'Credential harvesting followed by lateral movement',
        summaryMarkdown: 'An adversary harvested credentials and moved laterally.',
        riskScore: 73,
        alertCount: alertIds.length,
        entityCount: 2,
        index: ATTACK_INDEX,
      },
    };

    const alertAttachments = alertIds.map((alertId) => ({
      type: SECURITY_ALERT_ATTACHMENT_TYPE,
      owner: OWNER,
      attachmentId: alertId,
      metadata: {
        index: ALERT_INDEX,
        rule: { id: 'attack-rule-id', name: 'attack rule' },
      },
    }));

    const indexDetectionDocs = async () => {
      await Promise.all([
        es.index({
          index: ATTACK_INDEX,
          id: attackId,
          document: {
            '@timestamp': new Date().toISOString(),
            [ALERT_WORKFLOW_STATUS]: 'open',
          },
        }),
        ...alertIds.map((alertId) =>
          es.index({
            index: ALERT_INDEX,
            id: alertId,
            document: {
              '@timestamp': new Date().toISOString(),
              [ALERT_WORKFLOW_STATUS]: 'open',
            },
          })
        ),
      ]);

      await es.indices.refresh({ index: [ATTACK_INDEX, ALERT_INDEX] });
    };

    const getWorkflowFields = async (index: string, id: string) => {
      // The sync runs `_update_by_query` with `conflicts: 'abort'`, which resolves ids through a
      // search rather than a realtime get. Refreshing before each read keeps both this assertion
      // and any follow-up status change working against the latest version, instead of aborting on
      // a conflict with a write the index has not refreshed yet.
      await es.indices.refresh({ index });
      const doc = await es.get<Record<string, string>>({ index, id });
      return {
        status: doc._source?.[ALERT_WORKFLOW_STATUS],
        reason: doc._source?.[ALERT_WORKFLOW_REASON],
      };
    };

    /**
     * Creates a case with sync on and attaches the attack plus its constituent alerts, the
     * way the Attacks page does — one `security.attack` attachment and one `security.alert`
     * attachment per de-anonymised alert.
     */
    const createCaseWithAttack = async () => {
      const postedCase = await createCase(
        supertest,
        getPostCaseRequest({
          owner: OWNER,
          settings: { syncAlerts: true, extractObservables: false },
        })
      );

      return bulkCreateAttachments({
        supertest,
        caseId: postedCase.id,
        params: [attackAttachment, ...alertAttachments],
      });
    };

    beforeEach(async () => {
      await indexDetectionDocs();
    });

    afterEach(async () => {
      await deleteAllCaseItems(es);
      await es.indices.delete({
        index: [ATTACK_INDEX, ALERT_INDEX],
        ignore_unavailable: true,
      });
    });

    it('closes the attack document and its attached alerts when the case is closed', async () => {
      const caseWithAttack = await createCaseWithAttack();

      await updateCase({
        supertest,
        params: {
          cases: [
            {
              id: caseWithAttack.id,
              version: caseWithAttack.version,
              status: CaseStatuses.closed,
              closeReason: 'true_positive',
            },
          ],
        },
      });

      const attack = await getWorkflowFields(ATTACK_INDEX, attackId);
      expect(attack.status).to.eql('closed');
      expect(attack.reason).to.eql('true_positive');

      for (const alertId of alertIds) {
        const alert = await getWorkflowFields(ALERT_INDEX, alertId);
        expect(alert.status).to.eql('closed');
        expect(alert.reason).to.eql('true_positive');
      }
    });

    it('acknowledges the attack document when the case moves to in-progress', async () => {
      const caseWithAttack = await createCaseWithAttack();

      await updateCase({
        supertest,
        params: {
          cases: [
            {
              id: caseWithAttack.id,
              version: caseWithAttack.version,
              status: CaseStatuses['in-progress'],
            },
          ],
        },
      });

      const attack = await getWorkflowFields(ATTACK_INDEX, attackId);
      expect(attack.status).to.eql('acknowledged');

      for (const alertId of alertIds) {
        const alert = await getWorkflowFields(ALERT_INDEX, alertId);
        expect(alert.status).to.eql('acknowledged');
      }
    });

    it('reopens the attack document when the case is reopened', async () => {
      const caseWithAttack = await createCaseWithAttack();

      const closedCases = await updateCase({
        supertest,
        params: {
          cases: [
            {
              id: caseWithAttack.id,
              version: caseWithAttack.version,
              status: CaseStatuses.closed,
              closeReason: 'other',
            },
          ],
        },
      });

      expect((await getWorkflowFields(ATTACK_INDEX, attackId)).status).to.eql('closed');

      await updateCase({
        supertest,
        params: {
          cases: [
            {
              id: closedCases[0].id,
              version: closedCases[0].version,
              status: CaseStatuses.open,
            },
          ],
        },
      });

      expect((await getWorkflowFields(ATTACK_INDEX, attackId)).status).to.eql('open');
    });

    it('does not sync the attack document when syncAlerts is off', async () => {
      const postedCase = await createCase(
        supertest,
        getPostCaseRequest({
          owner: OWNER,
          settings: { syncAlerts: false, extractObservables: false },
        })
      );

      const caseWithAttack = await bulkCreateAttachments({
        supertest,
        caseId: postedCase.id,
        params: [attackAttachment, ...alertAttachments],
      });

      await updateCase({
        supertest,
        params: {
          cases: [
            {
              id: caseWithAttack.id,
              version: caseWithAttack.version,
              status: CaseStatuses['in-progress'],
            },
          ],
        },
      });

      expect((await getWorkflowFields(ATTACK_INDEX, attackId)).status).to.eql('open');
    });
  });
};
