/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { CoreStart } from '@kbn/core/public';

import type { GetIamPermissionsResponse } from '../../common/iam_permissions_api';
import { IAM_PERMISSIONS_API_PATH } from '../../common/iam_permissions_api';

export interface UseIamPermissionsResult {
  data: GetIamPermissionsResponse | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Fetches IAM permissions from `GET /internal/onboarding/iam_permissions?services=...`.
 * Re-fetches whenever `serviceIds` changes (by identity of the sorted comma-joined string).
 */
export const useIamPermissions = (serviceIds: string[]): UseIamPermissionsResult => {
  const { services } = useKibana<CoreStart>();
  const [data, setData] = useState<GetIamPermissionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Stable key to avoid unnecessary refetches when the caller passes a new array with the same ids.
  const servicesKey = [...serviceIds].sort().join(',');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!servicesKey) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setData(null);

    services.http
      .get<GetIamPermissionsResponse>(IAM_PERMISSIONS_API_PATH, {
        query: { services: servicesKey },
        signal: controller.signal,
      })
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError(err);
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [services.http, servicesKey]);

  return { data, loading, error };
};
