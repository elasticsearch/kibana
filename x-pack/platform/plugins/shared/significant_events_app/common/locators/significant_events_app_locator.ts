/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  SIGNIFICANT_EVENTS_APP_ID,
  SIGNIFICANT_EVENTS_APP_LOCATOR_ID,
} from '@kbn/deeplinks-observability';
import type { LocatorDefinition, LocatorPublic } from '@kbn/share-plugin/public';
import type { SerializableRecord } from '@kbn/utility-types';

export type SignificantEventsAppTab =
  | 'streams'
  | 'knowledge_indicators'
  | 'queries'
  | 'detections'
  | 'significant_events'
  | 'memory'
  | 'cortex'
  | 'settings';

/**
 * Mirrors the query params of the `/{tab}` route one-to-one so every state of the
 * Significant Events app is addressable through the locator.
 */
export interface SignificantEventsAppLocatorParams extends SerializableRecord {
  tab?: SignificantEventsAppTab;
  rangeFrom?: string;
  rangeTo?: string;
  search?: string;
  status?: string;
  type?: string | string[];
  subtype?: string | string[];
  stream?: string | string[];
  showComputed?: string;
  selectedItem?: string;
  selectedEvent?: string;
}

export type SignificantEventsAppLocator = LocatorPublic<SignificantEventsAppLocatorParams>;

export class SignificantEventsAppLocatorDefinition
  implements LocatorDefinition<SignificantEventsAppLocatorParams>
{
  public readonly id = SIGNIFICANT_EVENTS_APP_LOCATOR_ID;

  public readonly getLocation = async ({
    tab = 'streams',
    ...query
  }: SignificantEventsAppLocatorParams) => {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value == null) {
        continue;
      }
      // Repeated keys for array values, matching the io-ts codecs of the route.
      for (const entry of Array.isArray(value) ? value : [value]) {
        searchParams.append(key, String(entry));
      }
    }

    const search = searchParams.toString();

    return {
      app: SIGNIFICANT_EVENTS_APP_ID,
      path: `/${tab}${search ? `?${search}` : ''}`,
      state: {},
    };
  };
}
