/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ServiceItem } from '../../../../../common/search_strategy';
import { FormattedRelativePreferenceDate } from '../../../../common/components/formatted_date';
import * as i18n from './translations';
import type { ObservedEntityData } from '../../../../flyout_v2/entity/shared/components/observed_entity/types';
import type { EntityTableRows } from '../../shared/components/entity_table/types';
import { getEmptyTagValue } from '../../../../common/components/empty_value';

const basicServiceFields: EntityTableRows<ObservedEntityData<ServiceItem>> = [
  {
    label: i18n.SERVICE_ID,
    getValues: (serviceData: ObservedEntityData<ServiceItem>) => serviceData.details.service?.id,
    field: 'service.id',
  },
  {
    label: i18n.SERVICE_NAME,
    getValues: (serviceData: ObservedEntityData<ServiceItem>) => serviceData.details.service?.name,
    field: 'service.name',
  },
  {
    label: i18n.ADDRESS,
    getValues: (serviceData: ObservedEntityData<ServiceItem>) =>
      serviceData.details.service?.address,
    field: 'service.address',
  },
  {
    label: i18n.ENVIRONMENT,
    getValues: (serviceData: ObservedEntityData<ServiceItem>) =>
      serviceData.details.service?.environment,
    field: 'service.environment',
  },
  {
    label: i18n.EPHEMERAL_ID,
    getValues: (serviceData: ObservedEntityData<ServiceItem>) =>
      serviceData.details.service?.ephemeral_id,
    field: 'service.ephemeral_id',
  },
  {
    label: i18n.NODE_NAME,
    getValues: (serviceData: ObservedEntityData<ServiceItem>) =>
      serviceData.details.service?.node?.name,
    field: 'service.node.name',
  },
  {
    label: i18n.NODE_ROLES,
    getValues: (serviceData: ObservedEntityData<ServiceItem>) =>
      serviceData.details.service?.node?.roles,
    field: 'service.node.roles',
  },
  {
    label: i18n.NODE_ROLE,
    getValues: (serviceData: ObservedEntityData<ServiceItem>) =>
      serviceData.details.service?.node?.role,
    field: 'service.node.role',
  },
  {
    label: i18n.STATE,
    getValues: (serviceData: ObservedEntityData<ServiceItem>) => serviceData.details.service?.state,
    field: 'service.state',
  },
  {
    label: i18n.TYPE,
    getValues: (serviceData: ObservedEntityData<ServiceItem>) => serviceData.details.service?.type,
    field: 'service.type',
  },
  {
    label: i18n.VERSION,
    getValues: (serviceData: ObservedEntityData<ServiceItem>) =>
      serviceData.details.service?.version,
    field: 'service.version',
  },
  {
    label: i18n.FIRST_SEEN,
    render: (serviceData: ObservedEntityData<ServiceItem>) =>
      serviceData.firstSeen.date ? (
        <FormattedRelativePreferenceDate value={serviceData.firstSeen.date} />
      ) : (
        getEmptyTagValue()
      ),
  },
  {
    label: i18n.LAST_SEEN,
    render: (serviceData: ObservedEntityData<ServiceItem>) =>
      serviceData.lastSeen.date ? (
        <FormattedRelativePreferenceDate value={serviceData.lastSeen.date} />
      ) : (
        getEmptyTagValue()
      ),
  },
];

export const useObservedServiceItems = (
  serviceData: ObservedEntityData<ServiceItem>
): EntityTableRows<ObservedEntityData<ServiceItem>> => {
  if (!serviceData.details) {
    return [];
  }

  return basicServiceFields;
};
