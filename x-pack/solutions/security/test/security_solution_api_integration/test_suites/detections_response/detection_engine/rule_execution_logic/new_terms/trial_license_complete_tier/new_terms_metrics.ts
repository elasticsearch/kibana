/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import { createRule, deleteAllRules, deleteAllAlerts } from '@kbn/detections-response-ftr-services';
import {
  dataGeneratorFactory,
  getLatestSecurityRuleExecutionMetricsFromEventLog,
  getOpenAlerts,
} from '../../../../utils';
import { getNewTermsRuleParams } from '../../../../utils/rules/get_rule_params';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const es = getService('es');
  const log = getService('log');
  const config = getService('config');
  // Alert suppression requires at least a platinum license, so suppression-dependent assertions
  // are skipped when this suite runs under a basic license (aggregation-path tier).
  const isBasicLicense = config.get('esTestCluster.license') === 'basic';
  const itWithSuppression = isBasicLicense ? it.skip : it;
  const { indexListOfDocuments } = dataGeneratorFactory({
    es,
    index: 'test-data-1',
    log,
  });

  describe('@ess @serverless @serverlessQA Rule execution metrics for New Terms rules', () => {
    beforeEach(async () => {
      await deleteAllAlerts(supertest, log, es);
      await deleteAllRules(supertest, log);

      await es.indices.delete({
        index: 'test-data-1,test-data-2',
        ignore_unavailable: true,
      });

      const mappings: MappingTypeMapping = {
        properties: {
          '@timestamp': {
            type: 'date',
          },
          host: {
            properties: {
              name: {
                type: 'keyword',
              },
            },
          },
        },
      };
      await es.indices.create({
        index: 'test-data-1',
        mappings,
      });
      await es.indices.create({
        index: 'test-data-2',
        mappings,
      });
    });

    describe('metrics collection', () => {
      describe('matched_indices_count', () => {
        it('records matched_indices_count for one matching index pattern', async () => {
          const timestamp = new Date().toISOString();
          const documents = [
            {
              '@timestamp': timestamp,
              host: { name: 'host-0' },
            },
            {
              '@timestamp': timestamp,
              host: { name: 'host-0' },
            },
          ];

          await indexListOfDocuments(documents);

          const createdRule = await createRule(
            supertest,
            log,
            getNewTermsRuleParams({
              index: ['test-data-1'],
              query: '*:*',
              new_terms_fields: ['host.name'],
              history_window_start: 'now-1h',
              from: 'now-35m',
              interval: '30m',
              enabled: true,
            })
          );

          const { matched_indices_count } = await getLatestSecurityRuleExecutionMetricsFromEventLog(
            es,
            log,
            createdRule.id
          );

          expect(matched_indices_count).toBe(1);
        });

        it('records matched_indices_count for a single index pattern with wildcard', async () => {
          const timestamp = new Date().toISOString();
          const documents = [
            {
              '@timestamp': timestamp,
              host: { name: 'host-0' },
            },
            {
              '@timestamp': timestamp,
              host: { name: 'host-0' },
            },
          ];

          await indexListOfDocuments(documents);

          const createdRule = await createRule(
            supertest,
            log,
            getNewTermsRuleParams({
              index: ['test-data-*'],
              query: '*:*',
              new_terms_fields: ['host.name'],
              history_window_start: 'now-1h',
              from: 'now-35m',
              interval: '30m',
              enabled: true,
            })
          );

          const { matched_indices_count } = await getLatestSecurityRuleExecutionMetricsFromEventLog(
            es,
            log,
            createdRule.id
          );

          expect(matched_indices_count).toBe(2);
        });

        it('records matched_indices_count for multiple matching index patterns', async () => {
          const timestamp = new Date().toISOString();
          const documents = [
            {
              '@timestamp': timestamp,
              host: { name: 'host-0' },
            },
            {
              '@timestamp': timestamp,
              host: { name: 'host-0' },
            },
          ];

          await indexListOfDocuments(documents);

          const createdRule = await createRule(
            supertest,
            log,
            getNewTermsRuleParams({
              index: ['test-da*', 'test-data-1', 'test-data-2'],
              query: '*:*',
              new_terms_fields: ['host.name'],
              history_window_start: 'now-1h',
              from: 'now-35m',
              interval: '30m',
              enabled: true,
            })
          );

          const { matched_indices_count } = await getLatestSecurityRuleExecutionMetricsFromEventLog(
            es,
            log,
            createdRule.id
          );

          expect(matched_indices_count).toBe(2);
        });
      });

      describe('alerts_candidate_count', () => {
        it('records alerts_candidate_count value', async () => {
          const timestamp = new Date().toISOString();
          const documents = [
            {
              '@timestamp': timestamp,
              host: { name: 'host-0' },
            },
            {
              '@timestamp': timestamp,
              host: { name: 'host-0' },
            },
          ];

          await indexListOfDocuments(documents);

          const createdRule = await createRule(
            supertest,
            log,
            getNewTermsRuleParams({
              index: ['test-data-1'],
              query: '*:*',
              new_terms_fields: ['host.name'],
              history_window_start: 'now-1h',
              from: 'now-35m',
              interval: '30m',
              enabled: true,
            })
          );

          const { alerts_candidate_count } =
            await getLatestSecurityRuleExecutionMetricsFromEventLog(es, log, createdRule.id);

          expect(alerts_candidate_count).toBe(1);
        });

        itWithSuppression(
          'records alerts_candidate_count higher than the number of suppressed alerts',
          async () => {
            const timestamp = new Date().toISOString();
            const documents = [
              {
                '@timestamp': timestamp,
                host: { name: 'host-0', ip: '1.2.3.4' },
              },
              {
                '@timestamp': timestamp,
                host: { name: 'host-0', ip: '1.2.3.4' },
              },
              {
                '@timestamp': timestamp,
                host: { name: 'host-1', ip: '1.2.3.4' },
              },
              {
                '@timestamp': timestamp,
                host: { name: 'host-1', ip: '1.2.3.4' },
              },
            ];

            await indexListOfDocuments(documents);

            const createdRule = await createRule(
              supertest,
              log,
              getNewTermsRuleParams({
                index: ['test-data-1'],
                query: '*:*',
                new_terms_fields: ['host.name'],
                history_window_start: 'now-1h',
                alert_suppression: {
                  group_by: ['host.ip'],
                  duration: {
                    value: 300,
                    unit: 'm',
                  },
                  missing_fields_strategy: 'suppress',
                },
                from: 'now-35m',
                interval: '30m',
                enabled: true,
              })
            );
            const alerts = await getOpenAlerts(supertest, log, es, createdRule);

            expect(alerts.hits.hits).toHaveLength(1);

            const { alerts_candidate_count } =
              await getLatestSecurityRuleExecutionMetricsFromEventLog(es, log, createdRule.id);

            expect(alerts_candidate_count).toBe(2);
          }
        );
      });

      describe('alerts_suppressed_count', () => {
        it('records alerts_suppressed_count as 0 when no suppression is configured', async () => {
          const timestamp = new Date().toISOString();
          const documents = [
            {
              '@timestamp': timestamp,
              host: { name: 'host-0' },
            },
          ];

          await indexListOfDocuments(documents);

          const createdRule = await createRule(
            supertest,
            log,
            getNewTermsRuleParams({
              index: ['test-data-1'],
              query: '*:*',
              new_terms_fields: ['host.name'],
              history_window_start: 'now-1h',
              from: 'now-35m',
              interval: '30m',
              enabled: true,
            })
          );
          const alerts = await getOpenAlerts(supertest, log, es, createdRule);

          expect(alerts.hits.hits).toHaveLength(1);

          const { alerts_suppressed_count } =
            await getLatestSecurityRuleExecutionMetricsFromEventLog(es, log, createdRule.id);

          expect(alerts_suppressed_count).toBe(0);
        });

        itWithSuppression(
          'records alerts_suppressed_count when alerts are suppressed',
          async () => {
            const timestamp = new Date().toISOString();
            const documents = [
              {
                '@timestamp': timestamp,
                host: { name: 'host-0', ip: '1.2.3.4' },
              },
              {
                '@timestamp': timestamp,
                host: { name: 'host-0', ip: '1.2.3.4' },
              },
              {
                '@timestamp': timestamp,
                host: { name: 'host-1', ip: '1.2.3.4' },
              },
              {
                '@timestamp': timestamp,
                host: { name: 'host-1', ip: '1.2.3.4' },
              },
            ];

            await indexListOfDocuments(documents);

            const createdRule = await createRule(
              supertest,
              log,
              getNewTermsRuleParams({
                index: ['test-data-1'],
                query: '*:*',
                new_terms_fields: ['host.name'],
                history_window_start: 'now-1h',
                alert_suppression: {
                  group_by: ['host.ip'],
                  duration: {
                    value: 300,
                    unit: 'm',
                  },
                  missing_fields_strategy: 'suppress',
                },
                from: 'now-35m',
                interval: '30m',
                enabled: true,
              })
            );
            const alerts = await getOpenAlerts(supertest, log, es, createdRule);

            expect(alerts.hits.hits).toHaveLength(1);

            const { alerts_suppressed_count } =
              await getLatestSecurityRuleExecutionMetricsFromEventLog(es, log, createdRule.id);

            expect(alerts_suppressed_count).toBe(1);
          }
        );
      });
    });
  });
};
