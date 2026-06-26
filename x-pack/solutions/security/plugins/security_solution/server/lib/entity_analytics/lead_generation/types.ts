/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Entity } from '@kbn/entity-store/common';

/**
 * Entity representation flowing through the lead generation pipeline.
 *
 * Entity Store V2 records already embed risk scores (`entity.risk`), attributes
 * (`entity.attributes.watchlists`, etc.), and behaviors, so we carry the full
 * entity record through the pipeline rather than fetching data separately.
 */
export interface LeadEntity {
  /** The full Entity Store V2 record (UserEntity | HostEntity | …) */
  readonly record: Entity;
  /** Entity Store unique identifier (EUID, e.g. `"user:alice"`). This is the
   *  identity key used by all observation modules for queries and joins.
   *  Derived from `entity.id`; entities without an EUID are excluded at the
   *  conversion boundary.
   */
  readonly id: string;
  /** Convenience: entity type derived from `entity.type` */
  readonly type: string;
  /** Display name derived from `entity.name`. Use this only for
   *  human-readable strings (descriptions, log lines). For identity, use
   *  {@link LeadEntity.id}.
   */
  readonly name: string;
}

export type ObservationSeverity = 'low' | 'medium' | 'high' | 'critical';

/** A single signal produced by an {@link ObservationModule}. */
export interface Observation {
  /** Stable entity key: the Entity Store EUID (e.g. `"user:alice"`) — i.e. `LeadEntity.id`. */
  readonly entityId: string;
  /** The module that produced this observation */
  readonly moduleId: string;
  /** A descriptive type, e.g. `high_risk_score`, `alert_spike`, `lateral_movement` */
  readonly type: string;
  /** Numeric score representing the severity of this observation (0–100) */
  readonly score: number;
  /** Bucketed severity */
  readonly severity: ObservationSeverity;
  /** Confidence in the observation (0.0–1.0) */
  readonly confidence: number;
  /** Human-readable description of what was observed */
  readonly description: string;
  /** Arbitrary metadata specific to the module */
  readonly metadata: Record<string, unknown>;
}

/** Configuration for an observation module registration. */
export interface ObservationModuleConfig {
  /** Unique identifier for this module */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Execution order (higher = earlier) */
  readonly priority: number;
  /** Optional weight for the weighted scoring engine (defaults in engine if omitted) */
  readonly weight?: number;
}

/** The contract every pluggable observation module must satisfy. */
export interface ObservationModule {
  /** Module configuration */
  readonly config: ObservationModuleConfig;
  /** Check whether the module can run (e.g. required data sources are available) */
  isEnabled(): boolean;
  /** Collect observations for a batch of entities */
  collect(entities: LeadEntity[]): Promise<Observation[]>;
}

export type LeadStaleness = 'fresh' | 'stale' | 'expired';

export const STALENESS_THRESHOLDS_MS = {
  fresh: 24 * 60 * 60 * 1000,
  stale: 72 * 60 * 60 * 1000,
} as const;

export const computeStaleness = (generatedAt: Date, now: Date): LeadStaleness => {
  const ageMs = now.getTime() - generatedAt.getTime();
  if (ageMs <= STALENESS_THRESHOLDS_MS.fresh) return 'fresh';
  if (ageMs <= STALENESS_THRESHOLDS_MS.stale) return 'stale';
  return 'expired';
};

/** The final output of the lead generation engine. */
export interface Lead {
  /** Unique lead identifier */
  readonly id: string;
  /** High-impact hypothesis title (e.g. "Potential Data Staging by Terminated Employee") */
  readonly title: string;
  /** One-sentence context byline */
  readonly byline: string;
  /** Detailed description: evidence chain, investigation guide, the "why" */
  readonly description: string;
  /** Entities involved in this lead */
  readonly entities: LeadEntity[];
  /** Tags: keywords + MITRE ATT&CK tactics/techniques */
  readonly tags: string[];
  /** Priority score (1–10, 10 = most urgent) — normalized from composite score */
  readonly priority: number;
  /** Suggested follow-up questions or investigation prompts */
  readonly chatRecommendations: string[];
  /** ISO-8601 timestamp of when this lead was generated */
  readonly timestamp: string;
  /** Staleness based on age: fresh (0–24h), stale (24–72h), expired (>72h) */
  readonly staleness: LeadStaleness;
  /** All observations that contributed to this lead */
  readonly observations: Observation[];
}

/** Engine configuration. */
export interface LeadGenerationEngineConfig {
  /** Minimum number of observations required for an entity to qualify for a lead */
  readonly minObservations: number;
  /** Maximum number of leads to return */
  readonly maxLeads: number;
  /** Bonus multiplier applied when multiple observations come from the same module (0.0–1.0) */
  readonly corroborationBonus: number;
  /** Bonus multiplier applied when observations come from multiple modules (0.0–1.0) */
  readonly diversityBonus: number;
  /** Raw score ceiling used when normalizing to the 1–10 priority scale */
  readonly normalizationCeiling: number;
}

export const DEFAULT_ENGINE_CONFIG: LeadGenerationEngineConfig = {
  minObservations: 1,
  maxLeads: 10,
  corroborationBonus: 0.15,
  diversityBonus: 0.1,
  normalizationCeiling: 100,
};
