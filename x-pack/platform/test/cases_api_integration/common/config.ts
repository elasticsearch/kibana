/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import path from 'path';

import { CA_CERT_PATH } from '@kbn/dev-utils';
import type { FtrConfigProviderContext } from '@kbn/test';
import { findTestPluginPaths } from '@kbn/test';
import { ScoutTestRunConfigCategory } from '@kbn/scout-info';

import { getAllExternalServiceSimulatorPaths } from '../../alerting_api_integration/common/lib/actions_simulations_utils';
import { services } from './services';

interface CreateTestConfigOptions {
  license: string;
  disabledPlugins?: string[];
  ssl?: boolean;
  testFiles?: string[];
  publicBaseUrl?: boolean;
  indexRefreshInterval?: string | false;
  kbnServerArgs?: string[];
}

const enabledActionTypes = [
  '.cases',
  '.cases-webhook',
  '.email',
  '.index',
  '.jira',
  '.pagerduty',
  '.swimlane',
  '.resilient',
  '.server-log',
  '.servicenow',
  '.servicenow-sir',
  '.slack',
  '.webhook',
  '.case',
  'test.authorization',
  'test.failing',
  'test.index-record',
  'test.noop',
  'test.rate-limit',
];

export function createTestConfig(name: string, options: CreateTestConfigOptions) {
  const { license = 'trial', disabledPlugins = [], ssl = false, testFiles = [] } = options;

  return async ({ readConfigFile }: FtrConfigProviderContext) => {
    const xPackApiIntegrationTestsConfig = await readConfigFile(
      require.resolve('../../api_integration/config.ts')
    );

    const servers = {
      ...xPackApiIntegrationTestsConfig.get('servers'),
      elasticsearch: {
        ...xPackApiIntegrationTestsConfig.get('servers.elasticsearch'),
        protocol: ssl ? 'https' : 'http',
      },
    };

    return {
      testConfigCategory: ScoutTestRunConfigCategory.API_TEST,
      testFiles,
      servers,
      services,
      junit: {
        reportName: 'X-Pack Case API Integration Tests',
      },
      esTestCluster: {
        ...xPackApiIntegrationTestsConfig.get('esTestCluster'),
        license,
        ssl,
        serverArgs: [
          `xpack.license.self_generated.type=${license}`,
          `xpack.security.enabled=${
            !disabledPlugins.includes('security') && ['trial', 'basic'].includes(license)
          }`,
        ],
      },
      kbnTestServer: {
        ...xPackApiIntegrationTestsConfig.get('kbnTestServer'),
        serverArgs: [
          ...xPackApiIntegrationTestsConfig.get('kbnTestServer.serverArgs'),
          ...(options.publicBaseUrl ? ['--server.publicBaseUrl=https://localhost:5601'] : []),
          `--xpack.actions.allowedHosts=${JSON.stringify(['localhost', 'some.non.existent.com'])}`,
          `--xpack.actions.enabledActionTypes=${JSON.stringify(enabledActionTypes)}`,
          '--xpack.eventLog.logEntries=true',
          ...disabledPlugins
            .filter((k) => k !== 'security')
            .map((key) => `--xpack.${key}.enabled=false`),
          ...findTestPluginPaths([
            path.resolve(__dirname, 'plugins'),
            path.resolve(__dirname, '../../alerting_api_integration/common/plugins'),
          ]),
          `--xpack.actions.preconfigured=${JSON.stringify({
            'preconfigured-servicenow': {
              name: 'preconfigured-servicenow',
              actionTypeId: '.servicenow',
              config: {
                apiUrl: 'https://example.com',
                usesTableApi: false,
              },
              secrets: {
                username: 'elastic',
                password: 'elastic',
              },
            },
          })}`,
          `--server.xsrf.allowlist=${JSON.stringify(getAllExternalServiceSimulatorPaths())}`,
          ...(ssl
            ? [
                `--elasticsearch.hosts=${servers.elasticsearch.protocol}://${servers.elasticsearch.hostname}:${servers.elasticsearch.port}`,
                `--elasticsearch.ssl.certificateAuthorities=${CA_CERT_PATH}`,
              ]
            : []),
          '--xpack.ruleRegistry.write.enabled=true',
          '--xpack.ruleRegistry.write.cache.enabled=false',
          '--xpack.cases.analytics.index.enabled=true',
          // Registers the unified `security.entity` attachment type so the cases
          // attachment tests exercise it (gated behind this experimental flag).
          `--xpack.securitySolution.enableExperimental=${JSON.stringify([
            'entityAttachmentsEnabled',
          ])}`,
          ...(options.kbnServerArgs ?? []),
        ],
      },
      indexRefreshInterval: options.indexRefreshInterval,
    };
  };
}
