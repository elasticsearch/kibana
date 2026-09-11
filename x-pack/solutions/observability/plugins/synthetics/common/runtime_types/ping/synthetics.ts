/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as t from 'io-ts';
import { ObserverCodec } from './observer';
import { ErrorStateCodec } from './error_state';
import {
  FullScreenshotType as ZodFullScreenshotType,
  RefResultType as ZodRefResultType,
  ScreenshotBlockDocType as ZodScreenshotBlockDocType,
  ScreenshotImageBlobType as ZodScreenshotImageBlobType,
  ScreenshotRefImageDataType as ZodScreenshotRefImageDataType,
} from '../zod/ping';

/**
 * This type has some overlap with the Ping type, but it helps avoid runtime type
 * check failures and removes a lot of unnecessary fields that our Synthetics UI code
 * does not care about.
 */
export const SyntheticsDataType = t.partial({
  index: t.number,
  journey: t.type({
    id: t.string,
    name: t.string,
  }),
  error: t.partial({
    message: t.string,
    name: t.string,
    stack: t.string,
  }),
  package_version: t.string,
  step: t.type({
    status: t.string,
    index: t.number,
    name: t.string,
    duration: t.type({
      us: t.number,
    }),
  }),
  type: t.string,
  blob: t.string,
  blob_mime: t.string,
  payload: t.partial({
    duration: t.number,
    index: t.number,
    is_navigation_request: t.boolean,
    message: t.string,
    method: t.string,
    name: t.string,
    params: t.partial({
      homepage: t.string,
    }),
    source: t.string,
    start: t.number,
    status: t.string,
    ts: t.number,
    type: t.string,
    url: t.string,
    end: t.number,
    text: t.string,
  }),
  isFullScreenshot: t.boolean,
  isScreenshotRef: t.boolean,
});

export const JourneyStepType = t.intersection([
  t.partial({
    config_id: t.string,
    monitor: t.partial({
      duration: t.type({
        us: t.number,
      }),
      name: t.string,
      status: t.string,
      type: t.string,
      timespan: t.type({
        gte: t.string,
        lt: t.string,
      }),
    }),
    observer: ObserverCodec,
    synthetics: SyntheticsDataType,
    error: t.type({
      message: t.string,
    }),
  }),
  t.type({
    _id: t.string,
    '@timestamp': t.string,
    monitor: t.type({
      id: t.string,
      check_group: t.string,
    }),
    synthetics: t.type({
      type: t.string,
    }),
  }),
]);

export type JourneyStep = t.TypeOf<typeof JourneyStepType>;

/**
 * The individual screenshot blocks Synthetics uses to reduce disk footprint.
 */
export const ScreenshotBlockType = t.type({
  hash: t.string,
  top: t.number,
  left: t.number,
  height: t.number,
  width: t.number,
});

/**
 * The old style of screenshot document that contains a full screenshot blob.
 */
export const FullScreenshotType = t.type({
  synthetics: t.intersection([
    t.partial({
      blob: t.string,
      blob_mime: t.string,
    }),
    t.type({
      step: t.type({
        name: t.string,
      }),
      type: t.literal('step/screenshot'),
    }),
  ]),
});

export type FullScreenshot = t.TypeOf<typeof FullScreenshotType>;

export function isFullScreenshot(data: unknown): data is FullScreenshot {
  return ZodFullScreenshotType.safeParse(data).success;
}

/**
 * The ref used by synthetics to organize the blocks needed to recompose a
 * fragmented image.
 */
export const RefResultType = t.type({
  '@timestamp': t.string,
  monitor: t.type({
    check_group: t.string,
  }),
  screenshot_ref: t.type({
    width: t.number,
    height: t.number,
    blocks: t.array(ScreenshotBlockType),
  }),
  synthetics: t.type({
    package_version: t.string,
    step: t.type({
      name: t.string,
      index: t.number,
    }),
    type: t.literal('step/screenshot_ref'),
  }),
});

export type RefResult = t.TypeOf<typeof RefResultType>;

export function isRefResult(data: unknown): data is RefResult {
  return ZodRefResultType.safeParse(data).success;
}

/**
 * Represents the result of querying for the legacy-style full screenshot blob.
 */
export const ScreenshotImageBlobType = t.type({
  stepName: t.union([t.null, t.string]),
  maxSteps: t.number,
  src: t.string,
});

export type ScreenshotImageBlob = t.TypeOf<typeof ScreenshotImageBlobType>;

export function isScreenshotImageBlob(data: unknown): data is ScreenshotImageBlob {
  return ZodScreenshotImageBlobType.safeParse(data).success;
}

/**
 * Represents the block blobs stored by hash. These documents are used to recompose synthetics images.
 */
export const ScreenshotBlockDocType = t.type({
  id: t.string,
  synthetics: t.type({
    blob: t.string,
    blob_mime: t.string,
  }),
});

export type ScreenshotBlockDoc = t.TypeOf<typeof ScreenshotBlockDocType>;

export interface PendingBlock {
  status: 'pending' | 'loading';
}

export type StoreScreenshotBlock = ScreenshotBlockDoc | PendingBlock;
export interface ScreenshotBlockCache {
  [hash: string]: StoreScreenshotBlock;
}

export function isScreenshotBlockDoc(data: unknown): data is ScreenshotBlockDoc {
  return ZodScreenshotBlockDocType.safeParse(data).success;
}

export function isPendingBlock(data: unknown): data is PendingBlock {
  return ['pending', 'loading'].some((s) => s === (data as PendingBlock)?.status);
}

/**
 * Contains the fields requried by the Synthetics UI when utilizing screenshot refs.
 */
export const ScreenshotRefImageDataType = t.type({
  stepName: t.union([t.null, t.string]),
  maxSteps: t.number,
  ref: t.type({
    screenshotRef: RefResultType,
  }),
});

export type ScreenshotRefImageData = t.TypeOf<typeof ScreenshotRefImageDataType>;

export function isScreenshotRef(data: unknown): data is ScreenshotRefImageData {
  return ZodScreenshotRefImageDataType.safeParse(data).success;
}

export const SyntheticsJourneyApiResponseType = t.intersection([
  t.type({
    checkGroup: t.string,
    steps: t.array(JourneyStepType),
  }),
  t.partial({
    details: t.union([
      t.intersection([
        t.type({
          timestamp: t.string,
          journey: JourneyStepType,
        }),
        t.partial({
          next: t.type({
            timestamp: t.string,
            checkGroup: t.string,
          }),
          previous: t.type({
            timestamp: t.string,
            checkGroup: t.string,
          }),
          summary: t.type({
            state: ErrorStateCodec,
          }),
        }),
      ]),
      t.null,
    ]),
  }),
]);

export type SyntheticsJourneyApiResponse = t.TypeOf<typeof SyntheticsJourneyApiResponseType>;
