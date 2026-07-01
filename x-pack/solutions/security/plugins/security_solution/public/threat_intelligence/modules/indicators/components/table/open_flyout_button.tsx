/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { useHistory } from 'react-router-dom';
import { useStore } from 'react-redux';
import type { DataTableRecord } from '@kbn/discover-utils';
import type { Indicator } from '../../../../../../common/threat_intelligence/types/indicator';
import { IOCRightPanelKey } from '../../../../../flyout/ioc_details/constants/panel_keys';
import { ENABLE_NEW_FLYOUT_SETTING } from '../../../../../../common/constants';
import { useKibana } from '../../../../../common/lib/kibana';
import { flyoutProviders } from '../../../../../flyout_v2/shared/components/flyout_provider';
import { useDefaultDocumentFlyoutProperties } from '../../../../../flyout_v2/shared/hooks/use_default_flyout_properties';
import { IOCDetails } from '../../../../../flyout_v2/ioc/main';
import { cellActionRenderer } from '../../../../../flyout_v2/shared/components/cell_actions';
import { documentFlyoutHistoryKey } from '../../../../../flyout_v2/shared/constants/flyout_history';
import { BUTTON_TEST_ID } from './test_ids';
import { VIEW_DETAILS_BUTTON_LABEL } from './translations';

export interface OpenIndicatorFlyoutButtonProps {
  /**
   * {@link Indicator} passed to the flyout component.
   */
  indicator: Indicator;
}

/**
 * Button added to the actions column of the indicators table to open/close the IndicatorFlyout component.
 */
export const OpenIndicatorFlyoutButton = memo(({ indicator }: OpenIndicatorFlyoutButtonProps) => {
  const { openFlyout } = useExpandableFlyoutApi();
  const { services } = useKibana();
  const { overlays, uiSettings } = services;
  const enableNewFlyout = uiSettings.get(ENABLE_NEW_FLYOUT_SETTING, false);
  const store = useStore();
  const history = useHistory();
  const defaultFlyoutProperties = useDefaultDocumentFlyoutProperties();

  const hit = useMemo<DataTableRecord>(
    () => ({
      id: indicator._id as string,
      raw: { _id: indicator._id as string, fields: indicator.fields },
      flattened: indicator.fields as Record<string, unknown>,
    }),
    [indicator]
  );

  const open = useCallback(() => {
    if (enableNewFlyout) {
      overlays.openSystemFlyout(
        flyoutProviders({
          services,
          store,
          history,
          children: <IOCDetails hit={hit} renderCellActions={cellActionRenderer} />,
        }),
        {
          ...defaultFlyoutProperties,
          historyKey: documentFlyoutHistoryKey,
          session: 'start',
        }
      );
    } else {
      openFlyout({
        right: {
          id: IOCRightPanelKey,
          params: {
            id: indicator._id,
          },
        },
      });
    }
  }, [
    enableNewFlyout,
    overlays,
    services,
    store,
    history,
    hit,
    indicator._id,
    defaultFlyoutProperties,
    openFlyout,
  ]);

  return (
    <EuiToolTip content={VIEW_DETAILS_BUTTON_LABEL} disableScreenReaderOutput>
      <EuiButtonIcon
        aria-label={VIEW_DETAILS_BUTTON_LABEL}
        data-test-subj={BUTTON_TEST_ID}
        color="text"
        iconType="maximize"
        onClick={open}
        size="s"
      />
    </EuiToolTip>
  );
});

OpenIndicatorFlyoutButton.displayName = 'OpenIndicatorFlyoutButton';
