/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Enables the Streams memory feature for accumulating knowledge from significant events discovery.
 */
export const STREAMS_SIGNIFICANT_EVENTS_MEMORY_ENABLED_FLAG =
  'streams.significantEventsMemoryEnabled';

/**
 * Enables grounding of significant events query generation against source code indexed via
 * Semantic Code Search (SCS). When enabled and a stream is linked to a code index, the query
 * generation reasoning agent can consult the source code (through the installed SCS Kibana
 * workflows) to verify hypotheses before emitting ES|QL queries.
 */
export const STREAMS_SIGNIFICANT_EVENTS_SEMANTIC_CODE_SEARCH_GROUNDING_ENABLED_FLAG =
  'streams.significantEventsSemanticCodeSearchGroundingEnabled';

/**
 * Enables the Streams root cause investigation workflow and agent.
 */
export const STREAMS_INVESTIGATION_ENABLED_FLAG = 'streams.investigationEnabled';
