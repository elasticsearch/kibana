/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlyoutHeader, EuiLink, EuiSpacer, EuiTab, EuiTabs, EuiTitle } from '@elastic/eui';
import { EBT_CLICK_ACTIONS, getEbtProps } from '@kbn/ebt-click';
import React from 'react';
import type { Environment } from '../../../../../common/environment_rt';
import type { ServiceNodeData } from '../../../../../common/service_map';
import { SERVICE_FLYOUT_EBT_ACTIONS, SERVICE_FLYOUT_EBT_ELEMENTS } from '../ebt_constants';
import { ServiceBadges } from './service_badges';
import { useServiceLinks } from '../hooks/use_service_links';
import { SERVICE_FLYOUT_TABS, type ServiceFlyoutTabId } from '..';

interface ServiceFlyoutHeaderProps {
  service: ServiceNodeData;
  title: string;
  titleId: string;
  environment: Environment;
  kuery: string;
  rangeFrom: string;
  rangeTo: string;
  selectedTabId: ServiceFlyoutTabId;
  onSelectedTabIdChange: (tabId: ServiceFlyoutTabId) => void;
}

export function ServiceFlyoutHeader({
  service,
  title,
  titleId,
  environment,
  kuery,
  rangeFrom,
  rangeTo,
  selectedTabId,
  onSelectedTabIdChange,
}: ServiceFlyoutHeaderProps) {
  const { overviewHref: serviceOverviewHref } = useServiceLinks({
    serviceName: service.id,
    rangeFrom,
    rangeTo,
    environment,
    kuery,
  });

  return (
    <EuiFlyoutHeader>
      <EuiTitle size="s">
        <h2 id={titleId} data-test-subj="serviceFlyoutTitle">
          <EuiLink
            href={serviceOverviewHref}
            data-test-subj="serviceFlyoutTitleLink"
            {...getEbtProps({
              action: EBT_CLICK_ACTIONS.VIEW_SERVICE,
              element: SERVICE_FLYOUT_EBT_ELEMENTS.TITLE,
            })}
          >
            {title}
          </EuiLink>
        </h2>
      </EuiTitle>
      <EuiSpacer size="m" />
      <ServiceBadges
        service={service}
        environment={environment}
        kuery={kuery}
        rangeFrom={rangeFrom}
        rangeTo={rangeTo}
      />
      <EuiSpacer size="s" />
      <EuiTabs data-test-subj="serviceFlyoutTabs">
        {SERVICE_FLYOUT_TABS.map(({ id, label }) => (
          <EuiTab
            key={id}
            isSelected={id === selectedTabId}
            onClick={() => onSelectedTabIdChange(id)}
            data-test-subj={`serviceFlyoutTab-${id}`}
            {...getEbtProps({
              action: SERVICE_FLYOUT_EBT_ACTIONS.VIEW_TAB,
              element: SERVICE_FLYOUT_EBT_ELEMENTS.TABS,
              detail: id,
            })}
          >
            {label}
          </EuiTab>
        ))}
      </EuiTabs>
    </EuiFlyoutHeader>
  );
}
