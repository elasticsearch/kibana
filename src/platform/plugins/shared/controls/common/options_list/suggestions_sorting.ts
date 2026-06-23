/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { OptionsListSortingType } from '@kbn/controls-schemas';
import { ControlValuesSource } from '@kbn/controls-constants';

export const getCompatibleSortingTypes = (
  type?: string,
  valuesSource?: ControlValuesSource
): OptionsListSortingType['by'][] => {
  // TODO Remove when we're able to get accurate document counts for ES|QL-source controls
  if (valuesSource === ControlValuesSource.ESQL) {
    return ['_key'];
  }

  switch (type) {
    case 'ip': {
      return ['_count'];
    }
    default: {
      return ['_count', '_key'];
    }
  }
};
