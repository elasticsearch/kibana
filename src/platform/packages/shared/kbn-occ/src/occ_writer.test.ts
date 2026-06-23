/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { OccConflictError } from './errors';
import { OccWriter } from './occ_writer';
import type { OccDocument, OccMetadata } from './types';

interface TestDoc extends Record<string, unknown> {
  value: number;
}

const createWriter = (deps: {
  get?: jest.Mock;
  index: jest.Mock;
  maxRetries?: number;
  retryDelayMs?: number;
}) =>
  new OccWriter<TestDoc>({
    get: deps.get,
    index: deps.index,
    maxRetries: deps.maxRetries,
    retryDelayMs: deps.retryDelayMs ?? 0,
  });

describe('OccWriter', () => {
  describe('create', () => {
    it('creates a document without reading first', async () => {
      const index = jest.fn().mockResolvedValue({ seqNo: 1, primaryTerm: 1 } satisfies OccMetadata);
      const writer = createWriter({ index });

      const result = await writer.create({
        id: 'doc-1',
        document: { value: 1 },
      });

      expect(index).toHaveBeenCalledWith({
        id: 'doc-1',
        document: { value: 1 },
        create: true,
      });
      expect(result.document).toEqual({ value: 1 });
    });

    it('wraps op_type create 409 (id already exists) in OccConflictError', async () => {
      const conflict = Object.assign(new Error('conflict'), { statusCode: 409 });
      const index = jest.fn().mockRejectedValue(conflict);
      const writer = createWriter({ index });

      await expect(
        writer.create({
          id: 'doc-1',
          document: { value: 1 },
        })
      ).rejects.toMatchObject({
        name: 'OccConflictError',
        message: 'Document "doc-1" already exists; create was rejected',
      });

      expect(index).toHaveBeenCalledTimes(1);
    });
  });

  describe('write', () => {
    it('indexes with caller-supplied OCC metadata and does not read', async () => {
      const get = jest.fn();
      const index = jest.fn().mockResolvedValue({ seqNo: 5, primaryTerm: 2 } satisfies OccMetadata);
      const writer = createWriter({ get, index });

      const result = await writer.write({
        id: 'doc-1',
        document: { value: 2 },
        ifSeqNo: 4,
        ifPrimaryTerm: 2,
      });

      expect(get).not.toHaveBeenCalled();
      expect(index).toHaveBeenCalledWith({
        id: 'doc-1',
        document: { value: 2 },
        ifSeqNo: 4,
        ifPrimaryTerm: 2,
      });
      expect(result.occ).toEqual({ seqNo: 5, primaryTerm: 2 });
    });

    it('wraps version conflicts in OccConflictError without retrying', async () => {
      const get = jest.fn();
      const conflict = Object.assign(new Error('conflict'), { statusCode: 409 });
      const index = jest.fn().mockRejectedValue(conflict);
      const writer = createWriter({ get, index });

      await expect(
        writer.write({
          id: 'doc-1',
          document: { value: 2 },
          ifSeqNo: 4,
          ifPrimaryTerm: 2,
        })
      ).rejects.toBeInstanceOf(OccConflictError);

      expect(get).not.toHaveBeenCalled();
      expect(index).toHaveBeenCalledTimes(1);
    });
  });

  describe('readModifyWrite', () => {
    it('updates with if_seq_no and if_primary_term from get', async () => {
      const existing: OccDocument<TestDoc> = {
        id: 'doc-1',
        source: { value: 1 },
        occ: { seqNo: 4, primaryTerm: 2 },
      };
      const get = jest.fn().mockResolvedValue(existing);
      const index = jest.fn().mockResolvedValue({ seqNo: 5, primaryTerm: 2 } satisfies OccMetadata);
      const writer = createWriter({ get, index });

      const result = await writer.readModifyWrite({
        id: 'doc-1',
        mutate: (doc) => ({ value: doc.value + 1 }),
      });

      expect(index).toHaveBeenCalledWith({
        id: 'doc-1',
        document: { value: 2 },
        ifSeqNo: 4,
        ifPrimaryTerm: 2,
      });
      expect(result.occ).toEqual({ seqNo: 5, primaryTerm: 2 });
    });

    it('retries after a version conflict and re-reads the document', async () => {
      const firstExisting: OccDocument<TestDoc> = {
        id: 'doc-1',
        source: { value: 1 },
        occ: { seqNo: 1, primaryTerm: 1 },
      };
      const secondExisting: OccDocument<TestDoc> = {
        id: 'doc-1',
        source: { value: 5 },
        occ: { seqNo: 2, primaryTerm: 1 },
      };
      const get = jest
        .fn()
        .mockResolvedValueOnce(firstExisting)
        .mockResolvedValueOnce(secondExisting);
      const conflict = Object.assign(new Error('conflict'), { statusCode: 409 });
      const index = jest
        .fn()
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce({ seqNo: 3, primaryTerm: 1 } satisfies OccMetadata);
      const writer = createWriter({ get, index, maxRetries: 3 });

      const result = await writer.readModifyWrite({
        id: 'doc-1',
        mutate: (doc) => ({ value: doc.value + 1 }),
      });

      expect(get).toHaveBeenCalledTimes(2);
      expect(index).toHaveBeenCalledTimes(2);
      expect(result.document).toEqual({ value: 6 });
    });

    it('throws OccConflictError when retries are exhausted', async () => {
      const existing: OccDocument<TestDoc> = {
        id: 'doc-1',
        source: { value: 1 },
        occ: { seqNo: 1, primaryTerm: 1 },
      };
      const get = jest.fn().mockResolvedValue(existing);
      const conflict = Object.assign(new Error('conflict'), { statusCode: 409 });
      const index = jest.fn().mockRejectedValue(conflict);
      const writer = createWriter({ get, index, maxRetries: 1 });

      await expect(
        writer.readModifyWrite({
          id: 'doc-1',
          mutate: (doc) => ({ value: doc.value + 1 }),
        })
      ).rejects.toBeInstanceOf(OccConflictError);
      expect(get).toHaveBeenCalledTimes(2);
      expect(index).toHaveBeenCalledTimes(2);
    });

    it('throws when updating a missing document', async () => {
      const get = jest.fn().mockResolvedValue(null);
      const index = jest.fn();
      const writer = createWriter({ get, index });

      await expect(
        writer.readModifyWrite({
          id: 'missing',
          mutate: () => ({ value: 1 }),
        })
      ).rejects.toThrow('Document with id "missing" not found');
    });

    it('throws when get is not configured', async () => {
      const writer = createWriter({ index: jest.fn() });

      await expect(
        writer.readModifyWrite({
          id: 'doc-1',
          mutate: () => ({ value: 1 }),
        })
      ).rejects.toThrow('OccWriter.readModifyWrite requires a get dependency');
    });
  });
});
