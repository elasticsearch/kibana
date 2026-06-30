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
import { ToolingLog } from '@kbn/tooling-log';
import {
  getUiamContainers,
  initializeUiamContainers,
  runUiamContainer,
  setupUiamCosmosDbDataDir,
  UIAM_CONTAINERS,
  UIAM_COSMOS_DB_DATA_DIR,
} from './docker_uiam';

jest.mock('timers/promises', () => ({
  setTimeout: jest.fn(() => Promise.resolve()),
}));

jest.mock('execa');
const execa = jest.requireMock('execa');

// Mock undici
jest.mock('undici', () => {
  const actualUndici = jest.requireActual('undici');
  return {
    ...actualUndici,
    fetch: jest.fn(),
    Agent: jest.fn(),
  };
});

jest.mock('@kbn/dev-utils', () => {
  return {
    CA_CERT_PATH: '/some/path/ca.crt',
    KBN_CERT_PATH: '/some/path/kibana.crt',
    KBN_KEY_PATH: '/some/path/kibana.key',
  };
});

// Import undici after mocking to get the mocked exports
import * as undici from 'undici';
const mockUndiciFetch = jest.mocked(undici.fetch);
const mockUndiciAgent = jest.mocked(undici.Agent);

jest.mock('../paths', () => ({
  SERVERLESS_UIAM_ENTRYPOINT_PATH: '/some_path/run_java_with_custom_ca.sh',
  SERVERLESS_UIAM_CERTIFICATE_BUNDLE_PATH: '/some_path/uiam_cosmosdb.pfx',
}));

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2000, 0, 1)));
  jest.resetAllMocks();
});

describe(`#runUiamContainer()`, () => {
  test('should be able to run UIAM containers', async () => {
    const [cosmosDbContainer, uiamContainer] = UIAM_CONTAINERS;

    // 1. Check Cosmos DB container.
    execa
      .mockResolvedValueOnce({ stdout: `name-${cosmosDbContainer.name}` })
      .mockResolvedValueOnce({ stdout: ` healthy ` });

    await expect(runUiamContainer(new ToolingLog(), cosmosDbContainer)).resolves.toEqual(
      cosmosDbContainer.name
    );

    expect(execa.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "docker",
          Array [
            "run",
            "--detach",
            "--interactive",
            "--tty",
            "--health-interval",
            "5s",
            "--health-timeout",
            "2s",
            "--health-retries",
            "30",
            "--health-start-period",
            "3s",
            "--net",
            "elastic",
            "--memory",
            "1g",
            "--memory-swap",
            "1g",
            "--volume",
            "/some_path/uiam_cosmosdb.pfx:/scripts/certs/uiam_cosmosdb.pfx:z",
            "-p",
            "127.0.0.1:8081:8081",
            "-p",
            "127.0.0.1:8082:1234",
            "--env",
            "AZURE_COSMOS_EMULATOR_PARTITION_COUNT=1",
            "--env",
            "AZURE_COSMOS_EMULATOR_ENABLE_DATA_PERSISTENCE=false",
            "--env",
            "GATEWAY_PUBLIC_ENDPOINT=uiam-cosmosdb",
            "--env",
            "CERT_PATH=/scripts/certs/uiam_cosmosdb.pfx",
            "--env",
            "LOG_LEVEL=error",
            "--health-cmd",
            "curl -sk http://127.0.0.1:8080/ready | grep -q \\"\\\\\\"overall\\\\\\": true\\"",
            "--name",
            "uiam-cosmosdb",
            "docker.elastic.co/kibana-ci/uiam-azure-cosmos-emulator:latest-verified",
            "--protocol",
            "https",
            "--port",
            "8081",
          ],
        ],
        Array [
          "docker",
          Array [
            "inspect",
            "-f",
            "{{.State.Health.Status}}",
            "uiam-cosmosdb",
          ],
        ],
      ]
    `);

    execa.mockClear();

    // 2. Check UIAM container.
    execa
      .mockResolvedValueOnce({ stdout: `name-${uiamContainer.name}` })
      .mockResolvedValueOnce({ stdout: ` healthy ` });

    await expect(runUiamContainer(new ToolingLog(), uiamContainer)).resolves.toEqual(
      uiamContainer.name
    );

    expect(execa.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "docker",
          Array [
            "run",
            "--detach",
            "--interactive",
            "--tty",
            "--health-interval",
            "5s",
            "--health-timeout",
            "2s",
            "--health-retries",
            "30",
            "--health-start-period",
            "3s",
            "--net",
            "elastic",
            "--memory",
            "2g",
            "--memory-swap",
            "2g",
            "--volume",
            "/some_path/run_java_with_custom_ca.sh:/opt/jboss/container/java/run/run-java-with-custom-ca.sh:z",
            "--volume",
            "/some_path/uiam_cosmosdb.pfx:/tmp/uiam_cosmosdb.pfx:z",
            "--volume",
            "/some/path/ca.crt:/tmp/ca.crt:z",
            "--volume",
            "/some/path/kibana.key:/tmp/server.key:z",
            "--volume",
            "/some/path/kibana.crt:/tmp/server.crt:z",
            "-p",
            "127.0.0.1:8443:8443",
            "--entrypoint",
            "/opt/jboss/container/java/run/run-java-with-custom-ca.sh",
            "--env",
            "JAVA_OPTS_APPEND=-Xms256m -Xmx1g",
            "--env",
            "uiam.apikey.convert.validation.endpoint.enabled=false",
            "--env",
            "quarkus.tls.https.key-store.pem.0.cert=/tmp/server.crt",
            "--env",
            "quarkus.tls.https.key-store.pem.0.key=/tmp/server.key",
            "--env",
            "quarkus.tls.https.trust-store.pem.certs=/tmp/ca.crt",
            "--env",
            "quarkus.tls.esclient.key-store.pem.0.cert=/tmp/server.crt",
            "--env",
            "quarkus.tls.esclient.key-store.pem.0.key=/tmp/server.key",
            "--env",
            "quarkus.http.ssl.certificate.key-store-provider=JKS",
            "--env",
            "quarkus.http.ssl.certificate.trust-store-provider=SUN",
            "--env",
            "quarkus.log.category.\\"co\\".level=INFO",
            "--env",
            "quarkus.log.category.\\"io\\".level=INFO",
            "--env",
            "quarkus.log.category.\\"org\\".level=INFO",
            "--env",
            "quarkus.log.category.\\"co.elastic.cloud.uiam\\".level=DEBUG",
            "--env",
            "quarkus.log.category.\\"co.elastic.cloud.uiam.app.authentication.ClientCertificateExtractor\\".level=INFO",
            "--env",
            "quarkus.log.console.json.enabled=false",
            "--env",
            "quarkus.log.level=INFO",
            "--env",
            "quarkus.otel.sdk.disabled=true",
            "--env",
            "quarkus.profile=dev",
            "--env",
            "uiam.api_keys.decoder.prefixes=essu_dev",
            "--env",
            "uiam.api_keys.encoder.prefix=essu_dev",
            "--env",
            "uiam.cosmos.account.access_key=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==",
            "--env",
            "uiam.cosmos.account.endpoint=https://uiam-cosmosdb:8081",
            "--env",
            "uiam.cosmos.container.apikey=api-keys",
            "--env",
            "uiam.cosmos.container.oauth_authorization_code=oauth-authorization-codes",
            "--env",
            "uiam.cosmos.container.oauth_client=oauth-clients",
            "--env",
            "uiam.cosmos.container.oauth_app_connection=oauth-app-connections",
            "--env",
            "uiam.cosmos.container.token_invalidation=token-invalidation",
            "--env",
            "uiam.cosmos.container.users=users",
            "--env",
            "uiam.cosmos.database=uiam-db",
            "--env",
            "uiam.cosmos.gateway_connection_mode=true",
            "--env",
            "uiam.internal.shared.secrets=Dw7eRt5yU2iO9pL3aS4dF6gH8jK0lZ1xC2vB3nM4qW5=",
            "--env",
            "uiam.tokens.jwt.signature.secrets=MnpT2a582F/LiRbocLHLnSF2SYElqTUdmQvBpVn+51Q=",
            "--env",
            "uiam.tokens.jwt.signing.secret=MnpT2a582F/LiRbocLHLnSF2SYElqTUdmQvBpVn+51Q=",
            "--env",
            "uiam.tokens.jwt.verify.clock.skew=PT2S",
            "--env",
            "uiam.tokens.refresh.grace_period=PT3S",
            "--health-cmd",
            "timeout 1 bash -c \\"</dev/tcp/localhost/8080\\"",
            "--name",
            "uiam",
            "docker.elastic.co/kibana-ci/uiam:latest-verified",
          ],
        ],
        Array [
          "docker",
          Array [
            "inspect",
            "-f",
            "{{.State.Health.Status}}",
            "uiam",
          ],
        ],
      ]
    `);
  });

  test('wait for the container to become healthy', async () => {
    const [cosmosDbContainer, uiamContainer] = UIAM_CONTAINERS;

    // 1. Check Cosmos DB container.
    execa
      .mockResolvedValueOnce({ stdout: `name-${cosmosDbContainer.name}` })
      .mockResolvedValueOnce({ stdout: ` running ` })
      .mockResolvedValueOnce({ stdout: ` running ` })
      .mockResolvedValueOnce({ stdout: ` healthy ` });

    await expect(runUiamContainer(new ToolingLog(), cosmosDbContainer)).resolves.toEqual(
      cosmosDbContainer.name
    );

    // Skip the first call to `docker run` as we checked it in the previous test.
    expect(execa.mock.calls.slice(1)).toMatchInlineSnapshot(`
      Array [
        Array [
          "docker",
          Array [
            "inspect",
            "-f",
            "{{.State.Health.Status}}",
            "uiam-cosmosdb",
          ],
        ],
        Array [
          "docker",
          Array [
            "inspect",
            "-f",
            "{{.State.Health.Status}}",
            "uiam-cosmosdb",
          ],
        ],
        Array [
          "docker",
          Array [
            "inspect",
            "-f",
            "{{.State.Health.Status}}",
            "uiam-cosmosdb",
          ],
        ],
      ]
    `);

    execa.mockClear();

    // 2. Check UIAM container.
    execa
      .mockResolvedValueOnce({ stdout: `name-${uiamContainer.name}` })
      .mockResolvedValueOnce({ stdout: ` running ` })
      .mockResolvedValueOnce({ stdout: ` running ` })
      .mockResolvedValueOnce({ stdout: ` healthy ` });

    await expect(runUiamContainer(new ToolingLog(), uiamContainer)).resolves.toEqual(
      uiamContainer.name
    );

    // Skip the first call to `docker run` as we checked it in the previous test.
    expect(execa.mock.calls.slice(1)).toMatchInlineSnapshot(`
      Array [
        Array [
          "docker",
          Array [
            "inspect",
            "-f",
            "{{.State.Health.Status}}",
            "uiam",
          ],
        ],
        Array [
          "docker",
          Array [
            "inspect",
            "-f",
            "{{.State.Health.Status}}",
            "uiam",
          ],
        ],
        Array [
          "docker",
          Array [
            "inspect",
            "-f",
            "{{.State.Health.Status}}",
            "uiam",
          ],
        ],
      ]
    `);
  });

  test('fails if container never becomes healthy', async () => {
    const [cosmosDbContainer, uiamContainer] = UIAM_CONTAINERS;

    // 1. Check Cosmos DB container.
    execa
      .mockResolvedValueOnce({ stdout: `name-${cosmosDbContainer.name}` })
      .mockResolvedValue({ stdout: ` running ` });

    await expect(
      runUiamContainer(new ToolingLog(), cosmosDbContainer)
    ).rejects.toMatchInlineSnapshot(
      `[Error: The "uiam-cosmosdb" container failed to start within the expected time. Last known status: running. Check the logs with [1mdocker logs -f uiam-cosmosdb[22m]`
    );

    // Skip the first call to `docker run` as we checked it in the previous test.
    expect(execa.mock.calls.slice(1)).toHaveLength(31);

    execa.mockClear();

    // 2. Check UIAM container.
    execa
      .mockResolvedValueOnce({ stdout: `name-${uiamContainer.name}` })
      .mockResolvedValue({ stdout: ` running ` });

    await expect(runUiamContainer(new ToolingLog(), uiamContainer)).rejects.toMatchInlineSnapshot(
      `[Error: The "uiam" container failed to start within the expected time. Last known status: running. Check the logs with [1mdocker logs -f uiam[22m]`
    );

    // Skip the first call to `docker run` as we checked it in the previous test.
    expect(execa.mock.calls.slice(1)).toHaveLength(31);
  });
});

describe('#initializeUiamContainers', () => {
  const AGENT_MOCK = {
    name: "I'm the danger. I'm the one who knocks.",
    dispatch: jest.fn(),
  };

  beforeEach(() => {
    mockUndiciAgent.mockImplementation(() => AGENT_MOCK as any);
  });

  test('should be able to initialize UIAM containers if Cosmos DB database does not exist', async () => {
    mockUndiciFetch.mockResolvedValue({ ok: true, status: 201 } as any);

    const promise = initializeUiamContainers(new ToolingLog());
    await jest.runAllTimersAsync();
    await promise;

    expect(mockUndiciAgent).toHaveBeenCalledTimes(1);
    expect(mockUndiciAgent).toHaveBeenCalledWith({ connect: { rejectUnauthorized: false } });

    expect(mockUndiciFetch).toHaveBeenCalledTimes(7);
    expect(mockUndiciFetch.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "https://localhost:8081/dbs",
          Object {
            "body": "{\\"id\\":\\"uiam-db\\"}",
            "dispatcher": Object {
              "dispatch": [MockFunction],
              "name": "I'm the danger. I'm the one who knocks.",
            },
            "headers": Object {
              "Authorization": "type%3Dmaster%26ver%3D1.0%26sig%3DbM52wXmcRTqB2rJbuj54HlpDmbiqQInCcPcBfryJHd0%3D",
              "Content-Type": "application/json",
              "x-ms-date": "Sat, 01 Jan 2000 00:00:00 GMT",
              "x-ms-version": "2018-12-31",
            },
            "method": "POST",
          },
        ],
        Array [
          "https://localhost:8081/dbs/uiam-db/colls",
          Object {
            "body": "{\\"id\\":\\"users\\",\\"partitionKey\\":{\\"paths\\":[\\"/id\\"],\\"kind\\":\\"Hash\\"}}",
            "dispatcher": Object {
              "dispatch": [MockFunction],
              "name": "I'm the danger. I'm the one who knocks.",
            },
            "headers": Object {
              "Authorization": "type%3Dmaster%26ver%3D1.0%26sig%3Djxrkp7JRqa5BKBelNeJSwradPgHYz2aTrP8%2Bce0zMQY%3D",
              "Content-Type": "application/json",
              "x-ms-date": "Sat, 01 Jan 2000 00:00:00 GMT",
              "x-ms-version": "2018-12-31",
            },
            "method": "POST",
          },
        ],
        Array [
          "https://localhost:8081/dbs/uiam-db/colls",
          Object {
            "body": "{\\"id\\":\\"api-keys\\",\\"partitionKey\\":{\\"paths\\":[\\"/id\\"],\\"kind\\":\\"Hash\\"}}",
            "dispatcher": Object {
              "dispatch": [MockFunction],
              "name": "I'm the danger. I'm the one who knocks.",
            },
            "headers": Object {
              "Authorization": "type%3Dmaster%26ver%3D1.0%26sig%3Djxrkp7JRqa5BKBelNeJSwradPgHYz2aTrP8%2Bce0zMQY%3D",
              "Content-Type": "application/json",
              "x-ms-date": "Sat, 01 Jan 2000 00:00:00 GMT",
              "x-ms-version": "2018-12-31",
            },
            "method": "POST",
          },
        ],
        Array [
          "https://localhost:8081/dbs/uiam-db/colls",
          Object {
            "body": "{\\"id\\":\\"token-invalidation\\",\\"partitionKey\\":{\\"paths\\":[\\"/id\\"],\\"kind\\":\\"Hash\\"}}",
            "dispatcher": Object {
              "dispatch": [MockFunction],
              "name": "I'm the danger. I'm the one who knocks.",
            },
            "headers": Object {
              "Authorization": "type%3Dmaster%26ver%3D1.0%26sig%3Djxrkp7JRqa5BKBelNeJSwradPgHYz2aTrP8%2Bce0zMQY%3D",
              "Content-Type": "application/json",
              "x-ms-date": "Sat, 01 Jan 2000 00:00:00 GMT",
              "x-ms-version": "2018-12-31",
            },
            "method": "POST",
          },
        ],
        Array [
          "https://localhost:8081/dbs/uiam-db/colls",
          Object {
            "body": "{\\"id\\":\\"oauth-clients\\",\\"partitionKey\\":{\\"paths\\":[\\"/creator_id\\"],\\"kind\\":\\"Hash\\"}}",
            "dispatcher": Object {
              "dispatch": [MockFunction],
              "name": "I'm the danger. I'm the one who knocks.",
            },
            "headers": Object {
              "Authorization": "type%3Dmaster%26ver%3D1.0%26sig%3Djxrkp7JRqa5BKBelNeJSwradPgHYz2aTrP8%2Bce0zMQY%3D",
              "Content-Type": "application/json",
              "x-ms-date": "Sat, 01 Jan 2000 00:00:00 GMT",
              "x-ms-version": "2018-12-31",
            },
            "method": "POST",
          },
        ],
        Array [
          "https://localhost:8081/dbs/uiam-db/colls",
          Object {
            "body": "{\\"id\\":\\"oauth-authorization-codes\\",\\"partitionKey\\":{\\"paths\\":[\\"/id\\"],\\"kind\\":\\"Hash\\"}}",
            "dispatcher": Object {
              "dispatch": [MockFunction],
              "name": "I'm the danger. I'm the one who knocks.",
            },
            "headers": Object {
              "Authorization": "type%3Dmaster%26ver%3D1.0%26sig%3Djxrkp7JRqa5BKBelNeJSwradPgHYz2aTrP8%2Bce0zMQY%3D",
              "Content-Type": "application/json",
              "x-ms-date": "Sat, 01 Jan 2000 00:00:00 GMT",
              "x-ms-version": "2018-12-31",
            },
            "method": "POST",
          },
        ],
        Array [
          "https://localhost:8081/dbs/uiam-db/colls",
          Object {
            "body": "{\\"id\\":\\"oauth-app-connections\\",\\"partitionKey\\":{\\"paths\\":[\\"/client_id\\"],\\"kind\\":\\"Hash\\"}}",
            "dispatcher": Object {
              "dispatch": [MockFunction],
              "name": "I'm the danger. I'm the one who knocks.",
            },
            "headers": Object {
              "Authorization": "type%3Dmaster%26ver%3D1.0%26sig%3Djxrkp7JRqa5BKBelNeJSwradPgHYz2aTrP8%2Bce0zMQY%3D",
              "Content-Type": "application/json",
              "x-ms-date": "Sat, 01 Jan 2000 00:00:00 GMT",
              "x-ms-version": "2018-12-31",
            },
            "method": "POST",
          },
        ],
      ]
    `);
  });

  test('should be able to initialize UIAM containers if Cosmos DB database and collections exist', async () => {
    mockUndiciFetch.mockResolvedValue({ ok: false, status: 409 } as any);

    await initializeUiamContainers(new ToolingLog());

    expect(mockUndiciAgent).toHaveBeenCalledTimes(1);
    expect(mockUndiciAgent).toHaveBeenCalledWith({ connect: { rejectUnauthorized: false } });

    expect(mockUndiciFetch).toHaveBeenCalledTimes(7);
  });

  test('fails if cannot create database', async () => {
    mockUndiciFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Some server error'),
    } as any);

    await expect(initializeUiamContainers(new ToolingLog())).rejects.toMatchInlineSnapshot(
      `[Error: Failed to create database (uiam-db): 500 Some server error]`
    );

    expect(mockUndiciAgent).toHaveBeenCalledTimes(1);
    expect(mockUndiciAgent).toHaveBeenCalledWith({ connect: { rejectUnauthorized: false } });

    expect(mockUndiciFetch).toHaveBeenCalledTimes(1);
  });

  test('fails if cannot create collection', async () => {
    mockUndiciFetch.mockResolvedValueOnce({ ok: true, status: 201 } as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Some server error'),
    } as any);

    await expect(initializeUiamContainers(new ToolingLog())).rejects.toMatchInlineSnapshot(
      `[Error: Failed to create collection (users): 500 Some server error]`
    );

    expect(mockUndiciAgent).toHaveBeenCalledTimes(1);
    expect(mockUndiciAgent).toHaveBeenCalledWith({ connect: { rejectUnauthorized: false } });

    expect(mockUndiciFetch).toHaveBeenCalledTimes(2);
  });
});

describe('#getUiamContainers()', () => {
  test('disables Cosmos DB data persistence and omits the data volume by default', () => {
    const [cosmosDbContainer] = getUiamContainers();

    expect(cosmosDbContainer.params).toEqual(
      expect.arrayContaining(['AZURE_COSMOS_EMULATOR_ENABLE_DATA_PERSISTENCE=false'])
    );
    expect(cosmosDbContainer.params).not.toEqual(
      expect.arrayContaining([expect.stringContaining(':/data:z')])
    );
  });

  test('enables Cosmos DB data persistence and mounts the host data path when provided', () => {
    const cosmosDbDataPath = '/host/.es/cosmosdb';
    const [cosmosDbContainer] = getUiamContainers({ cosmosDbDataPath });

    expect(cosmosDbContainer.params).toEqual(
      expect.arrayContaining([
        '--volume',
        `${cosmosDbDataPath}:/data:z`,
        '--env',
        'AZURE_COSMOS_EMULATOR_ENABLE_DATA_PERSISTENCE=true',
      ])
    );
  });
});

describe('#setupUiamCosmosDbDataDir()', () => {
  const baseEsPath = `${process.cwd()}/.es`;
  const cosmosDbDataPath = `${baseEsPath}/${UIAM_COSMOS_DB_DATA_DIR}`;

  beforeEach(() => {
    jest.useRealTimers();
  });

  afterEach(() => {
    mockFs.restore();
  });

  test('creates the Cosmos DB data dir and returns its path when missing', async () => {
    mockFs({ [baseEsPath]: {} });

    const returnedPath = await setupUiamCosmosDbDataDir(new ToolingLog(), {
      basePath: baseEsPath,
    });

    expect(returnedPath).toBe(cosmosDbDataPath);
    await expect(Fsp.access(cosmosDbDataPath)).resolves.not.toThrow();
    // eslint-disable-next-line no-bitwise
    expect((await Fsp.stat(cosmosDbDataPath)).mode & 0o777).toBe(0o777);
  });

  test('preserves an existing Cosmos DB data dir when --clean is not passed', async () => {
    mockFs({
      [baseEsPath]: {
        [UIAM_COSMOS_DB_DATA_DIR]: { 'state.dat': 'persisted' },
      },
    });

    await setupUiamCosmosDbDataDir(new ToolingLog(), { basePath: baseEsPath });

    await expect(Fsp.readFile(`${cosmosDbDataPath}/state.dat`, 'utf8')).resolves.toBe('persisted');
  });

  test('wipes an existing Cosmos DB data dir when --clean is passed', async () => {
    mockFs({
      [baseEsPath]: {
        [UIAM_COSMOS_DB_DATA_DIR]: { 'state.dat': 'persisted' },
      },
    });

    await setupUiamCosmosDbDataDir(new ToolingLog(), { basePath: baseEsPath, clean: true });

    await expect(Fsp.access(cosmosDbDataPath)).resolves.not.toThrow();
    await expect(Fsp.access(`${cosmosDbDataPath}/state.dat`)).rejects.toThrow();
  });
});
