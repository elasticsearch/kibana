/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { describeDataset, formatDocumentAnalysis } from '@kbn/ai-tools';
import { getStreamSamplingSource } from '@kbn/streams-schema';
import { DATASET_ANALYSIS_FEATURE_TYPE } from '@kbn/significant-events-schema';
import type { ComputedFeatureGenerator } from './types';

export const datasetAnalysisGenerator: ComputedFeatureGenerator = {
  type: DATASET_ANALYSIS_FEATURE_TYPE,

  description: 'Dataset schema and field analysis including value distributions and coverage',

  llmInstructions: `Contains the schema (excluding empty fields), field distributions, and sample values from the log dataset.
Use the \`properties.analysis\` field to understand available fields and their value distributions.
This is useful for understanding what fields are available for querying and what values they typically contain.`,

  generate: async ({ stream, start, end, esClient }) => {
    const analysis = await describeDataset({
      esClient,
      index: getStreamSamplingSource(stream),
      start,
      end,
    });

    const formattedAnalysis = formatDocumentAnalysis(analysis, {
      dropEmpty: true,
      dropUnmapped: false,
      limit: 150,
    });

    return {
      analysis: formattedAnalysis,
    };
  },
};
