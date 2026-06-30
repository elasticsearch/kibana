/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { access, chmod, mkdir, rm, writeFile } from 'fs/promises';
import { fetch } from 'undici';
import { join } from 'path';
import {
  generateCosmosDBApiRequestHeaders,
  MOCK_IDP_UIAM_COSMOS_DB_ACCESS_KEY,
  MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_API_KEYS,
  MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_OAUTH_APP_CONNECTIONS,
  MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_OAUTH_AUTHORIZATION_CODES,
  MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_OAUTH_CLIENTS,
  MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_TOKEN_INVALIDATION,
  MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_USERS,
  MOCK_IDP_UIAM_COSMOS_DB_INTERNAL_URL,
  MOCK_IDP_UIAM_COSMOS_DB_NAME,
  MOCK_IDP_UIAM_COSMOS_DB_URL,
  MOCK_IDP_UIAM_SHARED_SECRET,
  MOCK_IDP_UIAM_SIGNING_SECRET,
} from '@kbn/mock-idp-utils';
import type { ToolingLog } from '@kbn/tooling-log';
import chalk from 'chalk';
import execa from 'execa';
import { setTimeout as setTimeoutAsync } from 'timers/promises';
import { Agent } from 'undici';
import { REPO_ROOT } from '@kbn/repo-info';
import { CA_CERT_PATH, KBN_CERT_PATH, KBN_KEY_PATH } from '@kbn/dev-utils';
import {
  SERVERLESS_UIAM_ENTRYPOINT_PATH,
  SERVERLESS_UIAM_CERTIFICATE_BUNDLE_PATH,
  SERVERLESS_IDP_METADATA_PATH,
} from '../paths';

const COSMOS_DB_EMULATOR_DOCKER_REGISTRY = 'docker.elastic.co';
const COSMOS_DB_EMULATOR_DOCKER_REPO = `${COSMOS_DB_EMULATOR_DOCKER_REGISTRY}/kibana-ci/uiam-azure-cosmos-emulator`;

export const COSMOS_DB_EMULATOR_DEFAULT_IMAGE = `${COSMOS_DB_EMULATOR_DOCKER_REPO}:latest-verified`;

const UIAM_DOCKER_REGISTRY = 'docker.elastic.co';
const UIAM_DOCKER_PROMOTED_REPO = `${UIAM_DOCKER_REGISTRY}/kibana-ci/uiam`;

export const UIAM_DEFAULT_IMAGE = `${UIAM_DOCKER_PROMOTED_REPO}:latest-verified`;

// Path inside the Cosmos DB emulator container where it stores persisted data
// (matches the image's `DATA_PATH` env var default).
const COSMOS_DB_DATA_PATH_IN_CONTAINER = '/data';

// Subdirectory of the ES `basePath` (e.g. `<REPO>/.es`) where Cosmos DB
// emulator data is persisted across restarts. Sibling of the ES `stateless`
// bucket so a single `--clean` clears both.
export const UIAM_COSMOS_DB_DATA_DIR = 'cosmosdb';

const MAX_HEALTHCHECK_RETRIES = 30;

const ENV_DEFAULTS = {
  UIAM_COSMOS_DB_PORT: '8081',
  UIAM_COSMOS_DB_UI_PORT: '8082',
  UIAM_SERVICE_PORT: '8443',
  UIAM_OAUTH_SERVICE_PORT: '8444',
  UIAM_APP_LOGGING_LEVEL: 'DEBUG',
  UIAM_LOGGING_LEVEL: 'INFO',
};

const env = Object.fromEntries(
  Object.entries(ENV_DEFAULTS).map(([key, value]) => [key, String(process.env[key] || value)])
) as typeof ENV_DEFAULTS;

const SHARED_DOCKER_PARAMS = [
  'run',
  '--detach',
  '--interactive',
  '--tty',
  '--health-interval',
  '5s',
  '--health-timeout',
  '2s',
  '--health-retries',
  `${MAX_HEALTHCHECK_RETRIES}`,
  '--health-start-period',
  '3s',
];

export interface UiamContainer {
  name: string;
  image: string;
  params: string[];
  cmdParams: string[];
}

function getUiamCosmosDbContainer({
  cosmosDbDataPath,
}: { cosmosDbDataPath?: string } = {}): UiamContainer {
  const persistData = Boolean(cosmosDbDataPath);
  return {
    name: 'uiam-cosmosdb',
    image: process.env.UIAM_COSMOSDB_DOCKER_IMAGE || COSMOS_DB_EMULATOR_DEFAULT_IMAGE,
    params: [
      '--net',
      'elastic',

      // Cap container memory so the kernel OOM-killer doesn't pick UIAM stack
      // when total stack RSS approaches Docker VM limit.
      '--memory',
      '1g',
      '--memory-swap',
      '1g',

      '--volume',
      `${SERVERLESS_UIAM_CERTIFICATE_BUNDLE_PATH}:/scripts/certs/uiam_cosmosdb.pfx:z`,

      // When a host data path is provided, mount it into the emulator's data
      // directory so Cosmos DB state survives restarts.
      ...(persistData
        ? ['--volume', `${cosmosDbDataPath}:${COSMOS_DB_DATA_PATH_IN_CONTAINER}:z`]
        : []),

      '-p',
      `127.0.0.1:${env.UIAM_COSMOS_DB_PORT}:8081`, // Cosmos DB gateway
      '-p',
      `127.0.0.1:${env.UIAM_COSMOS_DB_UI_PORT}:1234`, // Cosmos DB emulator UI

      '--env',
      'AZURE_COSMOS_EMULATOR_PARTITION_COUNT=1',
      '--env',
      `AZURE_COSMOS_EMULATOR_ENABLE_DATA_PERSISTENCE=${persistData ? 'true' : 'false'}`,
      '--env',
      'GATEWAY_PUBLIC_ENDPOINT=uiam-cosmosdb',
      '--env',
      'CERT_PATH=/scripts/certs/uiam_cosmosdb.pfx',
      '--env',
      'LOG_LEVEL=error',

      '--health-cmd',
      'curl -sk http://127.0.0.1:8080/ready | grep -q "\\"overall\\": true"',
    ],
    cmdParams: ['--protocol', 'https', '--port', '8081'],
  };
}

const UIAM_CONTAINER: UiamContainer = {
  name: 'uiam',
  image: process.env.UIAM_DOCKER_IMAGE || UIAM_DEFAULT_IMAGE,
  params: [
    '--net',
    'elastic',

    // The Quarkus base image launches the JVM with `-XX:MaxRAMPercentage=80.0`
    // and no Xmx, so without an explicit cgroup limit the JVM reserves up to
    // 80% of the Docker VM's memory as heap (~6.4GB on the 8GB default).
    // Pair this with JAVA_OPTS_APPEND below to bound heap predictably.
    '--memory',
    '2g',
    '--memory-swap',
    '2g',

    '--volume',
    `${SERVERLESS_UIAM_ENTRYPOINT_PATH}:/opt/jboss/container/java/run/run-java-with-custom-ca.sh:z`,

    '--volume',
    `${SERVERLESS_UIAM_CERTIFICATE_BUNDLE_PATH}:/tmp/uiam_cosmosdb.pfx:z`,
    '--volume',
    `${CA_CERT_PATH}:/tmp/ca.crt:z`,
    '--volume',
    `${KBN_KEY_PATH}:/tmp/server.key:z`,
    '--volume',
    `${KBN_CERT_PATH}:/tmp/server.crt:z`,

    '-p',
    `127.0.0.1:${env.UIAM_SERVICE_PORT}:8443`, // UIAM API port

    '--entrypoint',
    '/opt/jboss/container/java/run/run-java-with-custom-ca.sh',

    '--env',
    'JAVA_OPTS_APPEND=-Xms256m -Xmx1g',

    '--env',
    'uiam.apikey.convert.validation.endpoint.enabled=false',
    '--env',
    'quarkus.tls.https.key-store.pem.0.cert=/tmp/server.crt',
    '--env',
    'quarkus.tls.https.key-store.pem.0.key=/tmp/server.key',
    '--env',
    'quarkus.tls.https.trust-store.pem.certs=/tmp/ca.crt',

    '--env',
    'quarkus.tls.esclient.key-store.pem.0.cert=/tmp/server.crt',
    '--env',
    'quarkus.tls.esclient.key-store.pem.0.key=/tmp/server.key',

    '--env',
    'quarkus.http.ssl.certificate.key-store-provider=JKS',
    '--env',
    'quarkus.http.ssl.certificate.trust-store-provider=SUN',
    '--env',
    `quarkus.log.category."co".level=${env.UIAM_LOGGING_LEVEL}`,
    '--env',
    `quarkus.log.category."io".level=${env.UIAM_LOGGING_LEVEL}`,
    '--env',
    `quarkus.log.category."org".level=${env.UIAM_LOGGING_LEVEL}`,
    '--env',
    `quarkus.log.category."co.elastic.cloud.uiam".level=${env.UIAM_APP_LOGGING_LEVEL}`,
    '--env',
    `quarkus.log.category."co.elastic.cloud.uiam.app.authentication.ClientCertificateExtractor".level=${env.UIAM_LOGGING_LEVEL}`,
    '--env',
    'quarkus.log.console.json.enabled=false',
    '--env',
    `quarkus.log.level=${env.UIAM_LOGGING_LEVEL}`,
    '--env',
    'quarkus.otel.sdk.disabled=true',
    '--env',
    'quarkus.profile=dev',
    '--env',
    'uiam.api_keys.decoder.prefixes=essu_dev',
    '--env',
    'uiam.api_keys.encoder.prefix=essu_dev',
    '--env',
    `uiam.cosmos.account.access_key=${MOCK_IDP_UIAM_COSMOS_DB_ACCESS_KEY}`,
    '--env',
    `uiam.cosmos.account.endpoint=${MOCK_IDP_UIAM_COSMOS_DB_INTERNAL_URL}`,
    '--env',
    `uiam.cosmos.container.apikey=${MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_API_KEYS}`,
    '--env',
    `uiam.cosmos.container.oauth_authorization_code=${MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_OAUTH_AUTHORIZATION_CODES}`,
    '--env',
    `uiam.cosmos.container.oauth_client=${MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_OAUTH_CLIENTS}`,
    '--env',
    `uiam.cosmos.container.oauth_app_connection=${MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_OAUTH_APP_CONNECTIONS}`,
    '--env',
    `uiam.cosmos.container.token_invalidation=${MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_TOKEN_INVALIDATION}`,
    '--env',
    `uiam.cosmos.container.users=${MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_USERS}`,
    '--env',
    `uiam.cosmos.database=${MOCK_IDP_UIAM_COSMOS_DB_NAME}`,
    '--env',
    'uiam.cosmos.gateway_connection_mode=true',
    '--env',
    `uiam.internal.shared.secrets=${MOCK_IDP_UIAM_SHARED_SECRET}`,
    '--env',
    `uiam.tokens.jwt.signature.secrets=${MOCK_IDP_UIAM_SIGNING_SECRET}`,
    '--env',
    `uiam.tokens.jwt.signing.secret=${MOCK_IDP_UIAM_SIGNING_SECRET}`,

    '--env',
    'uiam.tokens.jwt.verify.clock.skew=PT2S',

    '--env',
    'uiam.tokens.refresh.grace_period=PT3S',

    '--health-cmd',
    'timeout 1 bash -c "</dev/tcp/localhost/8080"',
  ],
  cmdParams: [],
};

const UIAM_OAUTH_CONTAINER: UiamContainer = {
  name: 'uiam-oauth',
  image: process.env.UIAM_DOCKER_IMAGE || UIAM_DEFAULT_IMAGE,
  params: [
    '--net',
    'elastic',

    // See note on the `uiam` container memory limits above.
    '--memory',
    '2g',
    '--memory-swap',
    '2g',

    '--volume',
    `${SERVERLESS_UIAM_ENTRYPOINT_PATH}:/opt/jboss/container/java/run/run-java-with-custom-ca.sh:z`,

    '--volume',
    `${SERVERLESS_UIAM_CERTIFICATE_BUNDLE_PATH}:/tmp/uiam_cosmosdb.pfx:z`,
    '--volume',
    `${CA_CERT_PATH}:/tmp/ca.crt:z`,
    '--volume',
    `${KBN_KEY_PATH}:/tmp/server.key:z`,
    '--volume',
    `${KBN_CERT_PATH}:/tmp/server.crt:z`,

    '-p',
    `127.0.0.1:${env.UIAM_OAUTH_SERVICE_PORT}:8443`, // UIAM OAuth HTTPS port

    '--entrypoint',
    '/opt/jboss/container/java/run/run-java-with-custom-ca.sh',

    '--env',
    'JAVA_OPTS_APPEND=-Xms256m -Xmx1g',

    '--env',
    'uiam.apikey.convert.validation.endpoint.enabled=false',
    '--env',
    'quarkus.tls.https.key-store.pem.0.cert=/tmp/server.crt',
    '--env',
    'quarkus.tls.https.key-store.pem.0.key=/tmp/server.key',
    '--env',
    'quarkus.tls.https.trust-store.pem.certs=/tmp/ca.crt',

    '--env',
    'quarkus.tls.esclient.key-store.pem.0.cert=/tmp/server.crt',
    '--env',
    'quarkus.tls.esclient.key-store.pem.0.key=/tmp/server.key',

    '--env',
    'quarkus.http.ssl.certificate.key-store-provider=JKS',
    '--env',
    'quarkus.http.ssl.certificate.trust-store-provider=SUN',
    '--env',
    `quarkus.log.category."co".level=${env.UIAM_LOGGING_LEVEL}`,
    '--env',
    `quarkus.log.category."io".level=${env.UIAM_LOGGING_LEVEL}`,
    '--env',
    `quarkus.log.category."org".level=${env.UIAM_LOGGING_LEVEL}`,
    '--env',
    `quarkus.log.category."co.elastic.cloud.uiam".level=${env.UIAM_APP_LOGGING_LEVEL}`,
    '--env',
    `quarkus.log.category."co.elastic.cloud.uiam.app.authentication.ClientCertificateExtractor".level=${env.UIAM_LOGGING_LEVEL}`,
    '--env',
    'quarkus.log.console.json.enabled=false',
    '--env',
    `quarkus.log.level=${env.UIAM_LOGGING_LEVEL}`,
    '--env',
    'quarkus.otel.sdk.disabled=true',
    '--env',
    'quarkus.profile=dev',
    '--env',
    'uiam.api_keys.decoder.prefixes=essu_dev',
    '--env',
    'uiam.api_keys.encoder.prefix=essu_dev',
    '--env',
    `uiam.cosmos.account.access_key=${MOCK_IDP_UIAM_COSMOS_DB_ACCESS_KEY}`,
    '--env',
    `uiam.cosmos.account.endpoint=${MOCK_IDP_UIAM_COSMOS_DB_INTERNAL_URL}`,
    '--env',
    `uiam.cosmos.container.apikey=${MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_API_KEYS}`,
    '--env',
    `uiam.cosmos.container.token_invalidation=${MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_TOKEN_INVALIDATION}`,
    '--env',
    `uiam.cosmos.container.users=${MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_USERS}`,
    '--env',
    `uiam.cosmos.database=${MOCK_IDP_UIAM_COSMOS_DB_NAME}`,
    '--env',
    'uiam.cosmos.gateway_connection_mode=true',
    '--env',
    `uiam.internal.shared.secrets=${MOCK_IDP_UIAM_SHARED_SECRET}`,
    '--env',
    `uiam.tokens.jwt.signature.secrets=${MOCK_IDP_UIAM_SIGNING_SECRET}`,
    '--env',
    `uiam.tokens.jwt.signing.secret=${MOCK_IDP_UIAM_SIGNING_SECRET}`,

    '--env',
    'uiam.tokens.jwt.verify.clock.skew=PT2S',

    '--env',
    'UIAM_SERVICE_BOUNDARY=external',

    '--env',
    `uiam.oauth.base_url=https://localhost:${env.UIAM_OAUTH_SERVICE_PORT}`,
    '--env',
    `UIAM_OAUTH_BASE_URL=https://localhost:${env.UIAM_OAUTH_SERVICE_PORT}`,

    '--env',
    'uiam.tokens.refresh.grace_period=PT3S',

    '--volume',
    `${SERVERLESS_IDP_METADATA_PATH}:/tmp/mock-idp-metadata.xml:z`,
    '--env',
    'uiam.saml.idp.metadata=/tmp/mock-idp-metadata.xml',
    '--env',
    `uiam.saml.acs.url=https://localhost:${env.UIAM_OAUTH_SERVICE_PORT}/saml/consume`,

    '--health-cmd',
    'timeout 1 bash -c "</dev/tcp/localhost/8443"',
  ],
  cmdParams: [],
};

/**
 * Returns the list of UIAM containers to run.
 * When `includeOAuth` is true, includes the UIAM OAuth container.
 * When `cosmosDbDataPath` is provided, the Cosmos DB emulator is configured to
 * persist data to that host directory across restarts.
 */
export function getUiamContainers({
  includeOAuth = false,
  cosmosDbDataPath,
}: { includeOAuth?: boolean; cosmosDbDataPath?: string } = {}): UiamContainer[] {
  const baseContainers: UiamContainer[] = [
    getUiamCosmosDbContainer({ cosmosDbDataPath }),
    UIAM_CONTAINER,
  ];
  return includeOAuth ? [...baseContainers, UIAM_OAUTH_CONTAINER] : baseContainers;
}

/** @deprecated Use {@link getUiamContainers} instead */
export const UIAM_CONTAINERS = getUiamContainers();

/**
 * Sets up the host directory used to persist Cosmos DB emulator data across
 * restarts. Mirrors {@link setupServerlessVolumes} for ES: the directory
 * survives restarts by default, and is wiped when `clean` is true. The
 * directory is a sibling of the ES `stateless` bucket under the same
 * `basePath`, so a single `--clean` clears both data stores.
 */
export async function setupUiamCosmosDbDataDir(
  log: ToolingLog,
  { basePath, clean }: { basePath: string; clean?: boolean }
): Promise<string> {
  const cosmosDbDataPath = join(basePath, UIAM_COSMOS_DB_DATA_DIR);

  log.info(chalk.bold(`Checking for local UIAM Cosmos DB data store at ${cosmosDbDataPath}`));
  log.indent(4);

  let exists = false;
  try {
    await access(cosmosDbDataPath);
    exists = true;
  } catch (e) {
    exists = false;
  }

  if (clean && exists) {
    log.info('Cleaning existing UIAM Cosmos DB data store.');
    try {
      await rm(cosmosDbDataPath, { recursive: true, force: true });
    } catch (error) {
      // Fall back to sudo if needed, CI user can have issues removing old state
      await execa('sudo', ['rm', '-rf', cosmosDbDataPath]);
    }
  }

  if (clean || !exists) {
    await mkdir(cosmosDbDataPath, { recursive: true });
    log.info('Created new UIAM Cosmos DB data store.');
  } else {
    log.info('Using existing UIAM Cosmos DB data store.');
  }

  // Permissions are set separately from mkdir due to default umask.
  await chmod(cosmosDbDataPath, 0o777);
  log.info('Setup UIAM Cosmos DB data store permissions (chmod 777).');

  log.indent(-4);
  return cosmosDbDataPath;
}

/**
 * Run a single UIAM-related container.
 */
export async function runUiamContainer(log: ToolingLog, container: UiamContainer) {
  const dockerCommand = SHARED_DOCKER_PARAMS.concat(
    container.params,
    ['--name', container.name],
    container.image,
    container.cmdParams
  );
  log.info(chalk.bold(`Running "${container.name}" container…`));
  log.indent(4, () => log.info(chalk.dim(`docker ${dockerCommand.join(' ')}`)));

  const { stdout: containerId } = await execa('docker', dockerCommand);

  let isHealthy = false;
  let healthcheckRetries = 0;
  while (!isHealthy) {
    let currentStatus;
    try {
      const { stdout: statusRaw } = await execa('docker', [
        'inspect',
        '-f',
        '{{.State.Health.Status}}',
        container.name,
      ]);

      currentStatus = statusRaw.trim();
      if (currentStatus === 'healthy') {
        isHealthy = true;
        break;
      }
    } catch (err) {
      currentStatus = `error: ${err}`;
    }

    log.info(chalk.bold(`Waiting for "${container.name}" container (${currentStatus})…`));
    await setTimeoutAsync(2000);

    healthcheckRetries++;
    if (healthcheckRetries >= MAX_HEALTHCHECK_RETRIES) {
      await tryExportLogs(container.name, log);
      throw new Error(
        `The "${
          container.name
        }" container failed to start within the expected time. Last known status: ${currentStatus}. Check the logs with ${chalk.bold(
          `docker logs -f ${container.name}`
        )}`
      );
    }
  }

  log.indent(4, () =>
    log.info(`The "${container.name}" container is up and ready.
  Container Name: ${container.name}
  Container Id:   ${containerId}

  View logs:            ${chalk.bold(`docker logs -f ${container.name}`)}
  Shell access:         ${chalk.bold(`docker exec -it ${container.name} /bin/bash`)}
`)
  );

  return container.name;
}

export async function initializeUiamContainers(log: ToolingLog) {
  const fetchDispatcher = new Agent({ connect: { rejectUnauthorized: false } });

  log.info(
    chalk.bold(
      `Initializing Cosmos DB (${MOCK_IDP_UIAM_COSMOS_DB_URL}/${MOCK_IDP_UIAM_COSMOS_DB_NAME})…`
    )
  );

  // 1. Create database.
  const dbRes = await fetch(`${MOCK_IDP_UIAM_COSMOS_DB_URL}/dbs`, {
    method: 'POST',
    headers: generateCosmosDBApiRequestHeaders('POST', 'dbs', ''),
    body: JSON.stringify({ id: MOCK_IDP_UIAM_COSMOS_DB_NAME }),
    dispatcher: fetchDispatcher,
  });

  if (dbRes.status === 201) {
    log.info(chalk.green(`✓ Database (${MOCK_IDP_UIAM_COSMOS_DB_NAME}) created successfully`));
  } else if (dbRes.status === 409) {
    log.info(chalk.yellow(`✓ Database (${MOCK_IDP_UIAM_COSMOS_DB_NAME}) already exists`));
  } else {
    throw new Error(
      `Failed to create database (${MOCK_IDP_UIAM_COSMOS_DB_NAME}): ${
        dbRes.status
      } ${await dbRes.text()}`
    );
  }

  // 2. Create collections.
  // Partition key paths must match the UIAM service's CosmosDB repository expectations.
  const collections: Array<{ id: string; partitionKeyPath: string }> = [
    { id: MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_USERS, partitionKeyPath: '/id' },
    { id: MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_API_KEYS, partitionKeyPath: '/id' },
    { id: MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_TOKEN_INVALIDATION, partitionKeyPath: '/id' },
    {
      id: MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_OAUTH_CLIENTS,
      partitionKeyPath: '/creator_id',
    },
    {
      id: MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_OAUTH_AUTHORIZATION_CODES,
      partitionKeyPath: '/id',
    },
    {
      id: MOCK_IDP_UIAM_COSMOS_DB_COLLECTION_OAUTH_APP_CONNECTIONS,
      partitionKeyPath: '/client_id',
    },
  ];

  for (const collection of collections) {
    log.info(chalk.bold(`Creating a Cosmos DB collection (${collection.id})…`));

    const collectionRes = await fetch(
      `${MOCK_IDP_UIAM_COSMOS_DB_URL}/dbs/${MOCK_IDP_UIAM_COSMOS_DB_NAME}/colls`,
      {
        method: 'POST',
        headers: generateCosmosDBApiRequestHeaders(
          'POST',
          'colls',
          `dbs/${MOCK_IDP_UIAM_COSMOS_DB_NAME}`
        ),
        body: JSON.stringify({
          id: collection.id,
          partitionKey: { paths: [collection.partitionKeyPath], kind: 'Hash' },
        }),
        dispatcher: fetchDispatcher,
      }
    );

    if (collectionRes.status === 201) {
      log.info(chalk.green(`✓ Collection (${collection.id}) created successfully`));
    } else if (collectionRes.status === 409) {
      log.info(chalk.yellow(`✓ Collection (${collection.id}) already exists`));
    } else {
      throw new Error(
        `Failed to create collection (${collection.id}): ${
          collectionRes.status
        } ${await collectionRes.text()}`
      );
    }
  }

  log.info(
    chalk.bold(
      `Cosmos DB (${MOCK_IDP_UIAM_COSMOS_DB_URL}/${MOCK_IDP_UIAM_COSMOS_DB_NAME}) has been successfully initialized.`
    )
  );
}

async function tryExportLogs(containerName: string, log: ToolingLog) {
  try {
    const { stdout: logs } = await execa('docker', ['logs', containerName]);
    await mkdir(join(REPO_ROOT, '.es'), {
      recursive: true,
    });
    return writeFile(join(REPO_ROOT, '.es', 'uiam_docker_error.log'), logs);
  } catch (err) {
    log.error(`Failed to export logs for container ${containerName}: ${err}`);
  }
}
