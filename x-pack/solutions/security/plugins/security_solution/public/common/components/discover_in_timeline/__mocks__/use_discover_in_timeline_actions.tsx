/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const defaultDiscoverTimeRange = {
  from: 'now-15m',
  to: 'now',
  mode: 'relative' as const,
};

export const useDiscoverInTimelineActions = () => {
  return {
    resetDiscoverAppState: jest.fn().mockResolvedValue(true),
    updateSavedSearch: jest.fn(),
    getAppStateFromSavedSearch: jest.fn(),
    timelineRestorePending: { current: false },
    defaultDiscoverAppState: {
      query: {
        query: '',
        language: 'esql',
      },
      sort: [['@timestamp', 'desc']],
      columns: [],
      index: 'security-solution-default',
      interval: 'auto',
      filters: [],
      hideChart: false,
      grid: {},
    },
  };
};
