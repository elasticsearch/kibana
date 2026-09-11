/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IndexSettings } from '../../../common/types';

type AcceptedIndexSettings = IndexSettings & {
  index?: NonNullable<IndexSettings['index']> & {
    'lifecycle.name'?: string;
  };
  'index.lifecycle'?: {
    name?: string;
  };
};

/**
 * Returns true when the settings reference an ILM policy through `index.lifecycle.name`,
 * including the nested, dotted, and optional-prefix forms accepted by Elasticsearch.
 */
export const hasIlmPolicySetting = (settings?: IndexSettings): boolean => {
  const acceptedSettings = settings as AcceptedIndexSettings | undefined;
  const policyName =
    acceptedSettings?.['index.lifecycle.name'] ??
    acceptedSettings?.index?.lifecycle?.name ??
    acceptedSettings?.index?.['lifecycle.name'] ??
    acceptedSettings?.['index.lifecycle']?.name ??
    acceptedSettings?.lifecycle?.name ??
    acceptedSettings?.['lifecycle.name'];
  return policyName != null;
};
