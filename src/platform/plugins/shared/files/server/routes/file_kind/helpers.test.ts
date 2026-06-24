/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IKibanaResponse } from '@kbn/core/server';
import type { File, FileJSON, FileKind } from '../../../common';
import { createFileServiceMock, createFileMock } from '../../mocks';
import { getById, validateFileNameExtension, validateMimeType } from './helpers';

describe('helpers', () => {
  describe('getById', () => {
    it('returns the file when its fileKind matches the requested kind', async () => {
      const fileService = createFileServiceMock();
      const file = createFileMock({ fileKind: 'myKind' });
      fileService.getById.mockResolvedValue(file);

      const result = await getById(fileService, 'abc', 'myKind');
      expect(result.error).toBeUndefined();
      expect(result.result).toBe(file);
    });

    it('returns 404 when the resolved file belongs to a different kind', async () => {
      const fileService = createFileServiceMock();
      const file = createFileMock({ fileKind: 'securitySolutionFilesCases' });
      fileService.getById.mockResolvedValue(file);

      const result = await getById(fileService, 'abc', 'defaultImage');
      expect(result.result).toBeUndefined();
      expect((result.error as IKibanaResponse).status).toBe(404);
    });

    it('returns 404 when the file does not exist', async () => {
      const { FileNotFoundError } = await import('../../file_service/errors');
      const fileService = createFileServiceMock();
      fileService.getById.mockRejectedValue(new FileNotFoundError('not found'));

      const result = await getById(fileService, 'missing', 'myKind');
      expect(result.result).toBeUndefined();
      expect((result.error as IKibanaResponse).status).toBe(404);
    });
  });

  describe('validateMimeType', () => {
    const createFileKind = (allowedMimeTypes?: string[]): FileKind => ({
      id: 'test-file-kind',
      allowedMimeTypes,
      http: {
        create: { requiredPrivileges: [] },
        download: { requiredPrivileges: [] },
      },
    });

    it('should return undefined when fileKind has empty allowedMimeTypes array', () => {
      const fileKind = createFileKind([]);
      const result = validateMimeType('image/png', fileKind);
      expect(result).toBeUndefined();
    });

    it('should return undefined when mimeType is in allowedMimeTypes', () => {
      const fileKind = createFileKind(['image/png', 'image/jpeg']);
      const result = validateMimeType('image/png', fileKind);
      expect(result).toBeUndefined();
    });

    it('should return bad request response when mimeType is not in allowedMimeTypes', () => {
      const fileKind = createFileKind(['image/png', 'image/jpeg']);
      const result = validateMimeType('application/pdf', fileKind);

      expect(result).toBeDefined();
      expect((result as IKibanaResponse).status).toBe(400);
      expect((result as IKibanaResponse).payload).toEqual({
        message: 'File type is not supported',
      });
    });

    it('should be case sensitive for mime type validation', () => {
      const fileKind = createFileKind(['image/png']);
      const result = validateMimeType('Image/PNG', fileKind);

      expect(result).toBeDefined();
      expect((result as IKibanaResponse).status).toBe(400);
    });
  });

  describe('validateFileNameExtension', () => {
    const createFile = (mimeType?: string) =>
      ({
        id: 'test-file',
        data: {
          id: 'test-file',
          name: 'test-file',
          mimeType,
          extension: 'txt',
          fileKind: 'test',
        } as FileJSON,
      } as File);

    it('should return undefined when fileName is undefined', () => {
      const file = createFile('image/png');
      const result = validateFileNameExtension(undefined, file);
      expect(result).toBeUndefined();
    });

    it('should return undefined when file is undefined', () => {
      const result = validateFileNameExtension('test.png', undefined);
      expect(result).toBeUndefined();
    });

    it('should return undefined when file has no mimeType', () => {
      const file = createFile();
      const result = validateFileNameExtension('test.png', file);
      expect(result).toBeUndefined();
    });

    it('should return undefined when fileName has no extension', () => {
      const file = createFile('text/plain');
      const result = validateFileNameExtension('README', file);
      expect(result).toBeUndefined();
    });

    it('should return undefined when extension matches expected extension', () => {
      const file = createFile('image/png');
      const result = validateFileNameExtension('image.png', file);
      expect(result).toBeUndefined();
    });

    it('should handle mime types with no known extensions', () => {
      const file = createFile('application/x-custom-type');
      const result = validateFileNameExtension('file.custom', file);

      // Should return undefined since there are no expected extensions for this mime type
      expect(result).toBeUndefined();
    });

    it('should handle file names with special characters', () => {
      const file = createFile('text/plain');

      expect(validateFileNameExtension('file-name_with.special@chars.txt', file)).toBeUndefined();
      expect(validateFileNameExtension('файл.txt', file)).toBeUndefined(); // Unicode filename
      expect(validateFileNameExtension('file with spaces.txt', file)).toBeUndefined();
    });

    it('should trim whitespace from mime type before validation', () => {
      const file = createFile('  text/plain  ');
      const result = validateFileNameExtension('test.txt', file);
      expect(result).toBeUndefined();
    });

    it('should be case insensitive for file extensions', () => {
      const file = createFile('image/png');

      expect(validateFileNameExtension('image.PNG', file)).toBeUndefined();
      expect(validateFileNameExtension('image.Png', file)).toBeUndefined();
      expect(validateFileNameExtension('image.pNG', file)).toBeUndefined();
    });

    it('should return bad request when extension does not match mime type', () => {
      const file = createFile('image/png');
      const result = validateFileNameExtension('document.pdf', file);

      expect(result).toBeDefined();
      expect((result as IKibanaResponse).status).toBe(400);
      expect((result as IKibanaResponse).payload).toEqual({
        message: 'File extension does not match file type',
      });
    });
  });
});
