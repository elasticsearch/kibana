/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';

import { i18n } from '@kbn/i18n';
import type { ObservedEntityData } from '../../../flyout_v2/entity/shared/components/observed_entity/types';
import type { MlCapabilitiesProvider } from '../../../common/components/ml/permissions/ml_capabilities_provider';
import { hasMlUserPermissions } from '../../../../common/machine_learning/has_ml_user_permissions';
import { getEmptyTagValue } from '../../../common/components/empty_value';
import type { HostItem } from '../../../../common/search_strategy';
import { AnomaliesField } from './components/anomalies_field';

export const getAnomaliesFields = (mlCapabilities: MlCapabilitiesProvider) => [
  {
    label: i18n.translate('xpack.securitySolution.timeline.sidePanel.maxAnomalyScoreByJobTitle', {
      defaultMessage: 'Max anomaly score by job',
    }),
    render: (hostData: ObservedEntityData<HostItem>) =>
      hostData.anomalies ? <AnomaliesField anomalies={hostData.anomalies} /> : getEmptyTagValue(),
    isVisible: () => hasMlUserPermissions(mlCapabilities),
  },
];
