/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import 'jest-canvas-mock';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { render } from '../../../utils/testing/rtl_helpers';
import { JourneyScreenshotDialog, getScreenshotUrl } from './journey_screenshot_dialog';

const testCheckGroup = 'test-check-group';
const testImgUrl1 = 'test-img-url-1';

const testImageDataResult = {
  ['/internal/uptime/journey/screenshot/test-check-group/1']: {
    attempts: 1,
    data: {},
    url: 'http://localhost/test-img-url-1',
    stepName: 'First step',
    loading: false,
    maxSteps: 2,
  },
  ['/internal/uptime/journey/screenshot/test-check-group/2']: {
    attempts: 1,
    data: {},
    url: 'http://localhost/test-img-url-2',
    stepName: 'Second step',
    loading: true,
    maxSteps: 2,
  },
};
jest.mock('../monitor_test_result/use_retrieve_step_image', () => ({
  useRetrieveStepImage: () => testImageDataResult,
}));

describe('JourneyScreenshotDialog', () => {
  const onCloseMock = jest.fn();

  const testProps = {
    checkGroup: testCheckGroup,
    initialImgSrc: testImgUrl1,
    initialStepNumber: 1,
    maxSteps: 2,
    isOpen: true,
    onClose: onCloseMock,
  };

  afterAll(() => {
    jest.clearAllMocks();
  });

  it('renders without errors', () => {
    expect(() => render(<JourneyScreenshotDialog {...testProps} />)).not.toThrowError();
  });

  it('shows loading indicator when image is loading', async () => {
    const { getByTestId, queryByTestId } = render(<JourneyScreenshotDialog {...testProps} />);

    expect(queryByTestId('screenshotImageLoadingProgress')).not.toBeInTheDocument();
    await userEvent.click(getByTestId('screenshotImageNextButton'));
  });

  it('respects maxSteps', async () => {
    const { getByTestId, queryByTestId } = render(<JourneyScreenshotDialog {...testProps} />);

    expect(queryByTestId('screenshotImageLoadingProgress')).not.toBeInTheDocument();
    await userEvent.click(getByTestId('screenshotImageNextButton'));
    expect(getByTestId('screenshotImageNextButton')).toHaveProperty('disabled');
  });

  it('shows correct image source and step name', () => {
    const { getByText, queryByTestId } = render(<JourneyScreenshotDialog {...testProps} />);
    expect(queryByTestId('stepScreenshotThumbnail')).toHaveProperty(
      'src',
      'http://localhost/test-img-url-1'
    );
    expect(getByText('Step: 1 of 1')).toBeInTheDocument();
  });
});

describe('getScreenshotUrl', () => {
  const basePath = '/abc';

  it('returns empty string when checkGroup is missing', () => {
    expect(getScreenshotUrl({ basePath, checkGroup: undefined, stepNumber: 1 })).toBe('');
  });

  it('returns a path without remoteName query param for local monitors', () => {
    expect(getScreenshotUrl({ basePath, checkGroup: 'cg-1', stepNumber: 2 })).toBe(
      '/abc/internal/synthetics/journey/screenshot/cg-1/2'
    );
  });

  it('appends a url-encoded remoteName query param for remote monitors', () => {
    expect(
      getScreenshotUrl({ basePath, checkGroup: 'cg-1', stepNumber: 2, remoteName: 'remote a' })
    ).toBe('/abc/internal/synthetics/journey/screenshot/cg-1/2?remoteName=remote%20a');
  });

  it('appends a url-encoded timestamp query param when provided', () => {
    expect(
      getScreenshotUrl({
        basePath,
        checkGroup: 'cg-1',
        stepNumber: 2,
        timestamp: '2023-01-01T00:00:00.000Z',
      })
    ).toBe(
      '/abc/internal/synthetics/journey/screenshot/cg-1/2?timestamp=2023-01-01T00%3A00%3A00.000Z'
    );
  });

  it('appends both remoteName and timestamp query params when provided', () => {
    expect(
      getScreenshotUrl({
        basePath,
        checkGroup: 'cg-1',
        stepNumber: 2,
        remoteName: 'remote a',
        timestamp: '2023-01-01T00:00:00.000Z',
      })
    ).toBe(
      '/abc/internal/synthetics/journey/screenshot/cg-1/2?remoteName=remote%20a&timestamp=2023-01-01T00%3A00%3A00.000Z'
    );
  });
});
