/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButtonEmpty, EuiContextMenuPanel, EuiContextMenuItem, EuiPopover } from '@elastic/eui';
import React, { useState, useEffect } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { UpdateUrlParams } from '../../../hooks';
import { useUrlParams } from '../../../hooks';

interface PopoverButtonProps {
  setIsOpen: (isOpen: boolean) => any;
  size: number;
}

const PopoverButton: React.FC<PopoverButtonProps> = ({ setIsOpen, size }) => (
  <EuiButtonEmpty
    color="text"
    data-test-subj="xpack.uptime.monitorList.pageSizeSelect.popoverOpen"
    iconType="chevronSingleDown"
    iconSide="right"
    onClick={() => setIsOpen(true)}
  >
    <FormattedMessage
      id="xpack.uptime.monitorList.pageSizePopoverButtonText"
      defaultMessage="Rows per page: {size}"
      values={{ size }}
    />
  </EuiButtonEmpty>
);

interface ContextItemProps {
  'data-test-subj': string;
  key: string;
  numRows: number;
}

const items: ContextItemProps[] = [
  {
    'data-test-subj': 'xpack.uptime.monitorList.pageSizeSelect.sizeSelectItem10',
    key: '10 rows',
    numRows: 10,
  },
  {
    'data-test-subj': 'xpack.uptime.monitorList.pageSizeSelect.sizeSelectItem25',
    key: '25 rows',
    numRows: 25,
  },
  {
    'data-test-subj': 'xpack.uptime.monitorList.pageSizeSelect.sizeSelectItem50',
    key: '50 rows',
    numRows: 50,
  },
  {
    'data-test-subj': 'xpack.uptime.monitorList.pageSizeSelect.sizeSelectItem100',
    key: '100 rows',
    numRows: 100,
  },
];

const LOCAL_STORAGE_KEY = 'xpack.uptime.monitorList.pageSize';

interface MonitorListPageSizeSelectProps {
  size: number;
  setSize: (value: number) => void;
}

/**
 * This component wraps the underlying UI functionality to make the component more testable.
 * The features leveraged in this function are tested elsewhere, and are not novel to this component.
 */
export const MonitorListPageSizeSelect: React.FC<MonitorListPageSizeSelectProps> = ({
  size,
  setSize,
}) => {
  const [, setUrlParams] = useUrlParams();

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, size.toString());
  }, [size]);

  return (
    <MonitorListPageSizeSelectComponent size={size} setSize={setSize} setUrlParams={setUrlParams} />
  );
};

interface ComponentProps extends MonitorListPageSizeSelectProps {
  setUrlParams: UpdateUrlParams;
}

/**
 * This function contains the UI functionality for the page select feature. It's agnostic to any
 * external services/features, and focuses only on providing the UI and handling user interaction.
 */
export const MonitorListPageSizeSelectComponent: React.FC<ComponentProps> = ({
  size,
  setSize,
  setUrlParams,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <EuiPopover
      aria-label={i18n.translate('xpack.uptime.monitorList.pageSizeSelect.popoverAriaLabel', {
        defaultMessage: 'Rows per page options',
      })}
      button={<PopoverButton setIsOpen={(value) => setIsOpen(value)} size={size} />}
      isOpen={isOpen}
      closePopover={() => setIsOpen(false)}
      anchorPosition="upLeft"
    >
      <EuiContextMenuPanel
        items={items.map(({ 'data-test-subj': dataTestSubj, key, numRows }) => (
          <EuiContextMenuItem
            data-test-subj={dataTestSubj}
            key={key}
            icon={size === numRows ? 'check' : 'empty'}
            onClick={() => {
              setSize(numRows);
              // reset pagination because the page size has changed
              setUrlParams({ pagination: undefined });
              setIsOpen(false);
            }}
          >
            <FormattedMessage
              id="xpack.uptime.monitorList.pageSizeSelect.numRowsItemMessage"
              defaultMessage="{numRows} rows"
              values={{ numRows }}
            />
          </EuiContextMenuItem>
        ))}
      />
    </EuiPopover>
  );
};
