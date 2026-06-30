/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Writable } from 'stream';

import type { TaskRunResult } from '@kbn/reporting-common/types';

import { REPORTING_REMOTE_EXECUTE_METADATA_SEPARATOR } from './constants';
import { executeReportingRemoteExport } from './execute_remote_export';

describe('executeReportingRemoteExport', () => {
  const remoteExecution = {
    enabled: true,
    url: 'http://executor.example/run',
    apiKey: 'test-api-key',
  };

  it('streams binary content after metadata delimiter', async () => {
    const metadata: TaskRunResult = {
      content_type: 'application/pdf',
      metrics: { pdf: { pages: 1 } },
    };
    const binaryPart = Buffer.from('%PDF-1.4 stub', 'utf8');
    const responseBody = Buffer.concat([
      Buffer.from(JSON.stringify(metadata), 'utf8'),
      Buffer.from(REPORTING_REMOTE_EXECUTE_METADATA_SEPARATOR, 'utf8'),
      binaryPart,
    ]);

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(responseBody);
          controller.close();
        },
      }),
    });
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

    const chunks: Buffer[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.from(chunk));
        cb();
      },
    });

    const result = await executeReportingRemoteExport({
      remoteExecution,
      jobId: 'job-1',
      jobtype: 'printable_pdf_v2',
      executionPayload: { hello: true },
      forwardHeaders: { cookie: 'sid=abc' },
      stream,
    });

    expect(result).toEqual(metadata);
    expect(Buffer.concat(chunks).equals(binaryPart)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      remoteExecution.url,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'ApiKey test-api-key',
          'content-type': 'application/json',
        }),
      })
    );
    const fetchOpts = fetchMock.mock.calls[0][1] as { body?: string };
    const callBody = JSON.parse(fetchOpts.body ?? '{}');
    expect(callBody.jobId).toBe('job-1');
    expect(callBody.forwardHeaders.cookie).toBe('sid=abc');
  });
});
