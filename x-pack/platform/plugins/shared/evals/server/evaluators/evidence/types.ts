/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InstrumentationProfile as GeneratedInstrumentationProfile } from '@kbn/evals-common';

export interface ToolCallEvidence {
  tool_call_id?: string;
  tool_id?: string;
  arguments?: unknown;
  result?: unknown;
}

export interface EvidenceRound {
  input: { message: string };
  steps: ToolCallEvidence[];
  response: { message: string };
}

export type EvidenceSource = 'traces' | 'logs';
export type EvidenceMessageSelectMode = 'first' | 'last';
export type EvidenceMessageParseMode = 'string' | 'genai_messages' | 'anthropic_message';
export const EVIDENCE_ITEM_KEYS = {
  userQuery: 'user_query',
  agentResponse: 'agent_response',
  toolCalls: 'tool_calls',
} as const;
export type EvidenceItemKey = (typeof EVIDENCE_ITEM_KEYS)[keyof typeof EVIDENCE_ITEM_KEYS];
export type InstrumentationProfile = GeneratedInstrumentationProfile;

export interface EvidenceFilterTerm {
  field: string;
  value: string;
}

export interface EvidenceMessageItemSpec {
  source: EvidenceSource;
  filter: EvidenceFilterTerm[];
  contentField: string;
  select: EvidenceMessageSelectMode;
  parse: EvidenceMessageParseMode;
}

export interface EvidenceToolCallsItemSpec {
  source: EvidenceSource;
  filter: EvidenceFilterTerm[];
  parse?: 'prefixed_json';
  fields: {
    tool_call_id: string;
    tool_id: string;
    arguments: string;
    result: string;
  };
}

export interface InstrumentationProfileSpec {
  user_query: EvidenceMessageItemSpec;
  agent_response: EvidenceMessageItemSpec;
  tool_calls: EvidenceToolCallsItemSpec;
}
