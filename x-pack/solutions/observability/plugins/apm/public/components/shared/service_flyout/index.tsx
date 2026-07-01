/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlyoutBody, EuiPortal, useGeneratedHtmlId } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React, { useEffect, useState } from 'react';
import type { Environment } from '../../../../common/environment_rt';
import type { ServiceNodeData } from '../../../../common/service_map';
import { ResponsiveFlyout } from '../responsive_flyout';
import { ServiceFlyoutFooter } from './footer';
import { ServiceFlyoutHeader } from './header';
import { ServiceFlyoutOverview } from './overview';

export const SERVICE_FLYOUT_TAB_IDS = {
  overview: 'overview',
  alerts: 'alerts',
  slos: 'slos',
} as const;

export type ServiceFlyoutTabId =
  (typeof SERVICE_FLYOUT_TAB_IDS)[keyof typeof SERVICE_FLYOUT_TAB_IDS];

export const SERVICE_FLYOUT_DEFAULT_TAB_ID = SERVICE_FLYOUT_TAB_IDS.overview;

export const SERVICE_FLYOUT_TABS = [
  {
    id: SERVICE_FLYOUT_TAB_IDS.overview,
    label: i18n.translate('xpack.apm.serviceFlyout.overviewTabLabel', {
      defaultMessage: 'Overview',
    }),
  },
] as const;

interface ServiceFlyoutProps {
  service: ServiceNodeData;
  environment: Environment;
  kuery: string;
  initialRangeFrom: string;
  initialRangeTo: string;
  initialTransactionType?: string;
  onView?: (params: { tabId: ServiceFlyoutTabId }) => void;
  onClose: () => void;
}

export function ServiceFlyout({
  service,
  environment,
  kuery,
  initialRangeFrom,
  initialRangeTo,
  initialTransactionType,
  onView,
  onClose,
}: ServiceFlyoutProps) {
  const title = service.label ?? service.id;
  const titleId = useGeneratedHtmlId({ prefix: 'serviceFlyoutTitle' });

  const [flyoutEnvironment, setFlyoutEnvironment] = useState(environment);
  const [flyoutRange, setFlyoutRange] = useState({
    rangeFrom: initialRangeFrom,
    rangeTo: initialRangeTo,
  });
  const [transactionType, setTransactionType] = useState(initialTransactionType ?? '');
  const [refreshToken, setRefreshToken] = useState(Date.now());

  const [selectedTabId, setSelectedTabId] = useState<ServiceFlyoutTabId>(
    SERVICE_FLYOUT_DEFAULT_TAB_ID
  );

  useEffect(() => {
    onView?.({ tabId: selectedTabId });
  }, [onView, selectedTabId]);

  const renderTabContent = () => {
    switch (selectedTabId) {
      case SERVICE_FLYOUT_TAB_IDS.overview:
        return (
          <ServiceFlyoutOverview
            service={service}
            environment={flyoutEnvironment}
            kuery={kuery}
            rangeFrom={flyoutRange.rangeFrom}
            rangeTo={flyoutRange.rangeTo}
            transactionType={transactionType}
            refreshToken={refreshToken}
            onTransactionTypeChange={setTransactionType}
            onEnvironmentChange={setFlyoutEnvironment}
            onRangeChange={setFlyoutRange}
            onRefresh={() => setRefreshToken(Date.now())}
          />
        );
      default:
        return null;
    }
  };

  return (
    <EuiPortal>
      <ResponsiveFlyout
        data-test-subj="serviceFlyout"
        flyoutMenuDisplayMode="always"
        onClose={onClose}
        ownFocus={false}
        size="m"
        paddingSize="m"
        resizable
        session="start"
        flyoutMenuProps={{ title }}
        aria-labelledby={titleId}
      >
        <ServiceFlyoutHeader
          service={service}
          title={title}
          titleId={titleId}
          environment={flyoutEnvironment}
          kuery={kuery}
          rangeFrom={flyoutRange.rangeFrom}
          rangeTo={flyoutRange.rangeTo}
          selectedTabId={selectedTabId}
          onSelectedTabIdChange={setSelectedTabId}
        />
        <EuiFlyoutBody>{renderTabContent()}</EuiFlyoutBody>
        <ServiceFlyoutFooter
          serviceName={service.id}
          environment={flyoutEnvironment}
          rangeFrom={flyoutRange.rangeFrom}
          rangeTo={flyoutRange.rangeTo}
          transactionType={transactionType}
        />
      </ResponsiveFlyout>
    </EuiPortal>
  );
}
