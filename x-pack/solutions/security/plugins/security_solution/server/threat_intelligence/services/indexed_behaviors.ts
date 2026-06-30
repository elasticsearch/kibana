/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ValidatedBehavior } from './hunt_behavior';

/**
 * Subset of `hunt_behavior` output fields that match the strict
 * `extracted.behaviors` nested mapping on `.kibana-threat-reports`
 * (see `setup/index_templates.ts`). Extra tool/route fields such as
 * `proposed_esql_rule` must not be written by the extraction workflow.
 */
export interface IndexedBehavior {
  id: string;
  technique_id: string;
  description: string;
  telemetry_targets?: string[];
  llm_confidence: number;
  confidence: number;
}

export const toIndexedBehaviors = (behaviors: ValidatedBehavior[]): IndexedBehavior[] =>
  behaviors.map(({ finding_id, technique_id, evidence_quote, llm_confidence, confidence }) => ({
    id: finding_id,
    technique_id,
    description: evidence_quote,
    llm_confidence,
    confidence,
  }));
