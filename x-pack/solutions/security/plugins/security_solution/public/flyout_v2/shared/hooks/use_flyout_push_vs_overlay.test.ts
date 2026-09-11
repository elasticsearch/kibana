/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, act } from '@testing-library/react';
import type { Storage } from '@kbn/kibana-utils-plugin/public';
import { useSystemFlyoutType } from '@kbn/core-overlays-browser';
import {
  DEFAULT_FLYOUT_TYPE,
  getStoredFlyoutType,
  useFlyoutPushVsOverlay,
} from './use_flyout_push_vs_overlay';
import { FLYOUT_PUSH_VS_OVERLAY_LOCAL_STORAGE } from '../constants/local_storage';
import { useKibana } from '../../../common/lib/kibana';

jest.mock('../../../common/lib/kibana');
jest.mock('@kbn/core-overlays-browser', () => ({
  useSystemFlyoutType: jest.fn(),
}));

const mockStorage = { get: jest.fn(), set: jest.fn() };
const storage = mockStorage as unknown as Storage;

describe('getStoredFlyoutType', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the stored value when it is "push"', () => {
    mockStorage.get.mockReturnValue('push');
    expect(getStoredFlyoutType(storage)).toBe('push');
    expect(mockStorage.get).toHaveBeenCalledWith(FLYOUT_PUSH_VS_OVERLAY_LOCAL_STORAGE);
  });

  it('returns the stored value when it is "overlay"', () => {
    mockStorage.get.mockReturnValue('overlay');
    expect(getStoredFlyoutType(storage)).toBe('overlay');
  });

  it('falls back to the default when nothing is stored', () => {
    mockStorage.get.mockReturnValue(undefined);
    expect(getStoredFlyoutType(storage)).toBe(DEFAULT_FLYOUT_TYPE);
  });

  it('falls back to the default when the stored value is invalid', () => {
    mockStorage.get.mockReturnValue('nonsense');
    expect(getStoredFlyoutType(storage)).toBe(DEFAULT_FLYOUT_TYPE);
  });
});

describe('useFlyoutPushVsOverlay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useKibana as jest.Mock).mockReturnValue({ services: { storage: mockStorage } });
    (useSystemFlyoutType as jest.Mock).mockReturnValue(undefined);
    mockStorage.get.mockReturnValue(undefined);
  });

  it('reads the live type from the system-flyout context when present', () => {
    (useSystemFlyoutType as jest.Mock).mockReturnValue({ type: 'push', setType: jest.fn() });

    const { result } = renderHook(() => useFlyoutPushVsOverlay());

    expect(result.current.type).toBe('push');
  });

  it('falls back to the persisted preference when there is no context', () => {
    (useSystemFlyoutType as jest.Mock).mockReturnValue(undefined);
    mockStorage.get.mockReturnValue('push');

    const { result } = renderHook(() => useFlyoutPushVsOverlay());

    expect(result.current.type).toBe('push');
  });

  it('persists the choice and applies it live via the context', () => {
    const setType = jest.fn();
    (useSystemFlyoutType as jest.Mock).mockReturnValue({ type: 'overlay', setType });

    const { result } = renderHook(() => useFlyoutPushVsOverlay());
    act(() => result.current.setType('push'));

    expect(mockStorage.set).toHaveBeenCalledWith(FLYOUT_PUSH_VS_OVERLAY_LOCAL_STORAGE, 'push');
    expect(setType).toHaveBeenCalledWith('push');
  });

  it('persists the choice even when there is no open flyout context', () => {
    (useSystemFlyoutType as jest.Mock).mockReturnValue(undefined);

    const { result } = renderHook(() => useFlyoutPushVsOverlay());
    act(() => result.current.setType('overlay'));

    expect(mockStorage.set).toHaveBeenCalledWith(FLYOUT_PUSH_VS_OVERLAY_LOCAL_STORAGE, 'overlay');
  });
});
