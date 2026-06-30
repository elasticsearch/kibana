/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';

import { ToolingLog } from '@kbn/tooling-log';
jest.mock('timers/promises', () => ({
  setTimeout: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('node-fetch');
import fetch from 'node-fetch';
const { Headers, Response } = jest.requireActual('node-fetch');

import { Artifact } from './artifact';

const log = new ToolingLog();
let MOCKS;

const PLATFORM = process.platform === 'win32' ? 'windows' : process.platform;
const ARCHITECTURE = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
const MOCK_VERSION = 'test-version';
const MOCK_URL = 'http://127.0.0.1:12345';
const MOCK_FILENAME = 'test-filename';

const DAILY_SNAPSHOT_BASE_URL = 'https://storage.googleapis.com/kibana-ci-es-snapshots-daily';
const PERMANENT_SNAPSHOT_BASE_URL =
  'https://storage.googleapis.com/kibana-ci-es-snapshots-permanent';
const TEMP_DIRS = [];

const createArchive = (params = {}) => {
  const license = params.license || 'default';
  const architecture = params.architecture || ARCHITECTURE;

  return {
    license: 'default',
    architecture,
    version: MOCK_VERSION,
    url: MOCK_URL + `/${license}`,
    platform: PLATFORM,
    filename: MOCK_FILENAME + `-${architecture}.${license}`,
    ...params,
  };
};

const mockFetch = (mock) =>
  fetch.mockReturnValue(Promise.resolve(new Response(JSON.stringify(mock))));

const getChecksum = (contents) => crypto.createHash('sha512').update(contents).digest('hex');

const createArtifactResponse = ({ contents, headers = {}, status = 200 }) => ({
  status,
  ok: status >= 200 && status < 300,
  body: Readable.from([contents]),
  headers: new Headers(headers),
});

const createArtifactDest = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-test-'));
  TEMP_DIRS.push(dir);

  return path.join(dir, MOCK_FILENAME);
};

const createCachedArtifact = ({ contents, etag = 'etag' }) => {
  const dest = createArtifactDest();
  fs.writeFileSync(dest, contents);
  fs.writeFileSync(
    `${dest}.meta`,
    JSON.stringify(
      {
        ts: new Date().toISOString(),
        etag,
      },
      null,
      2
    )
  );

  return dest;
};

const previousEnvVars = {};
const ENV_VARS_TO_RESET = [
  'ES_SNAPSHOT_MANIFEST',
  'KBN_ES_SNAPSHOT_USE_UNVERIFIED',
  'KBN_ES_SNAPSHOT_USE_CACHED',
];

beforeAll(() => {
  ENV_VARS_TO_RESET.forEach((key) => {
    if (key in process.env) {
      previousEnvVars[key] = process.env[key];
      delete process.env[key];
    }
  });
});

afterAll(() => {
  Object.keys(previousEnvVars).forEach((key) => {
    process.env[key] = previousEnvVars[key];
  });
});

beforeEach(() => {
  jest.resetAllMocks();

  MOCKS = {
    valid: {
      archives: [createArchive({ license: 'default' })],
    },
    invalidArch: {
      archives: [createArchive({ license: 'default', architecture: 'invalid_arch' })],
    },
    differentVersion: {
      archives: [createArchive({ license: 'default', version: 'another-version' })],
    },
    multipleArch: {
      archives: [
        createArchive({ architecture: 'fake_arch', license: 'default' }),
        createArchive({ architecture: ARCHITECTURE, license: 'default' }),
      ],
    },
  };
});

afterEach(() => {
  TEMP_DIRS.splice(0).forEach((dir) => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

const artifactTest = (requestedLicense, expectedLicense, fetchTimesCalled = 1) => {
  return async () => {
    const artifact = await Artifact.getSnapshot(requestedLicense, MOCK_VERSION, log);
    expect(fetch).toHaveBeenCalledTimes(fetchTimesCalled);
    expect(fetch.mock.calls[0][0]).toEqual(
      `${DAILY_SNAPSHOT_BASE_URL}/${MOCK_VERSION}/manifest-latest-verified.json`
    );
    if (fetchTimesCalled === 2) {
      expect(fetch.mock.calls[1][0]).toEqual(
        `${PERMANENT_SNAPSHOT_BASE_URL}/${MOCK_VERSION}/manifest.json`
      );
    }
    expect(artifact.spec.url).toEqual(MOCK_URL + `/${expectedLicense}`);
    expect(artifact.spec.checksumUrl).toEqual(MOCK_URL + `/${expectedLicense}.sha512`);
    expect(artifact.spec.checksumType).toEqual('sha512');
    expect(artifact.spec.filename).toEqual(MOCK_FILENAME + `-${ARCHITECTURE}.${expectedLicense}`);
  };
};

describe('Artifact', () => {
  describe('download()', () => {
    it('redownloads a corrupt cached artifact after a 304 response', async () => {
      const artifact = new Artifact(log, {
        url: MOCK_URL,
        filename: MOCK_FILENAME,
        checksumUrl: `${MOCK_URL}.sha512`,
        checksumType: 'sha512',
      });
      const validContents = Buffer.from('valid artifact');
      const dest = createCachedArtifact({
        contents: Buffer.from('corrupt artifact'),
      });

      fetch
        .mockReturnValueOnce(Promise.resolve(new Response('', { status: 304 })))
        .mockReturnValueOnce(
          Promise.resolve(new Response(`${getChecksum(validContents)}  ${MOCK_FILENAME}`))
        )
        .mockReturnValueOnce(
          Promise.resolve(
            createArtifactResponse({
              contents: validContents,
              headers: { etag: 'fresh-etag' },
            })
          )
        )
        .mockReturnValueOnce(
          Promise.resolve(new Response(`${getChecksum(validContents)}  ${MOCK_FILENAME}`))
        );

      await artifact.download(dest);

      expect(fs.readFileSync(dest)).toEqual(validContents);
      expect(JSON.parse(fs.readFileSync(`${dest}.meta`, 'utf8')).etag).toBe('fresh-etag');
      expect(fetch).toHaveBeenCalledTimes(4);
    });

    it('reuses a cached artifact when the checksum endpoint is unavailable', async () => {
      const artifact = new Artifact(log, {
        url: MOCK_URL,
        filename: MOCK_FILENAME,
        checksumUrl: `${MOCK_URL}.sha512`,
        checksumType: 'sha512',
      });
      const cachedContents = Buffer.from('cached artifact');
      const dest = createCachedArtifact({
        contents: cachedContents,
      });

      fetch
        .mockReturnValueOnce(Promise.resolve(new Response('', { status: 304 })))
        .mockReturnValueOnce(
          Promise.resolve(new Response('', { status: 503, statusText: 'Service Unavailable' }))
        );

      await artifact.download(dest);

      expect(fs.readFileSync(dest)).toEqual(cachedContents);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('reuses a cached artifact without a meta file when prefer-cached is enabled', async () => {
      process.env.KBN_ES_SNAPSHOT_USE_CACHED = 'true';

      const artifact = new Artifact(log, {
        url: MOCK_URL,
        filename: MOCK_FILENAME,
        checksumUrl: `${MOCK_URL}.sha512`,
        checksumType: 'sha512',
      });
      const cachedContents = Buffer.from('cached artifact without meta');
      const dest = createArtifactDest();
      fs.writeFileSync(dest, cachedContents);

      await artifact.download(dest);

      expect(fs.readFileSync(dest)).toEqual(cachedContents);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('skips the truncation guard for content-encoded responses', async () => {
      const artifact = new Artifact(log, {
        url: MOCK_URL,
        filename: MOCK_FILENAME,
        checksumUrl: `${MOCK_URL}.sha512`,
        checksumType: 'sha512',
      });
      const validContents = Buffer.from('valid artifact');
      const dest = createArtifactDest();

      fetch
        .mockReturnValueOnce(
          Promise.resolve(
            createArtifactResponse({
              contents: validContents,
              headers: {
                etag: 'fresh-etag',
                'content-encoding': 'gzip',
                'content-length': '1',
              },
            })
          )
        )
        .mockReturnValueOnce(
          Promise.resolve(new Response(`${getChecksum(validContents)}  ${MOCK_FILENAME}`))
        );

      await artifact.download(dest);

      expect(fs.readFileSync(dest)).toEqual(validContents);
      expect(JSON.parse(fs.readFileSync(`${dest}.meta`, 'utf8')).etag).toBe('fresh-etag');
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getSnapshot()', () => {
    describe('with default snapshot', () => {
      beforeEach(() => {
        mockFetch(MOCKS.valid);
      });

      it(
        'should return artifact metadata for a daily default artifact',
        artifactTest('default', 'default')
      );

      it(
        'should default to default license with anything other than "oss"',
        artifactTest('INVALID_LICENSE', 'default')
      );

      it('should return an artifact even if the version does not match', async () => {
        mockFetch(MOCKS.differentVersion);
        artifactTest('default', 'default');
      });

      it('should throw when an artifact cannot be found in the manifest for the specified parameters', async () => {
        mockFetch(MOCKS.invalidArch);
        await expect(Artifact.getSnapshot('default', MOCK_VERSION, log)).rejects.toThrow(
          "couldn't find an artifact"
        );
      });
    });

    describe('with missing default snapshot', () => {
      beforeEach(() => {
        fetch.mockReturnValueOnce(Promise.resolve(new Response('', { status: 404 })));
        mockFetch(MOCKS.valid);
      });

      it(
        'should return artifact metadata for a permanent default artifact',
        artifactTest('default', 'default', 2)
      );

      it(
        'should default to default license with anything other than "oss"',
        artifactTest('INVALID_LICENSE', 'default', 2)
      );

      it('should return an artifact even if the version does not match', async () => {
        mockFetch(MOCKS.differentVersion);
        artifactTest('default', 'default', 2);
      });

      it('should throw when an artifact cannot be found in the manifest for the specified parameters', async () => {
        mockFetch(MOCKS.invalidArch);
        await expect(Artifact.getSnapshot('default', MOCK_VERSION, log)).rejects.toThrow(
          "couldn't find an artifact"
        );
      });
    });

    describe('with snapshots for multiple architectures', () => {
      beforeEach(() => {
        mockFetch(MOCKS.multipleArch);
      });

      it('should return artifact metadata for the correct architecture', async () => {
        const artifact = await Artifact.getSnapshot('default', MOCK_VERSION, log);
        expect(artifact.spec.filename).toEqual(MOCK_FILENAME + `-${ARCHITECTURE}.default`);
      });
    });

    describe('with custom snapshot manifest URL', () => {
      const CUSTOM_URL = 'http://www.creedthoughts.gov.www/creedthoughts';

      beforeEach(() => {
        process.env.ES_SNAPSHOT_MANIFEST = CUSTOM_URL;
        mockFetch(MOCKS.valid);
      });

      it('should use the custom URL when looking for a snapshot', async () => {
        await Artifact.getSnapshot('default', MOCK_VERSION, log);
        expect(fetch.mock.calls[0][0]).toEqual(CUSTOM_URL);
      });

      afterEach(() => {
        delete process.env.ES_SNAPSHOT_MANIFEST;
      });
    });

    describe('with latest unverified snapshot', () => {
      beforeEach(() => {
        process.env.KBN_ES_SNAPSHOT_USE_UNVERIFIED = '1';
        mockFetch(MOCKS.valid);
      });

      it('should use the daily unverified URL when looking for a snapshot', async () => {
        await Artifact.getSnapshot('default', MOCK_VERSION, log);
        expect(fetch.mock.calls[0][0]).toEqual(
          `${DAILY_SNAPSHOT_BASE_URL}/${MOCK_VERSION}/manifest-latest.json`
        );
      });

      afterEach(() => {
        delete process.env.KBN_ES_SNAPSHOT_USE_UNVERIFIED;
      });
    });
  });
});
