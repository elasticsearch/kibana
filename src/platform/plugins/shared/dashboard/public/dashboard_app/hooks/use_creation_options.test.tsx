/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScopedHistory } from '@kbn/core-application-browser';
import type { IKbnUrlStateStorage } from '@kbn/kibana-utils-plugin/public';
import { renderHook } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { BehaviorSubject } from 'rxjs';

import { screenshotModeService, coreServices } from '../../services/kibana_services';
import { DASHBOARD_AS_CODE_FILTERS_FEATURE_FLAG } from '../../dashboard_constants';
import { useCreationOptions } from './use_creation_options';
import { extractDashboardState, loadAndRemoveDashboardState } from '../url';
import {
  getSearchSessionIdFromURL,
  getSessionURLObservable,
} from '../url/search_sessions_integration';

const mockKbnUrlStateStorage = {
  get: jest.fn(),
} as unknown as IKbnUrlStateStorage;

jest.mock('../url', () => ({
  extractDashboardState: jest.fn(),
  loadAndRemoveDashboardState: jest.fn(),
}));

jest.mock('../url/search_sessions_integration', () => ({
  createSessionRestorationDataProvider: jest.fn(),
  getSearchSessionIdFromURL: jest.fn(),
  getSessionURLObservable: jest.fn(),
  removeSearchSessionIdFromURL: jest.fn(),
}));

describe('useCreationOptions', () => {
  const validateOutcome = jest.fn().mockReturnValue('valid');

  beforeEach(() => {
    jest.clearAllMocks();

    jest.spyOn(screenshotModeService, 'isScreenshotMode').mockReturnValue(false);
    jest.spyOn(screenshotModeService, 'getScreenshotContext').mockReturnValue(undefined);
    (mockKbnUrlStateStorage.get as jest.Mock).mockReturnValue(undefined);
    (extractDashboardState as jest.Mock).mockReturnValue({});
    (loadAndRemoveDashboardState as jest.Mock).mockReturnValue({});
    (getSearchSessionIdFromURL as jest.Mock).mockReturnValue(undefined);
    (getSessionURLObservable as jest.Mock).mockReturnValue(
      new BehaviorSubject<string | undefined>(undefined)
    );
    coreServices.featureFlags.getBooleanValue = jest
      .fn()
      .mockImplementation((flag, defaultValue) =>
        flag === DASHBOARD_AS_CODE_FILTERS_FEATURE_FLAG ? false : defaultValue
      );
  });

  it('clears history.state after merging locator dashboard payload', async () => {
    const history = createMemoryHistory();
    const replaceSpy = jest.spyOn(history, 'replace');
    history.replace({
      pathname: '/',
      search: '',
      hash: '',
      state: {
        title: 'From locator',
        viewMode: 'edit',
      },
    });
    replaceSpy.mockClear();
    (extractDashboardState as jest.Mock).mockReturnValue({
      title: 'From locator',
      viewMode: 'edit',
    });

    const { result } = renderHook(() =>
      useCreationOptions({
        history,
        getScopedHistory: () => history as unknown as ScopedHistory,
        kbnUrlStateStorage: mockKbnUrlStateStorage,
        validateOutcome,
        incomingEmbeddables: undefined,
      })
    );

    const creationOptions = await result.current();
    expect(creationOptions.getInitialInput?.()).toEqual({
      title: 'From locator',
      viewMode: 'edit',
    });
    expect(replaceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/',
        search: '',
        hash: '',
        state: undefined,
      })
    );
    expect(history.location.state).toBeUndefined();
  });

  it('adds dashboard as-code feature flag setting into unifiedSearchSettings', async () => {
    coreServices.featureFlags.getBooleanValue = jest
      .fn()
      .mockImplementation((flag, defaultValue) =>
        flag === DASHBOARD_AS_CODE_FILTERS_FEATURE_FLAG ? true : defaultValue
      );
    const history = createMemoryHistory();

    const { result } = renderHook(() =>
      useCreationOptions({
        history,
        getScopedHistory: () => history as unknown as ScopedHistory,
        kbnUrlStateStorage: mockKbnUrlStateStorage,
        validateOutcome,
        incomingEmbeddables: undefined,
      })
    );

    const creationOptions = await result.current();
    expect(creationOptions.unifiedSearchSettings).toEqual({
      kbnUrlStateStorage: mockKbnUrlStateStorage,
      useAsCodeFilters: true,
    });
  });

  it('does not clear history.state when there is no locator dashboard payload', async () => {
    const history = createMemoryHistory();
    const replaceSpy = jest.spyOn(history, 'replace');
    history.replace({
      pathname: '/',
      search: '',
      hash: '',
      state: { notConsumedByDashboardExtract: true },
    });
    replaceSpy.mockClear();

    const { result } = renderHook(() =>
      useCreationOptions({
        history,
        getScopedHistory: () => history as unknown as ScopedHistory,
        kbnUrlStateStorage: mockKbnUrlStateStorage,
        validateOutcome,
        incomingEmbeddables: undefined,
      })
    );

    const creationOptions = await result.current();
    creationOptions.getInitialInput?.();

    expect(replaceSpy).not.toHaveBeenCalled();
    expect(history.location.state).toEqual({
      notConsumedByDashboardExtract: true,
    });
  });
});
