/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CODE_ANALYSIS_FEATURE_TYPE } from '@kbn/significant-events-schema';
import type { ComputedFeatureGenerator } from './types';

/**
 * Key under which the consuming plugin injects the `code_analysis` provider via
 * {@link ComputedFeatureGeneratorOptions.providers}.
 */
export const CODE_ANALYSIS_PROVIDER_KEY = CODE_ANALYSIS_FEATURE_TYPE;

/**
 * Computed feature that grounds significant-events query generation in the
 * stream's source code.
 *
 * This generator only carries metadata (so its `llmInstructions` flow into the
 * generation prompt). The actual computation — selecting the producing
 * repository by content and verifying log/error strings against the indexed
 * source code — depends on Semantic Code Search (Agent Builder tools) which
 * lives in the consuming plugin, not in this package. The plugin therefore
 * injects a provider via `options.providers[CODE_ANALYSIS_PROVIDER_KEY]`.
 *
 * When no provider is injected (feature disabled, Agent Builder unavailable) or
 * the provider finds no matching repository, `generate` returns `undefined` and
 * the feature is skipped.
 */
export const codeAnalysisGenerator: ComputedFeatureGenerator = {
  type: CODE_ANALYSIS_FEATURE_TYPE,

  description:
    'Log/error message strings, error types, and dependency calls extracted from the source code that produces this stream, verified against values actually present in the logs',

  llmInstructions: `Contains source code evidence from the repository that produces this stream, in two parts.
\`properties.verified_strings\` and \`properties.evidence\` are confirmed: each string appears in both the source code and the observed logs. Use \`verified_strings\` verbatim when wording detection queries and when choosing \`MATCH_PHRASE\` vs \`:\`. \`properties.evidence\` entries (\`code: <file>:<line> <snippet>\`) can be copied directly into a query's \`evidence\`.
\`properties.code_context\` entries are broader: code snippets from the same repository surfaced by semantic search that may contain log/error strings the service can emit but that have not yet appeared in the lookback window. Use these as proactive hints for detection queries — the same way \`technology\` and \`infrastructure\` features work.
Treat all entries as hints that refine queries already anchored in \`dataset_analysis\`, never as a replacement for it.`,

  generate: async (options) => {
    const provider = options.providers?.[CODE_ANALYSIS_PROVIDER_KEY];
    if (!provider) {
      return undefined;
    }
    return provider(options);
  },
};
