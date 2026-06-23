/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { EuiButtonIcon, EuiFlexGroup, EuiFlexItem, EuiToolTip } from '@elastic/eui';
import type { AttackDiscoverySchedule } from '@kbn/elastic-assistant-common';

import * as i18n from './translations';
import type { TableColumn } from './constants';
import { WithMissingPrivileges } from '../../missing_privileges';

interface ActionProps {
  deleteSchedule: (scheduleId: string) => Promise<void>;
  isDisabled: boolean;
  scheduleId: string;
}

const Action = ({ isDisabled, deleteSchedule, scheduleId }: ActionProps) => {
  const onScheduleDeleteChange = useCallback(async () => {
    deleteSchedule(scheduleId);
  }, [deleteSchedule, scheduleId]);

  return (
    <EuiFlexGroup alignItems="center" justifyContent="spaceAround">
      <EuiFlexItem grow={false}>
        <WithMissingPrivileges>
          {(enabled) => (
            <EuiToolTip content={i18n.DELETE_ACTIONS_BUTTON_ARIAL_LABEL} disableScreenReaderOutput>
              <EuiButtonIcon
                data-test-subj="deleteButton"
                aria-label={i18n.DELETE_ACTIONS_BUTTON_ARIAL_LABEL}
                color="danger"
                iconType="trash"
                onClick={onScheduleDeleteChange}
                disabled={isDisabled || !enabled}
              />
            </EuiToolTip>
          )}
        </WithMissingPrivileges>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

export const createActionsColumn = ({
  isDisabled,
  deleteSchedule,
}: {
  isDisabled: boolean;
  deleteSchedule: (scheduleId: string) => Promise<void>;
}): TableColumn => {
  return {
    field: 'delete',
    name: i18n.COLUMN_ACTIONS,
    render: (_, schedule: AttackDiscoverySchedule) => (
      <Action isDisabled={isDisabled} deleteSchedule={deleteSchedule} scheduleId={schedule.id} />
    ),
    width: '65px',
    align: 'center',
  };
};
