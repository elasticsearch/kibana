/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { getEmptyTagValue } from '../../../../../common/components/empty_value';
import type { UserItem } from '../../../../../../common/search_strategy';
import { FormattedRelativePreferenceDate } from '../../../../../common/components/formatted_date';
import * as i18n from './translations';
import type { ObservedEntityData } from '../../../shared/components/observed_entity/types';
import type { EntityTableRows } from '../../../../../flyout/entity_details/shared/components/entity_table/types';

export const basicUserFields: EntityTableRows<ObservedEntityData<UserItem>> = [
  {
    label: i18n.USER_ID,
    getValues: (userData: ObservedEntityData<UserItem>) => userData.details.user?.id,
    field: 'user.id',
  },
  {
    label: i18n.DOMAIN,
    getValues: (userData: ObservedEntityData<UserItem>) => userData.details.user?.domain,
    field: 'user.domain',
  },
  {
    label: i18n.FIRST_SEEN,
    render: (userData: ObservedEntityData<UserItem>) =>
      userData.firstSeen.date ? (
        <FormattedRelativePreferenceDate value={userData.firstSeen.date} />
      ) : (
        getEmptyTagValue()
      ),
  },
  {
    label: i18n.LAST_SEEN,
    render: (userData: ObservedEntityData<UserItem>) =>
      userData.lastSeen.date ? (
        <FormattedRelativePreferenceDate value={userData.lastSeen.date} />
      ) : (
        getEmptyTagValue()
      ),
  },
  {
    label: i18n.OPERATING_SYSTEM_TITLE,
    getValues: (userData: ObservedEntityData<UserItem>) => userData.details.host?.os?.name,
    field: 'host.os.name',
  },
  {
    label: i18n.FAMILY,
    getValues: (userData: ObservedEntityData<UserItem>) => userData.details.host?.os?.family,
    field: 'host.os.family',
  },
  {
    label: i18n.IP_ADDRESSES,
    getValues: (userData: ObservedEntityData<UserItem>) => userData.details.host?.ip,
    field: 'host.ip',
  },
];
