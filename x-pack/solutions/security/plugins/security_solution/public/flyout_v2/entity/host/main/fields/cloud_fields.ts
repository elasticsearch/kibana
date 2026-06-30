/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HostItem } from '../../../../../../common/search_strategy';
import type { EntityTableRows } from '../../../../../flyout/entity_details/shared/components/entity_table/types';
import type { ObservedEntityData } from '../../../shared/components/observed_entity/types';
import * as i18n from './translations';

export const cloudFields: EntityTableRows<ObservedEntityData<HostItem>> = [
  {
    label: i18n.CLOUD_PROVIDER,
    getValues: (hostData: ObservedEntityData<HostItem>) => hostData.details.cloud?.provider,
    field: 'cloud.provider',
  },
  {
    label: i18n.REGION,
    getValues: (hostData: ObservedEntityData<HostItem>) => hostData.details.cloud?.region,
    field: 'cloud.region',
  },
  {
    label: i18n.INSTANCE_ID,
    getValues: (hostData: ObservedEntityData<HostItem>) => hostData.details.cloud?.instance?.id,
    field: 'cloud.instance.id',
  },
  {
    label: i18n.MACHINE_TYPE,
    getValues: (hostData: ObservedEntityData<HostItem>) => hostData.details.cloud?.machine?.type,
    field: 'cloud.machine.type',
  },
];
