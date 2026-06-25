/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface IndexInfo {
  indexName: string;
  docs: number;
}

export type MainCategories = 'Endpoint' | 'Identity' | 'Network' | 'Cloud' | 'Application/SaaS';

export interface CategoryGroup {
  category: MainCategories | string;
  indices: IndexInfo[];
}

export interface CategoriesResponse {
  rawCategoriesMap: CategoryGroup[];
  mainCategoriesMap: CategoryGroup[];
}

// TODO: siem-readiness - Request ECS Data Quality Dashboard team to move these types to a common location
// (e.g., @kbn/ecs-data-quality-types or similar shared package) so they can be reused
// on the FE side without duplication. See:
// x-pack/solutions/security/plugins/ecs_data_quality_dashboard/server/schemas/result.ts
export interface DataQualityResultDocument {
  indexPattern?: string;
  checkedBy?: string;
  indexId?: string;
  ilmPhase?: string;
  batchId: string;
  indexName: string;
  isCheckAll: boolean;
  checkedAt: number;
  docsCount: number;
  totalFieldCount: number;
  ecsFieldCount: number;
  customFieldCount: number;
  incompatibleFieldCount: number;
  incompatibleFieldMappingItems: Array<{
    fieldName: string;
    expectedValue: string;
    actualValue: string;
    description: string;
  }>;
  incompatibleFieldValueItems: Array<{
    fieldName: string;
    expectedValues: string[];
    actualValues: Array<{ name: string; count: number }>;
    description: string;
  }>;
  sameFamilyFieldCount: number;
  sameFamilyFields: string[];
  sameFamilyFieldItems: Array<{
    fieldName: string;
    expectedValue: string;
    actualValue: string;
    description: string;
  }>;
  unallowedMappingFields: string[];
  unallowedValueFields: string[];
  sizeInBytes: number;
  markdownComments: string[];
  ecsVersion: string;
  error: string | null;
}

export interface RelatedIntegrationRuleResponse {
  related_integrations?: Array<RelatedIntegration>;
  enabled: boolean;
}

export interface RelatedIntegration {
  package: string;
  version?: string;
  integration?: string;
}

export interface SiemReadinessPackageInfo {
  id: string;
  name: string;
  title: string;
  version: string;
  status: string;
  categories?: string[];
  packagePoliciesInfo?: {
    count: number;
  };
}

export interface PipelineStats {
  name: string;
  indices: string[];
  docsCount: number;
  failedDocsCount: number;
  /** False when the server cannot provide ingestion stats (e.g. serverless mode). */
  statsAvailable: boolean;
  categories?: string[];
  // Volume / silence health — null means "insufficient history or no events ever"
  lastEventMs?: number | null;
  silenceMs?: number | null;
  isSilent?: boolean;
  /** Doc count for yesterday (the most recent complete day); the in-progress current day is excluded. */
  lastFullDayDocs?: number | null;
  baseline7dAvg?: number | null;
  /** Clamped to [0, ∞) — negative means volume spike (not a drop). */
  volumeDropPct?: number | null;
}
export interface CasesSearchResponse {
  total: number;
  countOpenCases: number;
  countClosedCases: number;
  countInProgressCases: number;
}

// Retention types
export type RetentionType = 'ilm' | 'dsl' | null;
export type RetentionStatus = 'healthy' | 'non-compliant';

export interface RetentionInfo {
  indexName: string;
  isDataStream: boolean;
  retentionType: RetentionType;
  retentionPeriod: string | null;
  retentionDays: number | null;
  policyName: string | null;
  status: RetentionStatus;
}

export interface RetentionResponse {
  items: RetentionInfo[];
}

export type VisibilityStatus = 'healthy' | 'actionsRequired' | 'noData';

export interface IndexDocCount {
  index: string;
  docCount: number;
  exists: boolean;
  error?: string;
}

// Blast radius types for finding enrichment
export type FindingSeverity = 'CRITICAL' | 'WARNING' | 'INFORMATIONAL';

/** Finding sub-type — currently only emitted by the Continuity dimension. */
export type ContinuityFindingType =
  | 'pipeline_failure'
  | 'silence'
  | 'volume_drop_warning'
  | 'volume_drop_critical';

export interface AffectedRule {
  id: string;
  name: string;
}

export interface AffectedTactic {
  id: string;
  name: string;
  totalRules: number;
  affectedRulesCount: number;
}

export interface RecommendedAction {
  label: string;
  href: string;
}

export interface ActionableFinding {
  category?: MainCategories;
  severity: FindingSeverity;
  message: string;
  resource: string;
  type?: ContinuityFindingType;
  affectedRules?: AffectedRule[];
  affectedTactics?: AffectedTactic[];
  affectedPlatform?: string;
  recommendedActions?: RecommendedAction[];
  /**
   * Indicates the reliability of the blast-radius fields on this finding.
   * - 'healthy': blast radius is complete and trustworthy.
   * - 'unavailable': a lookup that this dimension depends on failed entirely (e.g. pipeline map
   *   for continuity, category map for coverage). The affected* fields are intentionally omitted.
   * - 'partial': at least one rule's index resolution failed, so affectedRules/Tactics may be
   *   undercounted.
   */
  blastRadiusStatus?: 'healthy' | 'partial' | 'unavailable';
}

export interface CoveragePayload {
  status: VisibilityStatus;
  summary: string;
  items: CategoryGroup[];
  actionableFindings: ActionableFinding[];
}

export interface QualityPayload {
  status: VisibilityStatus;
  summary: string;
  items: DataQualityResultDocument[];
  actionableFindings: ActionableFinding[];
}

export interface ContinuityPayload {
  status: VisibilityStatus;
  summary: string;
  items: PipelineStats[];
  actionableFindings: ActionableFinding[];
}

export interface RetentionPayload {
  status: VisibilityStatus;
  summary: string;
  items: RetentionInfo[];
  actionableFindings: ActionableFinding[];
}
