/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart } from '@kbn/core/public';
import { useAbortableAsync } from '@kbn/react-hooks';

const REMOTE_CLUSTERS_API = '/api/remote_clusters';

export function useCcsHasRemoteClusters({
  http,
  isServerless,
}: {
  http: HttpStart;
  isServerless: boolean;
}) {
  const { value } = useAbortableAsync(
    async ({ signal }) => {
      if (isServerless) {
        return false;
      }
      try {
        const clusters = await http.get<Array<{ isConnected: boolean }>>(REMOTE_CLUSTERS_API, {
          signal,
        });
        return clusters.some(({ isConnected }) => isConnected);
      } catch {
        return false;
      }
    },
    [http, isServerless]
  );

  return value ?? false;
}
