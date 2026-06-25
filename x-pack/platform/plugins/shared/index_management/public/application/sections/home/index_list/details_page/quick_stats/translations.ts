/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const docCountErrorTooltip = i18n.translate(
  'xpack.idxMgmt.indexDetails.overviewTab.status.docCountErrorTooltip',
  {
    defaultMessage:
      'Unable to retrieve document count. Please refresh the page or try again later.',
  }
);

export const docCountErrorLabel = i18n.translate(
  'xpack.idxMgmt.indexDetails.overviewTab.status.docCountErrorLabel',
  { defaultMessage: 'Unable to retrieve' }
);

export { docCountApproximateTooltip, docCountClosedIndexTooltip } from '../../translations';

export const storageCardTitle = i18n.translate(
  'xpack.idxMgmt.indexDetails.overviewTab.storage.cardTitle',
  { defaultMessage: 'Storage' }
);

export const aliasesCardTitle = i18n.translate(
  'xpack.idxMgmt.indexDetails.overviewTab.aliases.cardTitle',
  { defaultMessage: 'Aliases' }
);
