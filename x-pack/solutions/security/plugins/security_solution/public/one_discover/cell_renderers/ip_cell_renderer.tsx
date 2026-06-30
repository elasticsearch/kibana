/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { EuiLink } from '@elastic/eui';
import type { DataGridCellValueElementProps } from '@kbn/unified-data-table';
import { useHistory } from 'react-router-dom';
import { useIsInSecurityApp } from '../../common/hooks/is_in_security_app';
import { getOrEmptyTagFromValue } from '../../common/components/empty_value';
import { flyoutProviders } from '../../flyout_v2/shared/components/flyout_provider';
import { useDefaultDocumentFlyoutProperties } from '../../flyout_v2/shared/hooks/use_default_flyout_properties';
import { buildFlyoutContent } from '../../flyout_v2/shared/utils/build_flyout_content';
import { DataViewManagerBootstrap } from '../alert_flyout_overview_tab_component/data_view_manager_bootstrap';
import type { StartServices } from '../../types';
import type { SecurityAppStore } from '../../common/store/types';

export interface IpCellRendererProps extends DataGridCellValueElementProps {
  /** Kibana start services, used to access overlays for opening the network details flyout */
  services: StartServices;
  /** Redux store passed through to the flyout providers */
  store: SecurityAppStore;
}

/**
 * Cell renderer for IP address columns in One Discover.
 * Renders each IP as a clickable link that opens the network details flyout.
 */
export const IpCellRenderer = React.memo<IpCellRendererProps>(({ services, store, ...props }) => {
  const history = useHistory();
  const isInSecurityApp = useIsInSecurityApp();
  const defaultDocumentFlyoutProperties = useDefaultDocumentFlyoutProperties();
  const { overlays } = services;
  const rawValue = props.row.flattened[props.columnId];

  const addresses: string[] = useMemo(() => {
    if (Array.isArray(rawValue)) return rawValue.map(String);
    if (rawValue != null) return [String(rawValue)];
    return [];
  }, [rawValue]);

  const handleClick = useCallback(
    (ip: string) => {
      const flyoutContent = buildFlyoutContent(props.columnId, ip);
      if (flyoutContent) {
        overlays.openSystemFlyout(
          flyoutProviders({
            services,
            store,
            history,
            children: (
              <>
                {!isInSecurityApp && <DataViewManagerBootstrap />}
                {flyoutContent}
              </>
            ),
          }),
          {
            ...defaultDocumentFlyoutProperties,
            session: 'start',
          }
        );
      }
    },
    [
      props.columnId,
      overlays,
      services,
      store,
      history,
      isInSecurityApp,
      defaultDocumentFlyoutProperties,
    ]
  );

  if (addresses.length === 0) {
    return getOrEmptyTagFromValue(null);
  }

  return (
    <>
      {addresses.map((ip, idx) => (
        <React.Fragment key={`${ip}-${idx}`}>
          {idx > 0 && ', '}
          <EuiLink onClick={() => handleClick(ip)} data-test-subj="one-discover-ip-link">
            {ip}
          </EuiLink>
        </React.Fragment>
      ))}
    </>
  );
});

IpCellRenderer.displayName = 'IpCellRenderer';
