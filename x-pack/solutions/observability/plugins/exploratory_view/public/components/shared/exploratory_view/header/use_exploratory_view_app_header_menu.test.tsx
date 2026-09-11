/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import {
  ADD_TO_CASE_BUTTON_TEST_SUBJ,
  EMBED_BUTTON_TEST_SUBJ,
  OPEN_IN_LENS_BUTTON_TEST_SUBJ,
  SAVE_BUTTON_TEST_SUBJ,
  useExploratoryViewAppHeaderMenu,
} from './use_exploratory_view_app_header_menu';

describe('useExploratoryViewAppHeaderMenu', () => {
  const handlers = {
    onSave: jest.fn(),
    onOpenInLens: jest.fn(),
    onAddToCase: jest.fn(),
    onEmbed: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('orders Open in Lens, Add to case, then overflow Embed, with Save as primary', () => {
    const { result } = renderHook(() =>
      useExploratoryViewAppHeaderMenu({
        canUseEditor: true,
        hasLensAttributes: true,
        hasTimeRange: true,
        isDev: true,
        ...handlers,
      })
    );

    expect(result.current.items?.map((item) => item.id)).toEqual([
      'openInLens',
      'addToCase',
      'embed',
    ]);
    expect(result.current.items?.[0]).toEqual(
      expect.objectContaining({
        testId: OPEN_IN_LENS_BUTTON_TEST_SUBJ,
        disableButton: false,
      })
    );
    expect(result.current.items?.[1]).toEqual(
      expect.objectContaining({
        testId: ADD_TO_CASE_BUTTON_TEST_SUBJ,
        disableButton: false,
      })
    );
    expect(result.current.items?.[2]).toEqual(
      expect.objectContaining({
        testId: EMBED_BUTTON_TEST_SUBJ,
        overflow: true,
        disableButton: false,
      })
    );
    expect(result.current.primaryActionItem).toEqual(
      expect.objectContaining({
        id: 'save',
        testId: SAVE_BUTTON_TEST_SUBJ,
        disableButton: false,
      })
    );
  });

  it('disables Save and Open in Lens when the editor cannot be used', () => {
    const { result } = renderHook(() =>
      useExploratoryViewAppHeaderMenu({
        canUseEditor: false,
        hasLensAttributes: true,
        hasTimeRange: true,
        isDev: true,
        ...handlers,
      })
    );

    expect(result.current.primaryActionItem?.disableButton).toBe(true);
    expect(result.current.items?.[0].disableButton).toBe(true);
  });

  it('runs the configured actions', () => {
    const { result } = renderHook(() =>
      useExploratoryViewAppHeaderMenu({
        canUseEditor: true,
        hasLensAttributes: true,
        hasTimeRange: true,
        isDev: true,
        ...handlers,
      })
    );

    result.current.primaryActionItem?.run?.();
    result.current.items?.[0].run?.();
    result.current.items?.[1].run?.();
    result.current.items?.[2].run?.();

    expect(handlers.onSave).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenInLens).toHaveBeenCalledTimes(1);
    expect(handlers.onAddToCase).toHaveBeenCalledTimes(1);
    expect(handlers.onEmbed).toHaveBeenCalledTimes(1);
  });

  it('omits Embed outside dev mode', () => {
    const { result } = renderHook(() =>
      useExploratoryViewAppHeaderMenu({
        canUseEditor: true,
        hasLensAttributes: true,
        hasTimeRange: true,
        isDev: false,
        ...handlers,
      })
    );

    expect(result.current.items?.map((item) => item.id)).toEqual(['openInLens', 'addToCase']);
  });
});
