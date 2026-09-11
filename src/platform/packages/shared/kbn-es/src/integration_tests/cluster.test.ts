/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import fs from 'fs';
import { ToolingLog, ToolingLogCollectingWriter } from '@kbn/tooling-log';
import * as extractConfig from '../utils/extract_config_files';
import * as dockerUtils from '../utils/docker';
import { createAnyInstanceSerializer, createStripAnsiSerializer } from '@kbn/jest-serializers';
import * as installUtils from '../install';
import * as waitClusterUtil from '../utils/wait_until_cluster_ready';
import { Cluster } from '../cluster';
import { ES_NOPASSWORD_P12_PATH } from '@kbn/dev-utils/src/certs';
import {
  DownloadSnapshotOptions,
  InstallArchiveOptions,
  InstallSnapshotOptions,
  InstallSourceOptions,
} from '../install/types';
import { Client } from '@elastic/elasticsearch';

expect.addSnapshotSerializer(createAnyInstanceSerializer(ToolingLog));
expect.addSnapshotSerializer(createAnyInstanceSerializer(Client));
expect.addSnapshotSerializer(createStripAnsiSerializer());

const log = new ToolingLog();
const logWriter = new ToolingLogCollectingWriter();
log.setWriters([logWriter]);
const KIBANA_ROOT = process.cwd();
const installPath = `${KIBANA_ROOT}/.es`;
const esClusterExecOptions = {};
const initialEnv = { ...process.env };

const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const ensureResolve = async (promise: Promise<unknown>, name: string) => {
  return await Promise.race([
    promise,
    sleep(100).then(() => {
      throw new Error(`promise was supposed to resolve with ${name} resolution`);
    }),
  ]);
};

const ensureNoResolve = async (promise: Promise<unknown>) => {
  await Promise.race([
    sleep(100),
    promise.then(() => {
      throw new Error('promise was not supposed to resolve');
    }),
  ]);
};

jest.mock('execa');
const execaMock = jest.requireMock('execa');

const mockEsBin = (
  {
    exitCode,
    start,
    ssl,
  }: {
    exitCode?: number;
    start?: boolean;
    ssl?: boolean;
  } = { start: false, ssl: false }
) => {
  execaMock.mockImplementationOnce((args: string[], options: {}) =>
    jest.requireActual('execa')(
      process.execPath,
      [
        '--require=@kbn/swc-register/install',
        require.resolve('./__fixtures__/es_bin.js'),
        JSON.stringify({
          exitCode,
          start,
          ssl: ssl || args.includes('xpack.security.http.ssl.enabled=true'),
        }),
      ],
      options
    )
  );
};

jest.mock('../install', () => ({
  downloadSnapshot: jest.fn(),
  installSource: jest.fn(),
  installSnapshot: jest.fn(),
  installArchive: jest.fn(),
}));

jest.mock('../utils/extract_config_files', () => ({
  extractConfigFiles: jest.fn(),
}));

jest.mock('../utils/docker', () => ({
  runServerlessCluster: jest.fn(),
  runDockerContainer: jest.fn(),
}));

jest.mock('../utils/wait_until_cluster_ready', () => ({
  waitUntilClusterReady: jest.fn(),
}));

const downloadSnapshotMock = jest.spyOn(installUtils, 'downloadSnapshot');
const installSourceMock = jest.spyOn(installUtils, 'installSource');
const installSnapshotMock = jest.spyOn(installUtils, 'installSnapshot');
const installArchiveMock = jest.spyOn(installUtils, 'installArchive');
const extractConfigFilesMock = jest.spyOn(extractConfig, 'extractConfigFiles');
const runServerlessClusterMock = jest.spyOn(dockerUtils, 'runServerlessCluster');
const runDockerContainerMock = jest.spyOn(dockerUtils, 'runDockerContainer');
const waitUntilClusterReadyMock = jest.spyOn(waitClusterUtil, 'waitUntilClusterReady');

beforeEach(() => {
  jest.resetAllMocks();
  extractConfigFilesMock.mockImplementation((config) =>
    Array.isArray(config) ? config : [config]
  );
  log.indent(-log.getIndent());
  logWriter.messages.length = 0;
});

afterEach(() => {
  process.env = { ...initialEnv };
});

describe('#downloadSnapshot()', () => {
  test('awaits downloadSnapshot() promise and returns { downloadPath }', async () => {
    let resolveDownloadSnapshot: Function;
    downloadSnapshotMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDownloadSnapshot = () => {
            resolve({ downloadPath: 'foo' });
          };
        })
    );

    const cluster = new Cluster({ log });
    const promise = cluster.downloadSnapshot({ version: '8.10.0' });
    await ensureNoResolve(promise);
    resolveDownloadSnapshot!();
    await expect(ensureResolve(promise, 'downloadSnapshot()')).resolves.toEqual({
      downloadPath: 'foo',
    });
  });

  test('passes through all options+log to downloadSnapshot()', async () => {
    downloadSnapshotMock.mockResolvedValue({ downloadPath: 'foo' });
    const options: DownloadSnapshotOptions = {
      version: '8.10.0',
      license: 'trial',
      basePath: 'someBasePath',
      installPath: 'someInstallPath',
      log,
      useCached: true,
    };
    const cluster = new Cluster({ log });
    await cluster.downloadSnapshot(options);
    expect(downloadSnapshotMock.mock.calls[0][0]).toMatchObject(options);
    expect(logWriter.messages).toMatchInlineSnapshot(`
      Array [
        " info source[@kbn/es Cluster] Downloading snapshot",
      ]
    `);
  });

  test('rejects if downloadSnapshot() rejects', async () => {
    downloadSnapshotMock.mockRejectedValue(new Error('foo'));
    const cluster = new Cluster({ log });
    await expect(cluster.downloadSnapshot({ version: '8.10.0' })).rejects.toThrowError('foo');
  });
});

describe('#installSource()', () => {
  test('awaits installSource() promise and returns { installPath, disableEsTmpDir }', async () => {
    let resolveInstallSource: Function;
    installSourceMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInstallSource = () => {
            resolve({ installPath: 'foo', disableEsTmpDir: false });
          };
        })
    );

    const cluster = new Cluster({ log });
    const promise = cluster.installSource({ sourcePath: 'bar' });
    await ensureNoResolve(promise);
    resolveInstallSource!();
    await expect(ensureResolve(promise, 'installSource()')).resolves.toEqual({
      installPath: 'foo',
      disableEsTmpDir: false,
    });
  });

  test('passes through all options+log to installSource()', async () => {
    installSourceMock.mockResolvedValue({ installPath: 'foo', disableEsTmpDir: false });
    const options: InstallSourceOptions = {
      sourcePath: 'bar',
      license: 'trial',
      password: 'changeme',
      basePath: 'someBasePath',
      installPath: 'someInstallPath',
      esArgs: ['foo=true'],
      log,
    };
    const cluster = new Cluster({ log });
    await cluster.installSource(options);
    expect(installSourceMock.mock.calls[0][0]).toMatchObject(options);
    expect(logWriter.messages).toMatchInlineSnapshot(`
          Array [
            " info source[@kbn/es Cluster] Installing from source",
          ]
      `);
  });

  test('rejects if installSource() rejects', async () => {
    installSourceMock.mockRejectedValue(new Error('foo'));
    const cluster = new Cluster({ log });
    await expect(cluster.installSource({ sourcePath: 'bar' })).rejects.toThrowError('foo');
  });
});

describe('#installSnapshot()', () => {
  test('awaits installSnapshot() promise and returns { installPath, disableEsTmpDir }', async () => {
    let resolveInstallSnapshot: Function;
    installSnapshotMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInstallSnapshot = () => {
            resolve({ installPath: 'foo', disableEsTmpDir: false });
          };
        })
    );

    const cluster = new Cluster({ log });
    const promise = cluster.installSnapshot({ version: '8.10.0' });
    await ensureNoResolve(promise);
    resolveInstallSnapshot!();
    await expect(ensureResolve(promise, 'installSnapshot()')).resolves.toEqual({
      installPath: 'foo',
      disableEsTmpDir: false,
    });
  });

  test('passes through all options+log to installSnapshot()', async () => {
    installSnapshotMock.mockResolvedValue({ installPath: 'foo', disableEsTmpDir: false });
    const options: InstallSnapshotOptions = {
      version: '8.10.0',
      license: 'trial',
      password: 'changeme',
      basePath: 'someBasePath',
      installPath: 'someInstallPath',
      esArgs: ['foo=true'],
      useCached: true,
      log,
    };
    const cluster = new Cluster({ log });
    await cluster.installSnapshot(options);
    expect(installSnapshotMock.mock.calls[0][0]).toMatchObject(options);
    expect(logWriter.messages).toMatchInlineSnapshot(`
          Array [
            " info source[@kbn/es Cluster] Installing from snapshot",
          ]
      `);
  });

  test('rejects if installSnapshot() rejects', async () => {
    installSnapshotMock.mockRejectedValue(new Error('foo'));
    const cluster = new Cluster({ log });
    await expect(cluster.installSnapshot({ version: '8.10.0' })).rejects.toThrowError('foo');
  });
});

describe('#installArchive()', () => {
  test('awaits installArchive() promise and returns { installPath, disableEsTmpDir }', async () => {
    let resolveInstallArchive: Function;
    installArchiveMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInstallArchive = () => {
            resolve({ installPath: 'foo', disableEsTmpDir: false });
          };
        })
    );

    const cluster = new Cluster({ log });
    const promise = cluster.installArchive('bar');
    await ensureNoResolve(promise);
    resolveInstallArchive!();
    await expect(ensureResolve(promise, 'installArchive()')).resolves.toEqual({
      installPath: 'foo',
      disableEsTmpDir: false,
    });
  });

  test('passes through all options+log to installArchive()', async () => {
    installArchiveMock.mockResolvedValue({ installPath: 'foo', disableEsTmpDir: true });
    const options: InstallArchiveOptions = {
      license: 'trial',
      password: 'changeme',
      basePath: 'someBasePath',
      installPath: 'someInstallPath',
      esArgs: ['foo=true'],
      log,
      disableEsTmpDir: true,
      resources: ['path/to/resource'],
    };
    const cluster = new Cluster({ log });
    await cluster.installArchive('bar', options);
    expect(installArchiveMock.mock.calls[0]).toMatchObject(['bar', options]);
    expect(logWriter.messages).toMatchInlineSnapshot(`
          Array [
            " info source[@kbn/es Cluster] Installing from an archive",
          ]
      `);
  });

  test('rejects if installArchive() rejects', async () => {
    installArchiveMock.mockRejectedValue(new Error('foo'));
    const cluster = new Cluster({ log });
    await expect(cluster.installArchive('bar')).rejects.toThrowError('foo');
  });
});

describe('#start(installPath)', () => {
  test('rejects when bin/elasticsearch exists with 0 before starting', async () => {
    mockEsBin({ exitCode: 0, start: false });

    await expect(
      new Cluster({ log }).start(installPath, esClusterExecOptions)
    ).rejects.toThrowError('ES exited without starting');
  });

  test('rejects when bin/elasticsearch exists with 143 before starting', async () => {
    mockEsBin({ exitCode: 143, start: false });

    await expect(
      new Cluster({ log }).start(installPath, esClusterExecOptions)
    ).rejects.toThrowError('ES exited without starting');
  });

  test('rejects when bin/elasticsearch exists with 130 before starting', async () => {
    mockEsBin({ exitCode: 130, start: false });

    await expect(
      new Cluster({ log }).start(installPath, esClusterExecOptions)
    ).rejects.toThrowError('ES exited without starting');
  });

  test('rejects when bin/elasticsearch exists with 1 before starting', async () => {
    mockEsBin({ exitCode: 1, start: false });

    await expect(
      new Cluster({ log }).start(installPath, esClusterExecOptions)
    ).rejects.toThrowError('ES exited with code 1');
  });

  test('resolves when bin/elasticsearch logs "started"', async () => {
    mockEsBin({ start: true });

    await new Cluster({ log }).start(installPath, esClusterExecOptions);
  });

  test(`writes logs to file when 'writeLogsToPath' is passed`, async () => {
    mockEsBin({ start: true });
    const writeLogsToPath = `${KIBANA_ROOT}/es-cluster.log`;

    await new Cluster({ log }).start(installPath, { writeLogsToPath });

    expect(logWriter.messages[0]).toContain(`and writing logs to ${writeLogsToPath}`);
    expect(fs.existsSync(writeLogsToPath)).toBe(true);
  });

  test('calls waitUntilClusterReady() by default', async () => {
    mockEsBin({ start: true });
    waitUntilClusterReadyMock.mockResolvedValue();

    await new Cluster({ log }).start(installPath, esClusterExecOptions);
    expect(waitUntilClusterReadyMock).toHaveBeenCalledTimes(1);
    expect(waitUntilClusterReadyMock.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        Object {
          "client": <Client>,
          "expectedStatus": "yellow",
          "log": <ToolingLog>,
          "readyTimeout": undefined,
        },
      ]
    `);
  });

  test(`doesn't call waitUntilClusterReady() if 'skipReadyCheck' is passed`, async () => {
    mockEsBin({ start: true });
    waitUntilClusterReadyMock.mockResolvedValue();

    await new Cluster({ log }).start(installPath, { skipReadyCheck: true });
    expect(waitUntilClusterReadyMock).toHaveBeenCalledTimes(0);
  });

  test(`rejects if waitUntilClusterReady() rejects`, async () => {
    mockEsBin({ start: true });
    waitUntilClusterReadyMock.mockRejectedValue(new Error('foo'));
    await expect(
      new Cluster({ log }).start(installPath, esClusterExecOptions)
    ).rejects.toThrowError('foo');
  });

  test('rejects if #start() was called previously', async () => {
    mockEsBin({ start: true });

    const cluster = new Cluster({ log });
    await cluster.start(installPath, esClusterExecOptions);
    await expect(cluster.start(installPath, esClusterExecOptions)).rejects.toThrowError(
      'ES has already been started'
    );
  });

  test('rejects if #run() was called previously', async () => {
    mockEsBin({ start: true });

    const cluster = new Cluster({ log });
    await cluster.run(installPath, esClusterExecOptions);
    await expect(cluster.start(installPath, esClusterExecOptions)).rejects.toThrowError(
      'ES has already been started'
    );
  });

  test('sets up SSL when enabled', async () => {
    mockEsBin({ start: true, ssl: true });

    const cluster = new Cluster({ log, ssl: true });
    await cluster.start(installPath, esClusterExecOptions);

    const config = extractConfigFilesMock.mock.calls[0][0];
    expect(config).toContain('xpack.security.http.ssl.enabled=true');
    expect(config).toContain(`xpack.security.http.ssl.keystore.path=${ES_NOPASSWORD_P12_PATH}`);
    expect(config).toContain(`xpack.security.http.ssl.keystore.type=PKCS12`);
  });

  test(`doesn't setup SSL when disabled`, async () => {
    mockEsBin({ start: true });
    extractConfigFilesMock.mockReturnValueOnce([]);

    const cluster = new Cluster({ log, ssl: false });
    await cluster.start(installPath, esClusterExecOptions);

    expect(extractConfigFilesMock.mock.calls[0][0]).toMatchObject([
      'action.destructive_requires_name=true',
      'cluster.routing.allocation.disk.threshold_enabled=false',
      'ingest.geoip.downloader.enabled=false',
      'search.check_ccs_compatibility=true',
    ]);
  });

  test('allows overriding search.check_ccs_compatibility', async () => {
    mockEsBin({ start: true });
    extractConfigFilesMock.mockReturnValueOnce([]);

    const cluster = new Cluster({
      log,
      ssl: false,
    });
    await cluster.start('undefined', {
      esArgs: ['search.check_ccs_compatibility=false'],
    });

    expect(extractConfigFilesMock.mock.calls[0][0]).toMatchObject([
      'action.destructive_requires_name=true',
      'cluster.routing.allocation.disk.threshold_enabled=false',
      'ingest.geoip.downloader.enabled=false',
      'search.check_ccs_compatibility=false',
    ]);
  });
});

describe('#run()', () => {
  test('resolves when bin/elasticsearch exists with 0', async () => {
    mockEsBin({ exitCode: 0 });

    await new Cluster({ log }).run(installPath, esClusterExecOptions);
  });

  test('resolves when bin/elasticsearch exists with 143', async () => {
    mockEsBin({ exitCode: 143 });

    await new Cluster({ log }).run(installPath, esClusterExecOptions);
  });

  test('resolves when bin/elasticsearch exists with 130', async () => {
    mockEsBin({ exitCode: 130 });

    await new Cluster({ log }).run(installPath, esClusterExecOptions);
  });

  test('rejects when bin/elasticsearch exists with 1', async () => {
    mockEsBin({ exitCode: 1 });

    await expect(new Cluster({ log }).run(installPath, esClusterExecOptions)).rejects.toThrowError(
      'ES exited with code 1'
    );
  });

  test('rejects if #start() was called previously', async () => {
    mockEsBin({ exitCode: 0, start: true });

    const cluster = new Cluster({ log });
    await cluster.start(installPath, esClusterExecOptions);
    await expect(cluster.run(installPath, esClusterExecOptions)).rejects.toThrowError(
      'ES has already been started'
    );
  });

  test('rejects if #run() was called previously', async () => {
    mockEsBin({ exitCode: 0 });

    const cluster = new Cluster({ log });
    await cluster.run(installPath, esClusterExecOptions);
    await expect(cluster.run(installPath, esClusterExecOptions)).rejects.toThrowError(
      'ES has already been started'
    );
  });

  test('sets up SSL when enabled', async () => {
    mockEsBin({ start: true, ssl: true });

    const cluster = new Cluster({ log, ssl: true });
    await cluster.run(installPath, esClusterExecOptions);

    const config = extractConfigFilesMock.mock.calls[0][0];
    expect(config).toContain('xpack.security.http.ssl.enabled=true');
    expect(config).toContain(`xpack.security.http.ssl.keystore.path=${ES_NOPASSWORD_P12_PATH}`);
    expect(config).toContain(`xpack.security.http.ssl.keystore.type=PKCS12`);
  });

  test(`doesn't setup SSL when disabled`, async () => {
    mockEsBin({ start: true });
    extractConfigFilesMock.mockReturnValueOnce([]);

    const cluster = new Cluster({ log, ssl: false });
    await cluster.run(installPath, esClusterExecOptions);

    expect(extractConfigFilesMock.mock.calls[0][0]).toMatchObject([
      'action.destructive_requires_name=true',
      'cluster.routing.allocation.disk.threshold_enabled=false',
      'ingest.geoip.downloader.enabled=false',
      'search.check_ccs_compatibility=true',
    ]);
  });

  test('sets default Java heap', async () => {
    mockEsBin({ start: true });

    const cluster = new Cluster({ log });
    await cluster.run(installPath, esClusterExecOptions);

    expect(execaMock.mock.calls[0][2].env.ES_JAVA_OPTS).toMatchInlineSnapshot(
      `"-Xms1536m -Xmx1536m"`
    );
  });

  test('allows Java heap to be overwritten', async () => {
    mockEsBin({ start: true });
    process.env.ES_JAVA_OPTS = '-Xms5g -Xmx5g';

    const cluster = new Cluster({ log });
    await cluster.run(installPath, esClusterExecOptions);

    expect(execaMock.mock.calls[0][2].env.ES_JAVA_OPTS).toMatchInlineSnapshot(`"-Xms5g -Xmx5g"`);
  });
});

describe('#installPlugins()', () => {
  test('passes through installPath and runs execa for each plugin', async () => {
    const cluster = new Cluster({ log });
    await cluster.installPlugins('foo', 'esPlugin1,esPlugin2', '');
    expect(execaMock.mock.calls.length).toBe(2);
    expect(execaMock.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        "bin/elasticsearch-plugin",
        Array [
          "install",
          "esPlugin1",
        ],
        Object {
          "cwd": "foo",
          "env": Object {
            "ES_JAVA_OPTS": "-Xms1536m -Xmx1536m",
            "JAVA_HOME": "",
          },
        },
      ]
    `);

    expect(execaMock.mock.calls[1]).toMatchInlineSnapshot(`
          Array [
            "bin/elasticsearch-plugin",
            Array [
              "install",
              "esPlugin2",
            ],
            Object {
              "cwd": "foo",
              "env": Object {
                "ES_JAVA_OPTS": "-Xms1536m -Xmx1536m",
                "JAVA_HOME": "",
              },
            },
          ]
      `);
  });

  test(`allows 'esJavaOpts' to be overwritten`, async () => {
    mockEsBin({ start: true });

    const cluster = new Cluster({ log });
    await cluster.installPlugins('foo', 'esPlugin1', '-Xms2g -Xmx2g');

    expect(execaMock.mock.calls[0][2].env.ES_JAVA_OPTS).toMatchInlineSnapshot(`"-Xms2g -Xmx2g"`);
  });
});

describe('#configureKeystoreWithSecureSettingsFiles()', () => {
  test('passes through installPath and runs execa for each pair of settings', async () => {
    const cluster = new Cluster({ log });
    await cluster.configureKeystoreWithSecureSettingsFiles('foo', [
      ['name1', 'file1'],
      ['name2', 'file2'],
    ]);
    expect(execaMock.mock.calls.length).toBe(2);
    expect(execaMock.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        "./bin/elasticsearch-keystore",
        Array [
          "add-file",
          "name1",
          "file1",
        ],
        Object {
          "cwd": "foo",
          "env": Object {
            "JAVA_HOME": "",
          },
        },
      ]
    `);

    expect(execaMock.mock.calls[1]).toMatchInlineSnapshot(`
      Array [
        "./bin/elasticsearch-keystore",
        Array [
          "add-file",
          "name2",
          "file2",
        ],
        Object {
          "cwd": "foo",
          "env": Object {
            "JAVA_HOME": "",
          },
        },
      ]
    `);
  });
});

describe('#stop()', () => {
  test('rejects if #run() or #start() was not called', async () => {
    const cluster = new Cluster({ log });
    await expect(cluster.stop()).rejects.toThrowError('ES has not been started');
  });

  test('resolves when ES exits with 0', async () => {
    mockEsBin({ exitCode: 0, start: true });

    const cluster = new Cluster({ log });
    await cluster.start(installPath, esClusterExecOptions);
    await cluster.stop();
  });

  test('resolves when ES exits with 143', async () => {
    mockEsBin({ exitCode: 143, start: true });

    const cluster = new Cluster({ log });
    await cluster.start(installPath, esClusterExecOptions);
    await cluster.stop();
  });

  test('resolves when ES exits with 130', async () => {
    mockEsBin({ exitCode: 130, start: true });

    const cluster = new Cluster({ log });
    await cluster.start(installPath, esClusterExecOptions);
    await cluster.stop();
  });

  test('rejects when ES exits with 1', async () => {
    mockEsBin({ exitCode: 1, start: true });

    const cluster = new Cluster({ log });
    await expect(cluster.run(installPath, esClusterExecOptions)).rejects.toThrowError(
      'ES exited with code 1'
    );
    await expect(cluster.stop()).rejects.toThrowError('ES exited with code 1');
  });
});

describe('#kill()', () => {
  test('rejects if #run() or #start() was not called', async () => {
    const cluster = new Cluster({ log });
    await expect(cluster.kill()).rejects.toThrowError('ES has not been started');
  });

  test('resolves when ES exits with 0', async () => {
    mockEsBin({ exitCode: 0, start: true });

    const cluster = new Cluster({ log });
    await cluster.start(installPath, esClusterExecOptions);
    await cluster.kill();
  });
});

describe('#runServerless()', () => {
  const defaultOptions = {
    projectType: 'es' as dockerUtils.ServerlessProjectType,
    basePath: installPath,
  };
  test(`rejects if #start() was called before`, async () => {
    mockEsBin({ start: true });

    const cluster = new Cluster({ log });
    await cluster.start(installPath, esClusterExecOptions);
    await expect(cluster.runServerless(defaultOptions)).rejects.toThrowError(
      'ES stateful cluster has already been started'
    );
  });

  test(`rejects if #run() was called before`, async () => {
    mockEsBin({ start: true });

    const cluster = new Cluster({ log });
    await cluster.run(installPath, esClusterExecOptions);
    await expect(cluster.runServerless(defaultOptions)).rejects.toThrowError(
      'ES stateful cluster has already been started'
    );
  });

  test('awaits runServerlessCluster() promise and returns node names as string[]', async () => {
    const nodeNames = ['es1', 'es2', 'es3'];
    let resolveRunServerlessCluster: Function;
    runServerlessClusterMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRunServerlessCluster = () => {
            resolve(nodeNames);
          };
        })
    );

    const cluster = new Cluster({ log });
    const promise = cluster.runServerless(defaultOptions);
    await ensureNoResolve(promise);
    resolveRunServerlessCluster!();
    await expect(ensureResolve(promise, 'runServerless()')).resolves.toEqual(nodeNames);
  });

  test('rejects if #runServerless() was called before', async () => {
    const nodeNames = ['es1', 'es2', 'es3'];
    runServerlessClusterMock.mockResolvedValueOnce(nodeNames);

    const cluster = new Cluster({ log });
    await cluster.runServerless(defaultOptions);
    await expect(cluster.runServerless(defaultOptions)).rejects.toThrowError(
      'ES serverless docker cluster has already been started'
    );
  });

  test('rejects if #runServerlessCluster() rejects', async () => {
    runServerlessClusterMock.mockRejectedValueOnce(new Error('foo'));
    const cluster = new Cluster({ log });
    await expect(cluster.runServerless(defaultOptions)).rejects.toThrowError('foo');
  });

  test('passes through all options+log to #runServerlessCluster()', async () => {
    const nodeNames = ['es1', 'es2', 'es3'];
    runServerlessClusterMock.mockResolvedValueOnce(nodeNames);

    const cluster = new Cluster({ log });
    const serverlessOptions = {
      projectType: 'es' as dockerUtils.ServerlessProjectType,
      clean: true,
      basePath: installPath,
      teardown: true,
      background: true,
      waitForReady: true,
    };
    await cluster.runServerless(serverlessOptions);
    expect(runServerlessClusterMock.mock.calls[0][0]).toMatchInlineSnapshot(`<ToolingLog>`);
    expect(runServerlessClusterMock.mock.calls[0][1]).toBe(serverlessOptions);
  });
});

describe('#runDocker()', () => {
  const dockerOptions = {};
  test(`rejects if #start() was called before`, async () => {
    mockEsBin({ start: true });

    const cluster = new Cluster({ log });
    await cluster.start(installPath, esClusterExecOptions);
    await expect(cluster.runDocker(dockerOptions)).rejects.toThrowError(
      'ES stateful cluster has already been started'
    );
  });

  test('rejects if #run() was called before', async () => {
    mockEsBin({ start: true });
    const cluster = new Cluster({ log });
    await cluster.run(installPath, esClusterExecOptions);
    await expect(cluster.runDocker(dockerOptions)).rejects.toThrowError(
      'ES stateful cluster has already been started'
    );
  });

  test('await #runDockerContainer() promise', async () => {
    let resolveRunDockerContainer: Function;
    runDockerContainerMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRunDockerContainer = () => {
            resolve();
          };
        })
    );
    const cluster = new Cluster({ log });
    const promise = cluster.runDocker(dockerOptions);
    await ensureNoResolve(promise);
    resolveRunDockerContainer!();
    await expect(ensureResolve(promise, 'runDocker()')).resolves.toBeUndefined();
  });

  test('rejects if #runDockerContainer() rejects', async () => {
    runDockerContainerMock.mockRejectedValueOnce(new Error('foo'));
    const cluster = new Cluster({ log });
    await expect(cluster.runDocker(dockerOptions)).rejects.toThrowError('foo');
  });

  test('passes through all options+log to #runDockerContainer()', async () => {
    const options = { dockerCmd: 'start -a es01' };
    runDockerContainerMock.mockResolvedValueOnce();

    const cluster = new Cluster({ log });
    await cluster.runDocker(options);
    expect(runDockerContainerMock.mock.calls[0][0]).toMatchInlineSnapshot(`<ToolingLog>`);
    expect(runDockerContainerMock.mock.calls[0][1]).toBe(options);
  });
});
