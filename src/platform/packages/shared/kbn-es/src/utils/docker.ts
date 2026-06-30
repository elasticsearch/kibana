/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import chalk from 'chalk';
import execa from 'execa';
import fs, { existsSync } from 'fs';
import Fsp from 'fs/promises';
import pRetry from 'p-retry';
import { resolve, basename, join } from 'path';
import type { ClientOptions } from '@elastic/elasticsearch';
import { Client, HttpConnection } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { kibanaPackageJson as pkg, REPO_ROOT } from '@kbn/repo-info';
import { CA_CERT_PATH, ES_P12_PASSWORD, ES_P12_PATH } from '@kbn/dev-utils';
import {
  MOCK_IDP_REALM_NAME,
  MOCK_IDP_ENTITY_ID,
  MOCK_IDP_ATTRIBUTE_PRINCIPAL,
  MOCK_IDP_ATTRIBUTE_ROLES,
  MOCK_IDP_ATTRIBUTE_EMAIL,
  MOCK_IDP_ATTRIBUTE_NAME,
  MOCK_IDP_ATTRIBUTE_UIAM_ACCESS_TOKEN,
  MOCK_IDP_ATTRIBUTE_UIAM_ACCESS_TOKEN_EXPIRES_AT,
  MOCK_IDP_ATTRIBUTE_UIAM_REFRESH_TOKEN,
  MOCK_IDP_ATTRIBUTE_UIAM_REFRESH_TOKEN_EXPIRES_AT,
  MOCK_IDP_UIAM_ORGANIZATION_ID,
  MOCK_IDP_UIAM_PROJECT_ID,
  ensureSAMLRoleMapping,
  createMockIdpMetadata,
  MOCK_IDP_UIAM_SERVICE_INTERNAL_URL,
  MOCK_IDP_SP_BASE_URL,
} from '@kbn/mock-idp-utils';

import { initializeUiamContainers, runUiamContainer, getUiamContainers } from './docker_uiam';
import { getServerlessImageTag, getCommitUrl } from './extract_image_info';
import { readStringSecrets } from './read_string_secrets';
import { waitForSecurityIndex } from './wait_for_security_index';
import { createCliError } from '../errors';
import { shouldPreferCachedSnapshot } from './find_local_cached_snapshot';
import type { EsClusterExecOptions } from '../cluster_exec_options';
import {
  SERVERLESS_RESOURCES_PATHS,
  SERVERLESS_SECRETS_PATH,
  SERVERLESS_JWKS_PATH,
  SERVERLESS_IDP_METADATA_PATH,
  SERVERLESS_CONFIG_PATH,
  SERVERLESS_FILES_PATH,
  SERVERLESS_SECRETS_SSL_PATH,
  SERVERLESS_ROLES_ROOT_PATH,
  SERVERLESS_OPERATOR_PATH,
} from '../paths';
import {
  ELASTIC_SERVERLESS_SUPERUSER,
  ELASTIC_SERVERLESS_SUPERUSER_PASSWORD,
} from './serverless_file_realm';
import { NativeRealm, SYSTEM_INDICES_SUPERUSER } from './native_realm';
import { waitUntilClusterReady } from './wait_until_cluster_ready';

interface ImageOptions {
  image?: string;
  tag?: string;
}

interface BaseOptions extends ImageOptions {
  port?: number;
  ssl?: boolean;
  /** Kill running cluster before starting a new cluster  */
  kill?: boolean;
  files?: string | string[];
}

export const serverlessProjectTypes = [
  'es',
  'oblt',
  'security',
  'workplaceai',
  'vectordb',
] as const;
export type ServerlessProjectType = (typeof serverlessProjectTypes)[number];

export const esServerlessProjectTypes = [
  'elasticsearch',
  'elasticsearch_general_purpose',
  'elasticsearch_vector',
  'observability',
  'security',
  'workplaceai',
  'vectordb',
] as const;
export type EsServerlessProjectType = (typeof esServerlessProjectTypes)[number];

export const serverlessProductTiers = [
  'essentials',
  'logs_essentials',
  'complete',
  'search_ai_lake',
] as const;
export type ServerlessProductTier = (typeof serverlessProductTiers)[number];

export const isServerlessProjectType = (value: string): value is ServerlessProjectType => {
  return serverlessProjectTypes.includes(value as ServerlessProjectType);
};

export const isEsServerlessProjectType = (value: string): value is EsServerlessProjectType => {
  return esServerlessProjectTypes.includes(value as EsServerlessProjectType);
};

export const isServerlessProjectTier = (value: string): value is ServerlessProductTier => {
  return serverlessProductTiers.includes(value as ServerlessProductTier);
};

export const esProjectTypeFromKbn = new Map<string, string>([
  // resolve Kibana `es` project type to general purpose by default
  // other elasticsearch_* project types need to be set explicitly in the test config
  ['es', 'elasticsearch_general_purpose'],
  ['oblt', 'observability'],
  ['security', 'security'],
  ['workplaceai', 'workplaceai'],
  ['vectordb', 'vectordb'],
]);

// ES operator/settings.json expects 'elasticsearch' for all `elasticsearch_*` project types.
export const esSettingsProjectTypeFromKbn = new Map<string, string>([
  ...esProjectTypeFromKbn.entries(),
  ['es', 'elasticsearch'],
]);

export const kbnProjectTypeFromEs = new Map<string, string>([
  ['elasticsearch', 'es'],
  ['elasticsearch_general_purpose', 'es'],
  ['elasticsearch_vector', 'es'],
  ['observability', 'oblt'],
  ['security', 'security'],
  ['workplaceai', 'workplaceai'],
  ['vectordb', 'vectordb'],
]);

export interface DockerOptions extends EsClusterExecOptions, BaseOptions {
  dockerCmd?: string;
  /** Activate snapshot-docker behavior (security, readiness check, detached mode, etc.) */
  snapshot?: boolean;
  license?: string;
  version?: string;
  /** Container name. Defaults to 'es01'. Use unique names for parallel runs. */
  name?: string;
  /** When true, returns immediately after ES is ready instead of tailing logs. */
  background?: boolean;
  /** Host-side transport port to map to container port 9300. Defaults to port + 100. */
  transportPort?: number;
}

export interface ServerlessOptions extends EsClusterExecOptions, BaseOptions {
  /** Publish ES docker container on additional host IP */
  host?: string;
  /** Serverless project type */
  projectType: ServerlessProjectType;
  /** Elasticsearch serverless project type */
  esProjectType?: EsServerlessProjectType;
  /** Product tier for serverless project */
  productTier?: ServerlessProductTier;
  /** Clean (or delete) all data created by the ES cluster after it is stopped */
  clean?: boolean;
  /** Full path where the ES cluster will store data */
  basePath: string;
  /** Directory in basePath where the ES cluster will store data */
  dataPath?: string;
  /** If this process exits, leave the ES cluster running in the background */
  skipTeardown?: boolean;
  /** Start the ES cluster in the background instead of remaining attached: useful for running tests */
  background?: boolean;
  /** Wait for the ES cluster to be ready to serve requests */
  waitForReady?: boolean;
  /**
   * Resource file(s) to overwrite
   * (see list of files that can be overwritten under `src/platform/packages/shared/kbn-es/src/serverless_resources/users`)
   */
  resources?: string | string[];
  /** Configure ES serverless with UIAM support */
  uiam?: boolean;
  /** Configure ES serverless with UIAM OAuth support (starts an additional uiam-oauth container) */
  uiamOAuth?: boolean;
  /** Configuration for a linked project in Cross Project Search (CPS) mode */
  linkedProject?: { projectId: string; port: number };
}

interface ServerlessEsNodeArgs {
  esArgs?: Array<[string, string]>;
  image: string;
  name: string;
  params: string[];
}

export const DEFAULT_PORT = 9200;
const DOCKER_REGISTRY = 'docker.elastic.co';

const ES_REFRESH_INTERVAL_OVERRIDE_FLAG =
  '-Des.stateless.allow.index.refresh_interval.override=true';

const DOCKER_BASE_CMD = [
  'run',

  '-t',

  '--net',
  'elastic',

  '--name',
  'es01',

  '-p',
  '127.0.0.1:9300:9300',
];

const DEFAULT_DOCKER_ESARGS: Array<[string, string]> = [
  ['ES_LOG_STYLE', 'file'],

  ['discovery.type', 'single-node'],

  ['xpack.security.enabled', 'false'],

  ['ES_JAVA_OPTS', '-Xms1536m -Xmx1536m'],
];

export const DOCKER_REPO = `${DOCKER_REGISTRY}/elasticsearch/elasticsearch`;
export const DOCKER_TAG = `${pkg.version}-SNAPSHOT`;
export const DOCKER_IMG = `${DOCKER_REPO}:${DOCKER_TAG}`;

export const ES_SERVERLESS_REPO_KIBANA = `${DOCKER_REGISTRY}/kibana-ci/elasticsearch-serverless`;
export const ES_SERVERLESS_REPO_ELASTICSEARCH = `${DOCKER_REGISTRY}/elasticsearch-ci/elasticsearch-serverless`;
export const ES_SERVERLESS_LATEST_VERIFIED_TAG = 'latest-verified';
export const ES_SERVERLESS_DEFAULT_IMAGE = `${ES_SERVERLESS_REPO_KIBANA}:${ES_SERVERLESS_LATEST_VERIFIED_TAG}`;

// See for default cluster settings
// https://github.com/elastic/elasticsearch-serverless/blob/main/serverless-build-tools/src/main/kotlin/elasticsearch.serverless-run.gradle.kts
export function getSharedServerlessParams(nameSuffix = ''): string[] {
  const n1 = `es01${nameSuffix}`;
  const n2 = `es02${nameSuffix}`;

  return [
    'run',

    '--detach',

    '--interactive',

    '--tty',

    '--net',
    'elastic',

    '--env',
    'path.repo=/objectstore',

    '--env',
    `cluster.initial_master_nodes=${n1},${n2}`,

    '--env',
    'stateless.enabled=true',

    '--env',
    'stateless.object_store.type=fs',
  ];
}

// only allow certain ES args to be overwrote by options
const DEFAULT_SERVERLESS_ESARGS: Array<[string, string]> = [
  ['ES_LOG_STYLE', 'file'],

  ['cluster.name', 'stateless'],

  ['ingest.geoip.downloader.enabled', 'false'],

  ['xpack.ml.enabled', 'true'],

  ['xpack.security.enabled', 'true'],

  // JWT realm settings are to closer emulate a real ES serverless env
  ['xpack.security.authc.realms.jwt.jwt1.allowed_audiences', 'elasticsearch'],

  ['xpack.security.authc.realms.jwt.jwt1.allowed_issuer', 'https://kibana.elastic.co/jwt/'],

  ['xpack.security.authc.realms.jwt.jwt1.claims.principal', 'sub'],

  ['xpack.security.authc.realms.jwt.jwt1.client_authentication.type', 'shared_secret'],

  ['xpack.security.authc.realms.jwt.jwt1.order', '-98'],

  [
    'xpack.security.authc.realms.jwt.jwt1.pkc_jwkset_path',
    `${SERVERLESS_CONFIG_PATH}jwks/jwks.json`,
  ],

  ['xpack.security.operator_privileges.enabled', 'true'],

  ['xpack.security.transport.ssl.enabled', 'true'],

  [
    'xpack.security.transport.ssl.keystore.path',
    `${SERVERLESS_CONFIG_PATH}certs/elasticsearch.p12`,
  ],

  ['xpack.security.transport.ssl.verification_mode', 'certificate'],

  [
    'xpack.security.remote_cluster_client.ssl.keystore.path',
    `${SERVERLESS_CONFIG_PATH}certs/elasticsearch.p12`,
  ],
  ['xpack.security.remote_cluster_client.ssl.verification_mode', 'certificate'],

  [
    'xpack.security.remote_cluster_server.ssl.keystore.path',
    `${SERVERLESS_CONFIG_PATH}certs/elasticsearch.p12`,
  ],
  ['xpack.security.remote_cluster_server.ssl.verification_mode', 'certificate'],
  ['xpack.security.remote_cluster_server.ssl.client_authentication', 'required'],

  ['ES_JAVA_OPTS', '-Xms1g -Xmx1g'],
];

const DEFAULT_SSL_ESARGS: Array<[string, string]> = [
  ['xpack.security.http.ssl.enabled', 'true'],

  ['xpack.security.http.ssl.keystore.path', `${SERVERLESS_CONFIG_PATH}certs/elasticsearch.p12`],

  ['xpack.security.http.ssl.verification_mode', 'certificate'],
];

const DOCKER_SSL_ESARGS: Array<[string, string]> = [
  ['xpack.security.enabled', 'true'],

  ['xpack.security.http.ssl.keystore.password', ES_P12_PASSWORD],

  ['xpack.security.transport.ssl.enabled', 'true'],

  [
    'xpack.security.transport.ssl.keystore.path',
    `${SERVERLESS_CONFIG_PATH}certs/elasticsearch.p12`,
  ],

  ['xpack.security.transport.ssl.verification_mode', 'certificate'],

  ['xpack.security.transport.ssl.keystore.password', ES_P12_PASSWORD],
];

export function getServerlessNodes(
  nameSuffix = '',
  portOffset = 0
): Array<Omit<ServerlessEsNodeArgs, 'image'>> {
  const n1 = `es01${nameSuffix}`;
  const n2 = `es02${nameSuffix}`;

  return [
    {
      name: n1,
      params: [
        '-p',
        `127.0.0.1:${9300 + portOffset}:${9300 + portOffset}`,

        '--env',
        `discovery.seed_hosts=${n2}`,

        '--env',
        'node.roles=["master","remote_cluster_client","ingest","index","ml","transform"]',
      ],
      esArgs: [
        ['xpack.searchable.snapshot.shared_cache.size', '16MB'],
        ['xpack.searchable.snapshot.shared_cache.region_size', '256K'],
        ['ES_JAVA_OPTS', '-Xms1536m -Xmx1536m'],
      ],
    },
    {
      name: n2,
      params: [
        '-p',
        `127.0.0.1:${9202 + portOffset}:${9202 + portOffset}`,

        '-p',
        `127.0.0.1:${9302 + portOffset}:${9302 + portOffset}`,

        '--env',
        `discovery.seed_hosts=${n1}`,

        '--env',
        'node.roles=["master","remote_cluster_client","search"]',
      ],
      esArgs: [
        ['xpack.searchable.snapshot.shared_cache.size', '16MB'],
        ['xpack.searchable.snapshot.shared_cache.region_size', '256K'],
      ],
    },
  ];
}

export const SERVERLESS_NODES = getServerlessNodes();

/**
 * Determine the Docker image from CLI options and defaults
 */
export function resolveDockerImage({
  tag,
  image,
  repo,
  defaultImg,
}: {
  tag?: string;
  image?: string;
  repo: string;
  defaultImg: string;
}) {
  if (image) {
    if (!image.includes(DOCKER_REGISTRY)) {
      throw createCliError(
        `Only verified images from ${DOCKER_REGISTRY} are currently allowed.\nIf you require this functionality in @kbn/es please contact the Kibana Operations Team.`
      );
    }

    return image;
  } else if (tag) {
    return `${repo}:${tag}`;
  }

  return defaultImg;
}

/**
 * Determine the port and optionally an additional host to bind the Serverless index node or Docker node to
 */
export function resolvePort(options: ServerlessOptions | DockerOptions) {
  const port = options.port || DEFAULT_PORT;
  const value = ['-p', `127.0.0.1:${port}:${port}`];

  if ((options as ServerlessOptions).host) {
    value.push('-p', `${(options as ServerlessOptions).host}:${port}:${port}`);
  }

  if (options.port) {
    value.push('--env', `http.port=${options.port}`);
  }

  return value;
}

/**
 * Verify that Docker is installed locally
 */
export async function verifyDockerInstalled(log: ToolingLog) {
  log.info(chalk.bold('Verifying Docker is installed.'));

  const { stdout } = await execa('docker', ['--version']).catch(({ message }) => {
    throw createCliError(
      `Docker not found locally. Install it from: https://www.docker.com\n\n${message}`
    );
  });

  log.indent(4, () => log.info(stdout));
}

/**
 * Setup elastic Docker network if needed
 */
export async function maybeCreateDockerNetwork(log: ToolingLog) {
  log.info(chalk.bold('Checking status of elastic Docker network.'));
  log.indent(4);

  const process = await execa('docker', ['network', 'create', 'elastic']).catch(({ message }) => {
    if (message.includes('network with name elastic already exists')) {
      log.info('Using existing network.');
    } else {
      throw createCliError(message);
    }
  });

  if (process?.exitCode === 0) {
    log.info('Created new network.');
  }

  log.indent(-4);
}

const RETRYABLE_DOCKER_PULL_ERROR_MESSAGES = [
  'connection refused',
  'i/o timeout',
  'Client.Timeout',
  'TLS handshake timeout',
];

/**
 * Pull a Docker image if needed. Ensures latest image.
 * Stops serverless from pulling the same image in each node's promise and
 * gives better control of log output, instead of falling back to docker run.
 */
export async function isDockerImageAvailableLocally(image: string) {
  try {
    const { stdout } = await execa('docker', ['images', '-q', image]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function maybePullDockerImage(log: ToolingLog, image: string) {
  log.info(chalk.bold(`Checking for image: ${image}`));

  if (shouldPreferCachedSnapshot() && (await isDockerImageAvailableLocally(image))) {
    log.info(
      'prefer-cached enabled, skipping pull of locally available image %s',
      chalk.bold(image)
    );
    return;
  }

  await pRetry(
    async () => {
      await execa('docker', ['pull', image], {
        // inherit is required to show Docker pull output
        stdio: ['ignore', 'inherit', 'pipe'],
      }).catch(({ message }) => {
        const errorMessage = `Error pulling image. This is likely an issue authenticating with ${DOCKER_REGISTRY}.
Visit ${chalk.bold.cyan('https://docker-auth.elastic.co/github_auth')} to login.

${message}`;
        throw createCliError(errorMessage);
      });
    },
    {
      retries: 2,
      onFailedAttempt: (error) => {
        // Only retry if retryable error messages are found in the error message.
        for (const msg of RETRYABLE_DOCKER_PULL_ERROR_MESSAGES) {
          if (error?.message?.includes(msg)) {
            log.info(`Retrying due to error: ${error.message}`);
            return;
          }
        }

        log.warning('Docker pull failed, error not retriable. Exiting.');
        throw error;
      },
    }
  );
}

/**
 * When we're working with :latest or :latest-verified, it is useful to expand what version they refer to
 */
export async function printDockerImageInfo(log: ToolingLog, image: string) {
  let imageFullName = image;
  if (image.includes('serverless')) {
    const imageTag = (await getServerlessImageTag(image)) ?? image.split(':').pop() ?? '';
    const imageBase = image.replace(/:.*/, '');
    imageFullName = `${imageBase}:${imageTag}`;
  }

  const revisionUrl = await getCommitUrl(image);
  log.info(`Using Docker image: ${imageFullName} (${revisionUrl})`);
}

export async function cleanUpDanglingContainers(log: ToolingLog) {
  log.info(chalk.bold('Cleaning up dangling Docker containers.'));

  try {
    const linkedNodes = getServerlessNodes('-linked', 10);
    const serverlessContainerNames = SERVERLESS_NODES.concat(
      linkedNodes,
      getUiamContainers({ includeOAuth: true })
    ).map(({ name }) => name);

    for (const name of serverlessContainerNames) {
      await execa('docker', ['container', 'rm', name, '--force']).catch(() => {
        // Ignore errors if the container doesn't exist
      });
    }

    log.success('Cleaned up dangling Docker containers.');
  } catch (e) {
    log.error(e);
  }
}

export async function detectRunningNodes(log: ToolingLog, options: BaseOptions) {
  const linkedNodes = getServerlessNodes('-linked', 10);
  const namesCmd = SERVERLESS_NODES.concat(
    linkedNodes,
    getUiamContainers({ includeOAuth: true })
  ).flatMap(({ name }) => ['--filter', `name=${name}`]);

  const { stdout } = await execa('docker', ['ps', '--quiet'].concat(namesCmd));
  const runningNodeIds = stdout.split(/\r?\n/).filter((s) => s);

  if (runningNodeIds.length) {
    if (options.kill) {
      log.info(chalk.bold('Killing running serverless containers.'));
      await execa('docker', ['kill'].concat(runningNodeIds));
    } else {
      throw createCliError(
        'ES has already been started, pass --kill to automatically stop the containers on startup.'
      );
    }
  } else {
    log.info('No running containers detected.');
  }
}

/**
 * Common setup for Docker and Serverless containers
 */
async function setupDocker({ log, options }: { log: ToolingLog; options: BaseOptions }) {
  await verifyDockerInstalled(log);
  await detectRunningNodes(log, options);
  await cleanUpDanglingContainers(log);
  await maybeCreateDockerNetwork(log);
}

/**
 * Pulls and prints info about the Docker image.
 */
async function setupDockerImage({ log, image }: { log: ToolingLog; image: string }) {
  await maybePullDockerImage(log, image);
  await printDockerImageInfo(log, image);
}

/**
 * Override default esArgs with options.esArgs
 */
export function resolveEsArgs(
  defaultEsArgs: Array<[string, string]>,
  options: ServerlessOptions | DockerOptions,
  projectIdOverride?: string
) {
  const { esArgs: customEsArgs, password, ssl } = options;
  const esArgs = new Map(defaultEsArgs);

  if (ssl) {
    DEFAULT_SSL_ESARGS.forEach((arg) => {
      esArgs.set(arg[0], arg[1]);
    });
  }

  if (customEsArgs) {
    const args = typeof customEsArgs === 'string' ? [customEsArgs] : customEsArgs;

    args.forEach((arg) => {
      const [key, ...value] = arg.split('=');

      esArgs.set(key.trim(), value.join('=').trim());
    });
  }

  if (password) {
    esArgs.set('ELASTIC_PASSWORD', password);
  }

  // Configure mock identify provider (ES only supports SAML when running in SSL mode)
  if (ssl && esArgs.get('xpack.security.enabled') !== 'false') {
    // The mock IDP setup requires a custom role mapping, but since native role mappings are disabled by default in
    // Serverless, we have to re-enable them explicitly here.
    esArgs.set('xpack.security.authc.native_role_mappings.enabled', 'true');

    esArgs.set(`xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.order`, '0');
    esArgs.set(
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.idp.metadata.path`,
      `${SERVERLESS_CONFIG_PATH}idp_metadata.xml`
    );
    esArgs.set(
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.idp.entity_id`,
      MOCK_IDP_ENTITY_ID
    );
    esArgs.set(
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.sp.entity_id`,
      MOCK_IDP_SP_BASE_URL
    );
    esArgs.set(
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.sp.acs`,
      `${MOCK_IDP_SP_BASE_URL}/api/security/saml/callback`
    );
    esArgs.set(
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.sp.logout`,
      `${MOCK_IDP_SP_BASE_URL}/logout`
    );
    esArgs.set(
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.attributes.principal`,
      MOCK_IDP_ATTRIBUTE_PRINCIPAL
    );
    esArgs.set(
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.attributes.groups`,
      MOCK_IDP_ATTRIBUTE_ROLES
    );
    esArgs.set(
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.attributes.name`,
      MOCK_IDP_ATTRIBUTE_NAME
    );
    esArgs.set(
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.attributes.mail`,
      MOCK_IDP_ATTRIBUTE_EMAIL
    );

    if ('uiam' in options && options.uiam) {
      // HACK: A workaround for the Serverless ES metering service, which is enabled automatically after we set
      // `serverless.project_id`, and, if not configured _explicitly_ with an HTTP URL, expects CA certs in a
      // fixed location (`http-certs/ca.crt`) that we cannot override. Any HTTP URL works — we reuse the SP base
      // URL just to avoid introducing another constant — and use the longest possible interval to reduce noise.
      esArgs.set('metering.url', MOCK_IDP_SP_BASE_URL);
      esArgs.set('metering.report_period', '60m');

      esArgs.set(
        `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.private_attributes`,
        [
          MOCK_IDP_ATTRIBUTE_UIAM_ACCESS_TOKEN,
          MOCK_IDP_ATTRIBUTE_UIAM_ACCESS_TOKEN_EXPIRES_AT,
          MOCK_IDP_ATTRIBUTE_UIAM_REFRESH_TOKEN,
          MOCK_IDP_ATTRIBUTE_UIAM_REFRESH_TOKEN_EXPIRES_AT,
        ].join(',')
      );

      esArgs.set('serverless.organization_id', MOCK_IDP_UIAM_ORGANIZATION_ID);
      esArgs.set('serverless.project_type', esProjectTypeFromKbn.get(options.projectType)!);
      esArgs.set('serverless.project_id', projectIdOverride ?? MOCK_IDP_UIAM_PROJECT_ID);

      esArgs.set('serverless.universal_iam_service.enabled', 'true');
      esArgs.set('serverless.universal_iam_service.url', MOCK_IDP_UIAM_SERVICE_INTERNAL_URL);
      esArgs.set('serverless.universal_iam_service.ssl.verification_mode', 'none');

      if ('linkedProject' in options && options.linkedProject) {
        esArgs.set('serverless.cross_project.enabled', 'true');
        esArgs.set('remote_cluster_server.enabled', 'true');
      }
    }
  }

  const getEsProjectTypeValue = () => {
    const esProjectTypeParam = esArgs.get('serverless.project_type');
    if (esProjectTypeParam) {
      // parameter explicitly set, use that as first option
      return esProjectTypeParam;
    }
    if ('esProjectType' in options) {
      // esProjectType specified, pass that as parameter value
      return options.esProjectType;
    }
    if ('projectType' in options) {
      // determine ES project type from Kibana project type as fallback
      return esProjectTypeFromKbn.get(options.projectType);
    }
  };
  const esProjectTypeValue = getEsProjectTypeValue();
  if (esProjectTypeValue) {
    esArgs.set('serverless.project_type', esProjectTypeValue);
  }

  const javaOptions = esArgs.get('ES_JAVA_OPTS');
  if (javaOptions) {
    // Ensure the serverless refresh interval override flag is always present alongside any custom ES_JAVA_OPTS.
    if (!javaOptions.includes(ES_REFRESH_INTERVAL_OVERRIDE_FLAG)) {
      esArgs.set('ES_JAVA_OPTS', `${javaOptions} ${ES_REFRESH_INTERVAL_OVERRIDE_FLAG}`.trim());
    }
  } else {
    esArgs.set('ES_JAVA_OPTS', ES_REFRESH_INTERVAL_OVERRIDE_FLAG);
  }

  return Array.from(esArgs).flatMap((e) => ['--env', e.join('=')]);
}

export function getESp12Volume() {
  return ['--volume', `${ES_P12_PATH}:${SERVERLESS_CONFIG_PATH}certs/elasticsearch.p12`];
}

/**
 * Removes REPO_ROOT from hostPath. Keep the rest to avoid filename collisions.
 * Returns the path where a file will be mounted inside the ES or ES serverless container.
 * /root/kibana/package/foo/bar.json => /usr/share/elasticsearch/files/package/foo/bar.json
 */
export function getDockerFileMountPath(hostPath: string) {
  return join(SERVERLESS_FILES_PATH, hostPath.replace(REPO_ROOT, ''));
}

/**
 * Setup local volumes for Serverless ES
 */
export async function setupServerlessVolumes(
  log: ToolingLog,
  options: ServerlessOptions,
  overrides?: { projectId?: string; operatorPath?: string }
) {
  const {
    basePath,
    clean,
    ssl,
    files,
    resources,
    projectType,
    productTier,
    dataPath = 'stateless',
  } = options;
  const objectStorePath = resolve(basePath, dataPath);

  log.info(chalk.bold(`Checking for local serverless ES object store at ${objectStorePath}`));
  log.indent(4);

  let exists = null;
  try {
    await Fsp.access(objectStorePath);
    exists = true;
  } catch (e) {
    exists = false;
  }
  if (clean && exists) {
    log.info('Cleaning existing object store.');
    try {
      await Fsp.rm(objectStorePath, { recursive: true, force: true });
    } catch (error) {
      // Fall back to sudo if needed, CI user can have issues removing old state
      await execa('sudo', ['rm', '-rf', objectStorePath]);
    }
  }

  if (clean || !exists) {
    await Fsp.mkdir(objectStorePath, { recursive: true }).then(() =>
      log.info('Created new object store.')
    );
  } else {
    log.info('Using existing object store.');
  }

  // Permissions are set separately from mkdir due to default umask
  await Fsp.chmod(objectStorePath, 0o777).then(() => {
    log.info('Setup object store permissions (chmod 777).');
  });

  log.indent(-4);

  const volumeCmds = [
    '--volume',
    `${basePath}:/objectstore:z`,
    '--env',
    `stateless.object_store.bucket=${dataPath}`,
  ];

  if (files) {
    const _files = typeof files === 'string' ? [files] : files;
    const fileCmds = _files.reduce<string[]>((acc, filePath) => {
      acc.push('--volume', `${filePath}:${getDockerFileMountPath(filePath)}:z`);

      return acc;
    }, []);

    volumeCmds.push(...fileCmds);
  }

  const resourceFileOverrides: Record<string, string> = resources
    ? (Array.isArray(resources) ? resources : [resources]).reduce((acc, filePath) => {
        acc[basename(filePath)] = resolve(process.cwd(), filePath);
        return acc;
      }, {} as Record<string, string>)
    : {};

  const tierSpecificRolesFileExists = (filePath: string): boolean => {
    try {
      return existsSync(filePath);
    } catch (e) {
      return false;
    }
  };

  // Read roles for the specified projectType
  const tierSpecificRolesResourcePath =
    productTier && resolve(SERVERLESS_ROLES_ROOT_PATH, projectType, productTier, 'roles.yml');
  const rolesResourcePath =
    tierSpecificRolesResourcePath && tierSpecificRolesFileExists(tierSpecificRolesResourcePath)
      ? tierSpecificRolesResourcePath
      : resolve(SERVERLESS_ROLES_ROOT_PATH, projectType, 'roles.yml');

  const resourcesPaths = [...SERVERLESS_RESOURCES_PATHS, rolesResourcePath];

  const serverlessResources = resourcesPaths.reduce<string[]>((acc, path) => {
    const fileName = basename(path);
    let localFilePath = path;

    if (resourceFileOverrides[fileName]) {
      localFilePath = resourceFileOverrides[fileName];
      log.info(`'${fileName}' resource overridden with: ${localFilePath}`);
      delete resourceFileOverrides[fileName];
    }

    acc.push('--volume', `${localFilePath}:${SERVERLESS_CONFIG_PATH}${fileName}`);

    return acc;
  }, []);

  if (Object.keys(resourceFileOverrides).length > 0) {
    throw new Error(
      `Unsupported ES serverless --resources value(s):\n  ${Object.values(
        resourceFileOverrides
      ).join('  \n')}\n\nValid resources: ${resourcesPaths
        .map((filePath) => basename(filePath))
        .join(' | ')}`
    );
  }

  // Create and add metadata for mock identity provider
  if (ssl) {
    const metadata = await createMockIdpMetadata();
    await Fsp.writeFile(SERVERLESS_IDP_METADATA_PATH, metadata);
    volumeCmds.push(
      '--volume',
      `${SERVERLESS_IDP_METADATA_PATH}:${SERVERLESS_CONFIG_PATH}idp_metadata.xml:z`
    );
  }

  volumeCmds.push(
    ...getESp12Volume(),
    ...serverlessResources,
    ...(await getOperatorVolume(
      esSettingsProjectTypeFromKbn.get(projectType)!,
      ssl,
      overrides?.projectId,
      overrides?.operatorPath
    )),

    '--volume',
    `${
      ssl ? SERVERLESS_SECRETS_SSL_PATH : SERVERLESS_SECRETS_PATH
    }:${SERVERLESS_CONFIG_PATH}secrets/secrets.json:z`,
    '--volume',
    `${SERVERLESS_JWKS_PATH}:${SERVERLESS_CONFIG_PATH}jwks/jwks.json:z`
  );

  return volumeCmds;
}

/**
 * Resolve the Serverless ES image based on defaults and CLI options
 */
function getServerlessImage({ image, tag }: ImageOptions) {
  return resolveDockerImage({
    image,
    tag,
    repo: ES_SERVERLESS_REPO_ELASTICSEARCH,
    defaultImg: ES_SERVERLESS_DEFAULT_IMAGE,
  });
}

/**
 * Run a single node in the ES Serverless cluster
 */
export async function runServerlessEsNode(
  log: ToolingLog,
  { params, name, image }: ServerlessEsNodeArgs,
  sharedParams: string[] = getSharedServerlessParams()
) {
  const dockerCmd = sharedParams.concat(
    params,
    ['--name', name, '--env', `node.name=${name}`],
    image
  );

  log.info(chalk.bold(`Running serverless ES node: ${name}`));
  log.indent(4, () => log.info(chalk.dim(`docker ${dockerCmd.join(' ')}`)));

  const { stdout } = await execa('docker', dockerCmd);

  log.indent(4, () =>
    log.info(`${name} is running.
  Container Name: ${name}
  Container Id:   ${stdout}

  View logs:            ${chalk.bold(`docker logs -f ${name}`)}
  Shell access:         ${chalk.bold(`docker exec -it ${name} /bin/bash`)}
`)
  );
}

function getESClient(clientOptions: ClientOptions): Client {
  return new Client({
    Connection: HttpConnection,
    requestTimeout: 30_000,
    ...clientOptions,
  });
}

/**
 * Runs an ES Serverless Cluster through Docker
 */
export async function runServerlessCluster(log: ToolingLog, options: ServerlessOptions) {
  const startTime = Date.now();
  const elapsed = () => `${((Date.now() - startTime) / 1000).toFixed(1)}s`;

  log.info('[runServerlessCluster] Setting up Docker environment...');
  await setupDocker({ log, options });
  log.info(`[runServerlessCluster] Docker environment ready (${elapsed()})`);

  const esServerlessImage = getServerlessImage({ image: options.image, tag: options.tag });
  log.info(`[runServerlessCluster] Pulling Docker image(s) for: ${esServerlessImage}...`);
  await Promise.all([
    setupDockerImage({ log, image: esServerlessImage }),
    ...(options.uiam
      ? getUiamContainers({ includeOAuth: options.uiamOAuth }).map(({ image }) =>
          setupDockerImage({ log, image })
        )
      : []),
  ]);
  log.info(`[runServerlessCluster] Docker image(s) ready (${elapsed()})`);

  log.info('[runServerlessCluster] Setting up serverless volumes...');
  const volumeCmd = await setupServerlessVolumes(log, options);
  log.info(`[runServerlessCluster] Serverless volumes ready (${elapsed()})`);

  const portCmd = resolvePort(options);

  log.info('[runServerlessCluster] Starting ES nodes...');
  // This is where nodes are started
  const nodeNames = await Promise.all(
    SERVERLESS_NODES.map(async (node, i) => {
      await runServerlessEsNode(log, {
        ...node,
        image: esServerlessImage,
        params: node.params.concat(
          resolveEsArgs(DEFAULT_SERVERLESS_ESARGS.concat(node.esArgs ?? []), options),
          i === 0 ? portCmd : [],
          volumeCmd
        ),
      });
      return node.name;
    }).concat(
      options.uiam
        ? getUiamContainers({ includeOAuth: options.uiamOAuth }).map((container) =>
            runUiamContainer(log, container)
          )
        : []
    )
  );
  log.info(`[runServerlessCluster] All ES nodes started (${elapsed()})`);

  log.success(`Serverless ES cluster running.
  Login with username ${chalk.bold.cyan(ELASTIC_SERVERLESS_SUPERUSER)} or ${chalk.bold.cyan(
    SYSTEM_INDICES_SUPERUSER
  )} and password ${chalk.bold.magenta(ELASTIC_SERVERLESS_SUPERUSER_PASSWORD)}
  See src/platform/packages/shared/kbn-es/src/serverless_resources/README.md for additional information on authentication.
  Stop the cluster:     ${chalk.bold(`docker container stop ${nodeNames.join(' ')}`)}
    `);

  if (!options.skipTeardown) {
    // SIGINT will not trigger in FTR (see cluster.runServerless for FTR signal)
    process.on('SIGINT', () => teardownServerlessClusterSync(log, options));
  }

  if (options.uiam) {
    log.info(`[runServerlessCluster] Initializing UIAM containers (${elapsed()})...`);
    await initializeUiamContainers(log);
    log.info(`[runServerlessCluster] UIAM containers initialized (${elapsed()})`);
  }

  const esNodeUrl = `${options.ssl ? 'https' : 'http'}://${portCmd[1].substring(
    0,
    portCmd[1].lastIndexOf(':')
  )}`;

  const client = getESClient({
    node: esNodeUrl,
    auth: {
      username: ELASTIC_SERVERLESS_SUPERUSER,
      password: ELASTIC_SERVERLESS_SUPERUSER_PASSWORD,
    },
    ...(options.ssl
      ? {
          tls: {
            ca: [fs.readFileSync(CA_CERT_PATH)],
            // NOTE: Even though we've added ca into the tls options, we are using 127.0.0.1 instead of localhost
            // for the ip which is not validated. As such we are getting the error
            // Hostname/IP does not match certificate's altnames: IP: 127.0.0.1 is not in the cert's list:
            // To work around that we are overriding the function checkServerIdentity too
            checkServerIdentity: () => {
              return undefined;
            },
          },
        }
      : {}),
  });

  const readyPromise = waitUntilClusterReady({ client, expectedStatus: 'green', log }).then(
    async () => {
      if (!options.ssl) {
        return;
      }

      await ensureSAMLRoleMapping(client);

      log.success(
        `Created role mapping for mock identity provider. You can now login using ${chalk.bold.cyan(
          MOCK_IDP_REALM_NAME
        )} realm`
      );
    }
  );

  if (options.waitForReady) {
    log.info(`[runServerlessCluster] Waiting for ES cluster to be ready (${elapsed()})...`);
    await readyPromise;
    log.info(`[runServerlessCluster] ES cluster is ready (${elapsed()})`);
    if (!options.esArgs || !options.esArgs.includes('xpack.security.enabled=false')) {
      // If security is not disabled, make sure the security index exists before running the test to avoid flakiness
      log.info(`[runServerlessCluster] Waiting for security index (${elapsed()})...`);
      await waitForSecurityIndex({ client, log });
      log.info(`[runServerlessCluster] Security index ready (${elapsed()})`);
    }
  }

  if (!options.background) {
    // The serverless cluster has to be started detached, so we attach a logger afterwards for output
    await execa('docker', ['logs', '-f', SERVERLESS_NODES[0].name], {
      // inherit is required to show Docker output and Java console output for pw, enrollment token, etc
      stdio: ['ignore', 'inherit', 'inherit'],
    }).catch(() => {
      /**
       * docker logs will throw errors when the nodes are killed through SIGINT
       * and the entrypoint doesn't exit normally, so we silence the errors.
       */
    });
  }

  return nodeNames;
}

export const LINKED_CLUSTER_NAME_SUFFIX = '-linked';
export const LINKED_CLUSTER_PORT_OFFSET = 10;

/**
 * Starts a linked ES Serverless cluster for Cross Project Search (CPS).
 * Must be called AFTER the origin cluster and UIAM are fully ready.
 * Reuses the same Docker network, ES image, and UIAM service -- does NOT start new UIAM containers.
 */
export async function runLinkedServerlessCluster(log: ToolingLog, options: ServerlessOptions) {
  const { linkedProject } = options;
  if (!linkedProject) {
    return [];
  }

  log.info(chalk.bold('Starting linked ES cluster for Cross Project Search...'));

  const esServerlessImage = getServerlessImage({ image: options.image, tag: options.tag });
  const linkedNodes = getServerlessNodes(LINKED_CLUSTER_NAME_SUFFIX, LINKED_CLUSTER_PORT_OFFSET);
  const linkedSharedParams = getSharedServerlessParams(LINKED_CLUSTER_NAME_SUFFIX);

  const linkedBasePath = resolve(options.basePath, `linked`);
  const linkedOptions: ServerlessOptions = {
    ...options,
    basePath: linkedBasePath,
    port: linkedProject.port,
    dataPath: `stateless${LINKED_CLUSTER_NAME_SUFFIX}`,
    uiam: true,
  };

  const linkedOperatorPath = resolve(REPO_ROOT, '.es', `operator${LINKED_CLUSTER_NAME_SUFFIX}`);
  const volumeCmd = await setupServerlessVolumes(log, linkedOptions, {
    projectId: linkedProject.projectId,
    operatorPath: linkedOperatorPath,
  });
  const portCmd = resolvePort(linkedOptions);

  const linkedClusterEsArgs: Array<[string, string]> = DEFAULT_SERVERLESS_ESARGS.concat([
    ['cluster.name', `stateless${LINKED_CLUSTER_NAME_SUFFIX}`],
  ]);

  const nodeNames = await Promise.all(
    linkedNodes.map(async (node, i) => {
      await runServerlessEsNode(
        log,
        {
          ...node,
          image: esServerlessImage,
          params: node.params.concat(
            resolveEsArgs(
              linkedClusterEsArgs.concat(node.esArgs ?? []),
              linkedOptions,
              linkedProject.projectId
            ),
            i === 0 ? portCmd : [],
            volumeCmd
          ),
        },
        linkedSharedParams
      );
      return node.name;
    })
  );

  log.success(`Linked ES cluster running for CPS (Cross-Project Search).
  Project ID: ${chalk.bold.cyan(linkedProject.projectId)}
  HTTP port:  ${chalk.bold.cyan(String(linkedProject.port))}
  Stop the cluster:     ${chalk.bold(`docker container stop ${nodeNames.join(' ')}`)}
    `);

  const esNodeUrl = `${options.ssl ? 'https' : 'http'}://${portCmd[1].substring(
    0,
    portCmd[1].lastIndexOf(':')
  )}`;

  const client = getESClient({
    node: esNodeUrl,
    auth: {
      username: ELASTIC_SERVERLESS_SUPERUSER,
      password: ELASTIC_SERVERLESS_SUPERUSER_PASSWORD,
    },
    ...(options.ssl
      ? {
          tls: {
            ca: [fs.readFileSync(CA_CERT_PATH)],
            checkServerIdentity: () => {
              return undefined;
            },
          },
        }
      : {}),
  });

  await waitUntilClusterReady({ client, expectedStatus: 'green', log });

  if (options.ssl) {
    await ensureSAMLRoleMapping(client);
  }

  if (!options.esArgs || !options.esArgs.includes('xpack.security.enabled=false')) {
    await waitForSecurityIndex({ client, log });
  }

  log.success('Linked ES cluster is ready.');

  await registerLinkedProjectInOriginSettings(log, options);

  return nodeNames;
}

const REMOTE_CLUSTER_SERVER_PORT = 9400;

/**
 * Updates the origin cluster's operator settings.json to register the linked project,
 * so ES can discover it for Cross Project Search via the /_project/tags API.
 *
 * The file is bind-mounted from the host, so writing it triggers an ES config reload.
 */
async function registerLinkedProjectInOriginSettings(log: ToolingLog, options: ServerlessOptions) {
  const { linkedProject } = options;
  if (!linkedProject) {
    return;
  }

  const settingsPath = join(SERVERLESS_OPERATOR_PATH, 'settings.json');
  log.info('Registering linked project in origin operator settings...');

  const currentJson = JSON.parse(await Fsp.readFile(settingsPath, 'utf-8'));

  const esProjectType =
    esSettingsProjectTypeFromKbn.get(options.projectType) ?? options.projectType;
  const linkedNodeName = `es01${LINKED_CLUSTER_NAME_SUFFIX}`;
  const linkedEndpoint = `${linkedNodeName}:${REMOTE_CLUSTER_SERVER_PORT}`;

  const linkedProjectInfo = {
    alias: 'linked_local_project',
    type: esProjectType,
    endpoint: linkedEndpoint,
    server_name: 'linked-local-project',
    tags: {
      _alias: 'linked_local_project',
      _id: linkedProject.projectId,
      _organization: MOCK_IDP_UIAM_ORGANIZATION_ID,
      _type: esProjectType,
      env: 'local',
    },
  };

  currentJson.metadata.version = String(Number(currentJson.metadata.version) + 1);
  currentJson.state.linked = {
    projects: {
      [linkedProject.projectId]: linkedProjectInfo,
    },
  };

  await Fsp.writeFile(settingsPath, JSON.stringify(currentJson, null, 2));
  log.success(`Linked project registered: ${linkedProject.projectId} -> ${linkedEndpoint}`);
}

/**
 * Stop a serverless ES cluster by node names
 */
export async function stopServerlessCluster(log: ToolingLog, nodes: string[]) {
  log.info('Stopping serverless ES cluster.');

  await execa('docker', ['container', 'stop'].concat(nodes));
}

/**
 * Kill any serverless ES nodes and UIAM related containers which are running.
 */
export function teardownServerlessClusterSync(log: ToolingLog, options: ServerlessOptions) {
  const imagesToKillContainersFor = [
    getServerlessImage(options),
    ...(options.uiam
      ? getUiamContainers({ includeOAuth: options.uiamOAuth }).map(({ image }) => image)
      : []),
  ];
  const { stdout } = execa.commandSync(
    `docker ps --filter status=running ${imagesToKillContainersFor
      .map((image) => `--filter ancestor=${image}`)
      .join(' ')} --quiet`
  );
  // Filter empty strings
  const runningNodes = stdout.split(/\r?\n/).filter((s) => s);

  if (runningNodes.length) {
    log.info('Killing running serverless containers.');

    execa.commandSync(`docker kill ${runningNodes.join(' ')}`);
  }
}

/**
 * Resolve the Elasticsearch image based on defaults and CLI options
 */
function getDockerImage({ image, tag }: ImageOptions) {
  return resolveDockerImage({
    image,
    tag,
    repo: DOCKER_REPO,
    defaultImg: DOCKER_IMG,
  });
}

/**
 * Resolve the full command to run Elasticsearch Docker container
 */
export function resolveDockerCmd(options: DockerOptions, image: string = DOCKER_IMG) {
  if (options.dockerCmd) {
    return options.dockerCmd.split(' ');
  }

  return DOCKER_BASE_CMD.concat(
    resolveEsArgs(DEFAULT_DOCKER_ESARGS.concat(options.ssl ? DOCKER_SSL_ESARGS : []), options),
    resolvePort(options),
    options.ssl ? getESp12Volume() : [],
    image
  );
}

/**
 * Runs an Elasticsearch Docker Container
 */
export async function runDockerContainer(
  log: ToolingLog,
  options: DockerOptions
): Promise<string | void> {
  if (options.snapshot) {
    return runDockerContainerInSnapshotMode(log, options);
  }

  let image;

  if (!options.dockerCmd) {
    await setupDocker({ log, options });
    image = getDockerImage({ image: options.image, tag: options.tag });
    await setupDockerImage({ log, image });
  }

  const dockerCmd = resolveDockerCmd(options, image);

  log.info(chalk.dim(`docker ${dockerCmd.join(' ')}`));
  await execa('docker', dockerCmd, {
    // inherit is required to show Docker output and Java console output for pw, enrollment token, etc
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

/**
 * A volume mount for the operator folder, that contains operator specific configuration files like settings.json.
 * We mount entire folder since Elasticsearch cannot properly watch changes in bind-mounted files.
 * @param projectType Type of the serverless project.
 * @param ssl Whether SSL is enabled (determines which secrets file to embed).
 * @param projectId Override for the project ID (defaults to MOCK_IDP_UIAM_PROJECT_ID).
 * @param operatorPath Override for the operator directory path on the host.
 */
async function getOperatorVolume(
  projectType: string,
  ssl: boolean = false,
  projectId: string = MOCK_IDP_UIAM_PROJECT_ID,
  operatorPath: string = SERVERLESS_OPERATOR_PATH
) {
  await Fsp.mkdir(operatorPath, { recursive: true });

  // Settings should include information about the project that's normally populated by the Elasticsearch Controller.
  const projectInfo = {
    id: projectId,
    type: projectType,
    alias: 'local_project',
    organization: MOCK_IDP_UIAM_ORGANIZATION_ID,
  };
  const projectTags = {
    ...Object.fromEntries(Object.entries(projectInfo).map(([key, value]) => [`_${key}`, value])),
    env: 'local',
  };

  const stringSecrets = await readStringSecrets(
    ssl ? SERVERLESS_SECRETS_SSL_PATH : SERVERLESS_SECRETS_PATH
  );

  await Fsp.writeFile(
    join(operatorPath, 'settings.json'),
    JSON.stringify(
      {
        metadata: { version: '100', compatibility: '' },
        state: {
          project: { ...projectInfo, tags: projectTags },
          cluster_secrets: { string_secrets: stringSecrets },
        },
      },
      null,
      2
    )
  );
  return ['--volume', `${operatorPath}:${SERVERLESS_CONFIG_PATH}operator`];
}

// ---------------------------------------------------------------------------
// Docker Snapshot Mode (activated by `snapshot: true` in DockerOptions)
// ---------------------------------------------------------------------------

/**
 * Default esArgs for Docker snapshot mode.
 * Mirrors the defaults applied by Cluster.exec() for the local snapshot flow,
 * plus the Docker-specific settings required for single-node operation.
 */
const DEFAULT_DOCKER_SNAPSHOT_ESARGS: Array<[string, string]> = [
  ['ES_LOG_STYLE', 'file'],
  ['discovery.type', 'single-node'],
  ['action.destructive_requires_name', 'true'],
  ['cluster.routing.allocation.disk.threshold_enabled', 'false'],
  ['ingest.geoip.downloader.enabled', 'false'],
  ['search.check_ccs_compatibility', 'true'],

  ['ES_JAVA_OPTS', '-Xms1536m -Xmx1536m'],
];

/**
 * Sanitize a path string into a valid Docker volume name.
 * Strips leading dots/slashes and replaces path separators with hyphens.
 */
function toDockerVolumeName(rawPath: string): string {
  const sanitized = rawPath.replace(/^[./\\]+/, '').replace(/[/\\]+/g, '-');
  return `kbn-es-${sanitized || 'data'}`;
}

/**
 * Runs an Elasticsearch Docker container with snapshot-equivalent semantics.
 *
 * - Applies the same default esArgs as the local snapshot flow
 * - Maps `--license=trial` → `xpack.license.self_generated.type=trial`
 * - Maps `-E path.data=<path>` → a Docker volume (named volume if local path
 *   doesn't exist, bind mount if it does)
 * - Waits for cluster readiness and sets up the native realm (passwords)
 */
async function runDockerContainerInSnapshotMode(
  log: ToolingLog,
  options: DockerOptions
): Promise<string> {
  await verifyDockerInstalled(log);
  await maybeCreateDockerNetwork(log);

  let tag = options.tag || (options.version ? `${options.version}-SNAPSHOT` : DOCKER_TAG);

  // When ES_SNAPSHOT_MANIFEST is set, use the commit-pinned docker tag from kibana-ci
  let repo = DOCKER_REPO;
  const manifestUrl = process.env.ES_SNAPSHOT_MANIFEST;
  if (!options.tag && !options.image && manifestUrl) {
    const resp = await fetch(manifestUrl);
    if (resp.ok) {
      const manifest = await resp.json();
      const { version, sha } = manifest;

      if (!/^\d+\.\d+\.\d+(-SNAPSHOT)?$/.test(version)) {
        throw createCliError(`Invalid version format in manifest: ${version}`);
      }
      if (!/^[0-9a-f]{40}$/.test(sha)) {
        throw createCliError(`Invalid sha format in manifest: ${sha}`);
      }

      const commitTag = `${version}-SNAPSHOT-${sha}`;
      const commitRepo = `${DOCKER_REGISTRY}/kibana-ci/elasticsearch`;
      const versionTag = `${version}-SNAPSHOT`;

      if (shouldPreferCachedSnapshot()) {
        if (await isDockerImageAvailableLocally(`${commitRepo}:${commitTag}`)) {
          tag = commitTag;
          repo = commitRepo;
        } else if (await isDockerImageAvailableLocally(`${commitRepo}:${versionTag}`)) {
          tag = versionTag;
          repo = commitRepo;
          log.info(`Using locally cached docker image ${repo}:${tag}`);
        } else if (await isDockerImageAvailableLocally(`${DOCKER_REPO}:${versionTag}`)) {
          tag = versionTag;
          repo = DOCKER_REPO;
          log.info(`Using locally cached docker image ${repo}:${tag}`);
        } else {
          tag = commitTag;
          repo = commitRepo;
        }
      } else {
        tag = commitTag;
        repo = commitRepo;
      }

      log.info(`Using docker image from manifest: ${repo}:${tag}`);
    } else {
      log.warning(
        `Failed to fetch ES_SNAPSHOT_MANIFEST (${resp.status}), falling back to default image`
      );
    }
  }

  const image = resolveDockerImage({
    image: options.image,
    tag,
    repo,
    defaultImg: DOCKER_IMG,
  });
  await setupDockerImage({ log, image });

  const containerName = options.name || 'es01';
  const port = options.port || DEFAULT_PORT;
  const password = options.password || 'changeme';
  const transportPort = options.transportPort ?? port + 100;

  await execa('docker', ['rm', '-f', containerName]).catch(() => {
    // ignore if container doesn't exist
  });

  const esArgsMap = new Map<string, string>(DEFAULT_DOCKER_SNAPSHOT_ESARGS);

  if (options.license === 'trial') {
    esArgsMap.set('xpack.license.self_generated.type', 'trial');
  }

  esArgsMap.set('ELASTIC_PASSWORD', password);

  const volumeMounts: string[] = [];
  const userEsArgs: string[] = options.esArgs
    ? Array.isArray(options.esArgs)
      ? options.esArgs
      : [options.esArgs]
    : [];

  for (const arg of userEsArgs) {
    const [key, ...rest] = arg.split('=');
    const k = key.trim();
    const v = rest.join('=').trim();

    if (k === 'path.data') {
      const hostPath = resolve(process.cwd(), v);
      if (fs.existsSync(hostPath)) {
        volumeMounts.push('--volume', `${hostPath}:/usr/share/elasticsearch/data`);
      } else {
        const volumeName = toDockerVolumeName(v);
        log.info(`Local path '${v}' does not exist — using Docker volume '${volumeName}'`);
        volumeMounts.push('--volume', `${volumeName}:/usr/share/elasticsearch/data`);
      }
      continue;
    }

    if (v) {
      const hostPath = resolve(REPO_ROOT, v);
      if (fs.existsSync(hostPath) && fs.statSync(hostPath).isFile()) {
        const containerPath = getDockerFileMountPath(hostPath);
        volumeMounts.push('--volume', `${hostPath}:${containerPath}`);
        esArgsMap.set(k, containerPath);
        continue;
      }
    }

    esArgsMap.set(k, v);
  }

  if (options.ssl) {
    esArgsMap.set('xpack.security.http.ssl.enabled', 'true');
    esArgsMap.set(
      'xpack.security.http.ssl.keystore.path',
      `${SERVERLESS_CONFIG_PATH}certs/elasticsearch.p12`
    );
    esArgsMap.set('xpack.security.http.ssl.keystore.password', ES_P12_PASSWORD);
    esArgsMap.set('xpack.security.transport.ssl.enabled', 'true');
    esArgsMap.set(
      'xpack.security.transport.ssl.keystore.path',
      `${SERVERLESS_CONFIG_PATH}certs/elasticsearch.p12`
    );
    esArgsMap.set('xpack.security.transport.ssl.verification_mode', 'certificate');
    esArgsMap.set('xpack.security.transport.ssl.keystore.password', ES_P12_PASSWORD);
    volumeMounts.push(...getESp12Volume());
  }

  const envArgs = Array.from(esArgsMap).flatMap(([k, v]) => {
    const value =
      k.startsWith('cluster.remote.') && k.endsWith('.seeds') && v.includes('localhost')
        ? v.replace(/localhost/g, 'host.docker.internal')
        : v;
    return ['--env', `${k}=${value}`];
  });

  const dockerCmd = [
    'run',
    '--detach',
    '-t',
    '--net',
    'elastic',
    '--add-host',
    'host.docker.internal:host-gateway',
    '--name',
    containerName,
    '-p',
    `${port}:9200`,
    '-p',
    `${transportPort}:9300`,
    ...envArgs,
    ...volumeMounts,
    image,
  ];

  log.info(chalk.dim(`docker ${dockerCmd.join(' ')}`));
  const { stdout: containerId } = await execa('docker', dockerCmd);

  log.info(`Container ${containerName} started: ${containerId.substring(0, 12)}`);

  process.on('SIGINT', () => {
    try {
      execa.commandSync(`docker kill ${containerName}`);
    } catch {
      // container may already be stopped
    }
  });

  const esUrl = `${options.ssl ? 'https' : 'http'}://127.0.0.1:${port}`;
  const client = new Client({
    node: esUrl,
    auth: { username: 'elastic', password },
    Connection: HttpConnection,
    requestTimeout: 30_000,
    ...(options.ssl
      ? {
          tls: {
            ca: [fs.readFileSync(CA_CERT_PATH)],
            checkServerIdentity: () => undefined,
          },
        }
      : {}),
  });

  if (!options.skipReadyCheck) {
    log.info('Waiting for ES to be ready...');
    await waitUntilClusterReady({
      client,
      expectedStatus: 'yellow',
      log,
      readyTimeout: options.readyTimeout,
    });
  }

  const securityExplicitlyDisabled = esArgsMap.get('xpack.security.enabled') === 'false';
  if (!securityExplicitlyDisabled && !options.skipSecuritySetup) {
    const nativeRealm = new NativeRealm({ elasticPassword: password, client, log });
    await nativeRealm.setPasswords(options as Record<string, unknown>);
  }

  log.success('ES is ready and native realm is set up');
  log.info(`  View logs:    ${chalk.bold(`docker logs -f ${containerName}`)}`);
  log.info(`  Shell:        ${chalk.bold(`docker exec -it ${containerName} /bin/bash`)}`);
  log.info(`  Stop:         ${chalk.bold(`docker container stop ${containerName}`)}`);

  if (!options.background) {
    await execa('docker', ['logs', '-f', containerName], {
      stdio: ['ignore', 'inherit', 'inherit'],
    }).catch(() => {
      // docker logs exits when the container stops
    });
  }

  return containerName;
}

export async function stopDockerContainer(log: ToolingLog, containerName: string): Promise<void> {
  try {
    await execa('docker', ['kill', containerName]);
    log.info(`Docker container ${containerName} killed`);
  } catch {
    // container may already be stopped
  }

  try {
    await execa('docker', ['rm', '-f', containerName]);
    log.info(`Docker container ${containerName} removed`);
  } catch {
    // container may already be removed
  }
}
