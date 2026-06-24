/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ConditionEntryField,
  OperatingSystem,
  TrustedAppEntryTypes,
} from '@kbn/securitysolution-utils';
import type { ConditionEntry } from './exception_list_items';
export interface GetTrustedAppsListResponse {
  per_page: number;
  page: number;
  total: number;
  data: TrustedApp[];
}

export enum OperatorFieldIds {
  is = 'is',
  matches = 'matches',
}

export interface TrustedAppConditionEntry<T extends ConditionEntryField = ConditionEntryField>
  extends ConditionEntry {
  field: T;
  type: TrustedAppEntryTypes;
  operator: 'included';
  value: string;
}

export type LinuxConditionEntry = TrustedAppConditionEntry<
  ConditionEntryField.HASH | ConditionEntryField.PATH
>;
export type WindowsConditionEntry = TrustedAppConditionEntry<
  ConditionEntryField.HASH | ConditionEntryField.PATH | ConditionEntryField.SIGNER
>;

export type MacosConditionEntry = TrustedAppConditionEntry<
  ConditionEntryField.HASH | ConditionEntryField.PATH | ConditionEntryField.SIGNER_MAC
>;

interface LinuxConditionEntries {
  os: OperatingSystem.LINUX;
  entries: LinuxConditionEntry[];
}

interface WindowsConditionEntries {
  os: OperatingSystem.WINDOWS;
  entries: WindowsConditionEntry[];
}

interface MacosConditionEntries {
  os: OperatingSystem.MAC;
  entries: MacosConditionEntry[];
}

export interface GlobalEffectScope {
  type: 'global';
}

export interface PolicyEffectScope {
  type: 'policy';
  /** An array of Endpoint Integration Policy UUIDs */
  policies: string[];
}

export type EffectScope = GlobalEffectScope | PolicyEffectScope;

/** Type for a new Trusted App Entry */
export type NewTrustedApp = {
  name: string;
  description?: string;
  effectScope: EffectScope;
} & (LinuxConditionEntries | WindowsConditionEntries | MacosConditionEntries);

/** A trusted app entry */
export type TrustedApp = NewTrustedApp & {
  version: string;
  id: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
};
