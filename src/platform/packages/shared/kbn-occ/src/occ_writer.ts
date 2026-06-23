/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DEFAULT_MAX_RETRIES, DEFAULT_RETRY_DELAY_MS } from './constants';
import { delayMs } from './delay';
import { OccConflictError, isElasticsearchWriteConflict } from './errors';
import type {
  OccCreateParams,
  OccReadModifyWriteParams,
  OccWriteParams,
  OccWriteResult,
  OccWriterDeps,
} from './types';

export class OccWriter<TSource extends object> {
  private readonly get?: OccWriterDeps<TSource>['get'];
  private readonly index: OccWriterDeps<TSource>['index'];
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly logger?: OccWriterDeps<TSource>['logger'];

  constructor(deps: OccWriterDeps<TSource>) {
    this.get = deps.get;
    this.index = deps.index;
    this.maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = deps.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.logger = deps.logger;
  }

  /**
   * Create — `op_type: create`; no read, no retry. 409 means the id already exists.
   */
  async create(params: OccCreateParams<TSource>): Promise<OccWriteResult<TSource>> {
    const { id, document } = params;

    try {
      const occ = await this.index({ id, document, create: true });
      return { document, occ };
    } catch (error) {
      if (!isElasticsearchWriteConflict(error)) {
        throw error;
      }

      throw new OccConflictError(`Document "${id}" already exists; create was rejected`);
    }
  }

  /**
   * Optimistic write — conditional index with caller-supplied OCC metadata; no read, no retry.
   * 409 means version conflict.
   */
  async write(params: OccWriteParams<TSource>): Promise<OccWriteResult<TSource>> {
    const { id, document, ifSeqNo, ifPrimaryTerm } = params;

    try {
      const occ = await this.index({ id, document, ifSeqNo, ifPrimaryTerm });
      return { document, occ };
    } catch (error) {
      if (!isElasticsearchWriteConflict(error)) {
        throw error;
      }

      throw new OccConflictError(`Version conflict for document "${id}"`);
    }
  }

  /**
   * Read → mutate → index with OCC, re-reading on conflict up to `maxRetries`.
   */
  async readModifyWrite(
    params: OccReadModifyWriteParams<TSource>
  ): Promise<OccWriteResult<TSource>> {
    if (!this.get) {
      throw new Error('OccWriter.readModifyWrite requires a get dependency');
    }

    const { id, mutate } = params;
    const maxAttempts = 1 + this.maxRetries;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`Document with id "${id}" not found`);
      }

      const document = mutate(existing.source);

      try {
        const occ = await this.index({
          id,
          document,
          ifSeqNo: existing.occ.seqNo,
          ifPrimaryTerm: existing.occ.primaryTerm,
        });
        return { document, occ };
      } catch (error) {
        if (!isElasticsearchWriteConflict(error) || attempt >= maxAttempts) {
          if (isElasticsearchWriteConflict(error) && attempt >= maxAttempts) {
            throw new OccConflictError(
              `Version conflict for document "${id}" after ${attempt} attempts`
            );
          }
          throw error;
        }

        this.logger?.debug(
          `OCC readModifyWrite conflict for document "${id}", retrying (attempt ${attempt}/${maxAttempts})`
        );
        await delayMs(this.retryDelayMs);
      }
    }

    throw new OccConflictError(`Version conflict for document "${id}"`);
  }
}
