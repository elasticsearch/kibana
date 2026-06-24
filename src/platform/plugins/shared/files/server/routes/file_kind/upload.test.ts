/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Readable } from 'stream';
import { httpServerMock } from '@kbn/core/server/mocks';
import type { DeeplyMockedKeys } from '@kbn/utility-types-jest';
import { kibanaResponseFactory } from '@kbn/core-http-router-server-internal';

import type { FileServiceStart } from '../../file_service';

import { handler } from './upload';
import { createFileKindsRequestHandlerContextMock } from '../test_utils';
import type { FileKindsRequestHandlerContext } from './types';
import type { File } from '../../file';
import { AbortedUploadError } from '../../file/errors';

const createRequest = httpServerMock.createKibanaRequest;

describe('upload', () => {
  let ctx: FileKindsRequestHandlerContext;
  let fileService: DeeplyMockedKeys<FileServiceStart>;

  let uploadContent: jest.Mock<ReturnType<File['uploadContent']>>;
  let deleteFn: jest.Mock<ReturnType<File['delete']>>;

  const testErrorMessage = 'stop';
  const stopFn = async () => {
    throw new Error(testErrorMessage);
  };

  beforeEach(async () => {
    ({ ctx, fileService } = createFileKindsRequestHandlerContextMock());
    uploadContent = jest.fn();
    deleteFn = jest.fn(async () => {}); // We need it to be a promise, or it'll crash because of missing `.catch`
    fileService.getById.mockResolvedValueOnce({
      id: 'test',
      data: { size: 1, fileKind: 'test' },
      uploadContent,
      delete: deleteFn,
    } as unknown as File);
  });

  it('errors as expected', async () => {
    fileService.getById.mockReset();
    fileService.getById.mockImplementation(stopFn);
    const { status, payload } = await handler(
      ctx,
      createRequest({
        params: { id: 'test' },
        query: { selfDestructOnFailure: true },
        body: Readable.from(['test']),
      }),
      kibanaResponseFactory
    );
    expect(status).toBe(500);
    expect(payload).toEqual({ message: testErrorMessage });
    expect(deleteFn).not.toHaveBeenCalled();
  });

  describe('self-destruct on abort', () => {
    it('deletes a file on failure to upload', async () => {
      uploadContent.mockImplementationOnce(() => {
        throw new AbortedUploadError('Request aborted');
      });

      const { status, payload } = await handler(
        ctx,
        createRequest({
          params: { id: 'test' },
          query: { selfDestructOnAbort: true },
          body: Readable.from(['test']),
        }),
        kibanaResponseFactory
      );
      expect(status).toBe(499);
      expect(payload).toEqual({ message: 'Request aborted' });
      expect(deleteFn).toHaveBeenCalledTimes(1);
    });
  });
});
