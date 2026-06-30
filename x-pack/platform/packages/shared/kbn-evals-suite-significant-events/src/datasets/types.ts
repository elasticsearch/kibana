/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { EvaluationCriterionStructured } from '@kbn/evals';
import type { Detection, Discovery } from '@kbn/significant-events-schema';
import type { GcsConfig } from '../data_generators/replay';
import type { ValidKIFeatureType } from '../evaluators/ki_feature_extraction';

export interface SamplingCriterion extends EvaluationCriterionStructured {
  sampling_filters?: QueryDslQueryContainer[];
}

interface ScenarioMetadata {
  difficulty: 'easy' | 'medium' | 'hard';
  failure_domain: string;
  failure_mode?: string;
}

export interface SnapshotSourceOverride {
  snapshot_name?: string;
  gcs?: {
    basePathPrefix?: GcsConfig['basePathPrefix'];
  };
}

export interface KIQueryGenerationScenario {
  input: {
    scenario_id: string;
    stream_name: string;
    stream_description: string;
  };
  output: {
    criteria: SamplingCriterion[];
    expected_categories: string[];
    expected_ground_truth: string;
    expect_stats?: boolean;
  };
  metadata: Record<string, unknown> & ScenarioMetadata;
  snapshot_source?: SnapshotSourceOverride;
}

export interface KIFeatureExtractionScenario {
  input: {
    scenario_id: string;
    log_query_filter?: QueryDslQueryContainer[];
  };
  output: {
    criteria: SamplingCriterion[];
    min_features?: number;
    max_features?: number;
    required_types?: ValidKIFeatureType[];
    expect_entity_filters?: boolean;
    expected_ground_truth: string;
  };
  metadata: Record<string, unknown> & ScenarioMetadata;
  snapshot_source?: SnapshotSourceOverride;
}

/**
 * A dataset provider supplies snapshot source defaults and evaluation criteria
 * for both KI query generation and KI feature extraction evals.
 *
 * To add a new dataset:
 * 1. Create a file in this directory (e.g. `my_app.ts`, similar to otel_demo)
 * 2. Export a `DatasetConfig` with your source defaults and scenarios
 * 3. Register it in `index.ts`
 * 4. Run evals with: `SIGEVENTS_DATASET=my-app node scripts/evals run ...`
 */
export interface KIFeatureExclusionScenario {
  input: {
    scenario_id: string;
    sample_document_count: number;
    exclude_count: number;
    follow_up_runs: number;
  };
  snapshot_source?: SnapshotSourceOverride;
}

export interface KIFeatureDeduplicationScenario {
  input: {
    scenario_id: string;
    iterations: number;
  };
  snapshot_source?: SnapshotSourceOverride;
}

export interface DiscoveryInvestigatorScenario {
  input: {
    scenario_id: string;
    stream_name: string;
    detections: Array<Partial<Detection>>;
    continuation_candidates?: Array<Discovery>;
  };
  /** Ordered ground-truth continuation chains by `rule_name`, keyed by continuation path label. */
  continuationChains?: Record<string, string[]>;
  output: {
    criteria: SamplingCriterion[];
    expected_min_evidence_count?: number;
    /** Human-readable summary of expected output for quick orientation (e.g. `discoveries=[cascade, benign-auth]`). */
    expected_ground_truth?: string;
    /**
     * The discoveries the investigator is expected to produce — same shape as the judge's
     * `input.discoveries` (detections + evidences + cause_kis). This is the canonical ground
     * truth: the grouping check derives its expected groups from these `detections[].rule_name`s,
     * and the same discoveries feed the judge scenario's input so the two stages stay consistent.
     */
    expected_discoveries: Array<Partial<Discovery>>;
  };
  metadata: Record<string, unknown> & ScenarioMetadata;
  snapshot_source?: SnapshotSourceOverride;
}

export interface DiscoveryJudgeScenario {
  id?: string;
  input: {
    scenario_id: string;
    discoveries: Array<Partial<Discovery>>;
  };
  output: {
    criteria: SamplingCriterion[];
    /** Human-readable summary of expected outcome for each discovery, e.g. `slug=promoted (reason); slug=demoted (reason)`. Used by the status-correctness evaluator. */
    expected_ground_truth: string;
    expect_assessment_note?: boolean;
  };
  metadata: Record<string, unknown> & ScenarioMetadata;
  snapshot_source?: SnapshotSourceOverride;
}

export interface DatasetConfig {
  id: string;
  description: string;
  gcs: GcsConfig;
  kiQueryGeneration: KIQueryGenerationScenario[];
  kiFeatureExtraction: KIFeatureExtractionScenario[];
  kiFeatureExclusion: KIFeatureExclusionScenario[];
  kiFeatureDeduplication: KIFeatureDeduplicationScenario[];
  discoveryInvestigator: DiscoveryInvestigatorScenario[];
  discoveryJudge: DiscoveryJudgeScenario[];
}
