/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  fetchBrowserJourney,
  fetchLastSuccessfulCheck,
  fetchScreenshotBlockSet,
  getJourneyScreenshot,
} from './api';
import { SYNTHETICS_API_URLS } from '../../../../../common/constants';
import { apiService } from '../../../../utils/api_service';

jest.mock('../../../../utils/api_service', () => ({
  apiService: { get: jest.fn(), post: jest.fn() },
}));

describe('getJourneyScreenshot', () => {
  const url = 'http://localhost:5601/internal/uptime/journey/screenshot/checkgroup/step';
  it('returns null if the response status is not 200', async () => {
    const mockFetch = jest.fn().mockRejectedValueOnce({ status: 404 });
    (global as any).fetch = mockFetch;

    const result = await getJourneyScreenshot(url);
    expect(result).toBeNull();
  });

  it('returns a ref if `content-type` is application/json', async () => {
    const mockResponse = {
      headers: {
        get: jest.fn().mockImplementation((header) => {
          if (header === 'content-type') return 'application/json';
          if (header === 'caption-name') return 'stepName';
          if (header === 'max-steps') return '0';
        }),
      },
      json: jest.fn().mockResolvedValue({}),
      status: 200,
    };

    const mockFetch = jest.fn().mockResolvedValue(mockResponse);
    global.fetch = mockFetch;

    const result = await getJourneyScreenshot('imgSrc');
    expect(result).toEqual({
      ref: {},
      stepName: 'stepName',
      maxSteps: 0,
    });
  });

  it('returns a blob when `content-type` is not application/json', async () => {
    const mockResponse = {
      headers: {
        get: jest.fn().mockImplementation((header) => {
          if (header === 'content-type') return 'image/jpeg';
          if (header === 'caption-name') return 'stepName';
          if (header === 'max-steps') return '0';
        }),
      },
      blob: jest.fn().mockResolvedValue(new Blob()),
      status: 200,
    };

    const mockFetch = jest.fn().mockResolvedValue(mockResponse);
    global.fetch = mockFetch;

    const result = await getJourneyScreenshot(url);
    expect(result).toEqual({
      src: expect.any(String),
      stepName: 'stepName',
      maxSteps: 0,
    });
  });

  it('does not retry if `shouldBackoff` is false', async () => {
    const mockResponse = {
      headers: {
        get: jest.fn().mockImplementation((header) => {
          if (header === 'content-type') return 'image/jpeg';
          if (header === 'caption-name') return 'stepName';
          if (header === 'max-steps') return '0';
        }),
      },
      blob: jest.fn().mockResolvedValue(new Blob()),
      status: 404,
    };

    const mockFetch = jest.fn().mockResolvedValue(mockResponse);
    global.fetch = mockFetch;

    const result = await getJourneyScreenshot(url, { shouldBackoff: false });
    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('will retry `n` times', async () => {
    const mockFailResponse = {
      headers: {
        get: jest.fn().mockImplementation((header) => {
          if (header === 'content-type') return 'image/jpeg';
          if (header === 'caption-name') return 'stepName';
          if (header === 'max-steps') return '0';
        }),
      },
      blob: jest.fn().mockResolvedValue(new Blob()),
      status: 404,
    };
    const mockSuccessResponse = {
      headers: {
        get: jest.fn().mockImplementation((header) => {
          if (header === 'content-type') return 'application/json';
          if (header === 'caption-name') return 'stepName';
          if (header === 'max-steps') return '0';
        }),
      },
      json: jest.fn().mockResolvedValue({}),
      status: 200,
    };
    let fetchCount = 0;

    const mockFetch = jest.fn().mockImplementation(() => {
      fetchCount++;
      if (fetchCount > 4) {
        return mockSuccessResponse;
      }
      return mockFailResponse;
    });
    global.fetch = mockFetch;

    const result = await getJourneyScreenshot(url);
    expect(result).toEqual({
      ref: {},
      stepName: 'stepName',
      maxSteps: 0,
    });
  });

  it('will return null when retry is exhausted', async () => {
    const maxRetry = 3;
    const initialBackoff = 10;
    const mockResponse = {
      headers: {
        get: jest.fn().mockImplementation((header) => {
          if (header === 'content-type') return 'image/jpeg';
          if (header === 'caption-name') return 'stepName';
          if (header === 'max-steps') return '0';
        }),
      },
      blob: jest.fn().mockResolvedValue(new Blob()),
      status: 404,
    };

    const mockFetch = jest.fn().mockReturnValue(mockResponse);
    global.fetch = mockFetch;

    const result = await getJourneyScreenshot(url, {
      shouldBackoff: true,
      maxRetry,
      initialBackoff,
    });
    expect(result).toBeNull();
    expect(mockFetch).toBeCalledTimes(maxRetry + 1);
  });
});

describe('fetchBrowserJourney remoteName plumbing', () => {
  const mockGet = apiService.get as jest.Mock;

  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({});
  });

  it('omits the remoteName query param for local monitors', async () => {
    await fetchBrowserJourney({ checkGroup: 'cg-1' });

    expect(mockGet).toHaveBeenCalledWith(
      SYNTHETICS_API_URLS.JOURNEY.replace('{checkGroup}', 'cg-1'),
      undefined,
      expect.anything()
    );
  });

  it('forwards remoteName to apiService.get when present', async () => {
    await fetchBrowserJourney({ checkGroup: 'cg-1', remoteName: 'remote-a' });

    expect(mockGet).toHaveBeenCalledWith(
      SYNTHETICS_API_URLS.JOURNEY.replace('{checkGroup}', 'cg-1'),
      { remoteName: 'remote-a' },
      expect.anything()
    );
  });

  it('forwards the run timestamp to apiService.get when present', async () => {
    await fetchBrowserJourney({ checkGroup: 'cg-1', timestamp: '2023-01-01T00:00:00.000Z' });

    expect(mockGet).toHaveBeenCalledWith(
      SYNTHETICS_API_URLS.JOURNEY.replace('{checkGroup}', 'cg-1'),
      { timestamp: '2023-01-01T00:00:00.000Z' },
      expect.anything()
    );
  });

  it('forwards both remoteName and timestamp when present', async () => {
    await fetchBrowserJourney({
      checkGroup: 'cg-1',
      remoteName: 'remote-a',
      timestamp: '2023-01-01T00:00:00.000Z',
    });

    expect(mockGet).toHaveBeenCalledWith(
      SYNTHETICS_API_URLS.JOURNEY.replace('{checkGroup}', 'cg-1'),
      { remoteName: 'remote-a', timestamp: '2023-01-01T00:00:00.000Z' },
      expect.anything()
    );
  });

  it('forwards stepsOnly to apiService.get when set', async () => {
    await fetchBrowserJourney({ checkGroup: 'cg-1', stepsOnly: true });

    expect(mockGet).toHaveBeenCalledWith(
      SYNTHETICS_API_URLS.JOURNEY.replace('{checkGroup}', 'cg-1'),
      { stepsOnly: true },
      expect.anything()
    );
  });

  it('omits stepsOnly when not set', async () => {
    await fetchBrowserJourney({ checkGroup: 'cg-1', timestamp: '2023-01-01T00:00:00.000Z' });

    expect(mockGet).toHaveBeenCalledWith(
      SYNTHETICS_API_URLS.JOURNEY.replace('{checkGroup}', 'cg-1'),
      { timestamp: '2023-01-01T00:00:00.000Z' },
      expect.anything()
    );
  });
});

describe('fetchScreenshotBlockSet remoteName plumbing', () => {
  const mockPost = apiService.post as jest.Mock;

  beforeEach(() => {
    mockPost.mockReset();
    mockPost.mockResolvedValue({ result: [] });
  });

  it('omits the remoteName body field for local monitors', async () => {
    await fetchScreenshotBlockSet(['h1', 'h2']);

    expect(mockPost).toHaveBeenCalledWith(SYNTHETICS_API_URLS.JOURNEY_SCREENSHOT_BLOCKS, {
      hashes: ['h1', 'h2'],
    });
  });

  it('forwards remoteName in the request body when present', async () => {
    await fetchScreenshotBlockSet(['h1', 'h2'], 'remote-a');

    expect(mockPost).toHaveBeenCalledWith(SYNTHETICS_API_URLS.JOURNEY_SCREENSHOT_BLOCKS, {
      hashes: ['h1', 'h2'],
      remoteName: 'remote-a',
    });
  });
});

describe('fetchLastSuccessfulCheck remoteName plumbing', () => {
  const mockGet = apiService.get as jest.Mock;
  const baseParams = {
    monitorId: 'm-1',
    timestamp: '2025-01-01T00:00:00Z',
    stepIndex: 1,
    location: 'us-east',
  };

  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({});
  });

  it('omits the remoteName query param for local monitors', async () => {
    await fetchLastSuccessfulCheck(baseParams);

    expect(mockGet).toHaveBeenCalledWith(
      SYNTHETICS_API_URLS.SYNTHETICS_SUCCESSFUL_CHECK,
      baseParams,
      expect.anything()
    );
  });

  it('forwards remoteName to apiService.get when present', async () => {
    await fetchLastSuccessfulCheck({ ...baseParams, remoteName: 'remote-a' });

    expect(mockGet).toHaveBeenCalledWith(
      SYNTHETICS_API_URLS.SYNTHETICS_SUCCESSFUL_CHECK,
      { ...baseParams, remoteName: 'remote-a' },
      expect.anything()
    );
  });
});
