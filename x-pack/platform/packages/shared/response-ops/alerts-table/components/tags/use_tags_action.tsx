/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiIcon } from '@elastic/eui';
import React, { useCallback, useState } from 'react';
import type { Alert } from '@kbn/alerting-types';
import type { ItemsSelectionState, UseActionProps } from './items/types';
import * as i18n from './translations';
import { useBulkUpdateAlertTags } from '../../hooks/use_bulk_update_alert_tags';
import { useAlertsTableContext } from '../../contexts/alerts_table_context';

const OBS_STACK_ALERTS_INDEX = '.alerts-observability*,.alerts-stack*';

export interface TagsActionState {
  isFlyoutOpen: boolean;
  onClose: () => void;
  openFlyout: (alerts: Alert[]) => void;
  onSaveTags: (tagsSelection: ItemsSelectionState) => Promise<void>;
  selectedAlerts: Alert[];
  getAction: (alerts: Alert[]) => {
    name: string;
    onClick: () => void;
    disabled: boolean;
    'data-test-subj': string;
    icon: React.ReactNode;
    key: string;
  };
}

export const useTagsAction = ({
  onActionSuccess,
  onActionError,
  isDisabled,
}: UseActionProps): TagsActionState => {
  const [isFlyoutOpen, setIsFlyoutOpen] = useState<boolean>(false);
  const onClose = useCallback(() => setIsFlyoutOpen(false), []);
  const [selectedAlerts, setSelectedAlerts] = useState<Alert[]>([]);
  const {
    services: { http, notifications },
  } = useAlertsTableContext();

  const { mutateAsync: bulkUpdateAlertTags } = useBulkUpdateAlertTags({ http, notifications });

  const openFlyout = useCallback((alerts: Alert[]) => {
    setIsFlyoutOpen(true);
    setSelectedAlerts(alerts);
  }, []);

  const onSaveItems = useCallback(
    async (tagsSelection: ItemsSelectionState) => {
      try {
        await bulkUpdateAlertTags({
          index: OBS_STACK_ALERTS_INDEX,
          alertIds: selectedAlerts.map((alert) => alert._id),
          add: tagsSelection.selectedItems?.length ? tagsSelection.selectedItems : undefined,
          remove: tagsSelection.unSelectedItems?.length ? tagsSelection.unSelectedItems : undefined,
        });

        onActionSuccess?.();
      } catch {
        onActionError?.();
      } finally {
        onClose();
      }
    },
    [bulkUpdateAlertTags, onClose, onActionSuccess, onActionError, selectedAlerts]
  );

  const getAction = (alerts: Alert[]) => {
    return {
      name: i18n.EDIT_TAGS,
      onClick: () => openFlyout(alerts),
      disabled: isDisabled,
      'data-test-subj': 'alerts-bulk-action-tags',
      icon: <EuiIcon type="tag" size="m" aria-hidden={true} />,
      key: 'alerts-bulk-action-tags',
    };
  };

  return { getAction, openFlyout, isFlyoutOpen, onClose, onSaveTags: onSaveItems, selectedAlerts };
};

export type UseTagsAction = ReturnType<typeof useTagsAction>;
