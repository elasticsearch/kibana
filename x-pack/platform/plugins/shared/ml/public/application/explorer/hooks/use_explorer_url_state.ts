/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { usePageUrlState, type UrlStateService } from '@kbn/ml-url-state';
import type { ExplorerAppState } from '@kbn/ml-common-types/locator';
import { ML_PAGES } from '@kbn/ml-common-types/locator_ml_pages';
import { resolveSeverityFormat } from '../../../../common/util/severity_threshold';

export type AnomalyExplorerUrlStateService = UrlStateService<ExplorerAppState>;

interface LegacyExplorerPageUrlState {
  pageKey: 'mlExplorerSwimlane';
  pageUrlState: ExplorerAppState['mlExplorerSwimlane'];
}

interface ExplorerPageUrlState {
  pageKey: typeof ML_PAGES.ANOMALY_EXPLORER;
  pageUrlState: ExplorerAppState;
}

export function useExplorerUrlState() {
  /**
   * Originally `mlExplorerSwimlane` resided directly in the app URL state (`_a` URL state key).
   * With current URL structure it has been moved under the `explorer` key of the app state (_a).
   */
  const [legacyExplorerState] = usePageUrlState<LegacyExplorerPageUrlState>('mlExplorerSwimlane');

  const [rawExplorerState, setExplorerState, explorerStateService] =
    usePageUrlState<ExplorerPageUrlState>(ML_PAGES.ANOMALY_EXPLORER, {
      mlExplorerSwimlane: legacyExplorerState,
      mlExplorerFilter: {},
    });

  const explorerState = useMemo(() => {
    const swimlaneState = rawExplorerState.mlExplorerSwimlane;

    // Check specifically for the old format (number type)
    if (swimlaneState && typeof swimlaneState.severity === 'number') {
      // Use the resolver function to handle old format conversion
      const resolvedSeverity = resolveSeverityFormat(swimlaneState.severity);

      return {
        ...rawExplorerState,
        mlExplorerSwimlane: {
          ...swimlaneState,
          severity: resolvedSeverity,
        },
      };
    }

    // Return the original state if no conversion was needed
    return rawExplorerState;
  }, [rawExplorerState]);

  return [explorerState, setExplorerState, explorerStateService] as const;
}
