/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import path from 'path';
import { CA_CERT_PATH } from '@kbn/dev-utils';
import type { FtrConfigProviderContext } from '@kbn/test';
import { kbnTestConfig, kibanaTestUser } from '@kbn/test';
import { ScoutTestRunConfigCategory } from '@kbn/scout-info';
import { PRECONFIGURED_ACTION_CONNECTORS } from '../shared';
import { installMockPrebuiltRulesPackage } from '../../test_suites/detections_response/utils';
import type { FtrProviderContext } from '../../ftr_provider_context';
import { services as baseServices } from './services';

interface CreateTestConfigOptions {
  license: string;
  ssl?: boolean;
  services?: any;
  // Used to enable searchable snapshots locally which is necessary to run tests on the frozen data tier
  // see https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore/searchable-snapshots
  esSnapshotStorageConfig?: { size: `${number}GB`; path: string };
  // How often index lifecycle management checks for indices that meet policy criteria. Defaults to 10m.
  // See https://www.elastic.co/docs/reference/elasticsearch/configuration-reference/index-lifecycle-management-settings
  ilmPollInterval?: `${number}${'s' | 'm'}`;
}
// test.not-enabled is specifically not enabled
const enabledActionTypes = [
  '.cases',
  '.email',
  '.index',
  '.pagerduty',
  '.swimlane',
  '.server-log',
  '.servicenow',
  '.slack',
  '.webhook',
  'test.authorization',
  'test.failing',
  'test.index-record',
  'test.noop',
  'test.rate-limit',
];

export function createTestConfig(options: CreateTestConfigOptions, testFiles?: string[]) {
  const {
    license = 'trial',
    ssl = false,
    services = baseServices,
    esSnapshotStorageConfig,
    ilmPollInterval,
  } = options;

  return async ({ readConfigFile }: FtrConfigProviderContext) => {
    const xPackApiIntegrationTestsConfig = await readConfigFile(
      require.resolve('@kbn/test-suites-xpack-platform/api_integration/config')
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
        reportName: 'X-Pack Security Solution API Integration Tests',
      },
      esTestCluster: {
        ...xPackApiIntegrationTestsConfig.get('esTestCluster'),
        license,
        ssl,
        serverArgs: [
          `xpack.license.self_generated.type=${license}`,
          ...(esSnapshotStorageConfig
            ? [
                `path.repo=${esSnapshotStorageConfig.path}`,
                `xpack.searchable.snapshot.shared_cache.size=${esSnapshotStorageConfig.size}`,
              ]
            : []),
          ...(ilmPollInterval ? [`indices.lifecycle.poll_interval=${ilmPollInterval}`] : []),
        ],
      },
      kbnTestServer: {
        ...xPackApiIntegrationTestsConfig.get('kbnTestServer'),
        env: {
          ELASTICSEARCH_USERNAME: kbnTestConfig.getUrlParts(kibanaTestUser).username,
        },
        serverArgs: [
          ...xPackApiIntegrationTestsConfig.get('kbnTestServer.serverArgs'),
          `--xpack.actions.allowedHosts=${JSON.stringify(['localhost', 'some.non.existent.com'])}`,
          `--xpack.actions.enabledActionTypes=${JSON.stringify(enabledActionTypes)}`,
          '--xpack.eventLog.logEntries=true',
          `--xpack.securitySolution.alertIgnoreFields=${JSON.stringify([
            'testing_ignored.constant',
            '/testing_regex*/',
          ])}`, // See tests within the file "ignore_fields.ts" which use these values in "alertIgnoreFields"
          '--xpack.ruleRegistry.write.enabled=true',
          '--xpack.ruleRegistry.write.cache.enabled=false',
          '--xpack.ruleRegistry.unsafe.indexUpgrade.enabled=true',
          '--xpack.ruleRegistry.unsafe.legacyMultiTenancy.enabled=true',
          `--xpack.securitySolution.enableExperimental=${JSON.stringify([
            'previewTelemetryUrlEnabled',
            'endpointExceptionsMovedUnderManagement',
            'ruleChangesHistoryEnabled',
          ])}`,
          '--xpack.alerting.ruleChangeTracking.enabled=true',
          `--plugin-path=${path.resolve(
            __dirname,
            '../../../../../../../src/platform/test/analytics/plugins/analytics_ftr_helpers'
          )}`,

          '--xpack.task_manager.poll_interval=1000',
          `--xpack.actions.preconfigured=${JSON.stringify(PRECONFIGURED_ACTION_CONNECTORS)}`,
          ...(ssl
            ? [
                `--elasticsearch.hosts=${servers.elasticsearch.protocol}://${servers.elasticsearch.hostname}:${servers.elasticsearch.port}`,
                `--elasticsearch.ssl.certificateAuthorities=${CA_CERT_PATH}`,
              ]
            : []),
        ],
      },
      mochaOpts: {
        grep: '/^(?!.*@skipInEss).*@ess.*/',
        rootHooks: {
          // Some of the Rule Management API endpoints install prebuilt rules package under the hood.
          // Prebuilt rules package installation has been known to be flakiness reason since
          // EPR might be unavailable or the network may have faults.
          // Real prebuilt rules package installation is prevented by
          // installing a lightweight mock package.
          beforeAll: ({ getService }: FtrProviderContext) =>
            installMockPrebuiltRulesPackage({ getService }),
        },
      },
    };
  };
}
