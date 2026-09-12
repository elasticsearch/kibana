/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useCompleteBadgeStyles } from './use_complete_status_badge_styles';

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    useEuiTheme: () => ({
      euiTheme: {
        colors: {
          success: '#000',
          backgroundBaseSuccess: '#111',
          plainDark: '#222',
          textSuccess: '#333',
        },
      },
    }),
  };
});

const mockUseDarkMode = jest.fn(() => false);
jest.mock('@kbn/react-kibana-context-theme', () => ({
  ...jest.requireActual('@kbn/react-kibana-context-theme'),
  useKibanaIsDarkMode: () => mockUseDarkMode(),
}));

describe('useCompleteBadgeStyles', () => {
  it('returns the correct styles for dark mode', () => {
    mockUseDarkMode.mockReturnValue(true);

    const { result } = renderHook(() => useCompleteBadgeStyles());
    expect(result.current.styles).toMatchInlineSnapshot(
      `"background-color:#000;color:#222;text-decoration:none;label:isDarkMode"`
    );
  });

  it('returns the correct styles for light mode', () => {
    mockUseDarkMode.mockReturnValue(false);

    const { result } = renderHook(() => useCompleteBadgeStyles());
    expect(result.current.styles).toMatchInlineSnapshot(
      `"background-color:#111;color:#333;text-decoration:none;label:isDarkMode"`
    );
  });
});
