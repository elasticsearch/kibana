/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export interface OccMetadata {
  seqNo: number;
  primaryTerm: number;
}

export interface OccDocument<TSource> {
  id: string;
  source: TSource;
  occ: OccMetadata;
}

export interface OccWriterDeps<TSource extends object> {
  /**
   * Required for {@link OccWriter.readModifyWrite}. Must return seq_no + primary_term
   * (ES GET or search with seq_no_primary_term: true).
   */
  get?: (id: string) => Promise<OccDocument<TSource> | null>;
  index: (params: {
    id: string;
    document: TSource;
    create?: boolean;
    ifSeqNo?: number;
    ifPrimaryTerm?: number;
    refresh?: boolean;
  }) => Promise<OccMetadata>;
  maxRetries?: number;
  retryDelayMs?: number;
  logger?: {
    debug: (message: string) => void;
  };
}

export interface OccCreateParams<TSource extends object> {
  id: string;
  document: TSource;
}

export interface OccWriteParams<TSource extends object> {
  id: string;
  document: TSource;
  ifSeqNo: number;
  ifPrimaryTerm: number;
}

export interface OccReadModifyWriteParams<TSource extends object> {
  id: string;
  mutate: (existing: TSource) => TSource;
}

export interface OccWriteResult<TSource> {
  document: TSource;
  occ: OccMetadata;
}
