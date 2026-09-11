/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const useDiscoverInTimelineContext = jest.fn().mockReturnValue({
  resetDiscoverAppState: jest.fn(),
  updateSavedSearch: jest.fn(),
  initializeLocalSavedSearch: jest.fn(),
  getAppStateFromSavedSearch: jest.fn(),
  defaultDiscoverAppState: {},
  discoverStateContainer: { current: undefined },
  setDiscoverStateContainer: jest.fn(),
  timelineRestorePending: { current: false },
});
