/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ServiceItem } from '../../../../../common/search_strategy';
import type { ObservedEntityData } from '../../../../flyout_v2/entity/shared/components/observed_entity/types';

const observedServiceDetails: ServiceItem = {
  service: {
    id: ['test id'],
    name: ['test name', 'another test name'],
    address: ['test address'],
    environment: ['test environment'],
    ephemeral_id: ['test ephemeral_id'],
    node: {
      name: ['test node name'],
      roles: ['test node roles'],
      role: ['test node role'],
    },
    roles: ['test roles'],
    state: ['test state'],
    type: ['test type'],
    version: ['test version'],
  },
};

export const mockObservedService: ObservedEntityData<ServiceItem> = {
  details: observedServiceDetails,
  isLoading: false,
  firstSeen: {
    isLoading: false,
    date: '2023-02-23T20:03:17.489Z',
  },
  lastSeen: {
    isLoading: false,
    date: '2023-02-23T20:03:17.489Z',
  },
};
