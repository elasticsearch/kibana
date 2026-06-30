/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiService } from '../../../../utils/api_service';
import type {
  ScreenshotBlockDoc,
  ScreenshotImageBlob,
  ScreenshotRefImageData,
  SyntheticsJourneyApiResponse,
  Ping,
} from '../../../../../common/runtime_types';
import { SyntheticsJourneyApiResponseType, PingType } from '../../../../../common/runtime_types';
import { SYNTHETICS_API_URLS } from '../../../../../common/constants';

export interface FetchJourneyStepsParams {
  checkGroup: string;
  remoteName?: string;
  timestamp?: string;
  // When true, only `steps` are fetched and the server skips the journey
  // details (prev/next sibling) lookup. Used by screenshot-only consumers.
  stepsOnly?: boolean;
}

export async function fetchScreenshotBlockSet(
  hashes: string[],
  remoteName?: string
): Promise<ScreenshotBlockDoc[]> {
  const response = await apiService.post<{ result: ScreenshotBlockDoc[] }>(
    SYNTHETICS_API_URLS.JOURNEY_SCREENSHOT_BLOCKS,
    {
      hashes,
      ...(remoteName ? { remoteName } : {}),
    }
  );
  return response.result;
}

export async function fetchBrowserJourney(
  params: FetchJourneyStepsParams
): Promise<SyntheticsJourneyApiResponse> {
  const query = {
    ...(params.remoteName ? { remoteName: params.remoteName } : {}),
    ...(params.timestamp ? { timestamp: params.timestamp } : {}),
    ...(params.stepsOnly ? { stepsOnly: true } : {}),
  };
  return apiService.get(
    SYNTHETICS_API_URLS.JOURNEY.replace('{checkGroup}', params.checkGroup),
    Object.keys(query).length ? query : undefined,
    SyntheticsJourneyApiResponseType
  );
}

export async function fetchLastSuccessfulCheck({
  monitorId,
  timestamp,
  stepIndex,
  location,
  remoteName,
}: {
  monitorId: string;
  timestamp: string;
  stepIndex: number;
  location?: string;
  remoteName?: string;
}): Promise<Ping> {
  return await apiService.get(
    SYNTHETICS_API_URLS.SYNTHETICS_SUCCESSFUL_CHECK,
    {
      monitorId,
      timestamp,
      stepIndex,
      location,
      ...(remoteName ? { remoteName } : {}),
    },
    PingType
  );
}

export interface BackoffOptions {
  shouldBackoff?: boolean;
  maxRetry?: number;
  initialBackoff?: number;
}

const DEFAULT_SHOULD_BACKOFF = true;
const DEFAULT_MAX_RETRY = 8;
const DEFAULT_INITIAL_BACKOFF = 100;

export async function getJourneyScreenshot(
  imgSrc: string,
  options?: Partial<BackoffOptions>
): Promise<ScreenshotImageBlob | ScreenshotRefImageData | null> {
  const shouldBackoff = options?.shouldBackoff ?? DEFAULT_SHOULD_BACKOFF;
  const maxRetry = options?.maxRetry ?? DEFAULT_MAX_RETRY;
  const initialBackoff = options?.initialBackoff ?? DEFAULT_INITIAL_BACKOFF;

  try {
    let retryCount = 0;

    let response: Response | null = null;
    let backoff = initialBackoff;
    while (response?.status !== 200) {
      const imgRequest = new Request(imgSrc);
      imgRequest.headers.set('x-elastic-internal-origin', 'Kibana');

      if (retryCount > maxRetry) break;

      response = await fetch(imgRequest);

      if (!shouldBackoff || response.status !== 404) break;

      await new Promise((r) => setTimeout(r, (backoff *= 2)));
      retryCount++;
    }

    if (response?.status !== 200) {
      return null;
    }

    const contentType = response.headers.get('content-type');
    const stepName = response.headers.get('caption-name');
    const maxSteps = Number(response.headers.get('max-steps') ?? 0);
    if (contentType?.indexOf('application/json') !== -1) {
      return {
        stepName,
        maxSteps,
        ref: await response.json(),
      };
    } else {
      return {
        stepName,
        maxSteps,
        src: URL.createObjectURL(await response.blob()),
      };
    }
  } catch (e) {
    return null;
  }
}
