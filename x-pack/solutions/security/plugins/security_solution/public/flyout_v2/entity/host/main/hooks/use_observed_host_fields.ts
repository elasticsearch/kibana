/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { useMlCapabilities } from '../../../../../common/components/ml/hooks/use_ml_capabilities';
import type { HostItem } from '../../../../../../common/search_strategy';
import { getAnomaliesFields } from '../../../../../flyout/entity_details/shared/common';
import type { EntityTableRows } from '../../../../../flyout/entity_details/shared/components/entity_table/types';
import type { ObservedEntityData } from '../../../../../flyout/entity_details/shared/components/observed_entity/types';
import { policyFields } from '../fields/endpoint_policy_fields';
import { basicHostFields } from '../fields/basic_host_fields';
import { cloudFields } from '../fields/cloud_fields';

export const useObservedHostFields = (
  hostData: ObservedEntityData<HostItem>
): EntityTableRows<ObservedEntityData<HostItem>> => {
  const mlCapabilities = useMlCapabilities();

  return useMemo(() => {
    if (hostData == null) {
      return [];
    }

    return [
      ...basicHostFields,
      ...getAnomaliesFields(mlCapabilities),
      ...cloudFields,
      ...policyFields,
    ];
  }, [hostData, mlCapabilities]);
};
