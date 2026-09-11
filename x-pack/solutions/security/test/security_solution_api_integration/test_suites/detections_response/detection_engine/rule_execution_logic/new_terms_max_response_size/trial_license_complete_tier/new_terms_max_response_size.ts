/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import { ALERT_RULE_UUID } from '@kbn/rule-data-utils';
import { ALERT_NEW_TERMS } from '@kbn/security-solution-plugin/common/field_maps/field_names';
import type { NewTermsRuleCreateProps } from '@kbn/security-solution-plugin/common/api/detection_engine';
import { getCreateNewTermsRulesSchemaMock } from '@kbn/security-solution-plugin/common/api/detection_engine/model/rule_schema/mocks';
import {
  createRule,
  deleteAllRules,
  deleteAllAlerts,
  waitFor,
  waitForRulePartialFailure,
  waitForRuleSuccess,
} from '@kbn/detections-response-ftr-services';
import { dataGeneratorFactory, fetchRule } from '../../../../utils';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import { ELASTICSEARCH_MAX_RESPONSE_SIZE_BYTES } from './max_response_size';

const INDEX = 'new_terms_large_documents';
const ALERTS_INDEX = '.alerts-security.alerts-default';
const NEW_TERMS_COUNT = 200;
// every bucket of the document fetch response carries the full document, so the response size is roughly
// NEW_TERMS_COUNT * DOCUMENT_SIZE_BYTES, which is twice the configured `elasticsearch.maxResponseSize`
const DOCUMENT_SIZE_BYTES = Math.ceil(
  (ELASTICSEARCH_MAX_RESPONSE_SIZE_BYTES * 2) / NEW_TERMS_COUNT
);
const NEW_TERMS = Array.from({ length: NEW_TERMS_COUNT }, (_, index) => `value-${index}`);
const MAX_RESPONSE_SIZE_WARNING = 'exceeded the "elasticsearch.maxResponseSize" limit';

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const es = getService('es');
  const log = getService('log');
  const { indexListOfDocuments } = dataGeneratorFactory({ es, index: INDEX, log });

  describe('@ess @serverless @skipInServerlessMKI New terms rule type, responses exceeding elasticsearch.maxResponseSize', () => {
    before(async () => {
      await es.indices.create({
        index: INDEX,
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            terms_field: { type: 'keyword' },
            other_field: { type: 'keyword' },
            content: { type: 'text', index: false },
          },
        },
      });
    });

    after(async () => {
      await es.indices.delete({ index: INDEX });
    });

    beforeEach(async () => {
      await es.deleteByQuery({ index: INDEX, query: { match_all: {} }, refresh: true });
    });

    afterEach(async () => {
      await deleteAllAlerts(supertest, log, es);
      await deleteAllRules(supertest, log);
    });

    const getRule = (newTermsFields: string[]): NewTermsRuleCreateProps => ({
      ...getCreateNewTermsRulesSchemaMock('rule-1', true),
      index: [INDEX],
      new_terms_fields: newTermsFields,
      from: 'now-6m',
      history_window_start: 'now-7d',
      max_signals: NEW_TERMS_COUNT * 2,
    });

    const indexDocument = async (content: string) => {
      await indexListOfDocuments([
        {
          '@timestamp': new Date().toISOString(),
          terms_field: NEW_TERMS,
          other_field: 'constant',
          content,
        },
      ]);
    };

    /**
     * Alerts are read directly from Elasticsearch with a limited `_source` because every alert embeds the large
     * source document, so fetching them through the Kibana alerts API would hit the same response size limit.
     */
    const getNewTermsOfAlerts = async (ruleId: string) => {
      const searchAlerts = () =>
        es.search<Record<string, string[]>>({
          index: ALERTS_INDEX,
          size: NEW_TERMS_COUNT * 2,
          _source: [ALERT_NEW_TERMS],
          query: { term: { [ALERT_RULE_UUID]: ruleId } },
        });

      await waitFor(
        async () => {
          await es.indices.refresh({ index: ALERTS_INDEX });

          const alerts = await searchAlerts();

          return alerts.hits.hits.length >= NEW_TERMS_COUNT;
        },
        'waitForNewTermsAlerts',
        log
      );

      const alerts = await searchAlerts();

      return alerts.hits.hits.map((hit) => hit._source?.[ALERT_NEW_TERMS]).sort();
    };

    it('creates an alert per new term of a single field when the document fetch response exceeds the limit', async () => {
      await indexDocument('x'.repeat(DOCUMENT_SIZE_BYTES));

      const { id } = await createRule(supertest, log, getRule(['terms_field']));

      await waitForRulePartialFailure({ supertest, log, id });

      const { execution_summary: executionSummary } = await fetchRule(supertest, { id });

      expect(executionSummary?.last_execution.message).toContain(MAX_RESPONSE_SIZE_WARNING);
      expect(await getNewTermsOfAlerts(id)).toEqual(NEW_TERMS.map((term) => [term]).sort());
    });

    it('creates an alert per new term of multiple fields when the document fetch response exceeds the limit', async () => {
      await indexDocument('x'.repeat(DOCUMENT_SIZE_BYTES));

      const { id } = await createRule(supertest, log, getRule(['terms_field', 'other_field']));

      await waitForRulePartialFailure({ supertest, log, id });

      const { execution_summary: executionSummary } = await fetchRule(supertest, { id });

      expect(executionSummary?.last_execution.message).toContain(MAX_RESPONSE_SIZE_WARNING);
      expect(await getNewTermsOfAlerts(id)).toEqual(
        NEW_TERMS.map((term) => [term, 'constant']).sort()
      );
    });

    it('succeeds without a warning when the document fetch response fits into the limit', async () => {
      await indexDocument('small');

      const { id } = await createRule(supertest, log, getRule(['terms_field']));

      await waitForRuleSuccess({ supertest, log, id });

      const { execution_summary: executionSummary } = await fetchRule(supertest, { id });

      expect(executionSummary?.last_execution.message).not.toContain(MAX_RESPONSE_SIZE_WARNING);
      expect(await getNewTermsOfAlerts(id)).toEqual(NEW_TERMS.map((term) => [term]).sort());
    });
  });
};
