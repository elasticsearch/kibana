/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Writable } from 'stream';

import type { TaskRunResult } from '@kbn/reporting-common/types';

import type { ReportingConfigType } from '../types';

import { REPORTING_REMOTE_EXECUTE_METADATA_SEPARATOR } from './constants';

function writeBufferToStream(stream: Writable, buf: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(buf, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export async function executeReportingRemoteExport(opts: {
  remoteExecution: NonNullable<ReportingConfigType['remoteExecution']>;
  jobId: string;
  jobtype: string;
  executionPayload: unknown;
  forwardHeaders: Record<string, string>;
  stream: Writable;
  signal?: AbortSignal;
}): Promise<TaskRunResult> {
  const { url, apiKey } = opts.remoteExecution;
  if (!url) {
    throw new Error(
      'xpack.reporting.remoteExecution.url is required when remote execution is enabled.'
    );
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(apiKey ? { authorization: `ApiKey ${apiKey}` } : {}),
  };

  const body = JSON.stringify({
    jobId: opts.jobId,
    jobtype: opts.jobtype,
    executionPayload: opts.executionPayload,
    forwardHeaders: opts.forwardHeaders,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: opts.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Reporting remote executor returned HTTP ${response.status}: ${text}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Reporting remote executor returned an empty response body');
  }

  const sepBuf = Buffer.from(REPORTING_REMOTE_EXECUTE_METADATA_SEPARATOR, 'utf8');
  let pending = Buffer.alloc(0);
  let metadata: TaskRunResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    const chunk = value?.length ? Buffer.from(value) : Buffer.alloc(0);

    if (!metadata) {
      pending = Buffer.concat([pending, chunk]);
      const sepIndex = pending.indexOf(sepBuf);
      if (sepIndex === -1) {
        if (done) {
          throw new Error(
            'Reporting remote executor ended the response before the metadata delimiter'
          );
        }
        continue;
      }

      const metaJson = pending.subarray(0, sepIndex).toString('utf8');
      try {
        metadata = JSON.parse(metaJson) as TaskRunResult;
      } catch (parseErr) {
        throw new Error(
          `Reporting remote executor returned invalid metadata JSON: ${metaJson}: ${parseErr}`
        );
      }

      const remainder = pending.subarray(sepIndex + sepBuf.length);
      pending = Buffer.alloc(0);
      if (remainder.length) {
        await writeBufferToStream(opts.stream, remainder);
      }
      if (done) {
        break;
      }
      continue;
    }

    if (chunk.length) {
      await writeBufferToStream(opts.stream, chunk);
    }
    if (done) {
      break;
    }
  }

  if (!metadata) {
    throw new Error('Reporting remote executor did not return metadata');
  }

  return metadata;
}
