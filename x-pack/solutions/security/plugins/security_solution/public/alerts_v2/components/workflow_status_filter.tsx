/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import { EuiFilterButton, EuiPopover, EuiSelectable } from '@elastic/eui';
import type { EuiSelectableOption } from '@elastic/eui';
import type { WorkflowStatus } from '../hooks/use_fetch_security_episodes';
import * as i18n from '../translations';

interface WorkflowStatusFilterProps {
  selectedStatus?: WorkflowStatus;
  onStatusChange: (status: WorkflowStatus | undefined) => void;
}

const STATUS_OPTIONS: Array<{ label: string; value: WorkflowStatus }> = [
  { label: i18n.STATUS_OPEN, value: 'open' },
  { label: i18n.STATUS_ACKNOWLEDGED, value: 'acknowledged' },
  { label: i18n.STATUS_CLOSED, value: 'closed' },
];

export const WorkflowStatusFilter: React.FC<WorkflowStatusFilterProps> = ({
  selectedStatus,
  onStatusChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const options: EuiSelectableOption[] = STATUS_OPTIONS.map((opt) => ({
    label: opt.label,
    key: opt.value,
    checked: selectedStatus === opt.value ? 'on' : undefined,
  }));

  const handleChange = useCallback(
    (newOptions: EuiSelectableOption[]) => {
      const selected = newOptions.find((o) => o.checked === 'on');
      onStatusChange(selected?.key as WorkflowStatus | undefined);
    },
    [onStatusChange]
  );

  return (
    <EuiPopover
      button={
        <EuiFilterButton
          iconType="arrowDown"
          iconSide="right"
          onClick={() => setIsOpen(!isOpen)}
          isSelected={isOpen}
          hasActiveFilters={!!selectedStatus}
          numActiveFilters={selectedStatus ? 1 : undefined}
          numFilters={STATUS_OPTIONS.length}
          data-test-subj="alertsV2WorkflowStatusFilter-button"
        >
          {i18n.COLUMN_STATUS}
        </EuiFilterButton>
      }
      isOpen={isOpen}
      closePopover={() => setIsOpen(false)}
      anchorPosition="downLeft"
      panelPaddingSize="none"
    >
      <EuiSelectable
        options={options}
        singleSelection
        onChange={handleChange}
        listProps={{ bordered: false }}
      >
        {(list) => <div style={{ width: 180 }}>{list}</div>}
      </EuiSelectable>
    </EuiPopover>
  );
};
