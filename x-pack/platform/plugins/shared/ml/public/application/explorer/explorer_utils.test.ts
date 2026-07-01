/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ML_RESULTS_INDEX_PATTERN } from '../../../common/constants/index_patterns';
import type { GroupObj } from '../components/job_selector/job_selector';
import type { ExplorerJob } from './explorer_utils';
import { getAnomalyResultsIndexPattern, getMergedGroupsAndJobsIds } from './explorer_utils';

describe('getAnomalyResultsIndexPattern', () => {
  it('should create correct index pattern format from a list of Explorer jobs', () => {
    const mockExplorerJobs: ExplorerJob[] = [
      {
        id: 'job-1',
        selected: true,
        bucketSpanSeconds: 3600,
        modelPlotEnabled: false,
      },
      {
        id: 'job-2',
        selected: false,
        bucketSpanSeconds: 7200,
        modelPlotEnabled: true,
        sourceIndices: ['index-1'],
        groups: ['group-1'],
      },
    ];

    const result = getAnomalyResultsIndexPattern(mockExplorerJobs);

    expect(result).toEqual({
      title: ML_RESULTS_INDEX_PATTERN,
      fields: [
        {
          name: 'job-1',
          type: 'string',
          aggregatable: true,
          searchable: true,
        },
        {
          name: 'job-2',
          type: 'string',
          aggregatable: true,
          searchable: true,
        },
      ],
    });
  });

  it('should handle empty jobs array', () => {
    const result = getAnomalyResultsIndexPattern([]);

    expect(result).toEqual({
      title: ML_RESULTS_INDEX_PATTERN,
      fields: [],
    });
  });
});

describe('getMergedGroupsAndJobsIds', () => {
  it('should merge group ids and standalone job ids correctly', () => {
    const mockGroups: GroupObj[] = [
      {
        groupId: 'group-1',
        jobIds: ['job-1', 'job-2'],
      },
      {
        groupId: 'group-2',
        jobIds: ['job-3', 'job-4'],
      },
    ];

    const mockSelectedJobs: ExplorerJob[] = [
      {
        id: 'job-1', // part of group-1
        selected: true,
        bucketSpanSeconds: 3600,
        modelPlotEnabled: false,
      },
      {
        id: 'job-5', // standalone job
        selected: true,
        bucketSpanSeconds: 3600,
        modelPlotEnabled: false,
      },
      {
        id: 'job-6', // standalone job
        selected: true,
        bucketSpanSeconds: 3600,
        modelPlotEnabled: false,
      },
    ];

    const result = getMergedGroupsAndJobsIds(mockGroups, mockSelectedJobs);

    expect(result).toEqual(['group-1', 'group-2', 'job-5', 'job-6']);
  });

  it('should handle empty groups and jobs', () => {
    const result = getMergedGroupsAndJobsIds([], []);

    expect(result).toEqual([]);
  });

  it('should handle overlapping jobs between groups', () => {
    const mockGroups: GroupObj[] = [
      {
        groupId: 'group-1',
        jobIds: ['job-1', 'job-2'],
      },
      {
        groupId: 'group-2',
        jobIds: ['job-2', 'job-3'], // job-2 is in both groups
      },
    ];

    const mockSelectedJobs: ExplorerJob[] = [
      {
        id: 'job-4',
        selected: true,
        bucketSpanSeconds: 3600,
        modelPlotEnabled: false,
      },
    ];

    const result = getMergedGroupsAndJobsIds(mockGroups, mockSelectedJobs);

    expect(result).toEqual(['group-1', 'group-2', 'job-4']);
  });

  it('should handle groups with no jobs', () => {
    const mockGroups: GroupObj[] = [
      {
        groupId: 'group-1',
        jobIds: [],
      },
      {
        groupId: 'group-2',
        jobIds: ['job-1'],
      },
    ];

    const mockSelectedJobs: ExplorerJob[] = [
      {
        id: 'job-2',
        selected: true,
        bucketSpanSeconds: 3600,
        modelPlotEnabled: false,
      },
    ];

    const result = getMergedGroupsAndJobsIds(mockGroups, mockSelectedJobs);

    expect(result).toEqual(['group-1', 'group-2', 'job-2']);
  });
});
