/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook } from '@testing-library/react';
import { EuiProvider } from '@elastic/eui';
import { useDefaultDocumentFlyoutProperties } from './use_default_flyout_properties';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <EuiProvider highContrastMode={false}>{children}</EuiProvider>
);

describe('useDefaultDocumentFlyoutProperties', () => {
  it('returns the expected document flyout properties', () => {
    const { result } = renderHook(() => useDefaultDocumentFlyoutProperties(), { wrapper });

    expect(result.current).toEqual(
      expect.objectContaining({
        ownFocus: false,
        paddingSize: 'm',
        resizable: true,
        size: 's',
      })
    );
    expect(typeof result.current.maxWidth).toBe('number');
    expect(typeof result.current.minWidth).toBe('number');
  });

  // Regression: the hook used to return a brand-new object on every render,
  // which caused an infinite render loop in `AlertsTableComponent` because
  // the value feeds an effect that writes to the alerts pagination external
  // store and the component subscribes to that store via
  // `useSyncExternalStore`. Memoizing the result is what breaks the loop.
  it('returns a stable reference across renders so it can be used as an effect dependency', () => {
    const { result, rerender } = renderHook(() => useDefaultDocumentFlyoutProperties(), {
      wrapper,
    });

    const initial = result.current;
    rerender();
    rerender();

    expect(result.current).toBe(initial);
  });
});
