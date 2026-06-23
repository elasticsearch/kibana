/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataTableRecord } from '@kbn/discover-utils';
import React, { useEffect, useState } from 'react';
import { i18n } from '@kbn/i18n';
import type { SecurityAppStore } from '../../common/store/types';
import type { StartServices } from '../../types';
import { flyoutProviders } from '../../flyout_v2/shared/components/flyout_provider';

const PLACEHOLDER_LABEL = i18n.translate(
  'xpack.securitySolution.oneDiscover.attackFlyoutOverviewTab.placeholder',
  { defaultMessage: 'attack body placeholder' }
);

export interface AttackFlyoutOverviewTabProps {
  hit: DataTableRecord;
  servicesPromise: Promise<StartServices>;
  storePromise: Promise<SecurityAppStore>;
  onAttackUpdated: () => void;
}

export const AttackFlyoutOverviewTab = ({
  hit: _hit,
  servicesPromise,
  storePromise,
  onAttackUpdated: _onAttackUpdated,
}: AttackFlyoutOverviewTabProps) => {
  const [services, setServices] = useState<StartServices | null>(null);
  const [store, setStore] = useState<SecurityAppStore | null>(null);

  useEffect(() => {
    let isCanceled = false;

    Promise.all([servicesPromise, storePromise])
      .then(([resolvedServices, resolvedStore]) => {
        if (isCanceled) {
          return;
        }

        setServices(resolvedServices);
        setStore(resolvedStore);
      })
      .catch(() => {
        if (!isCanceled) {
          setServices(null);
          setStore(null);
        }
      });

    return () => {
      isCanceled = true;
    };
  }, [servicesPromise, storePromise]);

  if (!services || !store) {
    return null;
  }

  return flyoutProviders({
    services,
    store,
    children: <div data-test-subj="attackFlyoutOverviewTabPlaceholder">{PLACEHOLDER_LABEL}</div>,
  });
};
