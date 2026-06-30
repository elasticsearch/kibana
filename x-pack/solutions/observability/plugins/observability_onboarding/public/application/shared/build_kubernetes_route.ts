/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const LANDING_ONLY_SEARCH_PARAMS = ['category', 'search'] as const;

export const buildKubernetesRoutePath = (search: string): string => {
  const params = new URLSearchParams(search);
  LANDING_ONLY_SEARCH_PARAMS.forEach((param) => params.delete(param));
  const next = params.toString();
  return `/kubernetes${next ? `?${next}` : ''}`;
};
