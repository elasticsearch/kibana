/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import path from 'path';

import type { FtrConfigProviderContext } from '@kbn/test';
import {
  fleetPackageRegistryDockerImage,
  defineDockerServersConfig,
  getKibanaCliLoggers,
} from '@kbn/test';
import { ScoutTestRunConfigCategory } from '@kbn/scout-info';
import { CA_CERT_PATH, KBN_CERT_PATH, KBN_KEY_PATH } from '@kbn/dev-utils';

const getFullPath = (relativePath: string) => path.join(path.dirname(__filename), relativePath);

export const BUNDLED_PACKAGE_DIR = '/tmp/fleet_bundled_packages';

export default async function ({ readConfigFile, log }: FtrConfigProviderContext) {
  const xPackAPITestsConfig = await readConfigFile(require.resolve('../api_integration/config.ts'));

  const registryPort: string | undefined = process.env.FLEET_PACKAGE_REGISTRY_PORT;
  const skipRunningDockerRegistry =
    process.env.FLEET_SKIP_RUNNING_PACKAGE_REGISTRY === 'true' ? true : false;

  // mount the config file for the package registry as well as
  // the directories containing additional packages into the container
  const volumes = {
    // src : dest
    './apis/fixtures/package_registry_config.yml': '/package-registry/config.yml',
    './apis/fixtures/test_packages': '/packages/test-packages',
    './apis/fixtures/package_verification/packages/zips': '/packages/signed-test-packages',
  };
  const dockerArgs: string[] = Object.entries(volumes).flatMap(([src, dest]) => [
    '-v',
    `${getFullPath(src)}:${dest}`,
  ]);

  dockerArgs.push('-e', 'EPR_REQUIRE_PACKAGE_SIGNATURES=false');

  const dockerServers = !skipRunningDockerRegistry
    ? defineDockerServersConfig({
        registry: {
          enabled: !!registryPort,
          image: fleetPackageRegistryDockerImage,
          portInContainer: 8080,
          port: registryPort,
          args: dockerArgs,
          waitForLogLine: 'package manifests loaded',
          waitForLogLineTimeoutMs: 60 * 6 * 1000, // 6 minutes,
          preferCached: true,
        },
      })
    : undefined;

  if (skipRunningDockerRegistry) {
    const cmd = `docker run ${dockerArgs.join(
      ' '
    )} -p ${registryPort}:8080 ${fleetPackageRegistryDockerImage}`;
    log.warning(`Not running docker registry, you can run it with the following command: ${cmd}`);
  }

  return {
    testConfigCategory: ScoutTestRunConfigCategory.API_TEST,
    servers: xPackAPITestsConfig.get('servers'),
    dockerServers,
    services: xPackAPITestsConfig.get('services'),
    esTestCluster: {
      ...xPackAPITestsConfig.get('esTestCluster'),
      serverArgs: [...xPackAPITestsConfig.get('esTestCluster.serverArgs'), 'http.host=0.0.0.0'],
    },
    kbnTestServer: {
      ...xPackAPITestsConfig.get('kbnTestServer'),
      serverArgs: [
        ...xPackAPITestsConfig.get('kbnTestServer.serverArgs'),
        // always install Endpoint package by default when Fleet sets up
        `--xpack.fleet.packages.0.name=endpoint`,
        `--xpack.fleet.packages.0.version=latest`,
        ...(registryPort ? [`--xpack.fleet.registryUrl=http://localhost:${registryPort}`] : []),
        `--xpack.fleet.developer.bundledPackageLocation=${BUNDLED_PACKAGE_DIR}`,
        `--xpack.fleet.developer.disableBundledPackagesCache=true`,
        `--xpack.fleet.productVersionsApiTimeoutMs=2000`,
        '--xpack.cloudSecurityPosture.enabled=true',
        `--xpack.fleet.developer.maxAgentPoliciesWithInactivityTimeout=10`,
        `--xpack.fleet.packageVerification.gpgKeyPath=${getFullPath(
          './apis/fixtures/package_verification/signatures/fleet_test_key_public.asc'
        )}`,
        `--xpack.securitySolution.enableExperimental=${JSON.stringify(['endpointRbacEnabled'])}`,
        `--xpack.fleet.experimentalFeatures=${JSON.stringify({
          enablePackageRollback: true,
          enableAgentPrivilegeLevelChange: true,
          enableAgentRollback: true,
          enableFleetPolicyRevisionsCleanupTask: false,
          enableSloTemplates: true,
          enableVersionSpecificPolicies: true,
          enableOpAMP: true,
          enableAgentPolicyMultipleDownloadSources: true,
          installIntegrationsKnowledge: false,
          // Keep the legacy agentless APIs enabled here so the base suite exercises legacy behavior;
          // config.agentless_legacy_disabled.ts overrides this to true for the rejection tests.
          disableAgentlessLegacyAPI: false,
        })}`,
        `--xpack.fleet.agentless.enabled=true`,
        `--xpack.fleet.agentless.api.url=http://localhost:8089/agentless-api`,
        `--xpack.fleet.agentless.api.tls.certificate=${KBN_CERT_PATH}`,
        `--xpack.fleet.agentless.api.tls.key=${KBN_KEY_PATH}`,
        `--xpack.fleet.agentless.api.tls.ca=${CA_CERT_PATH}`,
        `--xpack.fleet.internal.registry.kibanaVersionCheckEnabled=false`,
        `--xpack.fleet.internal.registry.spec.min=1.0`,
        `--logging.loggers=${JSON.stringify([
          ...getKibanaCliLoggers(xPackAPITestsConfig.get('kbnTestServer.serverArgs')),

          // Enable debug fleet logs by default
          {
            name: 'plugins.fleet',
            level: 'debug',
            appenders: ['default'],
          },
        ])}`,
        `--xpack.task_manager.unsafe.exclude_task_types=${JSON.stringify([
          'fleet:agent-status-change-task',
        ])} `,
      ],
    },
  };
}
