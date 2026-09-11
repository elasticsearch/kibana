/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  buildExperimentFilterQuery,
  buildExampleScoresQuery,
  buildDatasetExampleScoresQuery,
  buildSpaceFilter,
  buildStatsAggregation,
  parseStatsAggregationResponse,
  buildEvaluatorModelsAggregation,
  parseEvaluatorModelsAggregation,
  SCORES_SORT_ORDER,
  buildExperimentsListingFilterQuery,
  buildExperimentsListingAggregation,
  parseExperimentsListingResponse,
  buildModelDisplayId,
  escapeWildcard,
} from './query_builders';

describe('query_builders', () => {
  describe('escapeWildcard', () => {
    it('escapes wildcard metacharacters so they match literally', () => {
      // input chars: a * b ? c \ d  ->  a \* b \? c \\ d
      expect(escapeWildcard('a*b?c\\d')).toBe('a\\*b\\?c\\\\d');
    });

    it('leaves input without metacharacters unchanged', () => {
      expect(escapeWildcard('feature/in-tool')).toBe('feature/in-tool');
    });
  });

  describe('buildSpaceFilter', () => {
    it('matches the space, plus docs predating space-awareness in the default space', () => {
      expect(buildSpaceFilter('default')).toEqual({
        bool: {
          should: [
            { terms: { space_ids: ['default'] } },
            { bool: { must_not: { exists: { field: 'space_ids' } } } },
          ],
          minimum_should_match: 1,
        },
      });
    });

    it('matches only the space itself elsewhere, with no legacy fallback', () => {
      expect(buildSpaceFilter('marketing')).toEqual({
        bool: {
          should: [{ terms: { space_ids: ['marketing'] } }],
          minimum_should_match: 1,
        },
      });
    });
  });

  describe('buildExampleScoresQuery', () => {
    it('filters by example.id', () => {
      const query = buildExampleScoresQuery('example-123');
      expect(query).toEqual({
        bool: { must: [{ term: { 'example.id': 'example-123' } }] },
      });
    });

    it('adds a dataset filter when datasetId is provided', () => {
      const query = buildExampleScoresQuery('example-123', { datasetId: 'dataset-abc' });
      expect(query.bool.must).toHaveLength(2);
      expect(query.bool.must[1]).toEqual({ term: { 'example.dataset.id': 'dataset-abc' } });
    });

    it('omits the dataset filter when datasetId is absent', () => {
      const query = buildExampleScoresQuery('example-123', {});
      expect(query.bool.must).toHaveLength(1);
      expect(query.bool.must[0]).toEqual({ term: { 'example.id': 'example-123' } });
    });

    it('adds a space filter when spaceId is provided', () => {
      const query = buildExampleScoresQuery('example-123', { spaceId: 'marketing' });
      expect(query.bool.must).toHaveLength(2);
      expect(query.bool.must[1]).toEqual(buildSpaceFilter('marketing'));
    });

    it('adds execution and model filters when provided', () => {
      const query = buildExampleScoresQuery('example-123', {
        executionId: 'run-abc',
        modelId: 'openai-gpt-5.4',
      });
      expect(query.bool.must).toEqual([
        { term: { 'example.id': 'example-123' } },
        { term: { 'metadata.execution_id': 'run-abc' } },
        { term: { 'task.model.id': 'openai-gpt-5.4' } },
      ]);
    });
  });

  describe('buildDatasetExampleScoresQuery', () => {
    it('filters by example.dataset.id and experiment_id', () => {
      const query = buildDatasetExampleScoresQuery('dataset-123', 'experiment-123');
      expect(query).toEqual({
        bool: {
          must: [
            { term: { 'example.dataset.id': 'dataset-123' } },
            { term: { experiment_id: 'experiment-123' } },
          ],
        },
      });
    });

    it('filters by metadata.execution_id when filterField is specified', () => {
      const query = buildDatasetExampleScoresQuery('dataset-123', 'run-abc', {
        filterField: 'metadata.execution_id',
      });
      expect(query).toEqual({
        bool: {
          must: [
            { term: { 'example.dataset.id': 'dataset-123' } },
            { term: { 'metadata.execution_id': 'run-abc' } },
          ],
        },
      });
    });

    it('adds a space filter when spaceId is provided', () => {
      const query = buildDatasetExampleScoresQuery('dataset-123', 'experiment-123', {
        spaceId: 'default',
      });
      expect(query.bool.must).toHaveLength(3);
      expect(query.bool.must[2]).toEqual(buildSpaceFilter('default'));
    });
  });

  describe('buildExperimentFilterQuery', () => {
    it('filters by experiment_id only when no options provided', () => {
      const query = buildExperimentFilterQuery('experiment-123');
      expect(query).toEqual({
        bool: { must: [{ term: { experiment_id: 'experiment-123' } }] },
      });
    });

    it('adds suite filter when suiteId is provided', () => {
      const query = buildExperimentFilterQuery('experiment-123', { suiteId: 'suite-a' });
      expect(query.bool.must).toHaveLength(2);
      expect(query.bool.must[1]).toEqual({ term: { 'metadata.suite_id': 'suite-a' } });
    });

    it('adds model filter when modelId is provided', () => {
      const query = buildExperimentFilterQuery('experiment-123', { modelId: 'gpt-4' });
      expect(query.bool.must).toHaveLength(2);
      expect(query.bool.must[1]).toEqual({ term: { 'task.model.id': 'gpt-4' } });
    });

    it('adds both filters when both options are provided', () => {
      const query = buildExperimentFilterQuery('experiment-123', {
        suiteId: 'suite-a',
        modelId: 'gpt-4',
      });
      expect(query.bool.must).toHaveLength(3);
    });

    it('ignores empty string options', () => {
      const query = buildExperimentFilterQuery('experiment-123', { suiteId: '', modelId: '' });
      expect(query.bool.must).toHaveLength(1);
    });

    it('filters by metadata.execution_id when filterField is specified', () => {
      const query = buildExperimentFilterQuery('run-abc', { filterField: 'metadata.execution_id' });
      expect(query).toEqual({
        bool: { must: [{ term: { 'metadata.execution_id': 'run-abc' } }] },
      });
    });

    it('adds a space filter when spaceId is provided', () => {
      const query = buildExperimentFilterQuery('experiment-123', { spaceId: 'marketing' });
      expect(query.bool.must).toHaveLength(2);
      expect(query.bool.must[1]).toEqual(buildSpaceFilter('marketing'));
    });
  });

  describe('buildStatsAggregation', () => {
    it('returns the expected aggregation structure', () => {
      const agg = buildStatsAggregation();
      expect(agg.by_dataset.terms.field).toBe('example.dataset.id');
      expect(agg.by_dataset.aggs.example_count).toEqual({
        cardinality: { field: 'example.id' },
      });
      expect(agg.by_dataset.aggs.by_evaluator.terms.field).toBe('evaluator.name');
      expect(agg.by_dataset.aggs.by_evaluator.aggs.score_stats).toEqual({
        extended_stats: { field: 'evaluator.score' },
      });
      expect(agg.by_dataset.aggs.by_evaluator.aggs.score_median).toEqual({
        percentiles: { field: 'evaluator.score', percents: [50] },
      });
    });

    it('aggregates the judge model within each evaluator bucket, family and provider nested under the id', () => {
      const { aggs } = buildStatsAggregation().by_dataset.aggs.by_evaluator;

      expect(aggs.evaluator_model_id).toEqual({
        terms: { field: 'evaluator.model.id', size: 1 },
        aggs: {
          family: { terms: { field: 'evaluator.model.family', size: 1 } },
          provider: { terms: { field: 'evaluator.model.provider', size: 1 } },
        },
      });
    });
  });

  describe('buildEvaluatorModelsAggregation', () => {
    it('collects up to twenty judges, family and provider nested under the id', () => {
      expect(buildEvaluatorModelsAggregation()).toEqual({
        terms: { field: 'evaluator.model.id', size: 20 },
        aggs: {
          family: { terms: { field: 'evaluator.model.family', size: 1 } },
          provider: { terms: { field: 'evaluator.model.provider', size: 1 } },
        },
      });
    });
  });

  describe('parseEvaluatorModelsAggregation', () => {
    it('keeps the order the aggregation returned, so the first judge is the most used', () => {
      expect(
        parseEvaluatorModelsAggregation({
          evaluator_models: {
            buckets: [
              {
                key: 'gpt-4o',
                family: { buckets: [{ key: 'GPT' }] },
                provider: { buckets: [{ key: 'OpenAI' }] },
              },
              { key: 'claude-3', family: { buckets: [] }, provider: { buckets: [] } },
            ],
          },
        })
      ).toEqual([
        { id: 'gpt-4o', family: 'GPT', provider: 'OpenAI' },
        { id: 'claude-3', family: undefined, provider: undefined },
      ]);
    });

    it('reports no judges for an experiment scored only by code evaluators', () => {
      expect(parseEvaluatorModelsAggregation({ evaluator_models: { buckets: [] } })).toEqual([]);
      expect(parseEvaluatorModelsAggregation(undefined)).toEqual([]);
    });
  });

  describe('SCORES_SORT_ORDER', () => {
    it('sorts by dataset, example, evaluator, then repetition', () => {
      expect(SCORES_SORT_ORDER).toEqual([
        { 'example.dataset.name': { order: 'asc' } },
        { 'example.index': { order: 'asc' } },
        { 'evaluator.name': { order: 'asc' } },
        { 'task.repetition_index': { order: 'asc' } },
      ]);
    });
  });

  describe('buildExperimentsListingFilterQuery', () => {
    const preflightExclusion = { term: { experiment_id: 'kbn-evals-preflight' } };

    it('excludes preflight experiments when no filters provided', () => {
      expect(buildExperimentsListingFilterQuery()).toEqual({
        bool: { must_not: [preflightExclusion] },
      });
    });

    it('excludes preflight experiments for empty options', () => {
      expect(buildExperimentsListingFilterQuery({})).toEqual({
        bool: { must_not: [preflightExclusion] },
      });
    });

    it('filters by suiteId', () => {
      const query = buildExperimentsListingFilterQuery({ suiteId: 'suite-a' });
      expect(query).toEqual({
        bool: {
          must_not: [preflightExclusion],
          filter: [{ term: { 'metadata.suite_id': 'suite-a' } }],
        },
      });
    });

    it('filters by modelId', () => {
      const query = buildExperimentsListingFilterQuery({ modelId: 'gpt-4' });
      expect(query).toEqual({
        bool: {
          must_not: [preflightExclusion],
          filter: [{ term: { 'task.model.id': 'gpt-4' } }],
        },
      });
    });

    it('filters by branch using wildcard', () => {
      const query = buildExperimentsListingFilterQuery({ branch: 'main' });
      expect(query).toEqual({
        bool: {
          must_not: [preflightExclusion],
          filter: [
            {
              wildcard: {
                'metadata.git.branch': {
                  value: '*main*',
                  case_insensitive: true,
                },
              },
            },
          ],
        },
      });
    });

    it('filters by search matching experiment name or branch', () => {
      const query = buildExperimentsListingFilterQuery({ search: 'in-tool' });
      expect(query).toEqual({
        bool: {
          must_not: [preflightExclusion],
          filter: [
            {
              bool: {
                should: [
                  {
                    wildcard: { experiment_name: { value: '*in-tool*', case_insensitive: true } },
                  },
                  {
                    wildcard: {
                      'metadata.git.branch': { value: '*in-tool*', case_insensitive: true },
                    },
                  },
                ],
                minimum_should_match: 1,
              },
            },
          ],
        },
      });
    });

    it('escapes wildcard metacharacters in the branch filter', () => {
      const query = buildExperimentsListingFilterQuery({ branch: 'feature/foo?bar' }) as {
        bool: { filter: Array<{ wildcard: { 'metadata.git.branch': { value: string } } }> };
      };
      expect(query.bool.filter[0].wildcard['metadata.git.branch'].value).toBe(
        '*feature/foo\\?bar*'
      );
    });

    it('escapes wildcard metacharacters in the search filter for both fields', () => {
      const query = buildExperimentsListingFilterQuery({ search: 'a*b' }) as {
        bool: {
          filter: Array<{
            bool: { should: Array<{ wildcard: Record<string, { value: string }> }> };
          }>;
        };
      };
      const should = query.bool.filter[0].bool.should;
      expect(should[0].wildcard.experiment_name.value).toBe('*a\\*b*');
      expect(should[1].wildcard['metadata.git.branch'].value).toBe('*a\\*b*');
    });

    it('filters by datasetId', () => {
      const query = buildExperimentsListingFilterQuery({ datasetId: 'dataset-1' });
      expect(query).toEqual({
        bool: {
          must_not: [preflightExclusion],
          filter: [{ term: { 'example.dataset.id': 'dataset-1' } }],
        },
      });
    });

    it('filters by datasetName', () => {
      const query = buildExperimentsListingFilterQuery({ datasetName: 'Dataset One' });
      expect(query).toEqual({
        bool: {
          must_not: [preflightExclusion],
          filter: [{ term: { 'example.dataset.name': 'Dataset One' } }],
        },
      });
    });

    it('filters by buildId', () => {
      const query = buildExperimentsListingFilterQuery({ buildId: 'bk-abc123' });
      expect(query).toEqual({
        bool: {
          must_not: [preflightExclusion],
          filter: [{ term: { 'metadata.ci.build_id': 'bk-abc123' } }],
        },
      });
    });

    it('filters by spaceId', () => {
      const query = buildExperimentsListingFilterQuery({ spaceId: 'marketing' });
      expect(query).toEqual({
        bool: {
          must_not: [preflightExclusion],
          filter: [buildSpaceFilter('marketing')],
        },
      });
    });

    it('combines all filters when all options are provided', () => {
      const query = buildExperimentsListingFilterQuery({
        suiteId: 'suite-a',
        modelId: 'gpt-4',
        branch: 'main',
        datasetId: 'dataset-1',
        datasetName: 'Dataset One',
        buildId: 'bk-abc123',
      }) as { bool: { filter: unknown[]; must_not: unknown[] } };
      expect(query.bool.filter).toHaveLength(6);
      expect(query.bool.must_not).toEqual([preflightExclusion]);
    });
  });

  describe('buildExperimentsListingAggregation', () => {
    it('sets terms size to page * perPage', () => {
      const agg = buildExperimentsListingAggregation({ page: 3, perPage: 25 });
      expect(agg.experiments.terms.size).toBe(75);
    });

    it('includes cardinality aggregation for total_experiments by metadata.execution_id', () => {
      const agg = buildExperimentsListingAggregation({ page: 1, perPage: 10 });
      expect(agg.total_experiments).toEqual({ cardinality: { field: 'metadata.execution_id' } });
    });

    it('groups by metadata.execution_id', () => {
      const agg = buildExperimentsListingAggregation({ page: 1, perPage: 10 });
      expect(agg.experiments.terms.field).toBe('metadata.execution_id');
    });

    it('sorts by latest_timestamp descending', () => {
      const agg = buildExperimentsListingAggregation({ page: 1, perPage: 10 });
      expect(agg.experiments.terms.order).toEqual({ latest_timestamp: 'desc' });
    });

    it('includes all expected sub-aggregations', () => {
      const agg = buildExperimentsListingAggregation({ page: 1, perPage: 10 });
      const subAggs = Object.keys(agg.experiments.aggs);
      expect(subAggs).toEqual(
        expect.arrayContaining([
          'latest_timestamp',
          'experiment_count',
          'experiment_name',
          'suite_id',
          'dataset_id',
          'dataset_name',
          'task_model_id',
          'task_model_family',
          'task_model_provider',
          'evaluator_models',
          'git_branch',
          'git_commit_sha',
          'total_repetitions',
          'build_url',
          'pull_request',
        ])
      );
    });

    it('collects several judge models with their own family and provider', () => {
      const agg = buildExperimentsListingAggregation({ page: 1, perPage: 10 });

      expect(agg.experiments.aggs.evaluator_models).toEqual({
        terms: { field: 'evaluator.model.id', size: 20 },
        aggs: {
          family: { terms: { field: 'evaluator.model.family', size: 1 } },
          provider: { terms: { field: 'evaluator.model.provider', size: 1 } },
        },
      });
    });
  });

  describe('parseExperimentsListingResponse', () => {
    const makeBucket = (overrides: Partial<Record<string, unknown>> = {}) => ({
      key: 'build-run-1',
      doc_count: 10,
      latest_timestamp: { value_as_string: '2025-01-01T00:00:00Z' },
      experiment_count: { value: 3 },
      experiment_name: { buckets: [{ key: 'My Experiment' }] },
      suite_id: { buckets: [{ key: 'suite-a' }] },
      dataset_id: { buckets: [{ key: 'dataset-1' }] },
      dataset_name: { buckets: [{ key: 'Dataset One' }] },
      task_model_id: { buckets: [{ key: 'gpt-4' }] },
      task_model_family: { buckets: [{ key: 'gpt-4' }] },
      task_model_provider: { buckets: [{ key: 'openai' }] },
      evaluator_models: {
        buckets: [
          {
            key: 'claude-3',
            family: { buckets: [{ key: 'claude-3' }] },
            provider: { buckets: [{ key: 'anthropic' }] },
          },
        ],
      },
      git_branch: { buckets: [{ key: 'main' }] },
      git_commit_sha: { buckets: [{ key: 'abc123' }] },
      total_repetitions: { value: 3 },
      build_url: { buckets: [{ key: 'https://buildkite.com/build/1' }] },
      pull_request: { buckets: [{ key: '12345' }] },
      ...overrides,
    });

    it('returns empty experiments and zero total for undefined aggregations', () => {
      const result = parseExperimentsListingResponse(undefined, { page: 1, perPage: 25 });
      expect(result).toEqual({ experiments: [], total: 0 });
    });

    it('returns empty experiments for empty buckets', () => {
      const result = parseExperimentsListingResponse(
        { total_experiments: { value: 0 }, experiments: { buckets: [] } },
        { page: 1, perPage: 25 }
      );
      expect(result).toEqual({ experiments: [], total: 0 });
    });

    it('parses a single bucket correctly', () => {
      const aggs = {
        total_experiments: { value: 1 },
        experiments: { buckets: [makeBucket()] },
      };
      const result = parseExperimentsListingResponse(aggs, { page: 1, perPage: 25 });

      expect(result.total).toBe(1);
      expect(result.experiments).toHaveLength(1);
      expect(result.experiments[0]).toEqual({
        execution_id: 'build-run-1',
        experiment_id: 'build-run-1',
        experiment_name: 'My Experiment',
        experiment_count: 3,
        timestamp: '2025-01-01T00:00:00Z',
        suite_id: 'suite-a',
        dataset_ids: ['dataset-1'],
        dataset_names: ['Dataset One'],
        task_model: { id: 'gpt-4', family: 'gpt-4', provider: 'openai' },
        evaluator_model: { id: 'claude-3', family: 'claude-3', provider: 'anthropic' },
        evaluator_models: [{ id: 'claude-3', family: 'claude-3', provider: 'anthropic' }],
        git_branch: 'main',
        git_commit_sha: 'abc123',
        total_repetitions: 3,
        ci: { build_url: 'https://buildkite.com/build/1', pull_request: '12345' },
      });
    });

    it('returns every distinct judge model when an experiment evaluators differ', () => {
      const aggs = {
        total_experiments: { value: 1 },
        experiments: {
          buckets: [
            makeBucket({
              evaluator_models: {
                buckets: [
                  {
                    key: 'claude-3',
                    family: { buckets: [{ key: 'Claude' }] },
                    provider: { buckets: [{ key: 'Anthropic' }] },
                  },
                  {
                    key: 'gpt-4o',
                    family: { buckets: [{ key: 'GPT' }] },
                    provider: { buckets: [{ key: 'OpenAI' }] },
                  },
                ],
              },
            }),
          ],
        },
      };

      const result = parseExperimentsListingResponse(aggs, { page: 1, perPage: 25 });

      expect(result.experiments[0].evaluator_models).toEqual([
        { id: 'claude-3', family: 'Claude', provider: 'Anthropic' },
        { id: 'gpt-4o', family: 'GPT', provider: 'OpenAI' },
      ]);
      // The singular reports the most used judge, which is the bucket ES ordered first.
      expect(result.experiments[0].evaluator_model).toEqual({
        id: 'claude-3',
        family: 'Claude',
        provider: 'Anthropic',
      });
    });

    it('omits the evaluator model for an experiment judged only by code evaluators', () => {
      const result = parseExperimentsListingResponse(
        {
          total_experiments: { value: 1 },
          experiments: { buckets: [makeBucket({ evaluator_models: { buckets: [] } })] },
        },
        { page: 1, perPage: 25 }
      );

      expect(result.experiments[0].evaluator_models).toEqual([]);
      expect(result.experiments[0].evaluator_model).toBeUndefined();
      expect(result.experiments[0].task_model).toBeDefined();
    });

    it('omits the evaluator model when the evaluator_models agg is absent', () => {
      const { evaluator_models: _omitted, ...bucketWithoutModels } = makeBucket();
      const result = parseExperimentsListingResponse(
        { total_experiments: { value: 1 }, experiments: { buckets: [bucketWithoutModels] } },
        { page: 1, perPage: 25 }
      );

      expect(result.experiments[0].evaluator_models).toEqual([]);
      expect(result.experiments[0].evaluator_model).toBeUndefined();
    });

    it('slices to the correct page window', () => {
      const buckets = Array.from({ length: 5 }, (_, i) =>
        makeBucket({ key: `build-run-${i}`, doc_count: i + 1 })
      );
      const aggs = { total_experiments: { value: 5 }, experiments: { buckets } };

      const page1 = parseExperimentsListingResponse(aggs, { page: 1, perPage: 2 });
      expect(page1.experiments.map((e) => e.execution_id)).toEqual(['build-run-0', 'build-run-1']);

      const page2 = parseExperimentsListingResponse(aggs, { page: 2, perPage: 2 });
      expect(page2.experiments.map((e) => e.execution_id)).toEqual(['build-run-2', 'build-run-3']);

      const page3 = parseExperimentsListingResponse(aggs, { page: 3, perPage: 2 });
      expect(page3.experiments.map((e) => e.execution_id)).toEqual(['build-run-4']);
    });

    it('returns empty experiments for a page beyond results', () => {
      const aggs = {
        total_experiments: { value: 1 },
        experiments: { buckets: [makeBucket()] },
      };
      const result = parseExperimentsListingResponse(aggs, { page: 5, perPage: 25 });
      expect(result.experiments).toHaveLength(0);
      expect(result.total).toBe(1);
    });

    it('falls back to null for missing git metadata and empty arrays for missing datasets', () => {
      const bucket = makeBucket({
        git_branch: { buckets: [] },
        git_commit_sha: undefined,
        dataset_id: { buckets: [] },
        dataset_name: undefined,
      });
      const aggs = { total_experiments: { value: 1 }, experiments: { buckets: [bucket] } };
      const result = parseExperimentsListingResponse(aggs, { page: 1, perPage: 25 });
      expect(result.experiments[0].git_branch).toBeNull();
      expect(result.experiments[0].git_commit_sha).toBeNull();
      expect(result.experiments[0].dataset_ids).toEqual([]);
      expect(result.experiments[0].dataset_names).toEqual([]);
    });

    it('defaults total_repetitions to 1 when missing', () => {
      const bucket = makeBucket({ total_repetitions: {} });
      const aggs = { total_experiments: { value: 1 }, experiments: { buckets: [bucket] } };
      const result = parseExperimentsListingResponse(aggs, { page: 1, perPage: 25 });
      expect(result.experiments[0].total_repetitions).toBe(1);
    });
  });

  describe('buildModelDisplayId', () => {
    it('returns id when present', () => {
      expect(buildModelDisplayId('gpt-4', 'gpt-4', 'openai')).toBe('gpt-4');
    });

    it('returns provider/family when id is undefined', () => {
      expect(buildModelDisplayId(undefined, 'gpt-4', 'openai')).toBe('openai/gpt-4');
    });

    it('returns family when only family is provided', () => {
      expect(buildModelDisplayId(undefined, 'gpt-4', undefined)).toBe('gpt-4');
    });

    it('returns provider when only provider is provided', () => {
      expect(buildModelDisplayId(undefined, undefined, 'openai')).toBe('openai');
    });

    it('returns "unknown" when all parts are undefined', () => {
      expect(buildModelDisplayId(undefined, undefined, undefined)).toBe('unknown');
    });

    it('returns "unknown" when called with no arguments', () => {
      expect(buildModelDisplayId()).toBe('unknown');
    });
  });

  describe('parseStatsAggregationResponse', () => {
    it('returns empty array for undefined aggregations', () => {
      expect(parseStatsAggregationResponse(undefined)).toEqual([]);
    });

    it('returns empty array when by_dataset has no buckets', () => {
      expect(parseStatsAggregationResponse({ by_dataset: { buckets: [] } })).toEqual([]);
    });

    it('parses a dataset with evaluator buckets', () => {
      const aggs = {
        by_dataset: {
          buckets: [
            {
              key: 'ds-1',
              dataset_name: { buckets: [{ key: 'Dataset One' }] },
              example_count: { value: 5 },
              by_evaluator: {
                buckets: [
                  {
                    key: 'correctness',
                    score_stats: { avg: 0.8, std_deviation: 0.1, min: 0.5, max: 1.0, count: 10 },
                    score_median: { values: { '50.0': 0.85 } },
                  },
                ],
              },
            },
          ],
        },
      };

      const result = parseStatsAggregationResponse(aggs);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        dataset_id: 'ds-1',
        dataset_name: 'Dataset One',
        evaluator_name: 'correctness',
        example_count: 5,
        stats: { mean: 0.8, median: 0.85, std_dev: 0.1, min: 0.5, max: 1.0, count: 10 },
      });
    });

    it('attributes each evaluator to its own judge model, and none to code evaluators', () => {
      const aggs = {
        by_dataset: {
          buckets: [
            {
              key: 'ds-1',
              dataset_name: { buckets: [{ key: 'Dataset One' }] },
              example_count: { value: 5 },
              by_evaluator: {
                buckets: [
                  {
                    key: 'correctness',
                    score_stats: {},
                    score_median: { values: {} },
                    evaluator_model_id: {
                      buckets: [
                        {
                          key: 'gpt-4o',
                          family: { buckets: [{ key: 'GPT' }] },
                          provider: { buckets: [{ key: 'OpenAI' }] },
                        },
                      ],
                    },
                  },
                  {
                    key: 'groundedness',
                    score_stats: {},
                    score_median: { values: {} },
                    evaluator_model_id: {
                      buckets: [
                        {
                          key: 'claude-sonnet-4',
                          family: { buckets: [{ key: 'Claude' }] },
                          provider: { buckets: [{ key: 'Anthropic' }] },
                        },
                      ],
                    },
                  },
                  {
                    key: 'latency',
                    score_stats: {},
                    score_median: { values: {} },
                    evaluator_model_id: { buckets: [] },
                  },
                ],
              },
            },
          ],
        },
      };

      const result = parseStatsAggregationResponse(aggs);
      expect(
        result.map(({ evaluator_name: name, evaluator_model: model }) => [name, model])
      ).toEqual([
        ['correctness', { id: 'gpt-4o', family: 'GPT', provider: 'OpenAI' }],
        ['groundedness', { id: 'claude-sonnet-4', family: 'Claude', provider: 'Anthropic' }],
        ['latency', undefined],
      ]);
    });

    it('omits the judge model when the evaluator bucket carries no model sub-aggregation', () => {
      const aggs = {
        by_dataset: {
          buckets: [
            {
              key: 'ds-1',
              dataset_name: { buckets: [{ key: 'Dataset One' }] },
              example_count: { value: 5 },
              by_evaluator: {
                buckets: [{ key: 'correctness', score_stats: {}, score_median: { values: {} } }],
              },
            },
          ],
        },
      };

      expect(parseStatsAggregationResponse(aggs)[0].evaluator_model).toBeUndefined();
    });

    it('falls back to dataset key when dataset_name bucket is empty', () => {
      const aggs = {
        by_dataset: {
          buckets: [
            {
              key: 'ds-fallback',
              dataset_name: { buckets: [] },
              example_count: { value: 3 },
              by_evaluator: {
                buckets: [
                  {
                    key: 'eval-a',
                    score_stats: {},
                    score_median: { values: {} },
                  },
                ],
              },
            },
          ],
        },
      };

      const result = parseStatsAggregationResponse(aggs);
      expect(result[0].dataset_name).toBe('ds-fallback');
      expect(result[0].example_count).toBe(3);
      expect(result[0].stats.mean).toBe(0);
    });

    it('assigns the same example_count to all evaluators in a dataset', () => {
      const aggs = {
        by_dataset: {
          buckets: [
            {
              key: 'ds-1',
              dataset_name: { buckets: [{ key: 'Dataset One' }] },
              example_count: { value: 7 },
              by_evaluator: {
                buckets: [
                  {
                    key: 'Cached Tokens',
                    score_stats: {},
                    score_median: { values: {} },
                  },
                  {
                    key: 'Criteria',
                    score_stats: { avg: 0.8, std_deviation: 0.1, min: 0.5, max: 1.0, count: 7 },
                    score_median: { values: { '50.0': 0.85 } },
                  },
                ],
              },
            },
          ],
        },
      };

      const result = parseStatsAggregationResponse(aggs);
      expect(result).toHaveLength(2);
      expect(result[0].example_count).toBe(7);
      expect(result[1].example_count).toBe(7);
      expect(result[0].evaluator_name).toBe('Cached Tokens');
      expect(result[1].evaluator_name).toBe('Criteria');
    });

    it('defaults example_count to 0 when cardinality value is null', () => {
      const aggs = {
        by_dataset: {
          buckets: [
            {
              key: 'ds-1',
              example_count: { value: null },
              by_evaluator: {
                buckets: [{ key: 'eval-a' }],
              },
            },
          ],
        },
      };

      const result = parseStatsAggregationResponse(aggs);
      expect(result[0].example_count).toBe(0);
    });

    it('defaults stats to 0 when score_stats fields are missing', () => {
      const aggs = {
        by_dataset: {
          buckets: [
            {
              key: 'ds-1',
              by_evaluator: {
                buckets: [{ key: 'eval-b' }],
              },
            },
          ],
        },
      };

      const result = parseStatsAggregationResponse(aggs);
      expect(result[0].example_count).toBe(0);
      expect(result[0].stats).toEqual({
        mean: 0,
        median: 0,
        std_dev: 0,
        min: 0,
        max: 0,
        count: 0,
      });
    });
  });
});
