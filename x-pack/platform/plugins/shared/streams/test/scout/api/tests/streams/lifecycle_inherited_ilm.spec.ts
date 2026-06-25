/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { tags } from '@kbn/scout';
import { streamsApiTest as apiTest } from '../../fixtures';
import { COMMON_API_HEADERS } from '../../fixtures/constants';

apiTest.describe(
  'Stream lifecycle - inherited ILM config API (classic)',
  { tag: tags.stateful.classic },
  () => {
    const ilmClassic = {
      dataStreamName: 'logs-lci-ilm-classic',
      templateName: 'lci-ilm-classic-template',
      policyName: 'lci-ilm-classic-policy',
    } as const;

    async function createIlmClassicFixture(esClient: EsClient): Promise<void> {
      await esClient.ilm.putLifecycle({
        name: ilmClassic.policyName,
        policy: {
          phases: {
            hot: { actions: { rollover: { max_age: '30d' } } },
            delete: { min_age: '90d', actions: { delete: {} } },
          },
        },
      });

      await esClient.indices.putIndexTemplate({
        name: ilmClassic.templateName,
        index_patterns: [`${ilmClassic.dataStreamName}*`],
        data_stream: {},
        priority: 500,
        template: {
          settings: {
            'index.lifecycle.name': ilmClassic.policyName,
            'index.lifecycle.prefer_ilm': true,
          },
        },
      });

      await esClient.indices.createDataStream({ name: ilmClassic.dataStreamName });
    }

    async function cleanupIlmClassicFixture(esClient: EsClient): Promise<void> {
      await esClient.indices.deleteDataStream({ name: ilmClassic.dataStreamName });
      await esClient.indices.deleteIndexTemplate({ name: ilmClassic.templateName });
      await esClient.ilm.deleteLifecycle({ name: ilmClassic.policyName });
    }

    apiTest.afterEach(async ({ esClient }) => {
      await cleanupIlmClassicFixture(esClient);
    });

    apiTest(
      'returns the ILM policy a classic stream would inherit from its index template',
      async ({ apiClient, samlAuth, esClient }) => {
        const { cookieHeader } = await samlAuth.asStreamsAdmin();

        await createIlmClassicFixture(esClient);

        const { statusCode, body } = await apiClient.get(
          `internal/streams/${ilmClassic.dataStreamName}/lifecycle/_inherited`,
          {
            headers: { ...COMMON_API_HEADERS, ...cookieHeader },
            responseType: 'json',
          }
        );

        expect(statusCode).toBe(200);

        expect(body.lifecycle.ilm).toBeDefined();
        expect(body.lifecycle.ilm.policy).toBe(ilmClassic.policyName);
        expect(body.lifecycle.dsl).toBeUndefined();
      }
    );
  }
);
