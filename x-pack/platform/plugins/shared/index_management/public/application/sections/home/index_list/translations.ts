/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const docCountApproximateTooltip = i18n.translate(
  'xpack.idxMgmt.docCount.approximateTooltip',
  {
    defaultMessage:
      'Approximate — actual document count may be lower. An exact count requires read access.',
  }
);

export const docCountClosedIndexTooltip = i18n.translate(
  'xpack.idxMgmt.docCount.closedIndexTooltip',
  {
    defaultMessage:
      'Approximate — actual document count may be lower. Exact counts are not available for closed indices.',
  }
);
