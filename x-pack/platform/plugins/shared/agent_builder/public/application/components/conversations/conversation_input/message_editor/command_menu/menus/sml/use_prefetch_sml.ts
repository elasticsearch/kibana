/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@kbn/react-query';
import type {
  SmlSearchFilters,
  SmlSearchConstraints,
} from '@kbn/agent-context-layer-plugin/public';
import { SML_SEARCH_DEFAULT_SIZE } from '../../../../../../../../services/sml/constants';
import { queryKeys } from '../../../../../../../query_keys';
import { useAgentBuilderServices } from '../../../../../../../hooks/use_agent_builder_service';
import { useContextEngineEnabled } from '../../../../../../../hooks/use_context_engine_enabled';
import { useExperimentalFeatures } from '../../../../../../../hooks/use_experimental_features';

export const usePrefetchSml = (constraints?: SmlSearchConstraints, filters?: SmlSearchFilters) => {
  const queryClient = useQueryClient();
  const { smlService } = useAgentBuilderServices();
  const contextEngineEnabled = useContextEngineEnabled();
  const experimentalEnabled = useExperimentalFeatures();
  const smlEnabled = contextEngineEnabled && experimentalEnabled;

  return useCallback(() => {
    if (!smlEnabled) {
      return;
    }
    queryClient.prefetchQuery({
      queryKey: queryKeys.sml.autocomplete('*', constraints, filters),
      queryFn: () =>
        smlService.autocomplete({
          query: '*',
          size: SML_SEARCH_DEFAULT_SIZE,
          constraints,
          filters,
        }),
    });
  }, [smlEnabled, queryClient, smlService, constraints, filters]);
};
