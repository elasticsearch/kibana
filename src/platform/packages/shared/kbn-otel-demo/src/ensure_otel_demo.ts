/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import execa from 'execa';
import Path from 'path';
import chalk from 'chalk';
import { REPO_ROOT } from '@kbn/repo-info';
import {
  assertMinikubeAvailable,
  assertKubectlAvailable,
  ensureMinikubeRunning,
  waitForPodsReady,
  deleteNamespace,
  getMinikubeIp,
  getMinikubeHostGatewayIp,
} from './util/assert_minikube_available';
import { getFullOtelCollectorConfig } from './get_otel_collector_config';
import { getEdotK8sCollectorConfig } from './get_edot_k8s_collector_config';
import { writeFile } from './util/file_utils';
import { readKibanaConfig } from './read_kibana_config';
import { enableStreams } from './util/enable_streams';
import { createDataView } from './util/create_data_view';
import { resolveKibanaUrl } from './util/resolve_kibana_url';
import { buildCustomImages } from './util/build_custom_images';
import { resolveEdotCollectorVersion } from './util/resolve_edot_collector_version';
import type { DemoType, FailureScenario } from './types';
import { applyCodeScenario, buildCodeScenarioImages } from './apply_code_scenario';
import { seedCodeSearch } from './seed_code_search';
import {
  getDemoConfig,
  getDemoManifests,
  getScenarioById,
  getCodeScenarioById,
  getDemoCodeScenarios,
  getDemoServiceDefaults,
} from './demo_registry';

const DATA_DIR = Path.join(REPO_ROOT, 'data', 'demo_environments');

/**
 * Stops and removes a demo environment from Kubernetes.
 */
async function down(log: ToolingLog, namespace: string, demoName: string) {
  log.info(`Stopping ${demoName}...`);
  await deleteNamespace(namespace);
  await execa
    .command(`kubectl delete clusterrole otel-collector-${namespace} --ignore-not-found`)
    .catch(() => {});
  await execa
    .command(`kubectl delete clusterrolebinding otel-collector-${namespace} --ignore-not-found`)
    .catch(() => {});
}

/**
 * Normalizes Elasticsearch host URL for Kubernetes connectivity.
 * Converts localhost references to the host machine IP accessible from minikube.
 *
 * @param host - The Elasticsearch host URL
 * @returns Normalized endpoint URL
 */
function normalizeElasticsearchHost(host: string): string {
  let hostStr = host.toString();

  // For minikube, localhost needs to be the host machine's IP
  // minikube can reach the host at host.minikube.internal or via the bridge
  hostStr = hostStr.replace(/localhost/g, 'host.minikube.internal');

  if (hostStr.startsWith('http://') || hostStr.startsWith('https://')) {
    return hostStr;
  }

  return `http://${hostStr}`;
}

export interface DeployResult {
  namespace: string;
  kibanaUrl: string;
  elasticsearchHost: string;
  logsIndex: string;
}

/**
 * Deploys a demo environment on Kubernetes (minikube) with telemetry data
 * being sent to Elasticsearch. Resolves when pods are ready — does NOT
 * block on log streaming.
 *
 * @param log - Tooling logger for output
 * @param demoType - Type of demo to deploy (default: 'otel-demo')
 * @param configPath - Optional path to Kibana config file
 * @param logsIndex - Index name for logs (defaults to "logs.otel")
 * @param version - Demo version (defaults to demo's defaultVersion)
 * @param scenarioIds - Optional list of failure scenario IDs to apply
 * @param forceRebuildImages - If true, rebuilds the custom images
 *
 * @returns A promise that resolves when the demo environment is deployed and the logs are streaming
 */
export async function deployDemo({
  log,
  demoType = 'otel-demo',
  configPath,
  logsIndex = 'logs',
  version,
  scenarioIds = [],
  codeScenarioId,
  forceRebuildImages = false,
  useVanillaCollector = false,
}: {
  log: ToolingLog;
  demoType?: DemoType;
  configPath?: string | undefined;
  logsIndex?: string;
  version?: string;
  scenarioIds?: string[];
  codeScenarioId?: string;
  forceRebuildImages?: boolean;
  useVanillaCollector?: boolean;
}): Promise<DeployResult> {
  await assertKubectlAvailable();
  await assertMinikubeAvailable();

  const demoConfig = getDemoConfig(demoType);
  const demoVersion = version || demoConfig.defaultVersion;
  const namespace = demoConfig.namespace;
  const manifestsFilePath = Path.join(DATA_DIR, `${demoType}.yaml`);
  const activeCodeScenario = codeScenarioId
    ? getCodeScenarioById(demoType, codeScenarioId)
    : undefined;

  if (codeScenarioId && !activeCodeScenario) {
    throw new Error(`Unknown code scenario for ${demoType}: ${codeScenarioId}`);
  }

  log.info(`Starting ${demoConfig.displayName} on Kubernetes (minikube)...`);
  log.info(`  Version: ${demoVersion}`);

  if (demoConfig.requiresCustomImages) {
    if (demoConfig.imageBuildConfig) {
      log.write('');
      log.info(
        `${chalk.bold(
          'Building custom images:'
        )} This demo requires images to be built from source.`
      );
      if (demoConfig.customImageInstructions) {
        log.write(chalk.dim(`  ${demoConfig.customImageInstructions.split('\n')[0]}`));
      }
      log.write('');
      await buildCustomImages(log, demoConfig.id, demoConfig.imageBuildConfig, forceRebuildImages);
      log.write('');
    } else {
      log.write('');
      log.warning(
        `${chalk.bold(
          'WARNING:'
        )} This demo requires custom-built container images that are NOT available in public registries.`
      );
      log.warning('Pods will fail to start with ImagePullBackOff errors until images are built.');
      if (demoConfig.customImageInstructions) {
        log.write('');
        log.write(chalk.dim('Build instructions:'));
        for (const line of demoConfig.customImageInstructions.split('\n')) {
          log.write(chalk.dim(`  ${line}`));
        }
      }
      log.write('');
    }
  }

  // Ensure minikube is running
  log.info('Ensuring minikube is running...');
  await ensureMinikubeRunning();

  // Read Kibana configuration to get Elasticsearch and Kibana server credentials
  const kibanaConfig = readKibanaConfig(log, configPath);
  const {
    elasticsearch: elasticsearchConfig,
    server: serverConfig,
    kibanaCredentials,
  } = kibanaConfig;

  const elasticsearchHost = normalizeElasticsearchHost(elasticsearchConfig.hosts);
  const elasticsearchUsername = elasticsearchConfig.username;
  const elasticsearchPassword = elasticsearchConfig.password;

  // Build the base Kibana URL from config
  const kibanaHostname = `http://${serverConfig.host}:${serverConfig.port}${serverConfig.basePath}`;

  // Resolve the actual Kibana URL by detecting any dev mode base path
  // When running `yarn start` without `--no-base-path`, Kibana uses a random 3-letter prefix
  const kibanaUrl = await resolveKibanaUrl(kibanaHostname, log);

  log.info(`Kibana: ${kibanaUrl}`);
  log.info(`Elasticsearch: ${elasticsearchHost}`);
  log.info(`Logs index: ${logsIndex}`);

  await enableStreams({
    kibanaUrl,
    username: kibanaCredentials.username,
    password: kibanaCredentials.password,
    log,
  });

  await createDataView({
    kibanaUrl,
    username: kibanaCredentials.username,
    password: kibanaCredentials.password,
    log,
  });

  // Process failure scenarios
  const activeScenarios: FailureScenario[] = [];
  const envOverrides: Record<string, Record<string, string>> = {};

  for (const id of scenarioIds) {
    const scenario = getScenarioById(demoType, id);
    if (scenario) {
      activeScenarios.push(scenario);
      log.info(`Applying failure scenario: ${chalk.yellow(scenario.name)}`);
      log.info(`  ${chalk.dim(scenario.description.split('\n')[0])}`);

      // Collect env overrides from steps
      for (const step of scenario.steps) {
        if (step.type === 'env') {
          if (!envOverrides[step.service]) {
            envOverrides[step.service] = {};
          }
          envOverrides[step.service][step.variable] = step.value;
          log.debug(`  ${step.service}: ${step.variable}=${step.value}`);
        }
      }
    }
  }

  if (activeScenarios.length > 0) {
    log.write('');
    log.warning(
      `${chalk.bold(activeScenarios.length)} failure scenario(s) active - expect degraded behavior!`
    );
    log.write('');
  }

  let codeScenarioRepoDir: string | undefined;
  let imageOverrides: Record<string, string> | undefined;
  if (activeCodeScenario) {
    log.info(`Applying code scenario: ${chalk.yellow(activeCodeScenario.name)}`);
    log.info(`  ${chalk.dim(activeCodeScenario.description)}`);
    codeScenarioRepoDir = await applyCodeScenario({
      version: demoVersion,
      scenario: activeCodeScenario,
      log,
    });
    imageOverrides = await buildCodeScenarioImages({
      repoDir: codeScenarioRepoDir,
      scenario: activeCodeScenario,
      config: demoConfig,
      log,
    });
  }

  // Stop any existing deployment after scenario images are built, so a build failure does not
  // unnecessarily tear down a running demo.
  log.debug('Removing existing deployment');
  await down(log, namespace, demoConfig.displayName);

  // Resolve collector image: EDOT by default, vanilla with --vanilla
  let collectorImage: string;
  if (useVanillaCollector) {
    collectorImage = 'otel/opentelemetry-collector-contrib:0.115.1';
  } else {
    const edotVersion = await resolveEdotCollectorVersion(log);
    collectorImage = `docker.elastic.co/elastic-agent/elastic-otel-collector:${edotVersion}`;
  }
  log.info(`Using collector: ${collectorImage}`);

  // Generate OTel Collector configuration
  const collectorConfig = useVanillaCollector
    ? getFullOtelCollectorConfig({
        elasticsearchEndpoint: elasticsearchHost,
        username: kibanaCredentials.username,
        password: kibanaCredentials.password,
        logsIndex,
        namespace: demoConfig.namespace,
        demoId: demoConfig.id,
      })
    : getEdotK8sCollectorConfig({
        elasticsearchEndpoint: elasticsearchHost,
        username: kibanaCredentials.username,
        password: kibanaCredentials.password,
        namespace: demoConfig.namespace,
        demoId: demoConfig.id,
        logsIndex,
      });

  // Resolve host gateway IP so pods can reach host.minikube.internal via hostAliases.
  // CoreDNS inside pods doesn't resolve this hostname from minikube's /etc/hosts.
  const hostAliases: Array<{ ip: string; hostnames: string[] }> = [];
  if (elasticsearchHost.includes('host.minikube.internal')) {
    const gatewayIp = await getMinikubeHostGatewayIp();
    if (gatewayIp) {
      hostAliases.push({ ip: gatewayIp, hostnames: ['host.minikube.internal'] });
      log.debug(`Resolved host.minikube.internal → ${gatewayIp} (will inject as hostAlias)`);
    } else {
      log.warning(
        'Could not resolve host.minikube.internal IP — collector may fail to reach Elasticsearch'
      );
    }
  }

  // Generate Kubernetes manifests with scenario overrides
  log.info('Generating Kubernetes manifests...');
  const manifestGenerator = getDemoManifests(demoType);
  const manifests = manifestGenerator.generate({
    config: demoConfig,
    version: demoVersion,
    elasticsearchEndpoint: elasticsearchHost,
    username: elasticsearchUsername,
    password: elasticsearchPassword,
    logsIndex,
    collectorConfigYaml: collectorConfig,
    envOverrides,
    imageOverrides,
    resourceOverrides: activeCodeScenario?.resourceOverrides,
    hostAliases: hostAliases.length > 0 ? hostAliases : undefined,
    collectorImage,
  });

  log.debug(`Writing manifests to ${manifestsFilePath}`);
  await writeFile(manifestsFilePath, manifests);

  // Apply the manifests
  log.info('Deploying to Kubernetes...');
  await execa.command(`kubectl apply -f ${manifestsFilePath}`, {
    stdio: 'inherit',
  });

  // Wait for pods to be ready
  log.info('Waiting for pods to be ready (this may take a few minutes)...');

  const waitAndReport = async () => {
    try {
      await waitForPodsReady(namespace, { timeoutSeconds: 600, log });

      const minikubeIp = await getMinikubeIp();

      log.write('');
      log.write(
        `${chalk.green('✔')} ${
          demoConfig.displayName
        } deployed successfully and connected to ${elasticsearchHost}`
      );
      log.write('');

      if (demoConfig.frontendService) {
        log.write(
          `  ${chalk.bold('Web Store:')}        http://${minikubeIp}:${
            demoConfig.frontendService.nodePort
          }`
        );
      }

      log.write(`  ${chalk.bold('Logs Index:')}       ${logsIndex}`);

      if (activeScenarios.length > 0) {
        log.write(
          `  ${chalk.bold('Active Scenarios:')} ${chalk.yellow(
            activeScenarios.map((s) => s.id).join(', ')
          )}`
        );
      }
      if (activeCodeScenario) {
        log.write(
          `  ${chalk.bold('Active Code Scenario:')} ${chalk.yellow(activeCodeScenario.id)}`
        );
      }
      log.write('');

      if (demoConfig.frontendService) {
        log.write(chalk.dim('  To access the frontend, run:'));
        log.write(
          chalk.dim(
            `    minikube service ${demoConfig.frontendService.name}-external -n ${namespace}`
          )
        );
        log.write('');
      }

      log.write(chalk.dim('  To view pod logs:'));
      log.write(chalk.dim(`    kubectl logs -f -n ${namespace} -l app=frontend`));
      log.write('');
      log.write(chalk.dim('  To stop the demo:'));
      log.write(chalk.dim(`    node scripts/otel_demo.js --demo ${demoType} --teardown`));
      log.write('');
    } catch (error) {
      log.error(`Failed to deploy: ${error}`);
    }
  };

  await waitAndReport();

  if (activeCodeScenario && codeScenarioRepoDir) {
    await seedCodeSearch({
      elasticsearch: elasticsearchConfig,
      kibanaCredentials,
      kibanaUrl,
      version: demoVersion,
      codeScenarioId: activeCodeScenario.id,
      codeScenarioRepoDir,
      log,
    });
  }

  return { namespace, kibanaUrl, elasticsearchHost, logsIndex };
}

/**
 * Streams pod logs from a running demo deployment.
 * Blocks until the signal is aborted or the user presses Ctrl+C.
 */
export async function streamDemoLogs({
  log,
  namespace,
  signal,
}: {
  log: ToolingLog;
  namespace: string;
  signal?: AbortSignal;
}): Promise<void> {
  log.info('Streaming pod logs (Ctrl+C to stop)...');
  try {
    await execa.command(
      `kubectl logs -f -n ${namespace} -l app=otel-collector --max-log-requests=10`,
      {
        stdio: 'inherit',
        cleanup: true,
        ...(signal ? { signal } : {}),
      }
    );
  } catch {
    log.info('Stopped log streaming');
  }
}

/**
 * Stops and removes a demo environment from Kubernetes.
 */
export async function teardownDemo({
  log,
  demoType = 'otel-demo',
}: {
  log: ToolingLog;
  demoType?: DemoType;
}): Promise<void> {
  await assertKubectlAvailable();
  await assertMinikubeAvailable();

  const demoConfig = getDemoConfig(demoType);
  await down(log, demoConfig.namespace, demoConfig.displayName);
  log.success(`${demoConfig.displayName} stopped and removed from Kubernetes`);
}

/**
 * Ensures a demo environment is running on Kubernetes (minikube) with
 * telemetry data being sent to Elasticsearch.
 *
 * This function:
 * 1. Ensures minikube is running
 * 2. Reads Elasticsearch configuration from kibana.dev.yml
 * 3. Enables the streams feature in Kibana (sets up logs index)
 * 4. Generates OTel Collector configuration with k8sattributes processor
 * 5. Generates Kubernetes manifests for the demo
 * 6. Deploys to minikube using kubectl
 *
 * @param log - Tooling logger for output
 * @param signal - Abort signal for cleanup
 * @param demoType - Type of demo to deploy (default: 'otel-demo')
 * @param configPath - Optional path to Kibana config file
 * @param logsIndex - Index name for logs (defaults to "logs.otel")
 * @param version - Demo version (defaults to demo's defaultVersion)
 * @param teardown - If true, stops and removes the deployment
 * @param scenarioIds - Optional list of failure scenario IDs to apply
 * @param forceRebuildImages - If true, rebuilds the custom images
 *
 * @returns A promise that resolves when the demo environment is deployed and the logs are streaming
 */
export async function ensureOtelDemo({
  log,
  signal,
  demoType = 'otel-demo',
  configPath,
  logsIndex = 'logs',
  version,
  teardown = false,
  scenarioIds = [],
  codeScenarioId,
  forceRebuildImages = false,
  useVanillaCollector = false,
}: {
  log: ToolingLog;
  signal: AbortSignal;
  demoType?: DemoType;
  configPath?: string | undefined;
  logsIndex?: string;
  version?: string;
  teardown?: boolean;
  scenarioIds?: string[];
  codeScenarioId?: string;
  forceRebuildImages?: boolean;
  useVanillaCollector?: boolean;
}) {
  if (teardown) {
    await teardownDemo({ log, demoType });
    return;
  }

  const { namespace } = await deployDemo({
    log,
    demoType,
    configPath,
    logsIndex,
    version,
    scenarioIds,
    codeScenarioId,
    forceRebuildImages,
    useVanillaCollector,
  });

  await streamDemoLogs({ log, namespace, signal });
}

/**
 * Patches failure scenarios onto a running demo cluster.
 * Uses kubectl set env to update deployments without full redeployment.
 *
 * @param log - Tooling logger for output
 * @param demoType - Type of demo to patch (default: 'otel-demo')
 * @param scenarioIds - List of failure scenario IDs to apply (empty = no changes unless reset)
 * @param reset - If true, resets all services to defaults
 */
export async function patchScenarios({
  log,
  demoType = 'otel-demo',
  scenarioIds = [],
  codeScenarioId,
  configPath,
  version,
  reset = false,
}: {
  log: ToolingLog;
  demoType?: DemoType;
  scenarioIds?: string[];
  codeScenarioId?: string;
  configPath?: string | undefined;
  version?: string;
  reset?: boolean;
}) {
  await assertKubectlAvailable();

  const demoConfig = getDemoConfig(demoType);
  const namespace = demoConfig.namespace;
  const serviceDefaults = getDemoServiceDefaults(demoType);
  const demoVersion = version || demoConfig.defaultVersion;
  const codeScenarioServices = Array.from(
    new Set(getDemoCodeScenarios(demoType).flatMap((scenario) => scenario.affectedServices))
  );
  const serviceConfigsByName = new Map(
    demoConfig.getServices(demoVersion).map((service) => [service.name, service])
  );
  const activeCodeScenario = codeScenarioId
    ? getCodeScenarioById(demoType, codeScenarioId)
    : undefined;

  if (codeScenarioId && !activeCodeScenario) {
    throw new Error(`Unknown code scenario for ${demoType}: ${codeScenarioId}`);
  }

  // Check if namespace exists
  try {
    await execa.command(`kubectl get namespace ${namespace}`);
  } catch {
    throw new Error(
      `Namespace ${namespace} not found. Run 'node scripts/otel_demo.js --demo ${demoType}' first to deploy.`
    );
  }

  if (reset) {
    log.info(`Resetting all scenarios to defaults for ${demoConfig.displayName}...`);

    for (const [service, defaults] of Object.entries(serviceDefaults)) {
      const envArgs = Object.entries(defaults)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');

      log.debug(`Resetting ${service}: ${envArgs}`);
      try {
        await execa.command(`kubectl set env deployment/${service} -n ${namespace} ${envArgs}`, {
          stdio: 'pipe',
        });
        log.info(`  ${chalk.green('✔')} Reset ${service}`);
      } catch (error) {
        log.warning(`  ${chalk.yellow('⚠')} Could not reset ${service} (may not exist)`);
      }
    }

    log.success('All scenarios reset to defaults');
    for (const service of codeScenarioServices) {
      const defaults = serviceConfigsByName.get(service);
      if (!defaults) {
        continue;
      }

      try {
        await execa('kubectl', [
          'set',
          'image',
          `deployment/${service}`,
          `${service}=${defaults.image}`,
          '-n',
          namespace,
        ]);
        await execa('kubectl', [
          'patch',
          `deployment/${service}`,
          '-n',
          namespace,
          '--type',
          'strategic',
          '-p',
          JSON.stringify({
            spec: {
              template: {
                spec: {
                  containers: [{ name: service, imagePullPolicy: 'IfNotPresent', resources: {} }],
                },
              },
            },
          }),
        ]);
        await execa('kubectl', ['rollout', 'restart', `deployment/${service}`, '-n', namespace]);
        await execa('kubectl', [
          'rollout',
          'status',
          `deployment/${service}`,
          '-n',
          namespace,
          '--timeout=600s',
        ]);
      } catch (error) {
        log.warning(`  ${chalk.yellow('⚠')} Could not reset ${service} image/resources`);
      }
    }
    return;
  }

  if (scenarioIds.length === 0 && !activeCodeScenario) {
    log.warning('No scenarios specified. Use --scenario, --code-scenario, or --reset');
    return;
  }

  if (activeCodeScenario) {
    await assertMinikubeAvailable();
    await ensureMinikubeRunning();
    log.info(`Applying code scenario: ${chalk.yellow(activeCodeScenario.name)}`);
    log.info(`  ${chalk.dim(activeCodeScenario.description)}`);

    const codeScenarioRepoDir = await applyCodeScenario({
      version: demoVersion,
      scenario: activeCodeScenario,
      log,
    });
    const imageOverrides = await buildCodeScenarioImages({
      repoDir: codeScenarioRepoDir,
      scenario: activeCodeScenario,
      config: demoConfig,
      log,
    });

    const resourceOverrides = activeCodeScenario.resourceOverrides || {};
    for (const service of codeScenarioServices) {
      const defaultConfig = serviceConfigsByName.get(service);
      if (!defaultConfig) {
        log.warning(`  ${chalk.yellow('⚠')} No default service config found for ${service}`);
        continue;
      }

      const image = imageOverrides[service] || defaultConfig.image;
      const usesScenarioImage = Boolean(imageOverrides[service]);
      log.info(`  ${chalk.green('✔')} Updating ${service} to ${image}`);
      await execa('kubectl', [
        'set',
        'image',
        `deployment/${service}`,
        `${service}=${image}`,
        '-n',
        namespace,
      ]);
      await execa('kubectl', [
        'patch',
        `deployment/${service}`,
        '-n',
        namespace,
        '--type',
        'strategic',
        '-p',
        JSON.stringify({
          spec: {
            template: {
              spec: {
                containers: [
                  {
                    name: service,
                    imagePullPolicy: usesScenarioImage ? 'Never' : 'IfNotPresent',
                    resources: resourceOverrides[service] || {},
                  },
                ],
              },
            },
          },
        }),
      ]);
      await execa('kubectl', ['rollout', 'restart', `deployment/${service}`, '-n', namespace]);
      await execa('kubectl', [
        'rollout',
        'status',
        `deployment/${service}`,
        '-n',
        namespace,
        '--timeout=600s',
      ]);
    }

    const { elasticsearch, server, kibanaCredentials } = readKibanaConfig(log, configPath);
    const kibanaHostname = `http://${server.host}:${server.port}${server.basePath}`;
    const kibanaUrl = await resolveKibanaUrl(kibanaHostname, log);
    await seedCodeSearch({
      elasticsearch,
      kibanaCredentials,
      kibanaUrl,
      version: demoVersion,
      codeScenarioId: activeCodeScenario.id,
      codeScenarioRepoDir,
      log,
    });

    if (scenarioIds.length === 0) {
      log.write('');
      log.success(`Applied code scenario ${activeCodeScenario.id}.`);
      return;
    }
  }

  // Collect env changes per service
  const envChanges: Record<string, Record<string, string>> = {};

  for (const id of scenarioIds) {
    const scenario = getScenarioById(demoType, id);
    if (!scenario) {
      throw new Error(`Unknown scenario: ${id}`);
    }

    log.info(`Applying scenario: ${chalk.yellow(scenario.name)}`);
    log.info(`  ${chalk.dim(scenario.description.split('\n')[0])}`);

    for (const step of scenario.steps) {
      if (step.type === 'env') {
        if (!envChanges[step.service]) {
          envChanges[step.service] = {};
        }
        envChanges[step.service][step.variable] = step.value;
      }
    }
  }

  // Apply env changes using kubectl set env
  for (const [service, envs] of Object.entries(envChanges)) {
    const envArgs = Object.entries(envs)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');

    log.debug(`Patching ${service}: ${envArgs}`);
    try {
      await execa.command(`kubectl set env deployment/${service} -n ${namespace} ${envArgs}`, {
        stdio: 'pipe',
      });
      log.info(`  ${chalk.green('✔')} Patched ${service}`);
    } catch (error) {
      log.error(`  ${chalk.red('✗')} Failed to patch ${service}: ${error}`);
    }
  }

  log.write('');
  log.success(`Applied ${scenarioIds.length} scenario(s).`);
  log.write('');
  log.write(chalk.dim('  To watch pod restarts:'));
  log.write(chalk.dim(`    kubectl get pods -n ${namespace} -w`));
  log.write('');
  log.write(chalk.dim('  To reset to defaults:'));
  log.write(chalk.dim(`    node scripts/otel_demo.js --demo ${demoType} --reset`));
}
