/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Example } from '@kbn/evals';

// ---------------------------------------------------------------------------
// Minimal response types. Mirrors the shapes returned by the threat_intel
// enrichment routes without importing server/plugin code into this test-only
// package (packages expose a single entry point; a subpath import into the
// security_solution plugin would break that boundary).
// ---------------------------------------------------------------------------

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RelevanceResponse {
  is_intelligence: boolean;
  quality_class: 'intel' | 'marketing' | 'rollup' | 'thought_leadership';
  evidence_tier: 'primary' | 'pointer' | 'mixed';
  needs_render: boolean;
  primary_links: string[];
  has_original_commentary: boolean;
  reason: string;
}

export interface ClassifySeverityResponse {
  level: SeverityLevel;
  score: number;
  rationale?: string;
}

export interface TaxonomyResponse {
  categories: string[];
  regions: string[];
  relevance: number;
  diamond_suitable: boolean;
}

export type DiamondSignal = 'HIGH' | 'PARTIAL' | 'NONE';

export interface DiamondVertex {
  signal: DiamondSignal;
  summary: string;
}

export interface ExtractDiamondResponse {
  adversary: DiamondVertex;
  capability: DiamondVertex;
  infrastructure: DiamondVertex;
  victim: DiamondVertex;
  signal_count: number;
  model_id: string;
  extracted_at: string;
  extraction_mode: 'single_call' | 'per_vertex_fallback';
}

// ---------------------------------------------------------------------------
// Request inputs
// ---------------------------------------------------------------------------

export interface AssessRelevanceInput extends Record<string, unknown> {
  text: string;
  title?: string;
  url?: string;
}

export interface ClassifySeverityInput extends Record<string, unknown> {
  text: string;
  title?: string;
  report_id?: string;
  categories?: string[];
  ioc_count?: number;
}

export interface EnrichTaxonomyInput extends Record<string, unknown> {
  text: string;
  title?: string;
  report_id?: string;
}

export interface ExtractDiamondInput extends Record<string, unknown> {
  text: string;
  report_id?: string;
}

// ---------------------------------------------------------------------------
// Dataset example types (one per stage). `metadata.source` records whether the
// example is a verbatim snapshot of a demo pack fixture or authored in-suite.
// ---------------------------------------------------------------------------

export type ExampleSource = 'fixture-derived' | 'authored';

export interface StageMetadata extends Record<string, unknown> {
  Title: string;
  source: ExampleSource;
  pack?: string;
}

export type AssessRelevanceExample = Example<
  AssessRelevanceInput,
  { is_intelligence: boolean },
  StageMetadata
>;

export type ClassifySeverityExample = Example<
  ClassifySeverityInput,
  { level: SeverityLevel },
  StageMetadata
>;

export type EnrichTaxonomyExample = Example<
  EnrichTaxonomyInput,
  { categories: string[]; regions: string[] },
  StageMetadata
>;

export type ExtractDiamondExample = Example<
  ExtractDiamondInput,
  { min_signal_count: number },
  StageMetadata
>;
