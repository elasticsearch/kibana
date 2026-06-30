/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHash } from 'crypto';

/**
 * SHA-256 hex digest of the colon-joined parts.
 *
 * Mirrors the workflow engine's `| sha256` Liquid filter (registered in
 * `kbn-workflows/common/utils/create_workflow_liquid_engine`) so an adapter
 * computing a fingerprint in TS produces the byte-for-byte same value as
 * the YAML-only path the previous revision used. Keeping that invariant
 * lets us roll back to the YAML path without re-fingerprinting any
 * already-written documents.
 *
 * Each part is NFKC-normalized and stripped of leading/trailing
 * whitespace so trivial encoding differences (smart-quotes, BOMs, mixed
 * line endings) collapse to one fingerprint. RSS/Atom syndication
 * routinely re-encodes upstream advisories without changing the actual
 * content; without this normalization those would each get a new row.
 */
export const buildFingerprint = (parts: ReadonlyArray<string | undefined | null>): string => {
  const seed = parts.map((part) => (part ?? '').trim().normalize('NFKC')).join(':');
  return createHash('sha256').update(seed).digest('hex');
};
