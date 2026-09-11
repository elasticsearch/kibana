/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import { v4 as uuidv4 } from 'uuid';
import { getEntitiesAlias, ENTITY_LATEST } from '@kbn/entity-store/common';
import { hashEuid } from '@kbn/entity-store/common/domain/euid';
import type { FtrProviderContext } from '../../../../ftr_provider_context';
import {
  EntityStoreUtils,
  cleanUpRiskScoreMaintainer,
  entityMaintainerRouteHelpersFactory,
} from '../../utils';
import { deleteAllDocuments } from '../../utils/elasticsearch_helpers';

const VULNERABILITIES_LATEST_INDEX = 'logs-cloud_security_posture.vulnerabilities_latest-default';
const VULNERABILITIES_INDEX_TEMPLATE_NAME = 'test-highlights-v2-vulnerabilities-template';
const ML_JOB_ID = 'high_count_events_for_a_host_name_ea';
const ML_ANOMALIES_SHARED_INDEX = '.ml-anomalies-shared';
const ML_ANOMALY_RECORD_ID = 'test-highlights-v2-anomaly-record';

export default ({ getService }: FtrProviderContext): void => {
  const entityAnalyticsApi = getService('entityAnalyticsApi');
  const supertest = getService('supertest');
  const es = getService('es');
  const log = getService('log');
  const kibanaServer = getService('kibanaServer');

  const entityStoreUtils = EntityStoreUtils(getService);
  const maintainerRoutes = entityMaintainerRouteHelpersFactory(supertest);

  const LATEST_ALIAS = getEntitiesAlias(ENTITY_LATEST, 'default');
  const RISK_SCORE_DATA_STREAM = 'risk-score.risk-score-default';

  const hostName = 'highlights-v2-host.example.com';
  const hostEuid = `host:${hostName}`;
  const userName = 'highlights-v2-user';
  const userEuid = `user:${userName}`;
  const unassignedHostName = 'highlights-v2-unassigned-host.example.com';
  const unassignedHostEuid = `host:${unassignedHostName}`;
  const explicitUnassignedHostName = 'highlights-v2-explicit-unassigned-host.example.com';
  const explicitUnassignedHostEuid = `host:${explicitUnassignedHostName}`;

  const hostAlertId = uuidv4();
  const userAlertId = uuidv4();

  const anonymizedFields = ['host.name', 'user.name', 'service.name', 'entity.id'];
  const notAnonymizedFields = ['_id', '@timestamp', 'asset.criticality'];
  const mockAnonymizationFields = [...anonymizedFields, ...notAnonymizedFields].map(
    (field, index) => ({
      id: index + 1 + '',
      field,
      allowed: true,
      anonymized: anonymizedFields.includes(field),
    })
  );

  const baseRequestBody = {
    anonymizationFields: mockAnonymizationFields,
    from: Date.now() - 24 * 60 * 60 * 1000 * 365 * 99, // 99 years ago
    to: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now
    connectorId: 'preconfigured-bedrock',
  };

  describe('@ess @serverless @serverlessQA Entity Details - Highlights API v2', function () {
    before(async () => {
      await kibanaServer.uiSettings.update({ 'securitySolution:defaultAnomalyScore': 1 });

      // Ensure clean state: previous tests may have left a plain index or stale data stream
      // with the same name, which would cause createDataStream to fail with a name conflict.
      // cleanUpRiskScoreMaintainer uses deleteDataStream which only removes actual data streams —
      // if a stray task manager run wrote to the index after the template was deleted, ES
      // auto-creates it as a plain index. We explicitly delete that too.
      await entityStoreUtils.cleanEngines();
      await cleanUpRiskScoreMaintainer({ es, log });
      await es.indices
        .delete({ index: RISK_SCORE_DATA_STREAM, ignore_unavailable: true })
        .catch(() => {});

      // Install the entity store. installEntityStoreV2 stops the maintainer
      // after install, so the data stream is not yet created. A single
      // synchronous maintainer run creates risk score resources before we
      // index direct test fixtures.
      await entityStoreUtils.installEntityStoreV2({
        entityTypes: ['host', 'user'],
        waitForEntities: false,
      });
      await maintainerRoutes.runMaintainerSync('risk-score');

      // Index host and user entities directly into the entity store latest index
      const entityOperations = [
        {
          index: { _index: LATEST_ALIAS, _id: hashEuid(hostEuid) },
        },
        {
          '@timestamp': new Date().toISOString(),
          entity: {
            id: hostEuid,
            EngineMetadata: { Type: 'host' },
          },
          host: {
            name: hostName,
          },
          asset: {
            criticality: 'high_impact',
          },
        },
        {
          index: { _index: LATEST_ALIAS, _id: hashEuid(userEuid) },
        },
        {
          '@timestamp': new Date().toISOString(),
          entity: {
            id: userEuid,
            EngineMetadata: { Type: 'user' },
          },
          user: {
            name: userName,
          },
          asset: {
            criticality: 'medium_impact',
          },
        },
        // Unassigned criticality: field omitted (UI shows Unassigned)
        {
          index: { _index: LATEST_ALIAS, _id: hashEuid(unassignedHostEuid) },
        },
        {
          '@timestamp': new Date().toISOString(),
          entity: {
            id: unassignedHostEuid,
            EngineMetadata: { Type: 'host' },
          },
          host: {
            name: unassignedHostName,
          },
        },
        // Unassigned criticality: field present as unassigned
        {
          index: { _index: LATEST_ALIAS, _id: hashEuid(explicitUnassignedHostEuid) },
        },
        {
          '@timestamp': new Date().toISOString(),
          entity: {
            id: explicitUnassignedHostEuid,
            EngineMetadata: { Type: 'host' },
          },
          host: {
            name: explicitUnassignedHostName,
          },
          asset: {
            criticality: 'unassigned',
          },
        },
      ];
      await es.bulk({ operations: entityOperations, refresh: true });

      // Index risk score documents directly into the risk score data stream
      const riskScoreOperations = [
        { create: { _index: RISK_SCORE_DATA_STREAM } },
        {
          '@timestamp': new Date().toISOString(),
          host: {
            name: hostEuid,
            risk: {
              id_field: 'entity.id',
              id_value: hostEuid,
              score_type: 'base',
              calculated_level: 'High',
              calculated_score: 75,
              calculated_score_norm: 75,
              category_1_score: 75,
              category_1_count: 1,
              category_2_score: 10,
              category_2_count: 0,
              criticality_level: 'high_impact',
              criticality_modifier: 2,
              notes: [],
              modifiers: [],
              inputs: [
                {
                  id: hostAlertId,
                  index: '.alerts-security.alerts-default',
                  category: 'category_1',
                  description: 'Generated alert',
                  risk_score: 50,
                  timestamp: new Date().toISOString(),
                  contribution_score: 75,
                },
              ],
            },
          },
        },
        { create: { _index: RISK_SCORE_DATA_STREAM } },
        {
          '@timestamp': new Date().toISOString(),
          user: {
            name: userEuid,
            risk: {
              id_field: 'entity.id',
              id_value: userEuid,
              score_type: 'base',
              calculated_level: 'Moderate',
              calculated_score: 45,
              calculated_score_norm: 45,
              category_1_score: 45,
              category_1_count: 1,
              category_2_score: 0,
              category_2_count: 0,
              criticality_level: 'medium_impact',
              criticality_modifier: 1.5,
              notes: [],
              modifiers: [],
              inputs: [
                {
                  id: userAlertId,
                  index: '.alerts-security.alerts-default',
                  category: 'category_1',
                  description: 'Generated alert for user',
                  risk_score: 30,
                  timestamp: new Date().toISOString(),
                  contribution_score: 45,
                },
              ],
            },
          },
        },
      ];
      await es.bulk({ operations: riskScoreOperations, refresh: true });

      // Create index template with proper field mappings before indexing vulnerability data.
      // Without the CSPM package's index template, `vulnerability.severity` gets dynamic `text`
      // mapping, which breaks the aggregation's `case_insensitive: true` term queries (keyword only).
      await es.indices.putIndexTemplate({
        name: VULNERABILITIES_INDEX_TEMPLATE_NAME,
        index_patterns: ['logs-cloud_security_posture.vulnerabilities_latest-*'],
        data_stream: {},
        priority: 500, // Higher than the default logs template (100)
        template: {
          mappings: {
            dynamic: false,
            properties: {
              '@timestamp': { type: 'date' },
              host: { properties: { name: { type: 'keyword' } } },
              vulnerability: {
                properties: {
                  severity: { type: 'keyword' },
                  score: { properties: { base: { type: 'float' } } },
                  package: {
                    properties: {
                      name: { type: 'keyword' },
                      version: { type: 'keyword' },
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Index vulnerability data matching the host entity (data streams require 'create')
      await es.bulk({
        operations: [
          { create: { _index: VULNERABILITIES_LATEST_INDEX } },
          {
            '@timestamp': new Date().toISOString(),
            host: { name: hostName },
            resource: { name: 'some-package', id: 'pkg-001' },
            result: { evaluation: 'failed' },
            vulnerability: {
              severity: 'HIGH',
              package: { name: 'vulnerable-lib', version: '1.0.0' },
              score: { base: 7.5 },
            },
          },
          { create: { _index: VULNERABILITIES_LATEST_INDEX } },
          {
            '@timestamp': new Date().toISOString(),
            host: { name: hostName },
            resource: { name: 'another-package', id: 'pkg-002' },
            result: { evaluation: 'failed' },
            vulnerability: {
              severity: 'CRITICAL',
              package: { name: 'critical-lib', version: '2.0.0' },
              score: { base: 9.8 },
            },
          },
        ],
        refresh: true,
      });

      // Create a minimal ML anomaly detector job so getJobConfig() can find it via
      // anomalyDetectorsProvider (which requires the job to exist in ES and be synced
      // to a Kibana saved object in this space).
      await es.ml
        .putJob({
          job_id: ML_JOB_ID,
          analysis_config: {
            bucket_span: '1h',
            detectors: [{ function: 'high_count', partition_field_name: 'host.name' }],
            influencers: ['host.name'],
          },
          data_description: { time_field: 'timestamp' },
          groups: ['security'],
        })
        .catch(() => {}); // ignore if job already exists
      await supertest
        .get('/api/ml/saved_objects/sync')
        .set('kbn-xsrf', 'true')
        .set('elastic-api-version', '2023-10-31')
        .expect(200); // sync ML jobs to Kibana saved objects

      // Index an anomaly record into the shared ML results index for the host entity.
      await es.bulk({
        operations: [
          { index: { _index: ML_ANOMALIES_SHARED_INDEX, _id: ML_ANOMALY_RECORD_ID } },
          {
            job_id: ML_JOB_ID,
            result_type: 'record',
            timestamp: Date.now() - 60 * 60 * 1000, // 1 hour ago, within the test time range
            bucket_span: 3600,
            detector_index: 0,
            is_interim: false,
            record_score: 85.0,
            initial_record_score: 85.0,
            probability: 0.000001,
            typical: [1.0],
            actual: [100.0],
            function: 'high_count',
            function_description: 'high_count',
            partition_field_name: 'host.name',
            partition_field_value: hostName,
            host: { name: hostName },
            influencers: [
              { influencer_field_name: 'host.name', influencer_field_values: [hostName] },
            ],
          },
        ],
        refresh: true,
      });
    });

    after(async () => {
      await entityStoreUtils.cleanEngines();
      await cleanUpRiskScoreMaintainer({ es, log });
      await es.ml.deleteJob({ job_id: ML_JOB_ID, wait_for_completion: true }).catch(() => {});
      await deleteAllDocuments(es, VULNERABILITIES_LATEST_INDEX).catch(() => {});
      await es.indices
        .deleteIndexTemplate({ name: VULNERABILITIES_INDEX_TEMPLATE_NAME })
        .catch(() => {});
      await es
        .deleteByQuery({
          index: ML_ANOMALIES_SHARED_INDEX,
          query: { ids: { values: [ML_ANOMALY_RECORD_ID] } },
          refresh: true,
        })
        .catch(() => {});
      await kibanaServer.uiSettings.update({ 'securitySolution:defaultAnomalyScore': 50 });
    });

    it('should return risk score, asset criticality, and vulnerabilities for host entity', async () => {
      const { body } = await entityAnalyticsApi
        .entityDetailsHighlights({
          body: {
            ...baseRequestBody,
            entityType: 'host' as const,
            entityIdentifier: hostEuid,
          },
        })
        .expect(200);

      // Risk score
      expect(body.summary.riskScore).toBeDefined();
      expect(body.summary.riskScore).toHaveLength(1);
      expect(body.summary.riskScore[0]).toMatchObject({
        id_field: ['entity.id'],
        score: ['75.00'],
        asset_criticality_contribution_score: '10.00',
        alert_inputs: [
          expect.objectContaining({
            risk_score: ['50.00'],
            contribution_score: ['75.00'],
          }),
        ],
      });

      // Asset criticality sourced from entity store — assigned criticality only
      expect(body.summary.assetCriticality).toBeDefined();
      expect(body.summary.assetCriticality).toHaveLength(1);
      expect(body.summary.assetCriticality[0]).toEqual({
        'asset.criticality': ['High Impact'],
      });

      // Vulnerabilities
      expect(body.summary.vulnerabilities).toBeDefined();
      expect(body.summary.vulnerabilities!.length).toBeGreaterThanOrEqual(1);
      expect(body.summary.vulnerabilitiesTotal).toMatchObject({
        HIGH: 1,
        CRITICAL: 1,
        MEDIUM: 0,
        LOW: 0,
        NONE: 0,
      });

      // Anomalies
      expect(body.summary.anomalies).toBeDefined();
      expect(body.summary.anomalies).toHaveLength(1);
      expect(body.summary.anomalies[0]).toMatchObject({
        score: 85,
        id: ML_JOB_ID,
      });

      // Prompt and replacements
      expect(body.replacements).toBeDefined();
      expect(body.prompt).toContain(
        'Generate structured information for an entity so a Security analyst can act.'
      );
    });

    it('should return risk score and asset criticality for user entity', async () => {
      const { body } = await entityAnalyticsApi
        .entityDetailsHighlights({
          body: {
            ...baseRequestBody,
            entityType: 'user' as const,
            entityIdentifier: userEuid,
          },
        })
        .expect(200);

      expect(body.summary.riskScore).toBeDefined();
      expect(body.summary.riskScore).toHaveLength(1);
      expect(body.summary.riskScore[0]).toMatchObject({
        id_field: ['entity.id'],
        score: ['45.00'],
        asset_criticality_contribution_score: '0.00',
        alert_inputs: [
          expect.objectContaining({
            risk_score: ['30.00'],
            contribution_score: ['45.00'],
          }),
        ],
      });

      expect(body.summary.assetCriticality).toBeDefined();
      expect(body.summary.assetCriticality).toHaveLength(1);
      expect(body.summary.assetCriticality[0]).toEqual({
        'asset.criticality': ['Medium Impact'],
      });

      // Vulnerabilities only apply to hosts — omitted for users so the LLM
      // does not render a zeroed-out Vulnerabilities section
      expect(body.summary.vulnerabilities).toBeUndefined();
      expect(body.summary.vulnerabilitiesTotal).toBeUndefined();

      // Anomalies are explicitly null when there are no ML findings
      expect(body.summary.anomalies).toBeNull();

      // Prompt and replacements
      expect(body.replacements).toBeDefined();
      expect(body.prompt).toContain(
        'Generate structured information for an entity so a Security analyst can act.'
      );
    });

    it('should return empty assetCriticality when criticality is unassigned', async () => {
      const { body: missingCriticalityBody } = await entityAnalyticsApi
        .entityDetailsHighlights({
          body: {
            ...baseRequestBody,
            entityType: 'host' as const,
            entityIdentifier: unassignedHostEuid,
          },
        })
        .expect(200);

      // Entity exists but has no asset.criticality field
      expect(missingCriticalityBody.summary.assetCriticality).toEqual([]);

      const { body: explicitUnassignedBody } = await entityAnalyticsApi
        .entityDetailsHighlights({
          body: {
            ...baseRequestBody,
            entityType: 'host' as const,
            entityIdentifier: explicitUnassignedHostEuid,
          },
        })
        .expect(200);

      // Explicit unassigned value must also yield an empty array.
      expect(explicitUnassignedBody.summary.assetCriticality).toEqual([]);
    });

    it('should return empty highlights for non-existent entity', async () => {
      const { body } = await entityAnalyticsApi
        .entityDetailsHighlights({
          body: {
            ...baseRequestBody,
            entityType: 'host' as const,
            entityIdentifier: 'host:non-existent-entity',
          },
        })
        .expect(200);

      expect(body.summary.riskScore).toEqual([]);
      expect(body.summary.assetCriticality).toEqual([]);
      expect(body.summary.vulnerabilities).toBeUndefined();
      expect(body.summary.vulnerabilitiesTotal).toBeUndefined();
      // Anomalies are explicitly null when there are no ML findings
      expect(body.summary.anomalies).toBeNull();
      expect(body.prompt).toContain(
        'Generate structured information for an entity so a Security analyst can act.'
      );
    });

    describe('anonymization fields handling', () => {
      it('should anonymize host name in response', async () => {
        const { body } = await entityAnalyticsApi
          .entityDetailsHighlights({
            body: {
              ...baseRequestBody,
              entityType: 'host' as const,
              entityIdentifier: hostEuid,
            },
          })
          .expect(200);

        // host.name should be anonymized in the summary fields but the original
        // value should be recoverable from replacements
        expect(JSON.stringify(body.summary)).not.toContain(hostName);
        expect(JSON.stringify(body.replacements)).toContain(hostName);
      });

      it('should work with empty anonymization fields array', async () => {
        await entityAnalyticsApi
          .entityDetailsHighlights({
            body: {
              ...baseRequestBody,
              entityType: 'host' as const,
              entityIdentifier: hostEuid,
              anonymizationFields: [],
            },
          })
          .expect(200);
      });

      it('should not anonymize fields not in anonymizationFields list', async () => {
        const { body } = await entityAnalyticsApi
          .entityDetailsHighlights({
            body: {
              ...baseRequestBody,
              entityType: 'host' as const,
              entityIdentifier: hostEuid,
              anonymizationFields: mockAnonymizationFields.map((f) => ({
                ...f,
                anonymized: false,
              })),
            },
          })
          .expect(200);

        // With anonymized: false for all fields, the actual host name should appear in the summary
        expect(JSON.stringify(body.summary)).toContain(hostName);
        // replacements should be empty since nothing was anonymized
        expect(Object.keys(body.replacements)).toHaveLength(0);
      });
    });

    describe('edge cases and boundary conditions', () => {
      it('should handle very long entity identifiers', async () => {
        const longIdentifier = 'host:' + 'a'.repeat(1000);
        await entityAnalyticsApi
          .entityDetailsHighlights({
            body: {
              ...baseRequestBody,
              entityType: 'host' as const,
              entityIdentifier: longIdentifier,
            },
          })
          .expect(200);
      });

      it('should handle entity identifiers with special characters', async () => {
        const specialIdentifiers = [
          'host:test-host.example.com',
          'host:test_host_123',
          'host:test host with spaces',
          'host:test-host@domain.com',
          'host:test-host!@#$%^&*()',
          'host:test-host-ñáéíóú',
          'host:test-host-中文',
        ];

        for (const identifier of specialIdentifiers) {
          await entityAnalyticsApi
            .entityDetailsHighlights({
              body: {
                ...baseRequestBody,
                entityType: 'host' as const,
                entityIdentifier: identifier,
              },
            })
            .expect(200);
        }
      });
    });
  });
};
