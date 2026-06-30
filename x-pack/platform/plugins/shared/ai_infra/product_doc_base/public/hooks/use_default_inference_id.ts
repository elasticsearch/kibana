/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import { defaultInferenceEndpoints } from '@kbn/inference-common';
import type { ResourceType } from '@kbn/product-doc-common';
import type { ProductDocBasePluginStart } from '../types';

const STALE_TIME_MS = 5 * 60 * 1000;

/**
 * Fetches the best available inference endpoint for knowledge base installation.
 * Product documentation priority: Jina v5 > .elser-2-elastic > .elser-2-elasticsearch
 * Security Labs priority: .elser-2-elastic > .elser-2-elasticsearch
 */
export function useDefaultInferenceId(
  productDocBase: ProductDocBasePluginStart,
  resourceType?: ResourceType
) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['productDocBase.defaultInferenceId', resourceType],
    queryFn: () => productDocBase.installation.getDefaultInferenceId({ resourceType }),
    staleTime: STALE_TIME_MS,
    refetchOnWindowFocus: false,
  });

  return {
    inferenceId: data ?? defaultInferenceEndpoints.ELSER,
    isLoading,
    isError,
  };
}
