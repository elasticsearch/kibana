/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PackagePolicy } from '@kbn/fleet-plugin/common';
import {
  AGENT_CONFIG_PATH,
  AGENT_CONFIG_API_KEY_PATH,
  SOURCE_MAP_API_KEY_PATH,
  SOURCE_MAP_PATH,
} from '@kbn/apm-plugin/server/routes/fleet/get_package_policy_decorators';
import expect from '@kbn/expect';
import { get } from 'lodash';
import type { SourceMap } from '@kbn/apm-plugin/server/routes/source_maps/route';
import type { APIReturnType } from '@kbn/apm-plugin/public/services/rest/create_call_apm_api';
import { createEsClientForFtrConfig } from '@kbn/test';
import {
  APM_AGENT_CONFIGURATION_INDEX,
  APM_SOURCE_MAP_INDEX,
} from '@kbn/apm-sources-access-plugin/server';
import type { FtrProviderContext } from '../../common/ftr_provider_context';
import {
  createAgentPolicy,
  createPackagePolicy,
  deleteAgentPolicy,
  deletePackagePolicy,
  getPackagePolicy,
  setupFleet,
  updatePackagePolicy,
} from './helpers';
import { getBettertest } from '../../common/bettertest';
import { expectToReject } from '../../common/utils/expect_to_reject';

export default function ApiTest(ftrProviderContext: FtrProviderContext) {
  const { getService } = ftrProviderContext;
  const registry = getService('registry');
  const apmApiClient = getService('apmApiClient');
  const supertest = getService('supertest');
  const es = getService('es');
  const bettertest = getBettertest(supertest);
  const configService = getService('config');
  const apmSynthtraceEsClient = getService('apmSynthtraceEsClient');

  function createEsClientWithApiKeyAuth({ id, apiKey }: { id: string; apiKey: string }) {
    return createEsClientForFtrConfig(configService, { auth: { apiKey: { id, api_key: apiKey } } });
  }

  async function createConfiguration(configuration: any) {
    return apmApiClient.writeUser({
      endpoint: 'PUT /api/apm/settings/agent-configuration 2023-10-31',
      params: { body: configuration },
    });
  }

  async function deleteConfiguration(configuration: any) {
    return apmApiClient.writeUser({
      endpoint: 'DELETE /api/apm/settings/agent-configuration 2023-10-31',
      params: { body: { service: configuration.service } },
    });
  }

  async function uploadSourcemap({
    bundleFilePath,
    serviceName,
    serviceVersion,
    sourcemap,
  }: {
    bundleFilePath: string;
    serviceName: string;
    serviceVersion: string;
    sourcemap: SourceMap;
  }) {
    const response = await apmApiClient.writeUser({
      endpoint: 'POST /api/apm/sourcemaps 2023-10-31',
      type: 'form-data',
      params: {
        body: {
          bundle_filepath: bundleFilePath,
          service_name: serviceName,
          service_version: serviceVersion,
          sourcemap: JSON.stringify(sourcemap),
        },
      },
    });
    return response.body;
  }

  async function getActiveApiKeysCount(packagePolicyId: string) {
    const res = await es.transport.request({
      method: 'GET',
      path: '_security/_query/api_key',
      body: {
        size: 10000,
        query: {
          bool: {
            filter: [
              { term: { 'metadata.application': 'apm' } },
              { term: { 'metadata.package_policy_id': packagePolicyId } },
              { term: { invalidated: false } },
            ],
          },
        },
      },
    });

    // @ts-expect-error
    return res.total as number;
  }

  registry.when('APM package policy', { config: 'basic', archives: [] }, () => {
    let apmPackagePolicy: PackagePolicy;
    let agentPolicyId: string;
    let packagePolicyId: string;

    before(async () => {
      await setupFleet(bettertest);
      await apmSynthtraceEsClient.initializePackage({ skipInstallation: false });
      agentPolicyId = await createAgentPolicy({ bettertest });
      packagePolicyId = await createPackagePolicy({ bettertest, agentPolicyId });
      apmPackagePolicy = await getPackagePolicy(bettertest, packagePolicyId); // make sure to get the latest package policy
    });

    after(async () => {
      await deleteAgentPolicy(bettertest, agentPolicyId);
      await deletePackagePolicy(bettertest, packagePolicyId);
      await apmSynthtraceEsClient.uninstallPackage();
      expect(await getActiveApiKeysCount(packagePolicyId)).to.eql(0); // make sure all api keys for the policy are invalidated
    });

    describe('APM package policy callbacks', () => {
      it('sets default values for source maps', async () => {
        const sourceMap = get(apmPackagePolicy, SOURCE_MAP_PATH);
        expect(sourceMap).to.eql([]);
      });

      it('sets default values for agent configs', async () => {
        const agentConfigs = get(apmPackagePolicy, AGENT_CONFIG_PATH);
        expect(agentConfigs).to.eql([]);
      });

      it('creates two API keys for the package policy', async () => {
        expect(await getActiveApiKeysCount(packagePolicyId)).to.eql(2);
      });

      it('has api key that provides access to source maps only', async () => {
        const [id, apiKey] = get(apmPackagePolicy, SOURCE_MAP_API_KEY_PATH, '').split(':');
        expect(id).to.not.be.empty();
        expect(apiKey).to.not.be.empty();

        const esClient = createEsClientWithApiKeyAuth({ id, apiKey });
        const res = await esClient.search({ index: APM_SOURCE_MAP_INDEX });
        expect(res.hits.hits.length).to.be(0);
      });

      it('has api api key that provides access to the agent configurations index', async () => {
        const [id, apiKey] = get(apmPackagePolicy, AGENT_CONFIG_API_KEY_PATH, '').split(':');
        expect(id).to.not.be.empty();
        expect(apiKey).to.not.be.empty();

        const esClient = createEsClientWithApiKeyAuth({ id, apiKey });
        const res = await esClient.search({
          index: APM_AGENT_CONFIGURATION_INDEX,
        });

        expect(res.hits.hits.length).to.be(0);
      });

      it('throws when querying agent config index with source map api key', async () => {
        const [id, apiKey] = get(apmPackagePolicy, SOURCE_MAP_API_KEY_PATH, '').split(':');
        expect(id).to.not.be.empty();
        expect(apiKey).to.not.be.empty();

        const esClient = createEsClientWithApiKeyAuth({ id, apiKey });
        await expectToReject(() => esClient.search({ index: APM_AGENT_CONFIGURATION_INDEX }));
      });

      describe('Agent config', () => {
        let packagePolicyWithAgentConfig: PackagePolicy;
        const testConfiguration = {
          service: {},
          settings: { transaction_sample_rate: '0.55' },
        };
        before(async () => {
          await createConfiguration(testConfiguration);
          packagePolicyWithAgentConfig = await getPackagePolicy(bettertest, packagePolicyId);
        });

        after(async () => {
          await deleteConfiguration(testConfiguration);
        });

        it('sets the expected agent configs on the new package policy object', async () => {
          const agentConfigs = get(packagePolicyWithAgentConfig, AGENT_CONFIG_PATH)!;
          const { service, config } = agentConfigs[0];
          expect(service).to.eql({});
          expect(config).to.eql({ transaction_sample_rate: '0.55' });
        });
      });

      describe('Source maps', () => {
        let resp: APIReturnType<'POST /api/apm/sourcemaps 2023-10-31'>;

        after(async () => {
          await apmApiClient.writeUser({
            endpoint: 'DELETE /api/apm/sourcemaps/{id} 2023-10-31',
            params: { path: { id: resp.id } },
          });
        });

        before(async () => {
          resp = await uploadSourcemap({
            serviceName: 'uploading-test',
            serviceVersion: '1.0.0',
            bundleFilePath: 'bar',
            sourcemap: {
              version: 123,
              sources: [''],
              mappings: '',
            },
          });
        });

        it('sets the expected source maps on the new package policy object', async () => {
          const packagePolicyWithSourceMap = await getPackagePolicy(bettertest, packagePolicyId);
          const sourceMap = get(packagePolicyWithSourceMap, SOURCE_MAP_PATH);
          expect(sourceMap).to.eql([
            {
              'bundle.filepath': 'bar',
              'service.name': 'uploading-test',
              'service.version': '1.0.0',
              'sourcemap.url':
                '/api/fleet/artifacts/uploading-test-1.0.0/2f5d4e64ffde4acde832039186ca1652ed315fb0ecbcc1b398677b3bcba521df',
            },
          ]);
        });
      });
    });

    describe('APM package policy update - API key preservation', () => {
      // Simulates a client (e.g. Terraform provider) that only round-trips declared
      // package vars and drops the runtime-injected api key paths from the config.
      const keylessInputOverride = {
        inputs: [
          { type: 'apm', policy_template: 'apmserver', enabled: true, streams: [], vars: {} },
        ],
      };

      it('preserves existing api keys when an update omits them', async () => {
        const storedAgentKey = get(apmPackagePolicy, AGENT_CONFIG_API_KEY_PATH);
        const storedSourceMapKey = get(apmPackagePolicy, SOURCE_MAP_API_KEY_PATH);

        expect(storedAgentKey).to.not.be.empty();
        expect(storedSourceMapKey).to.not.be.empty();

        await updatePackagePolicy(bettertest, packagePolicyId, keylessInputOverride);

        const updatedPolicy = await getPackagePolicy(bettertest, packagePolicyId);

        expect(get(updatedPolicy, AGENT_CONFIG_API_KEY_PATH)).to.eql(storedAgentKey);
        expect(get(updatedPolicy, SOURCE_MAP_API_KEY_PATH)).to.eql(storedSourceMapKey);
      });

      it('does not accumulate new api keys when an update omits them', async () => {
        const activeKeysBefore = await getActiveApiKeysCount(packagePolicyId);

        await updatePackagePolicy(bettertest, packagePolicyId, keylessInputOverride);

        expect(await getActiveApiKeysCount(packagePolicyId)).to.eql(activeKeysBefore);
      });
    });
  });
}
