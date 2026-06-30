/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiThemeComputed } from '@elastic/eui';
import { ExecutionStatus } from '@kbn/workflows';
import { getExecutionStatusVisual } from './get_execution_status_color';

// Minimal mock theme — only the color tokens actually read by the function.
const mockTheme = {
  colors: {
    vis: { euiColorVisSuccess0: '#mock-success-vis' },
    backgroundBaseSuccess: '#mock-bg-success',
    danger: '#mock-danger',
    backgroundBaseDanger: '#mock-bg-danger',
    accent: '#mock-accent',
    backgroundBaseAccent: '#mock-bg-accent',
    textSubdued: '#mock-subdued',
    backgroundBaseSubdued: '#mock-bg-subdued',
    warning: '#mock-warning',
    backgroundBaseWarning: '#mock-bg-warning',
    borderBaseFloating: '#mock-border',
    backgroundBasePlain: '#mock-plain',
  },
} as unknown as EuiThemeComputed;

describe('getExecutionStatusVisual', () => {
  it('returns success icon for COMPLETED', () => {
    const { iconType, isSpinner } = getExecutionStatusVisual(mockTheme, ExecutionStatus.COMPLETED);
    expect(iconType).toBe('checkInCircleFilled');
    expect(isSpinner).toBeUndefined();
  });

  it('returns danger icon for FAILED', () => {
    const { iconType } = getExecutionStatusVisual(mockTheme, ExecutionStatus.FAILED);
    expect(iconType).toBe('crossInACircleFilled');
  });

  it('returns danger icon for TIMED_OUT', () => {
    const { iconType } = getExecutionStatusVisual(mockTheme, ExecutionStatus.TIMED_OUT);
    expect(iconType).toBe('crossInACircleFilled');
  });

  it('returns spinner play icon for RUNNING', () => {
    const { iconType, isSpinner } = getExecutionStatusVisual(mockTheme, ExecutionStatus.RUNNING);
    expect(iconType).toBe('play');
    expect(isSpinner).toBe(true);
  });

  it('returns skipped icon for SKIPPED', () => {
    const { iconType } = getExecutionStatusVisual(mockTheme, ExecutionStatus.SKIPPED);
    expect(iconType).toBe('minusInCircle');
  });

  it('returns clock icon for WAITING', () => {
    const { iconType } = getExecutionStatusVisual(mockTheme, ExecutionStatus.WAITING);
    expect(iconType).toBe('clock');
  });

  it('returns clock icon for WAITING_FOR_INPUT', () => {
    const { iconType } = getExecutionStatusVisual(mockTheme, ExecutionStatus.WAITING_FOR_INPUT);
    expect(iconType).toBe('clock');
  });

  it('returns subdued icon for CANCELLED', () => {
    const { iconType } = getExecutionStatusVisual(mockTheme, ExecutionStatus.CANCELLED);
    expect(iconType).toBe('crossInACircleFilled');
  });

  it('returns clock icon for PENDING', () => {
    const { iconType } = getExecutionStatusVisual(mockTheme, ExecutionStatus.PENDING);
    expect(iconType).toBe('clock');
  });

  it('returns empty icon for null (no execution yet)', () => {
    const { iconType } = getExecutionStatusVisual(mockTheme, null);
    expect(iconType).toBe('empty');
  });

  it('returns empty icon for undefined (no execution yet)', () => {
    const { iconType } = getExecutionStatusVisual(mockTheme, undefined);
    expect(iconType).toBe('empty');
  });

  it('COMPLETED bg matches the success background token', () => {
    const { bg } = getExecutionStatusVisual(mockTheme, ExecutionStatus.COMPLETED);
    expect(bg).toBe(mockTheme.colors.backgroundBaseSuccess);
  });

  it('FAILED bg matches the danger background token', () => {
    const { bg } = getExecutionStatusVisual(mockTheme, ExecutionStatus.FAILED);
    expect(bg).toBe(mockTheme.colors.backgroundBaseDanger);
  });

  it('RUNNING bg matches the accent background token', () => {
    const { bg } = getExecutionStatusVisual(mockTheme, ExecutionStatus.RUNNING);
    expect(bg).toBe(mockTheme.colors.backgroundBaseAccent);
  });
});
