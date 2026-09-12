/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ProductFeatureSecurityKey } from '@kbn/security-solution-features/keys';
import { getFlattenedObject } from '@kbn/std';
import { policyFactory } from '../../../../../../common/endpoint/models/policy_config';
import { getPolicyProtectionsReference } from '../../../../../../common/endpoint/models/policy_config_helpers';
import {
  AdvancedPolicySchema,
  type AdvancedPolicySchemaType,
} from '../../../../../../common/endpoint/service/policy/advanced_policy_schema';
import { PolicyOperatingSystem } from '../../../../../../common/endpoint/types';
import { isDerivedPath, isExcludedPath } from './path_rules';
import type { FieldRegistryEntry, FieldRegistryKind, FieldRegistryTier } from './types';
import { UI_POLICY_SECTIONS } from './ui_policy_sections';

const POLICY_OPERATING_SYSTEMS = new Set<string>(Object.values(PolicyOperatingSystem));
const GLOBAL_MANIFEST_VERSION = 'global_manifest_version';

const isPolicyOperatingSystem = (value: string): value is PolicyOperatingSystem =>
  POLICY_OPERATING_SYSTEMS.has(value);

const isUiPolicySection = (
  os: PolicyOperatingSystem,
  section: string
): section is keyof (typeof UI_POLICY_SECTIONS)[typeof os] =>
  Object.prototype.hasOwnProperty.call(UI_POLICY_SECTIONS[os], section);

const osForPath = (path: string): readonly PolicyOperatingSystem[] => {
  const [first] = path.split('.');
  if (first !== undefined && isPolicyOperatingSystem(first)) {
    return [first];
  }
  return [];
};

const classifyKind = (path: string): FieldRegistryKind => {
  if (path.includes('.advanced.')) {
    return 'advanced';
  }
  if (path.includes('.popup.')) {
    return 'popup';
  }
  if (path.includes('.events.')) {
    return 'event';
  }
  if (path.includes('.logging.')) {
    return 'logging';
  }
  if (path === 'meta' || path.startsWith('meta.')) {
    return 'meta';
  }
  return 'other';
};

const deriveTier = (path: string, fromFactory: boolean): FieldRegistryTier => {
  if (fromFactory && !path.includes('.advanced.')) {
    return 1;
  }
  return 2;
};

const computeUserEditable = (path: string): boolean => {
  if (path === GLOBAL_MANIFEST_VERSION) {
    return true;
  }

  const [osSegment, section] = path.split('.');
  if (osSegment === undefined || section === undefined || !isPolicyOperatingSystem(osSegment)) {
    return false;
  }
  if (!isUiPolicySection(osSegment, section)) {
    return false;
  }
  if (path.endsWith('.supported')) {
    return false;
  }
  return !isDerivedPath(path);
};

const schemaAttributes = (
  row: AdvancedPolicySchemaType
): Pick<FieldRegistryEntry, 'documentation' | 'minVersion' | 'maxVersion' | 'license'> => ({
  documentation: row.documentation,
  minVersion: row.first_supported_version,
  ...(row.last_supported_version !== undefined ? { maxVersion: row.last_supported_version } : {}),
  license: row.license,
});

const createFactoryEntry = (path: string, defaultValue: unknown): FieldRegistryEntry => ({
  path,
  os: osForPath(path),
  kind: classifyKind(path),
  tier: deriveTier(path, true),
  defaultValue,
  ...(path === GLOBAL_MANIFEST_VERSION
    ? { productFeatureGate: ProductFeatureSecurityKey.endpointProtectionUpdates }
    : {}),
  isDerived: isDerivedPath(path),
  excludeFromComparison: isExcludedPath(path),
  source: 'factory',
  userEditable: computeUserEditable(path),
});

const createSchemaOnlyEntry = (row: AdvancedPolicySchemaType): FieldRegistryEntry => ({
  path: row.key,
  os: osForPath(row.key),
  kind: classifyKind(row.key),
  tier: deriveTier(row.key, false),
  ...schemaAttributes(row),
  isDerived: isDerivedPath(row.key),
  excludeFromComparison: isExcludedPath(row.key),
  source: 'advanced_schema',
  userEditable: computeUserEditable(row.key),
});

const mergeSchemaOntoFactory = (
  existing: FieldRegistryEntry,
  row: AdvancedPolicySchemaType
): FieldRegistryEntry => ({
  ...existing,
  ...schemaAttributes(row),
  source: 'both',
});

const deriveFieldRegistry = (): readonly FieldRegistryEntry[] => {
  const factoryLeaves = getFlattenedObject(policyFactory());
  const entriesByPath = new Map<string, FieldRegistryEntry>();

  for (const [path, defaultValue] of Object.entries(factoryLeaves)) {
    entriesByPath.set(path, createFactoryEntry(path, defaultValue));
  }

  for (const row of AdvancedPolicySchema) {
    const existing = entriesByPath.get(row.key);
    if (existing === undefined) {
      entriesByPath.set(row.key, createSchemaOnlyEntry(row));
    } else if (existing.source !== 'factory') {
      throw new Error(`Duplicate AdvancedPolicySchema key: ${row.key}`);
    } else {
      entriesByPath.set(row.key, mergeSchemaOntoFactory(existing, row));
    }
  }

  for (const { keyPath, osList } of getPolicyProtectionsReference()) {
    for (const os of osList) {
      const path = `${os}.${keyPath}`;
      const existing = entriesByPath.get(path);
      if (existing === undefined) {
        throw new Error(`Protection expansion does not exist: ${path}`);
      }
      entriesByPath.set(path, { ...existing, kind: 'protection' });
    }
  }

  return [...entriesByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
};

const FIELD_REGISTRY = deriveFieldRegistry();
const ENTRIES_BY_PATH = new Map(FIELD_REGISTRY.map((entry) => [entry.path, entry]));
const PROTECTION_KEY_PATH_ENTRIES = new Map<string, readonly FieldRegistryEntry[]>(
  getPolicyProtectionsReference().map(({ keyPath, osList }) => [
    keyPath,
    osList.map((os) => {
      const entry = ENTRIES_BY_PATH.get(`${os}.${keyPath}`);
      if (entry === undefined) {
        throw new Error(`Protection expansion does not exist: ${os}.${keyPath}`);
      }
      return entry;
    }),
  ])
);

const osLessRemainderOf = (path: string): string | undefined => {
  const [first, ...rest] = path.split('.');
  if (first === undefined || rest.length === 0 || !isPolicyOperatingSystem(first)) {
    return undefined;
  }
  return rest.join('.');
};

const OS_LESS_REMAINDER_ENTRIES = new Map<string, FieldRegistryEntry[]>();
for (const entry of FIELD_REGISTRY) {
  const remainder = osLessRemainderOf(entry.path);
  if (remainder !== undefined) {
    const grouped = OS_LESS_REMAINDER_ENTRIES.get(remainder);
    if (grouped === undefined) {
      OS_LESS_REMAINDER_ENTRIES.set(remainder, [entry]);
    } else {
      grouped.push(entry);
    }
  }
}

export const getFieldRegistry = (): readonly FieldRegistryEntry[] => FIELD_REGISTRY;

export const getFieldRegistryEntry = (path: string): FieldRegistryEntry | undefined =>
  ENTRIES_BY_PATH.get(path);

export const getProtectionKeyPathEntries = (keyPath: string): readonly FieldRegistryEntry[] =>
  PROTECTION_KEY_PATH_ENTRIES.get(keyPath) ?? [];

export const getOsLessRemainderEntries = (remainder: string): readonly FieldRegistryEntry[] =>
  OS_LESS_REMAINDER_ENTRIES.get(remainder) ?? [];

export const isWritablePath = (entry: FieldRegistryEntry): boolean =>
  entry.tier === 1 && entry.userEditable && !entry.isDerived && !entry.excludeFromComparison;
