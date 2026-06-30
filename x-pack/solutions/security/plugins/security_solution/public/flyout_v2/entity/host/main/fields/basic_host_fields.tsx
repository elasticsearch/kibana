/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { getEmptyTagValue } from '../../../../../common/components/empty_value';
import type { HostItem } from '../../../../../../common/search_strategy';
import { FormattedRelativePreferenceDate } from '../../../../../common/components/formatted_date';
import { NetworkDetailsLink } from '../../../../../common/components/links';
import * as i18n from './translations';
import type { ObservedEntityData } from '../../../../../flyout/entity_details/shared/components/observed_entity/types';
import type { EntityTableRows } from '../../../../../flyout/entity_details/shared/components/entity_table/types';

export const basicHostFields: EntityTableRows<ObservedEntityData<HostItem>> = [
  {
    label: i18n.HOST_ID,
    getValues: (hostData: ObservedEntityData<HostItem>) => hostData.details.host?.id,
    field: 'host.id',
  },
  {
    label: i18n.FIRST_SEEN,
    render: (hostData: ObservedEntityData<HostItem>) =>
      hostData.firstSeen.date ? (
        <FormattedRelativePreferenceDate value={hostData.firstSeen.date} />
      ) : (
        getEmptyTagValue()
      ),
  },
  {
    label: i18n.LAST_SEEN,
    render: (hostData: ObservedEntityData<HostItem>) =>
      hostData.lastSeen.date ? (
        <FormattedRelativePreferenceDate value={hostData.lastSeen.date} />
      ) : (
        getEmptyTagValue()
      ),
  },
  {
    label: i18n.IP_ADDRESSES,
    field: 'host.ip',
    getValues: (hostData: ObservedEntityData<HostItem>) => hostData.details.host?.ip,
    renderField: (ip: string) => {
      return <NetworkDetailsLink ip={ip} />;
    },
  },
  {
    label: i18n.MAC_ADDRESSES,
    getValues: (hostData: ObservedEntityData<HostItem>) => hostData.details.host?.mac,
    field: 'host.mac',
  },
  {
    label: i18n.PLATFORM,
    getValues: (hostData: ObservedEntityData<HostItem>) => hostData.details.host?.os?.platform,
    field: 'host.os.platform',
  },
  {
    label: i18n.OS,
    getValues: (hostData: ObservedEntityData<HostItem>) => hostData.details.host?.os?.name,
    field: 'host.os.name',
  },
  {
    label: i18n.FAMILY,
    getValues: (hostData: ObservedEntityData<HostItem>) => hostData.details.host?.os?.family,
    field: 'host.os.family',
  },
  {
    label: i18n.VERSION,
    getValues: (hostData: ObservedEntityData<HostItem>) => hostData.details.host?.os?.version,
    field: 'host.os.version',
  },
  {
    label: i18n.ARCHITECTURE,
    getValues: (hostData: ObservedEntityData<HostItem>) => hostData.details.host?.architecture,
    field: 'host.architecture',
  },
];
