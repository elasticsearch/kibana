/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback } from 'react';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';
import type { Alert } from '@kbn/alerting-types';
import { i18n } from '@kbn/i18n';
import { EasePanelKey } from '../../../../flyout/ease/constants/panel_keys';

export const ROW_ACTION_FLYOUT_ICON_TEST_ID = 'alert-summary-table-row-action-flyout-icon';

export interface ActionsCellProps {
  /**
   * Alert data passed from the renderCellValue callback
   */
  alert: Alert;
}

/**
 * Renders a icon to open EASE alert summary flyout.
 */
export const OpenFlyoutRowControlColumn = memo(({ alert }: ActionsCellProps) => {
  const { openFlyout } = useExpandableFlyoutApi();
  const onOpenFlyout = useCallback(
    () =>
      openFlyout({
        right: {
          id: EasePanelKey,
          params: {
            id: alert._id,
            indexName: alert._index,
          },
        },
      }),
    [alert, openFlyout]
  );

  return (
    <EuiToolTip
      content={i18n.translate('xpack.securitySolution.alertSummary.table.flyoutIcon', {
        defaultMessage: 'Open flyout',
      })}
      disableScreenReaderOutput
    >
      <EuiButtonIcon
        aria-label={i18n.translate('xpack.securitySolution.alertSummary.table.flyoutIcon', {
          defaultMessage: 'Open flyout',
        })}
        color="primary"
        data-test-subj={ROW_ACTION_FLYOUT_ICON_TEST_ID}
        iconType="maximize"
        onClick={onOpenFlyout}
        size="xs"
      />
    </EuiToolTip>
  );
});

OpenFlyoutRowControlColumn.displayName = 'OpenFlyoutRowControlColumn';
