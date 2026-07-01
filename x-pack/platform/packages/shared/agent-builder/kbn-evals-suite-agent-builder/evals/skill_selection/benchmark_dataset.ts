/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Skill-selection benchmark dataset — parsed at runtime from benchmark_dataset.csv.
 *
 * Adding or modifying examples requires only editing the CSV — this file stays untouched.
 *
 * CSV columns: skill_id, category, query, query_type, expected_skill, notes
 *
 * Query types:
 *   direct     — query that explicitly calls for this skill
 *   indirect   — describes the problem without naming the skill domain
 *   distractor — sounds like the skill but should route to a neighbouring skill instead
 *
 * Ground truth wiring (in `output`, read by evaluators via the `expected` parameter):
 *   direct/indirect  → expectedSkill = expected_skill  (that skill must load)
 *   distractor       → expectedSkill = expected_skill  (the correct neighbour skill must load)
 *   distractor (no expected_skill) → shouldNotActivateSkill = skill_id  (no skill loads; fallback)
 *
 * `skill_id` is used only as a grouping key (metadata.skillId) and never as a routing assertion.
 * `expected_skill` is the authoritative routing target for all positive assertions.
 */

import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

type QueryType = 'direct' | 'indirect' | 'distractor';

interface CsvRow {
  skill_id: string;
  category: string;
  query: string;
  query_type: QueryType;
  expected_skill: string;
  notes: string;
}

export interface BenchmarkExample {
  input: { question: string };
  /** Ground truth annotations — read by evaluators via the `expected` param. */
  output: {
    expectedSkill?: string;
    shouldNotActivateSkill?: string;
  };
  /** Descriptive metadata — enriches human understanding of the example only. */
  metadata: {
    skillId: string;
    category: string;
    queryType: QueryType;
    notes?: string;
  };
}

function parseCsv(): BenchmarkExample[] {
  const csvPath = path.join(__dirname, 'benchmark_dataset.csv');
  const csvString = fs.readFileSync(csvPath, 'utf-8');

  const { data } = Papa.parse<CsvRow>(csvString, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: true,
  });

  return data.map(({ skill_id, category, query, query_type, expected_skill, notes }) => {
    if (query_type !== 'distractor' && !expected_skill.trim()) {
      throw new Error(`expected_skill is required for direct/indirect row: "${query}"`);
    }

    const output: BenchmarkExample['output'] = expected_skill.trim()
      ? { expectedSkill: expected_skill.trim() }
      : { shouldNotActivateSkill: skill_id };

    return {
      input: { question: query.trim() },
      output,
      metadata: {
        skillId: skill_id,
        category,
        queryType: query_type,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
    };
  });
}

const ALL_EXAMPLES: BenchmarkExample[] = parseCsv();

const bySkill = (skillId: string): BenchmarkExample[] =>
  ALL_EXAMPLES.filter((e) => e.metadata.skillId === skillId);

// ─── PLATFORM ───────────────────────────────────────────────────────────────

export const DASHBOARD_MANAGEMENT_EXAMPLES = bySkill('dashboard-management');
export const GRAPH_CREATION_EXAMPLES = bySkill('graph-creation');
export const SKILL_AUTHORING_EXAMPLES = bySkill('skill-authoring');
export const VISUALIZATION_CREATION_EXAMPLES = bySkill('visualization-creation');

// ─── STREAMS ────────────────────────────────────────────────────────────────

export const KI_IDENTIFICATION_MANAGEMENT_EXAMPLES = bySkill('ki-identification-management');
export const KNOWLEDGE_INDICATORS_MANAGEMENT_EXAMPLES = bySkill('knowledge-indicators-management');
export const SIG_EVENTS_MANAGEMENT_EXAMPLES = bySkill('significant-events-management');
export const SIG_EVENTS_MEMORY_EXAMPLES = bySkill('significant-events-memory');
export const STREAMS_MANAGEMENT_EXAMPLES = bySkill('streams-management');

// ─── SECURITY ───────────────────────────────────────────────────────────────

export const ALERT_ANALYSIS_EXAMPLES = bySkill('alert-analysis');
export const AUTOMATIC_TROUBLESHOOTING_EXAMPLES = bySkill(
  'elastic-defend-configuration-troubleshooting'
);
export const DETECTION_RULE_EDIT_EXAMPLES = bySkill('detection-rule-edit');
export const ENTITY_ANALYTICS_EXAMPLES = bySkill('entity-analytics');
export const FIND_RULES_EXAMPLES = bySkill('find-security-rules');
export const FIND_SECURITY_ML_JOBS_EXAMPLES = bySkill('find-security-ml-jobs');
export const SIEM_READINESS_EXAMPLES = bySkill('siem-readiness');
export const THREAT_HUNTING_EXAMPLES = bySkill('threat-hunting');

// ─── OBSERVABILITY ──────────────────────────────────────────────────────────

export const OBSERVABILITY_INVESTIGATION_EXAMPLES = bySkill('observability.investigation');
export const SERVICE_MAP_EXAMPLES = bySkill('service-map');

// ─── SEARCH ─────────────────────────────────────────────────────────────────

export const SEARCH_CATALOG_ECOMMERCE_EXAMPLES = bySkill('search.catalog-ecommerce');
export const SEARCH_ELASTICSEARCH_ONBOARDING_EXAMPLES = bySkill('search.elasticsearch-onboarding');
export const SEARCH_ELASTICSEARCH_TUTORIAL_EXAMPLES = bySkill('search.elasticsearch-tutorial');
export const SEARCH_KEYWORD_SEARCH_EXAMPLES = bySkill('search.keyword-search');
export const SEARCH_RAG_CHATBOT_EXAMPLES = bySkill('search.rag-chatbot');
export const SEARCH_USE_CASE_LIBRARY_EXAMPLES = bySkill('search.use-case-library');
export const SEARCH_VECTOR_HYBRID_SEARCH_EXAMPLES = bySkill('search.vector-hybrid-search');
