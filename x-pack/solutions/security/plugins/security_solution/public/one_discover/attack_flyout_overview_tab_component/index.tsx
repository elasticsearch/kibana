/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataTableRecord } from '@kbn/discover-utils';
import { EuiSpacer } from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import type { SecurityAppStore } from '../../common/store/types';
import type { StartServices } from '../../types';
import { flyoutProviders } from '../../flyout_v2/shared/components/flyout_provider';
import { OverviewTab } from '../../flyout_v2/attack/main/tabs/overview_tab';

export interface AttackFlyoutOverviewTabProps {
  hit: DataTableRecord;
  servicesPromise: Promise<StartServices>;
  storePromise: Promise<SecurityAppStore>;
}

export const AttackFlyoutOverviewTab = ({
  hit,
  servicesPromise,
  storePromise,
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
    children: <AttackFlyoutOverviewTabContent hit={hit} />,
  });
};

interface AttackFlyoutOverviewTabContentProps {
  hit: DataTableRecord;
}

/**
 * Rendered inside flyoutProviders so it has access to Redux store and services.
 */
const AttackFlyoutOverviewTabContent = ({ hit }: AttackFlyoutOverviewTabContentProps) => {
  return (
    <>
      <EuiSpacer size="m" />
      <OverviewTab hit={hit} />
    </>
  );
};
