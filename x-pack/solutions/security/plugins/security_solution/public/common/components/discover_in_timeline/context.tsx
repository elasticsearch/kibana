/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ExtendedDiscoverStateContainer } from '@kbn/discover-plugin/public';
import type { RefObject } from 'react';
import { createContext } from 'react';
import type { useDiscoverInTimelineActions } from './use_discover_in_timeline_actions';

export interface DiscoverInTimelineContextType
  extends ReturnType<typeof useDiscoverInTimelineActions> {
  discoverStateContainer: RefObject<ExtendedDiscoverStateContainer | undefined>;
  /**
   * Called with `undefined` when the ES|QL tab unmounts. The container it held is disposed at
   * that point and writing to it silently does nothing, so callers must treat an absent
   * container as "the tab will restore itself when it next mounts".
   */
  setDiscoverStateContainer: (stateContainer: ExtendedDiscoverStateContainer | undefined) => void;
}

export const DiscoverInTimelineContext = createContext<DiscoverInTimelineContextType | null>(null);
