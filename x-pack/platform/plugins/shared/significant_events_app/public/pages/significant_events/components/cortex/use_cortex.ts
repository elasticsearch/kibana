/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import { useKibana } from '../../../../hooks/use_kibana';
import type { GetCortexPageResponse, ListCortexPagesResponse } from './types';

const CORTEX_PAGES_PATH = '/internal/nightshift/cortex/pages';
const CORTEX_AVAILABILITY_PATH = '/internal/nightshift/cortex/availability';

const cortexKeys = {
  availability: ['cortex', 'availability'] as const,
  pages: ['cortex', 'pages'] as const,
  page: (id: string) => ['cortex', 'page', id] as const,
};

/**
 * Reports whether xpack.nightshift_investigations.cortex.enabled is on. A failed request means
 * the plugin is disabled or absent, which is treated the same as Cortex being off.
 */
export const useCortexEnabled = (): boolean => {
  const { core } = useKibana();

  const { data } = useQuery({
    queryKey: cortexKeys.availability,
    queryFn: ({ signal }) =>
      core.http.get<{ enabled: boolean }>(CORTEX_AVAILABILITY_PATH, { signal }),
    retry: false,
  });

  return data?.enabled ?? false;
};

export const useCortexPages = () => {
  const { core } = useKibana();

  return useQuery({
    queryKey: cortexKeys.pages,
    queryFn: ({ signal }) => core.http.get<ListCortexPagesResponse>(CORTEX_PAGES_PATH, { signal }),
  });
};

export const useCortexPage = (id: string | undefined) => {
  const { core } = useKibana();

  return useQuery({
    queryKey: cortexKeys.page(id ?? ''),
    queryFn: ({ signal }) =>
      core.http.get<GetCortexPageResponse>(`${CORTEX_PAGES_PATH}/${id}`, { signal }),
    enabled: id !== undefined,
  });
};
