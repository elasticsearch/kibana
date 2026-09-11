/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { EuiPopover, EuiButtonEmpty } from '@elastic/eui';
import numeral from '@elastic/numeral';
import type { Alert } from '@kbn/alerting-types';
import useObservable from 'react-use/lib/useObservable';
import type { SettingsStart } from '@kbn/core-ui-settings-browser';
import type { BulkActionsPanelConfig } from '../types';
import { BulkActionsVerbs } from '../types';
import * as i18n from '../translations';
import { useAlertsTableContext } from '../contexts/alerts_table_context';
import { AlertsTableBulkActionMenu } from './alerts_table_bulk_action_menu';

interface BulkActionsProps {
  totalItems: number;
  panels: BulkActionsPanelConfig[];
  alerts: Alert[];
  setIsBulkActionsLoading: (loading: boolean) => void;
  clearSelection: () => void;
  refresh: () => void;
  settings: SettingsStart;
}

const DEFAULT_NUMBER_FORMAT = 'format:number:defaultPattern';
const containerStyles = { display: 'inline-block', position: 'relative' } as const;

const BulkActionsComponent: React.FC<BulkActionsProps> = ({
  totalItems,
  panels,
  alerts,
  setIsBulkActionsLoading,
  clearSelection,
  refresh,
  settings,
}) => {
  const {
    bulkActionsStore: [{ rowSelection, isAllSelected }, updateSelectedRows],
  } = useAlertsTableContext();
  const [isActionsPopoverOpen, setIsActionsPopoverOpen] = useState(false);
  const defaultNumberFormat = useObservable<string>(
    useMemo(() => settings.client.get$(DEFAULT_NUMBER_FORMAT), [settings.client]),
    settings.client.get(DEFAULT_NUMBER_FORMAT)
  );
  const [showClearSelection, setShowClearSelection] = useState(false);

  useEffect(() => {
    setShowClearSelection(isAllSelected);
  }, [isAllSelected]);

  const selectedCount = rowSelection.size;

  const formattedTotalCount = useMemo(
    () => numeral(totalItems).format(defaultNumberFormat),
    [defaultNumberFormat, totalItems]
  );
  const formattedSelectedEventsCount = useMemo(
    () => numeral(selectedCount).format(defaultNumberFormat),
    [defaultNumberFormat, selectedCount]
  );

  const toggleIsActionOpen = useCallback(() => {
    setIsActionsPopoverOpen((currentIsOpen) => !currentIsOpen);
  }, [setIsActionsPopoverOpen]);

  const closeActionPopover = useCallback(() => {
    setIsActionsPopoverOpen(false);
  }, [setIsActionsPopoverOpen]);

  const closeIfPopoverIsOpen = useCallback(() => {
    if (isActionsPopoverOpen) {
      setIsActionsPopoverOpen(false);
    }
  }, [isActionsPopoverOpen]);

  const toggleSelectAll = useCallback(() => {
    if (!showClearSelection) {
      updateSelectedRows({ action: BulkActionsVerbs.selectAll });
    } else {
      updateSelectedRows({ action: BulkActionsVerbs.clear });
    }
  }, [showClearSelection, updateSelectedRows]);

  const selectedAlertsText = useMemo(
    () =>
      showClearSelection
        ? i18n.SELECTED_ALERTS(formattedTotalCount, totalItems)
        : i18n.SELECTED_ALERTS(formattedSelectedEventsCount, selectedCount),
    [
      showClearSelection,
      formattedTotalCount,
      formattedSelectedEventsCount,
      totalItems,
      selectedCount,
    ]
  );

  const selectClearAllAlertsText = useMemo(
    () =>
      showClearSelection
        ? i18n.CLEAR_SELECTION
        : i18n.SELECT_ALL_ALERTS(formattedTotalCount, totalItems),
    [showClearSelection, formattedTotalCount, totalItems]
  );

  return (
    <div style={containerStyles} data-test-subj="bulk-actions-button-container" aria-hidden>
      <EuiPopover
        aria-label={i18n.BULK_ACTIONS_ARIA_LABEL}
        isOpen={isActionsPopoverOpen}
        anchorPosition="upLeft"
        panelPaddingSize="none"
        button={
          <EuiButtonEmpty
            aria-label="selectedShowBulkActions"
            data-test-subj="selectedShowBulkActionsButton"
            size="xs"
            iconType="chevronSingleDown"
            iconSide="right"
            color="primary"
            onClick={toggleIsActionOpen}
          >
            {selectedAlertsText}
          </EuiButtonEmpty>
        }
        closePopover={closeActionPopover}
      >
        <AlertsTableBulkActionMenu
          alerts={alerts}
          clearSelection={clearSelection}
          closePopover={closeIfPopoverIsOpen}
          panels={panels}
          refresh={refresh}
          setIsBulkActionsLoading={setIsBulkActionsLoading}
        />
      </EuiPopover>
      <EuiButtonEmpty
        size="xs"
        aria-label="selectAllAlerts"
        data-test-subj="selectAllAlertsButton"
        iconType={showClearSelection ? 'cross' : 'pagesSelect'}
        onClick={toggleSelectAll}
      >
        {selectClearAllAlertsText}
      </EuiButtonEmpty>
    </div>
  );
};

// Lazy loading helpers
// eslint-disable-next-line import/no-default-export
export default React.memo(BulkActionsComponent);
