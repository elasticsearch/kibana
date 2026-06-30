/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';

import {
  ALERT_ATTACK_DISCOVERY_ALERT_IDS,
  ATTACK_DISCOVERY_ADHOC_ALERTS_COMMON_INDEX_PREFIX,
} from '@kbn/elastic-assistant-common';
import { ALERT_WORKFLOW_REASON, ALERT_WORKFLOW_STATUS } from '@kbn/rule-data-utils';
import {
  API_VERSIONS,
  DETECTION_ENGINE_ATTACKS_STATUS_URL,
  DETECTION_ENGINE_ATTACKS_SEARCH_URL,
} from '@kbn/security-solution-plugin/common/constants';
import { ELASTIC_HTTP_VERSION_HEADER } from '@kbn/core-http-common';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import { getSimpleAttackAlertsQuery } from '../../../unified_alerts/utils/queries';

const DETECTION_ALERTS_INDEX = '.alerts-security.alerts-default';
const ADHOC_ATTACK_INDEX = `${ATTACK_DISCOVERY_ADHOC_ALERTS_COMMON_INDEX_PREFIX}-default`;

// Purpose-built docs so the cascade can be verified deterministically: an ad-hoc
// attack alert whose related alert ids reference a known detection alert.
const CASCADE_DETECTION_ALERT_ID = 'ftr-cascade-detection-alert';
const CASCADE_ADHOC_ATTACK_ID = 'ftr-cascade-adhoc-attack';

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const es = getService('es');

  describe('@ess @serverless @skipInServerlessMKI Set Attacks Workflow Status', () => {
    const setStatus = (body: Record<string, unknown>) =>
      supertest
        .post(DETECTION_ENGINE_ATTACKS_STATUS_URL)
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, API_VERSIONS.public.v1)
        .send(body);

    const getAttackHits = async (ids?: string[]) => {
      const { body } = await supertest
        .post(DETECTION_ENGINE_ATTACKS_SEARCH_URL)
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, API_VERSIONS.public.v1)
        .send(
          ids === undefined
            ? getSimpleAttackAlertsQuery()
            : { query: { bool: { filter: { terms: { _id: ids } } } } }
        )
        .expect(200);
      return body.hits.hits as Array<{ _id: string; _source: Record<string, unknown> }>;
    };

    const getDetectionAlertStatus = async (id: string): Promise<string | undefined> => {
      const result = await es.get<Record<string, unknown>>({ index: DETECTION_ALERTS_INDEX, id });
      return result._source?.[ALERT_WORKFLOW_STATUS] as string | undefined;
    };

    before(async () => {
      await es.index({
        index: DETECTION_ALERTS_INDEX,
        id: CASCADE_DETECTION_ALERT_ID,
        refresh: true,
        document: {
          [ALERT_WORKFLOW_STATUS]: 'open',
          'kibana.alert.rule.rule_type_id': 'siem.queryRule',
        },
      });
      await es.index({
        index: ADHOC_ATTACK_INDEX,
        id: CASCADE_ADHOC_ATTACK_ID,
        refresh: true,
        document: {
          [ALERT_WORKFLOW_STATUS]: 'open',
          'kibana.alert.rule.rule_type_id': 'attack-discovery',
          [ALERT_ATTACK_DISCOVERY_ALERT_IDS]: [CASCADE_DETECTION_ALERT_ID],
        },
      });
    });

    after(async () => {
      await es.deleteByQuery({
        index: [DETECTION_ALERTS_INDEX, ADHOC_ATTACK_INDEX],
        refresh: true,
        ignore_unavailable: true,
        query: { ids: { values: [CASCADE_DETECTION_ALERT_ID, CASCADE_ADHOC_ATTACK_ID] } },
      });
    });

    it('updates the workflow status of attack alerts', async () => {
      const [attack] = await getAttackHits();

      const { body } = await setStatus({ ids: [attack._id], status: 'acknowledged' }).expect(200);
      expect(body.updated).toBeGreaterThan(0);

      const [updated] = await getAttackHits([attack._id]);
      expect(updated._source[ALERT_WORKFLOW_STATUS]).toEqual('acknowledged');
    });

    it('updates the workflow status of an ad-hoc attack alert', async () => {
      await setStatus({ ids: [CASCADE_ADHOC_ATTACK_ID], status: 'acknowledged' }).expect(200);

      const [updated] = await getAttackHits([CASCADE_ADHOC_ATTACK_ID]);
      expect(updated._source[ALERT_WORKFLOW_STATUS]).toEqual('acknowledged');
    });

    it('cascades the status to related detection alerts when update_related_alerts is true', async () => {
      await setStatus({
        ids: [CASCADE_ADHOC_ATTACK_ID],
        status: 'closed',
        update_related_alerts: true,
      }).expect(200);

      const [attack] = await getAttackHits([CASCADE_ADHOC_ATTACK_ID]);
      expect(attack._source[ALERT_WORKFLOW_STATUS]).toEqual('closed');
      expect(await getDetectionAlertStatus(CASCADE_DETECTION_ALERT_ID)).toEqual('closed');
    });

    it('does not touch related detection alerts when update_related_alerts is false', async () => {
      await es.update({
        index: DETECTION_ALERTS_INDEX,
        id: CASCADE_DETECTION_ALERT_ID,
        refresh: true,
        doc: { [ALERT_WORKFLOW_STATUS]: 'open' },
      });

      await setStatus({ ids: [CASCADE_ADHOC_ATTACK_ID], status: 'acknowledged' }).expect(200);

      expect(await getDetectionAlertStatus(CASCADE_DETECTION_ALERT_ID)).toEqual('open');
    });

    it('applies the closing reason when closing attacks', async () => {
      const [attack] = await getAttackHits();

      await setStatus({ ids: [attack._id], status: 'closed', reason: 'false_positive' }).expect(
        200
      );

      const [updated] = await getAttackHits([attack._id]);
      expect(updated._source[ALERT_WORKFLOW_STATUS]).toEqual('closed');
      expect(updated._source[ALERT_WORKFLOW_REASON]).toEqual('false_positive');
    });

    it('silently filters unknown attack ids without failing', async () => {
      const [attack] = await getAttackHits();

      const { body } = await setStatus({
        ids: [attack._id, 'this-attack-id-does-not-exist'],
        status: 'acknowledged',
      }).expect(200);

      expect(body.updated).toBeGreaterThan(0);
    });

    it('rejects an empty ids array with a 400', async () => {
      await setStatus({ ids: [], status: 'open' }).expect(400);
    });
  });
};
