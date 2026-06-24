/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useContext, useMemo } from 'react';
import { useFetcher } from '@kbn/observability-shared-plugin/public';
import type { CertFacets } from '../../../../../common/runtime_types';
import { getCertFacets } from '../../state/certs/api';
import { SyntheticsRefreshContext } from '../../contexts';

/**
 * Global distinct-cert counts per quick-filter value (independent of the active
 * selection, so sibling counts don't disappear). `remoteNames` scopes the
 * remote branch only; local certs are always counted.
 */
export const useCertFacets = (remoteNames?: string[]): CertFacets | undefined => {
  const { lastRefresh } = useContext(SyntheticsRefreshContext);

  // Stable reference: re-run only when the selection actually changes.
  const remoteNamesKey = remoteNames?.join(',') ?? '';
  const stableRemoteNames = useMemo(
    () => (remoteNamesKey ? remoteNamesKey.split(',') : undefined),
    [remoteNamesKey]
  );

  const fetchFacets = useCallback(() => getCertFacets(stableRemoteNames), [stableRemoteNames]);

  const { data } = useFetcher(fetchFacets, [fetchFacets, lastRefresh]);

  return data;
};
