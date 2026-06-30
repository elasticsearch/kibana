/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Parent feature for Streams Significant Events (Inference Feature Registry). */
export const SIGNIFICANT_EVENTS_INFERENCE_PARENT_FEATURE_ID = 'streams_significant_events' as const;

/** Knowledge Indicator feature extraction (KI extraction). */
export const SIGNIFICANT_EVENTS_KI_EXTRACTION_INFERENCE_FEATURE_ID =
  'streams_sig_events_ki_extraction' as const;

/** Knowledge Indicator query generation. */
export const SIGNIFICANT_EVENTS_KI_QUERY_GENERATION_INFERENCE_FEATURE_ID =
  'streams_significant_events_ki_query_generation' as const;

/** Discovery and significant event generation. */
export const SIGNIFICANT_EVENTS_DISCOVERY_INFERENCE_FEATURE_ID =
  'streams_significant_events_discovery' as const;

/** Root cause investigation. */
export const SIGNIFICANT_EVENTS_INVESTIGATION_INFERENCE_FEATURE_ID =
  'streams_significant_events_investigation' as const;
