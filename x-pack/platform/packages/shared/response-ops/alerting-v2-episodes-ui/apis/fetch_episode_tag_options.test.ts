/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ExpressionsStart } from '@kbn/expressions-plugin/public';
import { executeEsqlQuery } from '../utils/execute_esql_query';
import { fetchEpisodeTagOptions } from './fetch_episode_tag_options';

jest.mock('../utils/execute_esql_query');
const mockExecuteEsqlQuery = jest.mocked(executeEsqlQuery);

describe('fetchEpisodeTagOptions', () => {
  it('reads the tag actions without a time filter, like the episodes list does', async () => {
    mockExecuteEsqlQuery.mockResolvedValue([]);

    await fetchEpisodeTagOptions({
      spaceId: 'default',
      services: { expressions: {} as ExpressionsStart },
    });

    expect(mockExecuteEsqlQuery).toHaveBeenCalledWith(
      expect.objectContaining({ input: { type: 'kibana_context', esqlVariables: [] } })
    );
    const { timeField } = mockExecuteEsqlQuery.mock.calls[0][0];
    expect(timeField).toBeUndefined();
  });
});
