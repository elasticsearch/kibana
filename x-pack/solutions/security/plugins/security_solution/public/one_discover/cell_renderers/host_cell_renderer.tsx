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
import { DOC_VIEWER_FLYOUT_HISTORY_KEY } from '@kbn/unified-doc-viewer';
import { getOrEmptyTagFromValue } from '../../common/components/empty_value';
import { flyoutProviders } from '../../flyout_v2/shared/components/flyout_provider';
import { useDefaultDocumentFlyoutProperties } from '../../flyout_v2/shared/hooks/use_default_flyout_properties';
import { documentFlyoutHistoryKey } from '../../flyout_v2/shared/constants/flyout_history';
import { DataViewManagerBootstrap } from '../alert_flyout_overview_tab_component/data_view_manager_bootstrap';
import { Host } from '../../flyout_v2/entity/host/main';
import type { StartServices } from '../../types';
import type { SecurityAppStore } from '../../common/store/types';
import { useIsInSecurityApp } from '../../common/hooks/is_in_security_app';

export const HOST_CELL_RENDERER_FIELDS = new Set(['host.name', 'host.hostname']);

export interface HostCellRendererProps extends DataGridCellValueElementProps {
  services: StartServices;
  store: SecurityAppStore;
}

/**
 * Cell renderer for host-related columns in One Discover.
 * Renders each value as a clickable link that opens the host details flyout.
 */
export const HostCellRenderer = React.memo<HostCellRendererProps>(
  ({ services, store, ...props }) => {
    const history = useHistory();
    const isInSecurityApp = useIsInSecurityApp();
    const historyKey = isInSecurityApp ? documentFlyoutHistoryKey : DOC_VIEWER_FLYOUT_HISTORY_KEY;
    const { overlays } = services;
    const defaultDocumentFlyoutProperties = useDefaultDocumentFlyoutProperties();
    const rawValue = props.row.flattened[props.columnId];

    const values: string[] = useMemo(() => {
      if (Array.isArray(rawValue)) return rawValue.map(String);
      if (rawValue != null) return [String(rawValue)];
      return [];
    }, [rawValue]);

    const handleClick = useCallback(
      (hostName: string) => {
        if (!hostName) return;

        overlays.openSystemFlyout(
          flyoutProviders({
            services,
            store,
            history,
            children: (
              <>
                {!isInSecurityApp && <DataViewManagerBootstrap />}
                <Host hostName={hostName} hit={props.row} />
              </>
            ),
          }),
          {
            ...defaultDocumentFlyoutProperties,
            historyKey,
            session: 'start',
          }
        );
      },
      [
        overlays,
        services,
        store,
        history,
        isInSecurityApp,
        historyKey,
        props.row,
        defaultDocumentFlyoutProperties,
      ]
    );

    if (values.length === 0) {
      return getOrEmptyTagFromValue(null);
    }

    return (
      <>
        {values.map((val, idx) => (
          <React.Fragment key={`${val}-${idx}`}>
            {idx > 0 && ', '}
            <EuiLink onClick={() => handleClick(val)} data-test-subj="one-discover-host-link">
              {val}
            </EuiLink>
          </React.Fragment>
        ))}
      </>
    );
  }
);

HostCellRenderer.displayName = 'HostCellRenderer';
