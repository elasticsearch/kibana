/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AI_INDEX_PRIVILEGES_PATH, buildAiIndexSpaceFilter } from './space_filter';

describe('buildAiIndexSpaceFilter', () => {
  it('matches documents scoped to the space or to the global wildcard', () => {
    expect(buildAiIndexSpaceFilter('marketing')).toEqual({
      bool: {
        should: [
          {
            bool: {
              must_not: {
                nested: {
                  path: AI_INDEX_PRIVILEGES_PATH,
                  query: { match_all: {} },
                  ignore_unmapped: true,
                },
              },
            },
          },
          {
            nested: {
              path: AI_INDEX_PRIVILEGES_PATH,
              ignore_unmapped: true,
              query: {
                bool: {
                  should: [
                    { term: { [`${AI_INDEX_PRIVILEGES_PATH}.space`]: 'marketing' } },
                    { term: { [`${AI_INDEX_PRIVILEGES_PATH}.space`]: '*' } },
                  ],
                  minimum_should_match: 1,
                },
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    });
  });
});
