/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FieldRegistryEntry } from '../domain/field_registry';
import {
  getFieldRegistryEntry,
  getOsLessRemainderEntries,
  getProtectionKeyPathEntries,
} from '../domain/field_registry';

export type FieldReferenceDocumentationAvailability = 'absent' | 'present';

export type FieldReferenceLongFormGuidance = 'not_retrieved_by_this_tool';

export interface PresentedFieldReferenceEntry {
  readonly documentationAvailability: FieldReferenceDocumentationAvailability;
  readonly entry: FieldRegistryEntry;
}

export interface ExactFieldReferenceResult {
  readonly found: true;
  readonly match: 'exact';
  readonly path: string;
  readonly documentationAvailability: FieldReferenceDocumentationAvailability;
  readonly longFormGuidance: FieldReferenceLongFormGuidance;
  readonly entry: FieldRegistryEntry;
}

export interface ProtectionKeyFieldReferenceResult {
  readonly found: true;
  readonly match: 'protection_key_path';
  readonly path: string;
  readonly longFormGuidance: FieldReferenceLongFormGuidance;
  readonly entries: readonly PresentedFieldReferenceEntry[];
}

export interface OsLessRemainderFieldReferenceResult {
  readonly found: true;
  readonly match: 'os_less_remainder';
  readonly path: string;
  readonly longFormGuidance: FieldReferenceLongFormGuidance;
  readonly entries: readonly PresentedFieldReferenceEntry[];
}

export interface UnknownFieldReferenceResult {
  readonly found: false;
  readonly match: 'none';
  readonly path: string;
  readonly reason: 'unknown_path';
}

export type FieldReferenceResult =
  | ExactFieldReferenceResult
  | ProtectionKeyFieldReferenceResult
  | OsLessRemainderFieldReferenceResult
  | UnknownFieldReferenceResult;

const documentationAvailabilityOf = (
  entry: FieldRegistryEntry
): FieldReferenceDocumentationAvailability =>
  entry.documentation !== undefined && entry.documentation.length > 0 ? 'present' : 'absent';

const presentFieldReferenceEntry = (entry: FieldRegistryEntry): PresentedFieldReferenceEntry => ({
  documentationAvailability: documentationAvailabilityOf(entry),
  entry,
});

export const lookupFieldReference = (path: string): FieldReferenceResult => {
  const exact = getFieldRegistryEntry(path);
  if (exact !== undefined) {
    return {
      found: true,
      match: 'exact',
      path,
      documentationAvailability: documentationAvailabilityOf(exact),
      longFormGuidance: 'not_retrieved_by_this_tool',
      entry: exact,
    };
  }

  const protectionEntries = getProtectionKeyPathEntries(path);
  if (protectionEntries.length > 0) {
    return {
      found: true,
      match: 'protection_key_path',
      path,
      longFormGuidance: 'not_retrieved_by_this_tool',
      entries: protectionEntries.map(presentFieldReferenceEntry),
    };
  }

  const remainderEntries = getOsLessRemainderEntries(path);
  if (remainderEntries.length > 0) {
    return {
      found: true,
      match: 'os_less_remainder',
      path,
      longFormGuidance: 'not_retrieved_by_this_tool',
      entries: remainderEntries.map(presentFieldReferenceEntry),
    };
  }

  return { found: false, match: 'none', path, reason: 'unknown_path' };
};
