/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, renderHook } from '@testing-library/react';

import type { CoreStart } from '@kbn/core/public';
import { themeServiceMock } from '@kbn/core/public/mocks';

import { useAppDependencies } from '../app_dependencies';
import { ToastNotificationText, useToastNotificationText } from './toast_notification_text';

jest.mock('../app_dependencies');
jest.mock('@kbn/react-kibana-mount', () => ({
  toMountPoint: jest.fn((element: React.ReactElement) => element),
}));

describe('ToastNotificationText', () => {
  test('should render the text as plain text', () => {
    const props = {
      overlays: {} as CoreStart['overlays'],
      text: 'a short text message',
      theme: themeServiceMock.createStartContract(),
    };
    const { container } = render(<ToastNotificationText {...props} />);
    expect(container.textContent).toBe('a short text message');
  });

  test('should render the text within a modal', () => {
    const props = {
      overlays: {} as CoreStart['overlays'],
      text: 'a text message that is longer than 140 characters. a text message that is longer than 140 characters. a text message that is longer than 140 characters. ',
      theme: themeServiceMock.createStartContract(),
    };
    const { container } = render(<ToastNotificationText {...props} />);
    expect(container.textContent).toBe(
      'a text message that is longer than 140 characters. a text message that is longer than 140 characters. a text message that is longer than 140 ...View details'
    );
  });
});

describe('useToastNotificationText', () => {
  const SHORT_TEXT = 'a short text message';
  const LONG_TEXT =
    'a text message that is longer than 140 characters. a text message that is longer than 140 characters. a text message that is longer than 140 characters. ';
  const BOUNDARY_TEXT = 'a'.repeat(140);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns plain string for short text', () => {
    const { result } = renderHook(() => useToastNotificationText());
    const output = result.current(SHORT_TEXT);

    expect(output.text).toBe(SHORT_TEXT);
    expect(output.actionProps).toBeUndefined();
  });

  test('returns plain string for text exactly at the 140 character limit', () => {
    const { result } = renderHook(() => useToastNotificationText());
    const output = result.current(BOUNDARY_TEXT);

    expect(output.text).toBe(BOUNDARY_TEXT);
    expect(output.actionProps).toBeUndefined();
  });

  test('returns truncated preview and actionProps for text exceeding 140 characters', () => {
    const { result } = renderHook(() => useToastNotificationText());
    const output = result.current(LONG_TEXT);

    const { container } = render(output.text as unknown as React.ReactElement);

    expect(container).toHaveTextContent(`${LONG_TEXT.substring(0, 140)} ...`);
    expect(output.actionProps?.primary?.children).toBe('View details');
  });

  test('returns plain message string for object with short message', () => {
    const { result } = renderHook(() => useToastNotificationText());
    const output = result.current({ message: SHORT_TEXT });

    expect(output.text).toBe(SHORT_TEXT);
    expect(output.actionProps).toBeUndefined();
  });

  test('returns truncated preview and actionProps for object with long message', () => {
    const { result } = renderHook(() => useToastNotificationText());
    const output = result.current({ message: LONG_TEXT });

    const { container } = render(output.text as unknown as React.ReactElement);

    expect(container).toHaveTextContent(`${LONG_TEXT.substring(0, 140)} ...`);
    expect(output.actionProps?.primary?.children).toBe('View details');
  });

  test('returns JSON preview and actionProps for object without message property', () => {
    const messageObj = { code: 'ERR', reason: 'something went wrong' };
    const { result } = renderHook(() => useToastNotificationText());
    const output = result.current(messageObj);

    const { container } = render(output.text as unknown as React.ReactElement);

    expect(container).toHaveTextContent(JSON.stringify(messageObj, null, 2), {
      normalizeWhitespace: false,
    });
    expect(output.actionProps).toBeDefined();
  });

  test('opens a modal when the primary action is clicked', () => {
    const { result } = renderHook(() => useToastNotificationText());
    const appDeps = useAppDependencies();
    const output = result.current(LONG_TEXT);

    output.actionProps?.primary?.onClick?.({} as never);

    expect(appDeps.overlays.openModal).toHaveBeenCalledTimes(1);
  });
});
