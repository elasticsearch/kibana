/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Parent feature for Streams (Inference Feature Registry). */
export const STREAMS_INFERENCE_PARENT_FEATURE_ID = 'streams' as const;

/** Partitioning suggestions. */
export const STREAMS_PARTITIONING_SUGGESTIONS_INFERENCE_FEATURE_ID =
  'streams_partitioning_suggestions' as const;

/** Processing suggestions (pipelines, grok/dissect processors). */
export const STREAMS_PROCESSING_SUGGESTIONS_INFERENCE_FEATURE_ID =
  'streams_processing_suggestions' as const;
