/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import fs from 'fs';
import { promisify } from 'util';
import path from 'path';
import { createHash } from 'crypto';
import { pipeline, Transform } from 'stream';
import { setTimeout } from 'timers/promises';

import type { Headers } from 'node-fetch';
import fetch from 'node-fetch';
import chalk from 'chalk';
import type { ToolingLog } from '@kbn/tooling-log';

import { cache } from './utils/cache';
import { resolveCustomSnapshotUrl } from './custom_snapshots';
import { createCliError, isCliError } from './errors';
import { shouldPreferCachedSnapshot } from './utils/find_local_cached_snapshot';

const asyncPipeline = promisify(pipeline);
const DAILY_SNAPSHOTS_BASE_URL = 'https://storage.googleapis.com/kibana-ci-es-snapshots-daily';
const PERMANENT_SNAPSHOTS_BASE_URL =
  'https://storage.googleapis.com/kibana-ci-es-snapshots-permanent';

type ChecksumType = 'sha512';
export type ArtifactLicense = 'basic' | 'trial';

interface ArtifactManifest {
  id: string;
  bucket: string;
  branch: string;
  sha: string;
  sha_short: string;
  version: string;
  generated: string;
  archives: Array<{
    filename: string;
    checksum: string;
    url: string;
    version: string;
    platform: string;
    architecture: string;
    license: string;
  }>;
}

export interface ArtifactSpec {
  url: string;
  checksumUrl: string;
  checksumType: ChecksumType;
  filename: string;
}

interface ArtifactDownloaded {
  cached: false;
  checksum: string;
  etag?: string;
  contentLength: number;
  first500Bytes: Buffer;
  headers: Headers;
}
interface ArtifactCached {
  cached: true;
}

const CHECKSUM_MISMATCH_ERROR = 'ARTIFACT_CHECKSUM_MISMATCH';
const CHECKSUM_UNAVAILABLE_ERROR = 'ARTIFACT_CHECKSUM_UNAVAILABLE';

function getChecksumType(checksumUrl: string): ChecksumType {
  if (checksumUrl.endsWith('.sha512')) {
    return 'sha512';
  }

  throw new Error(`unable to determine checksum type: ${checksumUrl}`);
}

function headersToString(headers: Headers, indent = '') {
  return [...headers.entries()].reduce(
    (acc, [key, value]) => `${acc}\n${indent}${key}: ${value}`,
    ''
  );
}

function createTaggedError(message: string, code: string) {
  return Object.assign(new Error(message), { code });
}

function isTaggedError(error: unknown, code: string) {
  return error instanceof Error && 'code' in error && error.code === code;
}

async function retry<T>(log: ToolingLog, fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    attempt += 1;

    try {
      return await fn();
    } catch (error) {
      if (isCliError(error) || attempt >= 5) {
        throw error;
      }

      log.warning('...failure, retrying in 5 seconds:', error.message);
      await setTimeout(5000);
      log.info('...retrying');
    }
  }
}

// Setting this flag provides an easy way to run the latest un-promoted snapshot without having to look it up
function shouldUseUnverifiedSnapshot() {
  return !!process.env.KBN_ES_SNAPSHOT_USE_UNVERIFIED;
}

async function fetchSnapshotManifest(url: string, log: ToolingLog) {
  log.info('Downloading snapshot manifest from %s', chalk.bold(url));

  const abc = new AbortController();
  const resp = await retry(log, async () => await fetch(url, { signal: abc.signal }));
  const json = await resp.text();

  return { abc, resp, json };
}

async function getArtifactSpecForSnapshot(
  urlVersion: string,
  license: string,
  log: ToolingLog
): Promise<ArtifactSpec> {
  const desiredVersion = urlVersion.replace('-SNAPSHOT', '');
  const desiredLicense = 'default';

  const customManifestUrl = process.env.ES_SNAPSHOT_MANIFEST;
  const primaryManifestUrl = `${DAILY_SNAPSHOTS_BASE_URL}/${desiredVersion}/manifest-latest${
    shouldUseUnverifiedSnapshot() ? '' : '-verified'
  }.json`;
  const secondaryManifestUrl = `${PERMANENT_SNAPSHOTS_BASE_URL}/${desiredVersion}/manifest.json`;

  let { abc, resp, json } = await fetchSnapshotManifest(
    customManifestUrl || primaryManifestUrl,
    log
  );

  if (!customManifestUrl && !shouldUseUnverifiedSnapshot() && resp.status === 404) {
    log.info('Daily snapshot manifest not found, falling back to permanent manifest');
    ({ abc, resp, json } = await fetchSnapshotManifest(secondaryManifestUrl, log));
  }

  if (resp.status === 404) {
    abc.abort();
    throw createCliError(`Snapshots for ${desiredVersion} are not available`);
  }

  if (!resp.ok) {
    abc.abort();
    throw new Error(`Unable to read snapshot manifest: ${resp.statusText}\n  ${json}`);
  }

  const manifest: ArtifactManifest = JSON.parse(json);
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';

  const archive = manifest.archives.find(
    (a) => a.platform === platform && a.license === desiredLicense && a.architecture === arch
  );

  if (!archive) {
    throw createCliError(
      `Snapshots are available, but couldn't find an artifact in the manifest for [${desiredLicense}, ${platform}, ${arch}]`
    );
  }

  if (archive.version !== desiredVersion) {
    log.warning(
      `Snapshot found, but version does not match Kibana. Kibana: ${desiredVersion}, Snapshot: ${archive.version}`
    );
  }

  return {
    url: archive.url,
    checksumUrl: archive.url + '.sha512',
    checksumType: 'sha512',
    filename: archive.filename,
  };
}

export class Artifact {
  /**
   * Fetch an Artifact from the Artifact API for a license level and version
   */
  static async getSnapshot(license: ArtifactLicense, version: string, log: ToolingLog) {
    const urlVersion = `${encodeURIComponent(version)}-SNAPSHOT`;

    const customSnapshotArtifactSpec = resolveCustomSnapshotUrl(urlVersion, license);
    if (customSnapshotArtifactSpec) {
      return new Artifact(log, customSnapshotArtifactSpec);
    }

    const artifactSpec = await getArtifactSpecForSnapshot(urlVersion, license, log);
    return new Artifact(log, artifactSpec);
  }

  /**
   * Fetch an Artifact from the Elasticsearch past releases url
   */
  static async getArchive(url: string, log: ToolingLog) {
    const shaUrl = `${url}.sha512`;

    return new Artifact(log, {
      url,
      filename: path.basename(url),
      checksumUrl: shaUrl,
      checksumType: getChecksumType(shaUrl),
    });
  }

  constructor(private readonly log: ToolingLog, public readonly spec: ArtifactSpec) {}

  /**
   * Download the artifact to disk, skips the download if the cache is
   * up-to-date, verifies checksum when downloaded
   */
  async download(dest: string, { useCached = false }: { useCached?: boolean } = {}) {
    await retry(this.log, async () => {
      const cacheMeta = cache.readMeta(dest);
      const tmpPath = `${dest}.tmp`;

      if (shouldPreferCachedSnapshot(useCached)) {
        if (fs.existsSync(dest)) {
          this.log.info('using locally cached snapshot %s', chalk.bold(dest));
          return;
        }

        this.log.info('prefer-cached enabled but no cached snapshot found at %s', chalk.bold(dest));
      }

      const artifactResp = await this.fetchArtifact(tmpPath, cacheMeta.etag, cacheMeta.ts);
      if (artifactResp.cached) {
        // A 304 means the remote etag matches, but the file on disk may still be
        // corrupt, e.g. if an ES snapshot was promoted while a CI VM image was
        // being built, the cached file could have been overwritten mid-download.
        // Verify the checksum before trusting the cache.
        try {
          await this.verifyExistingFileChecksum(dest);
          return;
        } catch (error) {
          if (
            isTaggedError(error, CHECKSUM_MISMATCH_ERROR) ||
            (error as NodeJS.ErrnoException).code === 'ENOENT'
          ) {
            this.log.warning(
              'cached artifact is invalid, redownloading:',
              error instanceof Error ? error.message : error
            );
          } else if (isTaggedError(error, CHECKSUM_UNAVAILABLE_ERROR)) {
            this.log.warning(
              'unable to verify cached artifact checksum, reusing cached artifact:',
              error.message
            );
            return;
          } else {
            throw error;
          }
        }

        const redownloadedArtifact = await this.downloadAndVerify(tmpPath, cacheMeta.ts);

        // cache the etag for future downloads
        cache.writeMeta(dest, { etag: redownloadedArtifact.etag });

        // rename temp download to the destination location
        fs.renameSync(tmpPath, dest);
        return;
      }

      try {
        await this.verifyChecksum(artifactResp);
      } catch (error) {
        // clean up the temp file so a partial download doesn't linger
        this.safeUnlink(tmpPath);
        throw error;
      }

      // cache the etag for future downloads
      cache.writeMeta(dest, { etag: artifactResp.etag });

      // rename temp download to the destination location
      fs.renameSync(tmpPath, dest);
    });
  }

  /**
   * Download (bypassing etag cache) and verify checksum, cleaning up on failure
   */
  private async downloadAndVerify(tmpPath: string, ts: string): Promise<ArtifactDownloaded> {
    const artifactResp = await this.fetchArtifact(tmpPath, undefined, ts);
    if (artifactResp.cached) {
      throw new Error('expected cache bypass to download the artifact');
    }

    try {
      await this.verifyChecksum(artifactResp);
    } catch (error) {
      this.safeUnlink(tmpPath);
      throw error;
    }

    return artifactResp;
  }

  private safeUnlink(filePath: string) {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      // ignore if already gone
    }
  }

  /**
   * Fetch the artifact with an etag
   */
  private async fetchArtifact(
    tmpPath: string,
    etag: string | undefined,
    ts: string
  ): Promise<ArtifactDownloaded | ArtifactCached> {
    const url = this.spec.url;

    if (etag) {
      this.log.info('verifying cache of %s', chalk.bold(url));
    } else {
      this.log.info('downloading artifact from %s', chalk.bold(url));
    }

    const abc = new AbortController();
    const resp = await fetch(url, {
      signal: abc.signal,
      headers: etag ? { 'If-None-Match': etag } : {},
    });

    if (resp.status === 304) {
      this.log.info('etags match, reusing cache from %s', chalk.bold(ts));

      abc.abort();
      return {
        cached: true,
      };
    }

    if (!resp.ok) {
      abc.abort();
      throw new Error(
        `Unable to download elasticsearch snapshot: ${resp.statusText}${headersToString(
          resp.headers,
          '  '
        )}`
      );
    }

    if (etag) {
      this.log.info('cache invalid, redownloading');
    }

    const hash = createHash(this.spec.checksumType);
    let first500Bytes = Buffer.alloc(0);
    let contentLength = 0;

    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });

    await asyncPipeline(
      resp.body,
      new Transform({
        transform(chunk, encoding, cb) {
          contentLength += Buffer.byteLength(chunk);

          if (first500Bytes.length < 500) {
            first500Bytes = Buffer.concat(
              [first500Bytes, chunk],
              first500Bytes.length + chunk.length
            ).slice(0, 500);
          }

          hash.update(chunk, encoding);
          cb(null, chunk);
        },
      }),
      fs.createWriteStream(tmpPath)
    );

    // Detect truncated downloads that closed cleanly (e.g. the server reset
    // the connection after sending partial data). The checksum would also catch
    // this, but failing here gives a clearer error message.
    const expectedContentLength = resp.headers.get('content-length');
    const contentEncoding = resp.headers.get('content-encoding');
    if (
      !contentEncoding &&
      expectedContentLength &&
      contentLength !== parseInt(expectedContentLength, 10)
    ) {
      this.safeUnlink(tmpPath);
      throw new Error(
        `download from ${url} was truncated, received ${contentLength} of ${expectedContentLength} bytes`
      );
    }

    return {
      cached: false,
      checksum: hash.digest('hex'),
      etag: resp.headers.get('etag') ?? undefined,
      contentLength,
      first500Bytes,
      headers: resp.headers,
    };
  }

  /**
   * Verify the checksum of the downloaded artifact with the checksum at checksumUrl
   */
  private async verifyChecksum(artifactResp: ArtifactDownloaded) {
    const expectedChecksum = await this.fetchExpectedChecksum();

    if (artifactResp.checksum !== expectedChecksum) {
      const len = Buffer.byteLength(artifactResp.first500Bytes);
      const lenString = `${len} / ${artifactResp.contentLength}`;

      // Not a CliError so that retry() will re-attempt the download.
      // The checksum mismatch may be transient if the artifact was being
      // replaced on the server mid-download.
      throw createTaggedError(
        `artifact downloaded from ${this.spec.url} does not match expected checksum\n` +
          `  expected: ${expectedChecksum}\n` +
          `  received: ${artifactResp.checksum}\n` +
          `  headers: ${headersToString(artifactResp.headers, '    ')}\n` +
          `  content[${lenString} base64]: ${artifactResp.first500Bytes.toString('base64')}`,
        CHECKSUM_MISMATCH_ERROR
      );
    }

    this.log.info('checksum verified');
  }

  private async fetchExpectedChecksum() {
    this.log.info('downloading artifact checksum from %s', chalk.bold(this.spec.checksumUrl));

    const abc = new AbortController();
    const resp = await fetch(this.spec.checksumUrl, {
      signal: abc.signal,
    });

    if (!resp.ok) {
      abc.abort();
      throw createTaggedError(
        `Unable to download elasticsearch checksum: ${resp.statusText}${headersToString(
          resp.headers,
          '  '
        )}`,
        CHECKSUM_UNAVAILABLE_ERROR
      );
    }

    // in format of stdout from `shasum` cmd, which is `<checksum>   <filename>`
    const [expectedChecksum] = (await resp.text()).split(' ');
    return expectedChecksum;
  }

  private async verifyExistingFileChecksum(dest: string) {
    const hash = createHash(this.spec.checksumType);
    for await (const chunk of fs.createReadStream(dest)) {
      hash.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const expectedChecksum = await this.fetchExpectedChecksum();
    const actualChecksum = hash.digest('hex');
    if (actualChecksum !== expectedChecksum) {
      throw createTaggedError(
        `cached artifact at ${dest} checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}`,
        CHECKSUM_MISMATCH_ERROR
      );
    }

    this.log.info('checksum verified');
  }
}
