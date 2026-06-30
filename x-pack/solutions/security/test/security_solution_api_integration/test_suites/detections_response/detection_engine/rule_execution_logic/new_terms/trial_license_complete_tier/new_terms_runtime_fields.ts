/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import type { NewTermsRuleCreateProps } from '@kbn/security-solution-plugin/common/api/detection_engine';
import { getCreateNewTermsRulesSchemaMock } from '@kbn/security-solution-plugin/common/api/detection_engine/model/rule_schema/mocks';

import { deleteAllRules, deleteAllAlerts } from '@kbn/detections-response-ftr-services';
import { getPreviewAlerts, previewRule, dataGeneratorFactory } from '../../../../utils';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';

const RUNTIME_FIELD_INDEX = 'new-terms-runtime-field-test';
const RUNTIME_FIELD_DATA_VIEW_ID = 'new-terms-runtime-field-data-view';

const historicalWindowStart = '2022-10-13T05:00:04.000Z';
const ruleExecutionStart = '2022-10-19T05:00:04.000Z';
const recentDocTimestamp = '2022-10-19T05:00:05.000Z';

/**
 * These tests cover new terms rules whose `new_terms_fields` is a runtime field defined on the
 * Kibana data view (`runtimeFieldMap`), rather than in the Elasticsearch index mapping.
 *
 * ES|QL can only read runtime fields that are part of the index mapping; it has no way to accept
 * request-level runtime definitions, so a data-view runtime field would resolve to an
 * `Unknown column` error. To keep these fields supported, the executor detects when a
 * `new_terms_field` is a data-view runtime field (present in `runtimeMappings`) and falls back to
 * the aggregation approach, which injects `runtimeMappings` into every search.
 *
 * The assertions below verify that fallback: alerts are produced for data-view runtime fields,
 * matching the aggregation path's behavior.
 */
export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const es = getService('es');
  const log = getService('log');

  const { indexListOfDocuments } = dataGeneratorFactory({
    es,
    index: RUNTIME_FIELD_INDEX,
    log,
  });

  const indexMappings: MappingTypeMapping = {
    properties: {
      '@timestamp': { type: 'date' },
      host: {
        properties: {
          name: { type: 'keyword' },
        },
      },
    },
  };

  // `host_name_runtime` only exists on the data view, derived from the indexed `host.name`.
  const createRuntimeFieldDataView = async () => {
    await supertest
      .post(`/api/data_views/data_view`)
      .set('kbn-xsrf', 'true')
      .send({
        data_view: {
          id: RUNTIME_FIELD_DATA_VIEW_ID,
          title: RUNTIME_FIELD_INDEX,
          name: RUNTIME_FIELD_DATA_VIEW_ID,
          timeFieldName: '@timestamp',
          runtimeFieldMap: {
            host_name_runtime: {
              type: 'keyword',
              script: { source: `emit(doc['host.name'].value)` },
            },
          },
        },
      })
      .expect(200);
  };

  const deleteRuntimeFieldDataView = async () => {
    await supertest
      .delete(`/api/data_views/data_view/${RUNTIME_FIELD_DATA_VIEW_ID}`)
      .set('kbn-xsrf', 'true');
  };

  describe('@ess @serverless @serverlessQA New terms ES|QL approach - data view runtime fields', () => {
    before(async () => {
      await es.indices.delete({ index: RUNTIME_FIELD_INDEX, ignore_unavailable: true });
      await es.indices.create({ index: RUNTIME_FIELD_INDEX, mappings: indexMappings });

      // Historical: host-0, host-1. Recent: host-0 (known), host-new (NEW).
      const historicalDocs = [
        { '@timestamp': '2022-10-14T05:00:04.000Z', host: { name: 'host-0' } },
        { '@timestamp': '2022-10-14T05:00:04.000Z', host: { name: 'host-1' } },
      ];
      const recentDocs = [
        { '@timestamp': recentDocTimestamp, host: { name: 'host-0' } },
        { '@timestamp': recentDocTimestamp, host: { name: 'host-new' } },
      ];

      await indexListOfDocuments([...historicalDocs, ...recentDocs]);
      await createRuntimeFieldDataView();
    });

    after(async () => {
      await es.indices.delete({ index: RUNTIME_FIELD_INDEX, ignore_unavailable: true });
      await deleteRuntimeFieldDataView();
      await deleteAllAlerts(supertest, log, es);
      await deleteAllRules(supertest, log);
    });

    it('sanity check: an indexed field resolved through the data view works correctly', async () => {
      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        index: undefined,
        data_view_id: RUNTIME_FIELD_DATA_VIEW_ID,
        new_terms_fields: ['host.name'],
        from: ruleExecutionStart,
        history_window_start: historicalWindowStart,
      };

      const { previewId, logs } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });

      expect(logs[0].errors).toEqual([]);
      expect(previewAlerts.length).toEqual(1);
      expect(previewAlerts[0]._source?.['kibana.alert.new_terms']).toEqual(['host-new']);
    });

    it('detects a new value of a data-view runtime field - host_name_runtime "host-new"', async () => {
      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        index: undefined,
        data_view_id: RUNTIME_FIELD_DATA_VIEW_ID,
        new_terms_fields: ['host_name_runtime'],
        from: ruleExecutionStart,
        history_window_start: historicalWindowStart,
      };

      const { previewId, logs } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });

      expect(logs[0].errors).toEqual([]);
      expect(previewAlerts.length).toEqual(1);
      expect(previewAlerts[0]._source?.['kibana.alert.new_terms']).toEqual(['host-new']);
    });

    it('detects a new combination when one field is a data-view runtime field - host.name + host_name_runtime', async () => {
      const rule: NewTermsRuleCreateProps = {
        ...getCreateNewTermsRulesSchemaMock('rule-1', true),
        index: undefined,
        data_view_id: RUNTIME_FIELD_DATA_VIEW_ID,
        new_terms_fields: ['host.name', 'host_name_runtime'],
        from: ruleExecutionStart,
        history_window_start: historicalWindowStart,
      };

      const { previewId, logs } = await previewRule({ supertest, rule });
      const previewAlerts = await getPreviewAlerts({ es, previewId });

      expect(logs[0].errors).toEqual([]);
      expect(previewAlerts.length).toEqual(1);
      expect(previewAlerts[0]._source?.['kibana.alert.new_terms']).toEqual([
        'host-new',
        'host-new',
      ]);
    });
  });
};
