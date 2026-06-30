/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IndexAdapter, IndexPatternAdapter } from '@kbn/index-adapter';
import type {
  MigrationTranslationResult,
  SiemMigrationResource,
} from '../../../../common/siem_migrations/model/common.gen';
import type {
  RuleMigration,
  RuleMigrationRule,
  UpdateRuleMigrationRule,
} from '../../../../common/siem_migrations/model/rule_migration.gen';
import type { RuleVersions } from './data/rule_migrations_data_prebuilt_rules_client';
import type { Stored } from '../types';
import type { SiemMigrationsIndexNameProvider } from '../common/types';

export type StoredRuleMigration = Stored<RuleMigration>;
export type StoredRuleMigrationRule = Stored<RuleMigrationRule>;
export type StoredRuleMigrationResource = Stored<SiemMigrationResource>;

export interface RuleMigrationIntegration {
  id: string;
  title: string;
  description: string;
  data_streams: Array<{ dataset: string; title: string; index_pattern: string }>;
  elser_embedding: string;
  fields_metadata: Record<string, Record<string, unknown>> | undefined;
  knowledge_base?: string;
}

export interface RuleMigrationPrebuiltRule {
  rule_id: string;
  name: string;
  description: string;
  elser_embedding: string;
  mitre_attack_ids?: string[];
}

export type RuleSemanticSearchResult = RuleMigrationPrebuiltRule & RuleVersions;

export type InternalUpdateRuleMigrationRule = UpdateRuleMigrationRule & {
  translation_result?: MigrationTranslationResult;
};

/**
 *
 * Based on the severity levels defined in the Splunk Common Information Model (CIM) documentation
 *
 * https://docs.splunk.com/Documentation/CIM/6.0.2/User/Alerts
 *
 * '1': 'INFO';
 * '2': 'LOW';
 * '3': 'MEDIUM';
 * '4': 'HIGH';
 * '5': 'CRITICAL';
 *
 **/
export type SplunkSeverity = '1' | '2' | '3' | '4' | '5';

export type MicrosoftSentinelSeverity = 'high' | 'medium' | 'low' | 'informational';

export interface RuleMigrationAdapters {
  rules: IndexPatternAdapter;
  resources: IndexPatternAdapter;
  integrations: IndexAdapter;
  prebuiltrules: IndexAdapter;
  migrations: IndexPatternAdapter;
}

export type RuleMigrationAdapterId = keyof RuleMigrationAdapters;

export type RuleMigrationIndexNameProviders = Record<
  RuleMigrationAdapterId,
  SiemMigrationsIndexNameProvider
>;
