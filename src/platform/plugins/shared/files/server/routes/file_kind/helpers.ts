/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IKibanaResponse } from '@kbn/core/server';
import { kibanaResponseFactory } from '@kbn/core/server';
import mimeTypes from 'mime-types';
import type { File, FileKind } from '../../../common';
import type { FileServiceStart } from '../../file_service';
import { errors } from '../../file_service';

type ResultOrHttpError =
  | { result: File; error?: undefined }
  | { result?: undefined; error: IKibanaResponse };

/**
 * A helper that given an ID will return a file or map errors to an http response.
 * Enforces that the resolved file belongs to the requested file kind so that
 * authorization on the URL kind cannot be bypassed by supplying a cross-kind ID.
 */
export async function getById(
  fileService: FileServiceStart,
  id: string,
  fileKind: string
): Promise<ResultOrHttpError> {
  let result: undefined | File;
  try {
    result = await fileService.getById({ id });
  } catch (e) {
    let error: undefined | IKibanaResponse;
    if (e instanceof errors.FileNotFoundError) {
      error = kibanaResponseFactory.notFound({ body: { message: e.message } });
    } else {
      error = kibanaResponseFactory.custom({ statusCode: 500, body: { message: e.message } });
    }
    return { error };
  }

  if (result.data.fileKind !== fileKind) {
    return {
      error: kibanaResponseFactory.notFound({ body: { message: 'File not found' } }),
    };
  }

  return { result };
}

/**
 * Validate file kind restrictions on a provided MIME type
 * @param mimeType The MIME type to validate
 * @param fileKind The file kind definition that may contain restrictions
 * @returns `undefined` if the MIME type is valid or there are no restrictions.
 */
export function validateMimeType(
  mimeType: string | undefined,
  fileKind: FileKind | undefined
): undefined | IKibanaResponse {
  if (!mimeType || !fileKind) {
    return;
  }

  const allowedMimeTypes = fileKind.allowedMimeTypes;
  if (!allowedMimeTypes || allowedMimeTypes.length === 0) {
    return;
  }

  if (!allowedMimeTypes.includes(mimeType)) {
    return kibanaResponseFactory.badRequest({
      body: {
        message: `File type is not supported`,
      },
    });
  }
}

/**
 * Validate file name extension matches the file's MIME type
 * @param fileName The file name to validate
 * @param file
 * @returns `undefined` if the extension matches the MIME type or if no MIME type is provided.
 */
export function validateFileNameExtension(
  fileName: string | undefined,
  file: File | undefined
): undefined | IKibanaResponse {
  if (!fileName || !file || !file.data.mimeType) {
    return;
  }

  const fileMimeType = file.data.mimeType.trim();
  if (!fileMimeType) {
    return;
  }

  // Extract file extension (handle cases with multiple dots)
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) {
    // No extension found - this might be intentional for some file types
    return;
  }

  const fileExtension = fileName.substring(lastDotIndex + 1).toLowerCase();
  if (!fileExtension) {
    return;
  }

  const expectedExtensions = mimeTypes.extensions[fileMimeType];
  if (expectedExtensions && !expectedExtensions.includes(fileExtension)) {
    return kibanaResponseFactory.badRequest({
      body: {
        message: `File extension does not match file type`,
      },
    });
  }
}
