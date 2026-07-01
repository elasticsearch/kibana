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
import {
  API_VERSIONS,
  DETECTION_ENGINE_ATTACKS_TAGS_URL,
  DETECTION_ENGINE_ATTACKS_SEARCH_URL,
} from '@kbn/security-solution-plugin/common/constants';
import { ELASTIC_HTTP_VERSION_HEADER } from '@kbn/core-http-common';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import { getSimpleAttackAlertsQuery } from '../../../unified_alerts/utils/queries';

const DETECTION_ALERTS_INDEX = '.alerts-security.alerts-default';
const ADHOC_ATTACK_INDEX = `${ATTACK_DISCOVERY_ADHOC_ALERTS_COMMON_INDEX_PREFIX}-default`;
const WORKFLOW_TAGS_FIELD = 'kibana.alert.workflow_tags';

// Purpose-built docs so the cascade can be verified deterministically: an ad-hoc
// attack alert whose related alert ids reference a known detection alert.
const CASCADE_DETECTION_ALERT_ID = 'ftr-cascade-tags-detection-alert';
const CASCADE_ADHOC_ATTACK_ID = 'ftr-cascade-tags-adhoc-attack';

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const es = getService('es');

  describe('@ess @serverless @skipInServerlessMKI Set Attacks Tags', () => {
    const setTags = (body: Record<string, unknown>) =>
      supertest
        .post(DETECTION_ENGINE_ATTACKS_TAGS_URL)
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

    const getDetectionAlertTags = async (id: string): Promise<string[]> => {
      const result = await es.get<Record<string, unknown>>({ index: DETECTION_ALERTS_INDEX, id });
      const tags = result._source?.[WORKFLOW_TAGS_FIELD];
      return Array.isArray(tags) ? (tags as string[]) : [];
    };

    before(async () => {
      await es.index({
        index: DETECTION_ALERTS_INDEX,
        id: CASCADE_DETECTION_ALERT_ID,
        refresh: true,
        document: {
          [WORKFLOW_TAGS_FIELD]: [],
          'kibana.alert.rule.rule_type_id': 'siem.queryRule',
        },
      });
      await es.index({
        index: ADHOC_ATTACK_INDEX,
        id: CASCADE_ADHOC_ATTACK_ID,
        refresh: true,
        document: {
          [WORKFLOW_TAGS_FIELD]: [],
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

    it('adds tags to attack alerts', async () => {
      const [attack] = await getAttackHits();

      const { body } = await setTags({
        ids: [attack._id],
        tags: { tags_to_add: ['attack-tag-1'], tags_to_remove: [] },
      }).expect(200);
      expect(body.updated).toBeGreaterThan(0);

      const [updated] = await getAttackHits([attack._id]);
      expect(updated._source[WORKFLOW_TAGS_FIELD]).toContain('attack-tag-1');
    });

    it('removes tags from attack alerts', async () => {
      const [attack] = await getAttackHits();

      await setTags({
        ids: [attack._id],
        tags: { tags_to_add: ['tag-to-remove'], tags_to_remove: [] },
      }).expect(200);

      await setTags({
        ids: [attack._id],
        tags: { tags_to_add: [], tags_to_remove: ['tag-to-remove'] },
      }).expect(200);

      const [updated] = await getAttackHits([attack._id]);
      expect(updated._source[WORKFLOW_TAGS_FIELD] ?? []).not.toContain('tag-to-remove');
    });

    it('adds tags to an ad-hoc attack alert', async () => {
      await setTags({
        ids: [CASCADE_ADHOC_ATTACK_ID],
        tags: { tags_to_add: ['adhoc-attack-tag'], tags_to_remove: [] },
      }).expect(200);

      const [updated] = await getAttackHits([CASCADE_ADHOC_ATTACK_ID]);
      expect(updated._source[WORKFLOW_TAGS_FIELD]).toContain('adhoc-attack-tag');
    });

    it('cascades tags to related detection alerts when update_related_alerts is true', async () => {
      await setTags({
        ids: [CASCADE_ADHOC_ATTACK_ID],
        tags: { tags_to_add: ['cascade-tag'], tags_to_remove: [] },
        update_related_alerts: true,
      }).expect(200);

      const [attack] = await getAttackHits([CASCADE_ADHOC_ATTACK_ID]);
      expect(attack._source[WORKFLOW_TAGS_FIELD]).toContain('cascade-tag');
      expect(await getDetectionAlertTags(CASCADE_DETECTION_ALERT_ID)).toContain('cascade-tag');
    });

    it('does not touch related detection alerts when update_related_alerts is false', async () => {
      await es.update({
        index: DETECTION_ALERTS_INDEX,
        id: CASCADE_DETECTION_ALERT_ID,
        refresh: true,
        doc: { [WORKFLOW_TAGS_FIELD]: [] },
      });

      await setTags({
        ids: [CASCADE_ADHOC_ATTACK_ID],
        tags: { tags_to_add: ['attack-only-tag'], tags_to_remove: [] },
      }).expect(200);

      expect(await getDetectionAlertTags(CASCADE_DETECTION_ALERT_ID)).toEqual([]);
    });

    it('silently filters unknown attack ids without failing', async () => {
      const [attack] = await getAttackHits();

      const { body } = await setTags({
        ids: [attack._id, 'this-attack-id-does-not-exist'],
        tags: { tags_to_add: ['filtered-tag'], tags_to_remove: [] },
      }).expect(200);

      expect(body.updated).toBeGreaterThan(0);
    });

    it('rejects duplicate tags in add and remove arrays with a 400', async () => {
      const [attack] = await getAttackHits();

      await setTags({
        ids: [attack._id],
        tags: { tags_to_add: ['duplicate-tag'], tags_to_remove: ['duplicate-tag'] },
      }).expect(400);
    });

    it('rejects an empty ids array with a 400', async () => {
      await setTags({
        ids: [],
        tags: { tags_to_add: ['tag'], tags_to_remove: [] },
      }).expect(400);
    });
  });
};
