/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { useMlCapabilities } from '../../../../../common/components/ml/hooks/use_ml_capabilities';
import type { UserItem } from '../../../../../../common/search_strategy';
import { getAnomaliesFields } from '../../../../../flyout/entity_details/shared/common';
import type { EntityTableRows } from '../../../../../flyout/entity_details/shared/components/entity_table/types';
import type { ObservedEntityData } from '../../../shared/components/observed_entity/types';
import { basicUserFields } from '../fields/basic_user_fields';

export const useObservedUserFields = (
  userData: ObservedEntityData<UserItem>
): EntityTableRows<ObservedEntityData<UserItem>> => {
  const mlCapabilities = useMlCapabilities();

  return useMemo(() => {
    if (userData == null) {
      return [];
    }

    return [...basicUserFields, ...getAnomaliesFields(mlCapabilities)];
  }, [userData, mlCapabilities]);
};
