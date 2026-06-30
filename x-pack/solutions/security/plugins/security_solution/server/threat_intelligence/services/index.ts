/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Shared domain capability modules for the threat-intelligence plugin.
 *
 * Per the Agent Builder architecture guidance, business logic lives here
 * (not in tools). Internal HTTP routes (`server/routes/`) are the canonical
 * execution surface and call into these services. The Agent Builder tool
 * wrappers (`server/agent_builder/tools/`) survive only as thin portability
 * wrappers for 3rd party agents (Claude / Cursor) and they delegate to the
 * exact same services.
 */

export { searchReports } from './search_reports';
export type { SearchReportsParams, SearchReportsResult } from './search_reports';

export { ingestReport } from './ingest_report';
export type { IngestReportParams, IngestReportResult } from './ingest_report';

export { huntBehavior, huntBehaviorLlmExtractionSchema } from './hunt_behavior';
export type {
  HuntBehaviorArticleContext,
  HuntBehaviorParams,
  HuntBehaviorResult,
  HuntBehaviorStatus,
  HuntBehaviorAttachmentHint,
  ValidatedBehavior,
} from './hunt_behavior';

export { toIndexedBehaviors } from './indexed_behaviors';
export type { IndexedBehavior } from './indexed_behaviors';

export { huntForThreat } from './hunt_for_threat';
export type {
  HuntForThreatParams,
  HuntForThreatResult,
  HuntForThreatStatus,
  HuntForThreatHit,
  HuntIoc,
  AffectedAsset,
} from './hunt_for_threat';

export { huntOrchestrated } from './hunt_orchestrator';
export type {
  HuntOrchestratedParams,
  HuntOrchestratedResult,
  HuntOrchestratedStatus,
  HuntOrchestratedTier1,
  HuntOrchestratedTier2,
  HuntOrchestratedTier2SkipReason,
} from './hunt_orchestrator';

export {
  buildHuntFeedbackDoc,
  computeBoost,
  resolveHuntFeedbackTarget,
  writeHuntFeedback,
  writeHuntFeedbackSafe,
} from './write_hunt_feedback';
export type {
  HuntFeedbackInputs,
  HuntFeedbackTarget,
  HuntFeedbackWrite,
} from './write_hunt_feedback';

export { synthesizeAdvisory, advisoryLlmOutputSchema } from './synthesize_advisory';
export type {
  SynthesizeAdvisoryParams,
  SynthesizeAdvisoryResult,
  SynthesizeAdvisoryStatus,
} from './synthesize_advisory';

export { coverageGap } from './coverage_gap';
export type {
  CoverageGapParams,
  CoverageGapResult,
  CoverageGapTechniqueRow,
  CoverageRecommendation,
} from './coverage_gap';
export {
  collectRuleCoverageByTechnique,
  coverageSummaryForTechniques,
  enrichTechniquesWithRuleCoverage,
  techniqueCoverageFields,
} from './coverage_gap';
export type { TechniqueCoverageFields, TechniqueRuleCoverage } from './coverage_gap';

export {
  generalizeFromTelemetry,
  generalizeFromTelemetryLlmExtractionSchema,
} from './generalize_from_telemetry';
export type {
  GeneralizeFromTelemetryParams,
  GeneralizeFromTelemetryResult,
  GeneralizeFromTelemetryStatus,
  GeneralizeFromTelemetryAlertSample,
  GeneralizeFromTelemetryAttachmentHint,
  GeneralizeValidatedBehavior,
} from './generalize_from_telemetry';

export {
  persistSubscription,
  listSubscriptions,
  deleteSubscription,
  resolveSubscriptionParams,
} from './manage_subscriptions';
export type {
  PersistSubscriptionInput,
  PersistSubscriptionResult,
  ListSubscriptionsResult,
  DeleteSubscriptionResult,
  ResolveSubscriptionInput,
  ResolveSubscriptionOutcome,
  ResolvedSubscription,
  SubscriptionDelivery,
} from './manage_subscriptions';

export { extractIocs } from './extract_iocs';
export type { ExtractIocsParams, ExtractIocsResult, ExtractedIoc, IocTier } from './extract_iocs';

export {
  extractDiamond,
  extractDiamondLlmOutputSchema,
  DIAMOND_BODY_CHAR_LIMIT,
} from './extract_diamond';

export { enrichTaxonomy, taxonomyOutputSchema } from './enrich_taxonomy';
export type { EnrichTaxonomyParams, TaxonomyOutput } from './enrich_taxonomy';
export type {
  ExtractDiamondParams,
  ExtractDiamondResult,
  DiamondExtractionMode,
  DiamondSignal,
} from './extract_diamond';

export { analyseEnvironment } from './analyse_environment';
export type { AnalyseEnvironmentParams, AnalyseEnvironmentResult } from './analyse_environment';

export { flyoutInsights, parseReportIdFromIndicatorReference } from './flyout_insights';
export type { FlyoutInsightsRequest, FlyoutInsightsResponse } from './flyout_insights';

export { searchByAnchors } from './search_by_anchors';
export type {
  AnchorIoc,
  AnchorSet,
  SearchByAnchorsParams,
  AnchorMatchBreakdown,
  AnchorHit,
  SearchByAnchorsResult,
} from './search_by_anchors';

export {
  searchByDiamond,
  STRONG_FLOOR,
  MID_FLOOR,
  BASE_FLOOR,
  DIAMOND_VERTICES,
} from './search_by_diamond';
export type {
  DiamondVertex,
  DiamondVertexQueries,
  SearchByDiamondParams,
  DiamondVertexScore,
  DiamondHit,
  SearchByDiamondResult,
} from './search_by_diamond';

export { correlateThreat } from './correlate_threat';
export type {
  CorrelateThreatInput,
  CorrelateThreatParams,
  CorrelateThreatResult,
  CorrelateThreatTriagedResult,
  CorrelateThreatDepthResult,
  CorrelateThreatExtractResult,
  CorrelateThreatKnnResult,
  CorrelateThreatTriageResult,
  CorrelateThreatFullResult,
} from './correlate_threat';

export { synthesizeCorrelations, fetchCandidateBodyText } from './synthesize_correlations';
export type { SynthesizeCorrelationsParams, CandidateBodyEntry } from './synthesize_correlations';
