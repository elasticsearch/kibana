/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { buildThresholdEsqlQuery, type ThresholdConfig } from '../utils/threshold_to_esql';

export const useThresholdToEsql = (config: ThresholdConfig): string => {
  return useMemo(() => buildThresholdEsqlQuery(config), [config]);
};
