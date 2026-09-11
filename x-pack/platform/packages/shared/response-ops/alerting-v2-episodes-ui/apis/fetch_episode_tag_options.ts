/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ExpressionsStart } from '@kbn/expressions-plugin/public';
import {
  buildEpisodeTagOptionsQuery,
  type EpisodeTagOptionRow,
} from '../queries/episode_tag_options_query';
import { executeEsqlQuery } from '../utils/execute_esql_query';

export interface FetchEpisodeTagOptionsParams {
  spaceId: string;
  abortSignal?: AbortSignal;
  services: { expressions: ExpressionsStart };
}

/**
 * Returns tag option rows from the `.alert-actions` tag events, regardless of
 * the time picker: the episodes list reads its tags from every action too, so
 * any tag shown in a row can also be picked in the filter.
 */
export const fetchEpisodeTagOptions = ({
  spaceId,
  abortSignal,
  services: { expressions },
}: FetchEpisodeTagOptionsParams): Promise<EpisodeTagOptionRow[]> => {
  const query = buildEpisodeTagOptionsQuery(spaceId).print('basic');

  return executeEsqlQuery<EpisodeTagOptionRow>({
    expressions,
    query,
    input: { type: 'kibana_context', esqlVariables: [] },
    abortSignal,
  });
};
