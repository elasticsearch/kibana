/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { uniq } from 'lodash';

import type { PackagePolicy } from '../types/models';

/**
 * Derives the unique Elasticsearch index patterns for the enabled data streams
 * of an agentless package policy. Matches the index targeting used by the
 * throughput aggregation query in `server/services/agentless/throughput.ts`.
 *
 * Returns patterns of the form `${type}-${dataset}-*`.
 */
export const getAgentlessThroughputIndexPatterns = (
  packagePolicy: Pick<PackagePolicy, 'inputs'>
): string[] =>
  uniq(
    packagePolicy.inputs.flatMap((input) =>
      input.streams
        .filter((stream) => stream.enabled)
        .map((stream) => `${stream.data_stream.type ?? 'logs'}-${stream.data_stream.dataset}-*`)
    )
  );
