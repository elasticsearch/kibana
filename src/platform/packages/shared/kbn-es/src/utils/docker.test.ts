/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import mockFs from 'mock-fs';

import Fsp from 'fs/promises';
import { basename, join } from 'path';

import type { ServerlessOptions, ServerlessProjectType } from './docker';
import * as dockerUiam from './docker_uiam';
import {
  DOCKER_IMG,
  detectRunningNodes,
  maybeCreateDockerNetwork,
  maybePullDockerImage,
  printDockerImageInfo,
  resolveDockerCmd,
  resolveDockerImage,
  resolveEsArgs,
  resolvePort,
  runDockerContainer,
  runServerlessCluster,
  runServerlessEsNode,
  ES_SERVERLESS_DEFAULT_IMAGE,
  setupServerlessVolumes,
  stopServerlessCluster,
  teardownServerlessClusterSync,
  verifyDockerInstalled,
  getESp12Volume,
  getServerlessNodes,
  getSharedServerlessParams,
} from './docker';
import { ToolingLog, ToolingLogCollectingWriter } from '@kbn/tooling-log';
import { CA_CERT_PATH, ES_P12_PATH } from '@kbn/dev-utils';
import {
  SERVERLESS_CONFIG_PATH,
  SERVERLESS_RESOURCES_PATHS,
  SERVERLESS_SECRETS_PATH,
  SERVERLESS_SECRETS_SSL_PATH,
  SERVERLESS_JWKS_PATH,
  SERVERLESS_IDP_METADATA_PATH,
  SERVERLESS_OPERATOR_PATH,
} from '../paths';
import * as waitClusterUtil from './wait_until_cluster_ready';
import * as waitForSecurityIndexUtil from './wait_for_security_index';
import * as mockIdpPluginUtil from '@kbn/mock-idp-utils';

/**
 * This is set to 'true' on CI, and it causes some docker behaviours to differ.
 * There's a specific test that verifies the cached image is used when set to true.
 */
process.env.KBN_ES_SNAPSHOT_USE_CACHED = 'false';

jest.mock('execa');
const execa = jest.requireMock('execa');
execa.mockImplementation(() => Promise.resolve({ stdout: '' }));

jest.mock('./read_string_secrets', () => ({
  readStringSecrets: jest.fn().mockResolvedValue({}),
}));

const readStringSecretsMock = (
  jest.requireMock('./read_string_secrets') as {
    readStringSecrets: jest.MockedFunction<(path: string) => Promise<Record<string, string>>>;
  }
).readStringSecrets;

jest.mock('@elastic/elasticsearch', () => {
  return {
    Client: jest.fn(),
  };
});

jest.mock('./wait_until_cluster_ready', () => ({
  waitUntilClusterReady: jest.fn(),
}));

jest.mock('./wait_for_security_index', () => ({
  waitForSecurityIndex: jest.fn(),
}));

jest.mock('./docker_uiam', () => {
  const originalModule = jest.requireActual('./docker_uiam');
  return {
    ...originalModule,
    runUiamContainer: jest
      .fn()
      .mockImplementation((_, container) => Promise.resolve(container.name)),
    initializeUiamContainers: jest.fn(),
  };
});

jest.mock('@kbn/mock-idp-utils');

const log = new ToolingLog();
const logWriter = new ToolingLogCollectingWriter();
log.setWriters([logWriter]);

const KIBANA_ROOT = process.cwd();
const projectType: ServerlessProjectType = 'es';
const baseEsPath = `${KIBANA_ROOT}/.es`;
const serverlessDir = 'stateless';
const serverlessObjectStorePath = `${baseEsPath}/${serverlessDir}`;

const waitUntilClusterReadyMock = jest.spyOn(waitClusterUtil, 'waitUntilClusterReady');
const waitForSecurityIndexMock = jest.spyOn(waitForSecurityIndexUtil, 'waitForSecurityIndex');
const ensureSAMLRoleMappingMock = jest.spyOn(mockIdpPluginUtil, 'ensureSAMLRoleMapping');
const createMockIdpMetadataMock = jest.spyOn(mockIdpPluginUtil, 'createMockIdpMetadata');

beforeEach(() => {
  jest.resetAllMocks();
  log.indent(-log.getIndent());
  logWriter.messages.length = 0;

  // jest relies on the filesystem to get sourcemaps when using console.log
  // which breaks with the mocked FS, see https://github.com/tschaub/mock-fs/issues/234
  // hijacking logging to process.stdout as a workaround for this suite.
  jest.spyOn(console, 'log').mockImplementation((...args) => {
    process.stdout.write(args + '\n');
  });
});

afterEach(() => {
  mockFs.restore();
  // restore the console.log behavior
  jest.clearAllMocks();
});

const serverlessResources = SERVERLESS_RESOURCES_PATHS.reduce<string[]>((acc, path) => {
  acc.push(`${path}:${SERVERLESS_CONFIG_PATH}${basename(path)}`);

  return acc;
}, []);

const volumeCmdTest = async (volumeCmd: string[]) => {
  expect(volumeCmd).toHaveLength(24);
  expect(volumeCmd).toEqual(
    expect.arrayContaining([
      ...getESp12Volume(),
      ...serverlessResources,
      `${baseEsPath}:/objectstore:z`,
      `stateless.object_store.bucket=${serverlessDir}`,
      `${SERVERLESS_SECRETS_PATH}:${SERVERLESS_CONFIG_PATH}secrets/secrets.json:z`,
      `${SERVERLESS_JWKS_PATH}:${SERVERLESS_CONFIG_PATH}jwks/jwks.json:z`,
      `${SERVERLESS_OPERATOR_PATH}:${SERVERLESS_CONFIG_PATH}operator`,
    ])
  );

  // extract only permission from mode
  // eslint-disable-next-line no-bitwise
  expect((await Fsp.stat(serverlessObjectStorePath)).mode & 0o777).toBe(0o777);
};

describe('getServerlessNodes()', () => {
  test('should return default node names and ports with no arguments', () => {
    const nodes = getServerlessNodes();
    expect(nodes).toHaveLength(2);
    expect(nodes[0].name).toBe('es01');
    expect(nodes[1].name).toBe('es02');
    expect(nodes[0].params).toEqual(expect.arrayContaining(['127.0.0.1:9300:9300']));
    expect(nodes[1].params).toEqual(expect.arrayContaining(['127.0.0.1:9202:9202']));
    expect(nodes[1].params).toEqual(expect.arrayContaining(['127.0.0.1:9302:9302']));
    expect(nodes[0].params).toEqual(
      expect.arrayContaining([
        'node.roles=["master","remote_cluster_client","ingest","index","ml","transform"]',
      ])
    );
    expect(nodes[1].params).toEqual(
      expect.arrayContaining(['node.roles=["master","remote_cluster_client","search"]'])
    );
    expect(nodes[0].esArgs).toEqual(
      expect.arrayContaining([
        ['xpack.searchable.snapshot.shared_cache.size', '16MB'],
        ['xpack.searchable.snapshot.shared_cache.region_size', '256K'],
        ['ES_JAVA_OPTS', '-Xms1536m -Xmx1536m'],
      ])
    );
  });

  test('should apply name suffix and port offset for linked cluster', () => {
    const nodes = getServerlessNodes('-linked', 10);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].name).toBe('es01-linked');
    expect(nodes[1].name).toBe('es02-linked');
    expect(nodes[0].params).toEqual(expect.arrayContaining(['127.0.0.1:9310:9310']));
    expect(nodes[1].params).toEqual(expect.arrayContaining(['127.0.0.1:9212:9212']));
    expect(nodes[1].params).toEqual(expect.arrayContaining(['127.0.0.1:9312:9312']));
  });

  test('should configure discovery hosts with suffixed names', () => {
    const nodes = getServerlessNodes('-linked', 10);
    expect(nodes[0].params).toEqual(expect.arrayContaining([`discovery.seed_hosts=es02-linked`]));
    expect(nodes[1].params).toEqual(expect.arrayContaining([`discovery.seed_hosts=es01-linked`]));
  });
});

describe('getSharedServerlessParams()', () => {
  test('should return default master nodes with no arguments', () => {
    const params = getSharedServerlessParams();
    expect(params).toEqual(expect.arrayContaining(['cluster.initial_master_nodes=es01,es02']));
  });

  test('should return suffixed master nodes for linked cluster', () => {
    const params = getSharedServerlessParams('-linked');
    expect(params).toEqual(
      expect.arrayContaining(['cluster.initial_master_nodes=es01-linked,es02-linked'])
    );
  });
});

describe('resolveDockerImage()', () => {
  const defaultRepo = 'another/repo';
  const defaultImg = 'default/reg/repo:tag';
  const tag = '8.8.2';

  test('should return default image when no options', () => {
    const image = resolveDockerImage({ repo: defaultRepo, defaultImg });

    expect(image).toEqual(defaultImg);
  });

  test('should return tag with default repo when tag is passed', () => {
    const image = resolveDockerImage({ repo: defaultRepo, tag, defaultImg });

    expect(image).toMatchInlineSnapshot(`"another/repo:8.8.2"`);
  });

  test('should return image when tag is also passed', () => {
    const image = resolveDockerImage({ repo: defaultRepo, tag, image: DOCKER_IMG, defaultImg });

    expect(image).toEqual(DOCKER_IMG);
  });

  test('should error when invalid registry is passed', () => {
    expect(() =>
      resolveDockerImage({
        repo: defaultRepo,
        tag,
        image: 'another.registry.co/es/es:latest',
        defaultImg,
      })
    ).toThrowErrorMatchingInlineSnapshot(`
      "Only verified images from docker.elastic.co are currently allowed.
      If you require this functionality in @kbn/es please contact the Kibana Operations Team."
    `);
  });
});

describe('resolvePort()', () => {
  test('should return default port when no options', () => {
    const port = resolvePort({});

    expect(port).toMatchInlineSnapshot(`
      Array [
        "-p",
        "127.0.0.1:9200:9200",
      ]
    `);
  });

  test('should return default port when custom host passed in options', () => {
    const port = resolvePort({ host: '192.168.25.1' } as ServerlessOptions);

    expect(port).toMatchInlineSnapshot(`
      Array [
        "-p",
        "127.0.0.1:9200:9200",
        "-p",
        "192.168.25.1:9200:9200",
      ]
    `);
  });

  test('should return custom port when passed in options', () => {
    const port = resolvePort({ port: 9220 });

    expect(port).toMatchInlineSnapshot(`
      Array [
        "-p",
        "127.0.0.1:9220:9220",
        "--env",
        "http.port=9220",
      ]
    `);
  });

  test('should return custom port and host when passed in options', () => {
    const port = resolvePort({ port: 9220, host: '192.168.25.1' });

    expect(port).toMatchInlineSnapshot(`
      Array [
        "-p",
        "127.0.0.1:9220:9220",
        "-p",
        "192.168.25.1:9220:9220",
        "--env",
        "http.port=9220",
      ]
    `);
  });
});

describe('verifyDockerInstalled()', () => {
  test('should call the correct Docker command and log the version', async () => {
    execa.mockImplementation(() => Promise.resolve({ stdout: 'Docker Version 123' }));

    await verifyDockerInstalled(log);

    expect(execa.mock.calls).toMatchInlineSnapshot(`
          Array [
            Array [
              "docker",
              Array [
                "--version",
              ],
            ],
          ]
      `);

    expect(logWriter.messages).toMatchInlineSnapshot(`
      Array [
        " [34minfo[39m [1mVerifying Docker is installed.[22m",
        "   │ [34minfo[39m Docker Version 123",
      ]
    `);
  });

  test('should reject when Docker is not installed', async () => {
    execa.mockImplementation(() => Promise.reject({ message: 'Hello World' }));

    await expect(verifyDockerInstalled(log)).rejects.toThrowErrorMatchingInlineSnapshot(`
      "Docker not found locally. Install it from: https://www.docker.com

      Hello World"
    `);
  });
});

describe('maybeCreateDockerNetwork()', () => {
  test('should call the correct Docker command and create the network if needed', async () => {
    execa.mockImplementation(() => Promise.resolve({ exitCode: 0 }));

    await maybeCreateDockerNetwork(log);

    expect(execa.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "docker",
          Array [
            "network",
            "create",
            "elastic",
          ],
        ],
      ]
    `);

    expect(logWriter.messages).toMatchInlineSnapshot(`
      Array [
        " [34minfo[39m [1mChecking status of elastic Docker network.[22m",
        "   │ [34minfo[39m Created new network.",
      ]
    `);
  });

  test('should use an existing network', async () => {
    execa.mockImplementation(() =>
      Promise.reject({ message: 'network with name elastic already exists' })
    );

    await maybeCreateDockerNetwork(log);

    expect(logWriter.messages).toMatchInlineSnapshot(`
      Array [
        " [34minfo[39m [1mChecking status of elastic Docker network.[22m",
        "   │ [34minfo[39m Using existing network.",
      ]
    `);
  });

  test('should reject for any other Docker error', async () => {
    execa.mockImplementation(() => Promise.reject({ message: 'some error' }));

    await expect(maybeCreateDockerNetwork(log)).rejects.toThrowErrorMatchingInlineSnapshot(
      `"some error"`
    );
  });
});

describe('maybePullDockerImage()', () => {
  test('should pull the passed image', async () => {
    execa.mockImplementation(() => Promise.resolve({ exitCode: 0 }));

    await maybePullDockerImage(log, DOCKER_IMG);

    expect(execa.mock.calls[0][0]).toEqual('docker');
    expect(execa.mock.calls[0][1]).toEqual(expect.arrayContaining(['pull', DOCKER_IMG]));
  });

  describe('with KBN_ES_SNAPSHOT_USE_CACHED=true', () => {
    beforeEach(() => {
      process.env.KBN_ES_SNAPSHOT_USE_CACHED = 'true';
    });

    afterEach(() => {
      process.env.KBN_ES_SNAPSHOT_USE_CACHED = 'false';
    });

    test('skips pull when the image is available locally', async () => {
      execa.mockImplementationOnce(() => Promise.resolve({ stdout: 'local-image-id' }));

      await maybePullDockerImage(log, DOCKER_IMG);

      expect(execa.mock.calls).toHaveLength(1);
      expect(execa.mock.calls[0][1]).toEqual(['images', '-q', DOCKER_IMG]);
    });

    test('pulls when the image is not available locally', async () => {
      execa
        .mockImplementationOnce(() => Promise.resolve({ stdout: '' }))
        .mockImplementationOnce(() => Promise.resolve({ exitCode: 0 }));

      await maybePullDockerImage(log, DOCKER_IMG);

      expect(execa.mock.calls[0][1]).toEqual(['images', '-q', DOCKER_IMG]);
      expect(execa.mock.calls[1][1]).toEqual(expect.arrayContaining(['pull', DOCKER_IMG]));
    });
  });
});

describe('detectRunningNodes()', () => {
  const nodes = ['es01', 'es02', 'es03'];

  test('should not error if no nodes detected', async () => {
    execa.mockImplementation(() => Promise.resolve({ stdout: '' }));

    await detectRunningNodes(log, {});

    expect(execa.mock.calls).toHaveLength(1);
    expect(execa.mock.calls[0][1]).toEqual(expect.arrayContaining(['ps', '--quiet', '--filter']));
  });

  test('should kill nodes if detected and kill passed', async () => {
    execa.mockImplementation(() =>
      Promise.resolve({
        stdout: nodes.join('\n'),
      })
    );

    await detectRunningNodes(log, { kill: true });

    expect(execa.mock.calls).toHaveLength(2);
    expect(execa.mock.calls[1][1]).toEqual(expect.arrayContaining(nodes.concat('kill')));
  });

  test('should error if nodes detected and kill not passed', async () => {
    execa.mockImplementation(() =>
      Promise.resolve({
        stdout: nodes.join('\n'),
      })
    );

    await expect(detectRunningNodes(log, {})).rejects.toThrowErrorMatchingInlineSnapshot(
      `"ES has already been started, pass --kill to automatically stop the containers on startup."`
    );
  });
});

describe('resolveEsArgs()', () => {
  const defaultEsArgs: Array<[string, string]> = [
    ['foo', 'bar'],
    ['qux', 'zip'],
  ];
  const refreshOverrideFlag = '-Des.stateless.allow.index.refresh_interval.override=true';
  const findEnvValue = (args: string[], key: string) => {
    const entry = args.find((value) => value.startsWith(`${key}=`));
    return entry ? entry.slice(key.length + 1) : undefined;
  };

  test('should return default args when no options', () => {
    const esArgs = resolveEsArgs(defaultEsArgs, {});

    expect(esArgs).toHaveLength(6);
    expect(esArgs).toMatchInlineSnapshot(`
      Array [
        "--env",
        "foo=bar",
        "--env",
        "qux=zip",
        "--env",
        "ES_JAVA_OPTS=-Des.stateless.allow.index.refresh_interval.override=true",
      ]
    `);
  });

  test('should override default args when options is a string', () => {
    const esArgs = resolveEsArgs(defaultEsArgs, { esArgs: 'foo=true' });

    expect(esArgs).toHaveLength(6);
    expect(esArgs).toMatchInlineSnapshot(`
      Array [
        "--env",
        "foo=true",
        "--env",
        "qux=zip",
        "--env",
        "ES_JAVA_OPTS=-Des.stateless.allow.index.refresh_interval.override=true",
      ]
    `);
  });

  test('should override default args when options is an array', () => {
    const esArgs = resolveEsArgs(defaultEsArgs, { esArgs: ['foo=false', 'qux=true'] });

    expect(esArgs).toHaveLength(6);
    expect(esArgs).toMatchInlineSnapshot(`
      Array [
        "--env",
        "foo=false",
        "--env",
        "qux=true",
        "--env",
        "ES_JAVA_OPTS=-Des.stateless.allow.index.refresh_interval.override=true",
      ]
    `);
  });

  test('should override defaults args and handle password option', () => {
    const esArgs = resolveEsArgs(defaultEsArgs, { esArgs: 'foo=false', password: 'hello' });

    expect(esArgs).toHaveLength(8);
    expect(esArgs).toMatchInlineSnapshot(`
      Array [
        "--env",
        "foo=false",
        "--env",
        "qux=zip",
        "--env",
        "ELASTIC_PASSWORD=hello",
        "--env",
        "ES_JAVA_OPTS=-Des.stateless.allow.index.refresh_interval.override=true",
      ]
    `);
  });

  test('should add SAML realm args when SSL is passed', () => {
    const esArgs = resolveEsArgs([], {
      ssl: true,
    });

    expect(esArgs).toMatchInlineSnapshot(`
      Array [
        "--env",
        "xpack.security.http.ssl.enabled=true",
        "--env",
        "xpack.security.http.ssl.keystore.path=/usr/share/elasticsearch/config/certs/elasticsearch.p12",
        "--env",
        "xpack.security.http.ssl.verification_mode=certificate",
        "--env",
        "xpack.security.authc.native_role_mappings.enabled=true",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.order=0",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.idp.metadata.path=/usr/share/elasticsearch/config/idp_metadata.xml",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.idp.entity_id=urn:mock-idp",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.sp.entity_id=http://localhost:5601",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.sp.acs=http://localhost:5601/api/security/saml/callback",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.sp.logout=http://localhost:5601/logout",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.attributes.principal=http://saml.elastic-cloud.com/attributes/principal",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.attributes.groups=http://saml.elastic-cloud.com/attributes/roles",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.attributes.name=http://saml.elastic-cloud.com/attributes/name",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.attributes.mail=http://saml.elastic-cloud.com/attributes/email",
        "--env",
        "ES_JAVA_OPTS=-Des.stateless.allow.index.refresh_interval.override=true",
      ]
    `);
  });

  test('should not add SAML realm args when security is disabled', () => {
    const esArgs = resolveEsArgs([['xpack.security.enabled', 'false']], {
      ssl: true,
    });

    expect(esArgs).toMatchInlineSnapshot(`
      Array [
        "--env",
        "xpack.security.enabled=false",
        "--env",
        "xpack.security.http.ssl.enabled=true",
        "--env",
        "xpack.security.http.ssl.keystore.path=/usr/share/elasticsearch/config/certs/elasticsearch.p12",
        "--env",
        "xpack.security.http.ssl.verification_mode=certificate",
        "--env",
        "ES_JAVA_OPTS=-Des.stateless.allow.index.refresh_interval.override=true",
      ]
    `);
  });

  test('should not add UIAM-related args when run in Serverless mode without `--uiam` option', () => {
    const esArgs = resolveEsArgs([], {
      ssl: true,
      projectType,
      basePath: baseEsPath,
      uiam: false,
    });

    expect(esArgs).toMatchInlineSnapshot(`
      Array [
        "--env",
        "xpack.security.http.ssl.enabled=true",
        "--env",
        "xpack.security.http.ssl.keystore.path=/usr/share/elasticsearch/config/certs/elasticsearch.p12",
        "--env",
        "xpack.security.http.ssl.verification_mode=certificate",
        "--env",
        "xpack.security.authc.native_role_mappings.enabled=true",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.order=0",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.idp.metadata.path=/usr/share/elasticsearch/config/idp_metadata.xml",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.idp.entity_id=urn:mock-idp",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.sp.entity_id=http://localhost:5601",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.sp.acs=http://localhost:5601/api/security/saml/callback",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.sp.logout=http://localhost:5601/logout",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.attributes.principal=http://saml.elastic-cloud.com/attributes/principal",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.attributes.groups=http://saml.elastic-cloud.com/attributes/roles",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.attributes.name=http://saml.elastic-cloud.com/attributes/name",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.attributes.mail=http://saml.elastic-cloud.com/attributes/email",
        "--env",
        "serverless.project_type=elasticsearch_general_purpose",
        "--env",
        "ES_JAVA_OPTS=-Des.stateless.allow.index.refresh_interval.override=true",
      ]
    `);
  });

  test('should add UIAM-related args when run in Serverless mode with `--uiam` option', () => {
    const esArgs = resolveEsArgs([], {
      ssl: true,
      projectType,
      basePath: baseEsPath,
      uiam: true,
    });

    expect(esArgs).toMatchInlineSnapshot(`
      Array [
        "--env",
        "xpack.security.http.ssl.enabled=true",
        "--env",
        "xpack.security.http.ssl.keystore.path=/usr/share/elasticsearch/config/certs/elasticsearch.p12",
        "--env",
        "xpack.security.http.ssl.verification_mode=certificate",
        "--env",
        "xpack.security.authc.native_role_mappings.enabled=true",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.order=0",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.idp.metadata.path=/usr/share/elasticsearch/config/idp_metadata.xml",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.idp.entity_id=urn:mock-idp",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.sp.entity_id=http://localhost:5601",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.sp.acs=http://localhost:5601/api/security/saml/callback",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.sp.logout=http://localhost:5601/logout",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.attributes.principal=http://saml.elastic-cloud.com/attributes/principal",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.attributes.groups=http://saml.elastic-cloud.com/attributes/roles",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.attributes.name=http://saml.elastic-cloud.com/attributes/name",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.attributes.mail=http://saml.elastic-cloud.com/attributes/email",
        "--env",
        "metering.url=http://localhost:5601",
        "--env",
        "metering.report_period=60m",
        "--env",
        "xpack.security.authc.realms.saml.cloud-saml-kibana.private_attributes=http://saml.elastic-cloud.com/attributes/uiam/authentication/access_token,http://saml.elastic-cloud.com/attributes/uiam/authentication/access_token_expires_at,http://saml.elastic-cloud.com/attributes/uiam/authentication/refresh_token,http://saml.elastic-cloud.com/attributes/uiam/authentication/refresh_token_expires_at",
        "--env",
        "serverless.organization_id=org1234567890",
        "--env",
        "serverless.project_type=elasticsearch_general_purpose",
        "--env",
        "serverless.project_id=abcdef12345678901234567890123456",
        "--env",
        "serverless.universal_iam_service.enabled=true",
        "--env",
        "serverless.universal_iam_service.url=https://uiam:8443",
        "--env",
        "serverless.universal_iam_service.ssl.verification_mode=none",
        "--env",
        "ES_JAVA_OPTS=-Des.stateless.allow.index.refresh_interval.override=true",
      ]
    `);
  });

  test('should use projectIdOverride when provided in UIAM mode', () => {
    const overrideId = 'custom_project_id_123';
    const esArgs = resolveEsArgs(
      [],
      {
        ssl: true,
        projectType,
        basePath: baseEsPath,
        uiam: true,
      },
      overrideId
    );

    expect(findEnvValue(esArgs, 'serverless.project_id')).toBe(overrideId);
    expect(findEnvValue(esArgs, 'serverless.organization_id')).toBeDefined();
    expect(findEnvValue(esArgs, 'serverless.universal_iam_service.enabled')).toBe('true');
  });

  test('should use default project ID when no override is provided in UIAM mode', () => {
    const esArgs = resolveEsArgs([], {
      ssl: true,
      projectType,
      basePath: baseEsPath,
      uiam: true,
    });

    expect(findEnvValue(esArgs, 'serverless.project_id')).toBe('abcdef12345678901234567890123456');
  });

  test('should append refresh interval override when ES_JAVA_OPTS is provided', () => {
    const esArgs = resolveEsArgs([], { esArgs: 'ES_JAVA_OPTS=-Xms1g -Xmx1g' });

    expect(findEnvValue(esArgs, 'ES_JAVA_OPTS')).toBe(`-Xms1g -Xmx1g ${refreshOverrideFlag}`);
  });

  test('should not duplicate refresh interval override when already present', () => {
    const existingOptions = `-Xms1g -Xmx1g ${refreshOverrideFlag}`;
    const esArgs = resolveEsArgs([], { esArgs: `ES_JAVA_OPTS=${existingOptions}` });

    expect(findEnvValue(esArgs, 'ES_JAVA_OPTS')).toBe(existingOptions);
  });
});

describe('setupServerlessVolumes()', () => {
  const existingObjectStore = {
    [baseEsPath]: {
      [serverlessDir]: {
        cluster_state: { 0: {}, 1: {}, lease: 'hello world' },
      },
    },
  };

  test('should create stateless directory and return volume docker command', async () => {
    mockFs({
      [baseEsPath]: {},
    });

    const volumeCmd = await setupServerlessVolumes(log, {
      projectType,
      basePath: baseEsPath,
    });

    await volumeCmdTest(volumeCmd);
    await expect(Fsp.access(serverlessObjectStorePath)).resolves.not.toThrow();
  });

  test('should use an existing object store', async () => {
    mockFs(existingObjectStore);

    const volumeCmd = await setupServerlessVolumes(log, { projectType, basePath: baseEsPath });

    await volumeCmdTest(volumeCmd);
    await expect(
      Fsp.access(`${serverlessObjectStorePath}/cluster_state/lease`)
    ).resolves.not.toThrow();
  });

  test('should remove an existing object store when clean is passed', async () => {
    mockFs(existingObjectStore);

    const volumeCmd = await setupServerlessVolumes(log, {
      projectType,
      basePath: baseEsPath,
      clean: true,
    });

    await volumeCmdTest(volumeCmd);
    await expect(
      Fsp.access(`${serverlessObjectStorePath}/cluster_state/lease`)
    ).rejects.toThrowError();
  });

  test('should add SSL and IDP metadata volumes when ssl is passed', async () => {
    mockFs(existingObjectStore);
    createMockIdpMetadataMock.mockResolvedValue('<xml/>');

    const volumeCmd = await setupServerlessVolumes(log, {
      projectType,
      basePath: baseEsPath,
      ssl: true,
    });

    expect(createMockIdpMetadataMock).toHaveBeenCalledTimes(1);
    expect(createMockIdpMetadataMock).toHaveBeenCalledWith();

    const requiredPaths = [
      `${baseEsPath}:/objectstore:z`,
      SERVERLESS_IDP_METADATA_PATH,
      ES_P12_PATH,
      ...SERVERLESS_RESOURCES_PATHS,
    ];
    const pathsNotIncludedInCmd = requiredPaths.filter(
      (path) => !volumeCmd.some((cmd) => cmd.includes(path))
    );
    expect(volumeCmd).toHaveLength(26);
    expect(pathsNotIncludedInCmd).toEqual([]);
  });

  test('should use resource overrides', async () => {
    mockFs(existingObjectStore);
    const volumeCmd = await setupServerlessVolumes(log, {
      projectType,
      basePath: baseEsPath,
      resources: ['./relative/path/users', '/absolute/path/users_roles'],
    });

    expect(volumeCmd).toContain(
      '/absolute/path/users_roles:/usr/share/elasticsearch/config/users_roles'
    );
    expect(volumeCmd).toContain(
      `${process.cwd()}/relative/path/users:/usr/share/elasticsearch/config/users`
    );
  });

  test('should throw if an unknown resource override is used', async () => {
    mockFs(existingObjectStore);

    await expect(async () => {
      await setupServerlessVolumes(log, {
        projectType,
        basePath: baseEsPath,
        resources: ['/absolute/path/invalid'],
      });
    }).rejects.toThrow(
      'Unsupported ES serverless --resources value(s):\n  /absolute/path/invalid\n\n' +
        'Valid resources: operator_users.yml | role_mapping.yml | service_tokens | users | users_roles | roles.yml'
    );
  });

  test('should override data path when passed', async () => {
    const dataPath = 'stateless-cluster-ftr';

    mockFs({
      [baseEsPath]: {},
    });

    const volumeCmd = await setupServerlessVolumes(log, {
      projectType,
      basePath: baseEsPath,
      dataPath,
    });

    expect(volumeCmd).toEqual(
      expect.arrayContaining([`stateless.object_store.bucket=${dataPath}`])
    );
    await expect(Fsp.access(`${baseEsPath}/${dataPath}`)).resolves.not.toThrow();
  });

  test('should embed readStringSecrets output in operator settings.json', async () => {
    mockFs(existingObjectStore);
    const stringSecretsFixture = {
      'xpack.security.transport.ssl.keystore.secure_password': 'storepass',
      'xpack.security.authc.realms.jwt.jwt1.client_authentication.shared_secret': 'my_super_secret',
    };
    readStringSecretsMock.mockResolvedValue(stringSecretsFixture);

    const volumeCmd = await setupServerlessVolumes(log, {
      projectType,
      basePath: baseEsPath,
    });

    await volumeCmdTest(volumeCmd);
    expect(readStringSecretsMock).toHaveBeenCalledWith(SERVERLESS_SECRETS_PATH);
    const settings = JSON.parse(
      await Fsp.readFile(join(SERVERLESS_OPERATOR_PATH, 'settings.json'), 'utf-8')
    );
    expect(settings.state.cluster_secrets.string_secrets).toEqual(stringSecretsFixture);
  });

  test('should use SSL secrets file and embed string_secrets when ssl is enabled', async () => {
    mockFs(existingObjectStore);
    createMockIdpMetadataMock.mockResolvedValue('<xml/>');
    const stringSecretsFixture = {
      'xpack.security.http.ssl.keystore.secure_password': 'storepass',
    };
    readStringSecretsMock.mockResolvedValue(stringSecretsFixture);

    const volumeCmd = await setupServerlessVolumes(log, {
      projectType,
      basePath: baseEsPath,
      ssl: true,
    });

    expect(volumeCmd).toHaveLength(26);
    expect(volumeCmd.some((cmd) => cmd.includes(SERVERLESS_SECRETS_SSL_PATH))).toBe(true);
    expect(readStringSecretsMock).toHaveBeenCalledWith(SERVERLESS_SECRETS_SSL_PATH);
    const settings = JSON.parse(
      await Fsp.readFile(join(SERVERLESS_OPERATOR_PATH, 'settings.json'), 'utf-8')
    );
    expect(settings.state.cluster_secrets.string_secrets).toEqual(stringSecretsFixture);
  });
});

describe('runServerlessEsNode()', () => {
  const node = {
    params: ['--env', 'foo=bar', '--volume', 'foo/bar'],
    name: 'es01',
    image: ES_SERVERLESS_DEFAULT_IMAGE,
  };

  test('should call the correct Docker command', async () => {
    execa.mockImplementation(() => Promise.resolve({ stdout: 'containerId1234' }));

    await runServerlessEsNode(log, node);

    expect(execa.mock.calls[0][0]).toEqual('docker');
    expect(execa.mock.calls[0][1]).toEqual(
      expect.arrayContaining([
        ES_SERVERLESS_DEFAULT_IMAGE,
        ...node.params,
        '--name',
        node.name,
        '--env',
        `node.name=${node.name}`,
        'run',
        '--detach',
        '--net',
        'elastic',
      ])
    );
  });
});

describe('runServerlessCluster()', () => {
  let runUiamContainerMock: jest.MockedFunction<typeof dockerUiam.runUiamContainer>;
  let initializeUiamContainersMock: jest.MockedFunction<typeof dockerUiam.initializeUiamContainers>;
  beforeEach(() => {
    runUiamContainerMock = dockerUiam.runUiamContainer as jest.MockedFunction<
      typeof dockerUiam.runUiamContainer
    >;
    initializeUiamContainersMock = dockerUiam.initializeUiamContainers as jest.MockedFunction<
      typeof dockerUiam.initializeUiamContainers
    >;
  });

  test('should start 2 serverless nodes', async () => {
    waitUntilClusterReadyMock.mockResolvedValue();
    mockFs({
      [baseEsPath]: {},
    });
    execa.mockImplementation(() => Promise.resolve({ stdout: '' }));

    await runServerlessCluster(log, { projectType, basePath: baseEsPath });

    // docker version (1)
    // docker ps (1)
    // docker container rm (7 = 2 ES nodes, 2 linked ES nodes, 3 UIAM containers)
    // docker network create (1)
    // docker pull (1)
    // docker inspect (1)
    // docker run (2)
    // docker logs (1)
    expect(execa.mock.calls).toHaveLength(15);

    // UIAM containers should not be started when `--uiam` is not passed
    expect(runUiamContainerMock).not.toHaveBeenCalled();
    expect(initializeUiamContainersMock).not.toHaveBeenCalled();
  });

  test('should start 2 serverless ES nodes and two UIAM containers when in UIAM mode', async () => {
    waitUntilClusterReadyMock.mockResolvedValue();
    mockFs({
      [baseEsPath]: {},
    });
    execa.mockImplementation(() => Promise.resolve({ stdout: '' }));

    await runServerlessCluster(log, { projectType, basePath: baseEsPath, uiam: true });

    // docker version (1)
    // docker ps (1)
    // docker container rm (7 = 2 ES nodes, 2 linked ES nodes, 3 UIAM containers)
    // docker network create (1)
    // docker pull (3 = 1 for ES nodes, 2 for UIAM containers)
    // docker inspect (2 = image info call for ES nodes is memoized in the previous test, 2 for UIAM containers)
    // docker run (2)
    // docker logs (1)
    expect(execa.mock.calls).toHaveLength(18);

    expect(runUiamContainerMock).toHaveBeenCalledTimes(2);
    expect(runUiamContainerMock).toHaveBeenCalledWith(
      expect.anything(),
      dockerUiam.UIAM_CONTAINERS[0]
    );
    expect(runUiamContainerMock).toHaveBeenCalledWith(
      expect.anything(),
      dockerUiam.UIAM_CONTAINERS[1]
    );
    expect(initializeUiamContainersMock).toHaveBeenCalledTimes(1);
  });

  test(`should wait for serverless nodes to return 'green' status`, async () => {
    waitUntilClusterReadyMock.mockResolvedValue();
    mockFs({
      [baseEsPath]: {},
    });
    execa.mockImplementation(() => Promise.resolve({ stdout: '' }));

    await runServerlessCluster(log, { projectType, basePath: baseEsPath, waitForReady: true });
    expect(waitUntilClusterReadyMock).toHaveBeenCalledTimes(1);
    expect(waitUntilClusterReadyMock.mock.calls[0][0].expectedStatus).toEqual('green');
    expect(waitUntilClusterReadyMock.mock.calls[0][0].readyTimeout).toEqual(undefined);
  });

  test(`should create SAML role mapping when ssl is passed`, async () => {
    waitUntilClusterReadyMock.mockResolvedValue();
    mockFs({
      [CA_CERT_PATH]: '',
      [baseEsPath]: {},
    });
    execa.mockImplementation(() => Promise.resolve({ stdout: '' }));
    createMockIdpMetadataMock.mockResolvedValue('<xml/>');

    await runServerlessCluster(log, {
      projectType,
      basePath: baseEsPath,
      waitForReady: true,
      ssl: true,
    });

    expect(ensureSAMLRoleMappingMock).toHaveBeenCalledTimes(1);
  });

  test(`should wait for the security index`, async () => {
    waitUntilClusterReadyMock.mockResolvedValue();
    waitForSecurityIndexMock.mockResolvedValue();
    mockFs({
      [baseEsPath]: {},
    });
    execa.mockImplementation(() => Promise.resolve({ stdout: '' }));

    await runServerlessCluster(log, { projectType, basePath: baseEsPath, waitForReady: true });
    expect(waitForSecurityIndexMock).toHaveBeenCalledTimes(1);
    expect(waitForSecurityIndexMock.mock.calls[0][0].readyTimeout).toEqual(undefined);
  });

  test(`should not wait for the security index when security is disabled`, async () => {
    waitUntilClusterReadyMock.mockResolvedValue();
    mockFs({
      [baseEsPath]: {},
    });
    execa.mockImplementation(() => Promise.resolve({ stdout: '' }));

    await runServerlessCluster(log, {
      projectType,
      basePath: baseEsPath,
      waitForReady: true,
      esArgs: ['xpack.security.enabled=false'],
    });
    expect(waitForSecurityIndexMock).not.toHaveBeenCalled();
  });
});

describe('stopServerlessCluster()', () => {
  test('should stop passed in nodes', async () => {
    const nodes = ['es01', 'es02', 'es03'];
    execa.mockImplementation(() => Promise.resolve({ stdout: '' }));

    await stopServerlessCluster(log, nodes);

    expect(execa.mock.calls[0][0]).toEqual('docker');
    expect(execa.mock.calls[0][1]).toEqual(
      expect.arrayContaining(['container', 'stop'].concat(nodes))
    );
  });
});

describe('teardownServerlessClusterSync()', () => {
  const defaultOptions = { projectType, basePath: 'foo/bar' };

  test('should kill running serverless nodes', () => {
    const nodes = ['es01', 'es02', 'es03'];
    execa.commandSync.mockImplementation(() => ({
      stdout: nodes.join('\n'),
    }));

    teardownServerlessClusterSync(log, defaultOptions);

    expect(execa.commandSync.mock.calls).toHaveLength(2);
    expect(execa.commandSync.mock.calls[0][0]).toEqual(
      `docker ps --filter status=running --filter ancestor=${ES_SERVERLESS_DEFAULT_IMAGE} --quiet`
    );
    expect(execa.commandSync.mock.calls[1][0]).toEqual(`docker kill ${nodes.join(' ')}`);
  });

  test('should kill running serverless nodes and UIAM containers when in UIAM mode', () => {
    const containers = ['es01', 'es02', 'es03', 'uiam-cosmosdb', 'uiam'];
    execa.commandSync.mockImplementation(() => ({
      stdout: containers.join('\n'),
    }));

    teardownServerlessClusterSync(log, { ...defaultOptions, uiam: true });

    expect(execa.commandSync.mock.calls).toHaveLength(2);
    expect(execa.commandSync.mock.calls[0][0]).toEqual(
      `docker ps --filter status=running --filter ancestor=${ES_SERVERLESS_DEFAULT_IMAGE} --filter ancestor=${dockerUiam.COSMOS_DB_EMULATOR_DEFAULT_IMAGE} --filter ancestor=${dockerUiam.UIAM_DEFAULT_IMAGE} --quiet`
    );
    expect(execa.commandSync.mock.calls[1][0]).toEqual(`docker kill ${containers.join(' ')}`);
  });

  test('should not kill if no serverless nodes', () => {
    execa.commandSync.mockImplementation(() => ({
      stdout: '\n',
    }));

    teardownServerlessClusterSync(log, defaultOptions);

    expect(execa.commandSync.mock.calls).toHaveLength(1);
  });
});

describe('resolveDockerCmd()', () => {
  test('should return default command when no options', () => {
    const dockerCmd = resolveDockerCmd({});

    expect(dockerCmd).toEqual(expect.arrayContaining(['run', DOCKER_IMG]));
  });

  test('should return custom command when passed', () => {
    const dockerCmd = resolveDockerCmd({ dockerCmd: 'start -a es01' });

    expect(dockerCmd).toHaveLength(3);
    expect(dockerCmd).toMatchInlineSnapshot(`
      Array [
        "start",
        "-a",
        "es01",
      ]
    `);
  });
});

describe('runDockerContainer()', () => {
  test('should resolve', async () => {
    execa.mockImplementation(() => Promise.resolve({ stdout: '' }));
    await expect(runDockerContainer(log, {})).resolves.toBeUndefined();
    // docker version (1)
    // docker ps (1)
    // docker container rm (7 = 2 ES nodes, 2 linked ES nodes, 3 UIAM containers)
    // docker network create (1)
    // docker pull (1)
    // docker inspect (1)
    // docker run (1)
    expect(execa.mock.calls).toHaveLength(13);
  });
});

describe('printESImageInfo', () => {
  beforeEach(() => {
    logWriter.messages.length = 0;
  });

  test('should print ES Serverless image info', async () => {
    execa.mockImplementation(() =>
      Promise.resolve({
        stdout: JSON.stringify({
          'org.opencontainers.image.revision': 'deadbeef12345678',
          'org.opencontainers.image.source': 'https://github.com/elastic/elasticsearch-serverless',
        }),
      })
    );

    await printDockerImageInfo(
      log,
      'docker.elastic.co/elasticsearch-ci/elasticsearch-serverless:latest'
    );

    expect(execa.mock.calls).toHaveLength(1);
    expect(logWriter.messages[0]).toContain(
      `docker.elastic.co/elasticsearch-ci/elasticsearch-serverless:git-deadbeef1234`
    );
    expect(logWriter.messages[0]).toContain(
      `https://github.com/elastic/elasticsearch-serverless/commit/deadbeef12345678`
    );
  });

  test('should print ES image info', async () => {
    execa.mockImplementation(() =>
      Promise.resolve({
        stdout: JSON.stringify({
          'org.opencontainers.image.revision': 'deadbeef12345678',
          'org.opencontainers.image.source': 'https://github.com/elastic/elasticsearch',
        }),
      })
    );

    await printDockerImageInfo(log, 'docker.elastic.co/elasticsearch/elasticsearch:8.15-SNAPSHOT');

    expect(execa.mock.calls).toHaveLength(1);
    expect(logWriter.messages[0]).toContain(
      `docker.elastic.co/elasticsearch/elasticsearch:8.15-SNAPSHOT`
    );
    expect(logWriter.messages[0]).toContain(
      `https://github.com/elastic/elasticsearch/commit/deadbeef12345678`
    );
  });
});
