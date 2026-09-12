/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProductFeatureSecurityKey } from '@kbn/security-solution-features/keys';
import type { PolicyOperatingSystem } from '../../../../../../common/endpoint/types';

export type FieldRegistryKind =
  | 'protection'
  | 'event'
  | 'popup'
  | 'advanced'
  | 'logging'
  | 'meta'
  | 'other';

export type FieldRegistryTier = 1 | 2;

export type FieldRegistrySource = 'factory' | 'advanced_schema' | 'both';

export type FieldRegistryProductFeatureGate = ProductFeatureSecurityKey.endpointProtectionUpdates;

export interface FieldRegistryEntry {
  readonly path: string;
  readonly os: readonly PolicyOperatingSystem[];
  readonly kind: FieldRegistryKind;
  readonly tier: FieldRegistryTier;
  readonly defaultValue?: unknown;
  readonly license?: string;
  readonly minVersion?: string;
  readonly maxVersion?: string;
  readonly documentation?: string;
  readonly productFeatureGate?: FieldRegistryProductFeatureGate;
  readonly isDerived: boolean;
  readonly excludeFromComparison: boolean;
  readonly source: FieldRegistrySource;
  readonly userEditable: boolean;
}
