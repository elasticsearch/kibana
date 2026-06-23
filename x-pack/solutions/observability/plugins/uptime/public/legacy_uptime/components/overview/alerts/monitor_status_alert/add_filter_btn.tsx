/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { EuiButtonEmpty, EuiContextMenuItem, EuiContextMenuPanel, EuiPopover } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import * as labels from '../translations';
import { useUptimeDataView } from '../../../../contexts/uptime_data_view_context';

interface Props {
  newFilters: string[];
  onNewFilter: (val: string) => void;
  alertFilters: { [key: string]: string[] };
}

export const AddFilterButton: React.FC<Props> = ({ newFilters, onNewFilter, alertFilters }) => {
  const [isPopoverOpen, setPopover] = useState(false);

  const getSelectedItems = (fieldName: string) => alertFilters?.[fieldName] ?? [];

  const dataView = useUptimeDataView();

  const onButtonClick = () => {
    setPopover(!isPopoverOpen);
  };

  const closePopover = () => {
    setPopover(false);
  };

  const items: JSX.Element[] = [];

  const allFilters = [
    { id: 'observer.geo.name', label: labels.LOCATION },
    { id: 'tags', label: labels.TAG },
    { id: 'url.port', label: labels.PORT },
    { id: 'monitor.type', label: labels.TYPE },
  ];

  allFilters.forEach((filter) => {
    if (getSelectedItems(filter.id)?.length === 0 && !newFilters.includes(filter.id)) {
      items.push(
        <EuiContextMenuItem
          data-test-subj={'uptimeAlertAddFilter.' + filter.id}
          key={filter.id}
          onClick={() => {
            closePopover();
            onNewFilter(filter.id);
          }}
        >
          {filter.label}
        </EuiContextMenuItem>
      );
    }
  });

  const button = (
    <EuiButtonEmpty
      data-test-subj="uptimeCreateAlertAddFilter"
      disabled={items.length === 0 || !dataView}
      iconType="plusCircle"
      onClick={onButtonClick}
      size="s"
      flush="left"
    >
      {labels.ADD_FILTER}
    </EuiButtonEmpty>
  );

  return (
    <EuiPopover
      id="singlePanel"
      aria-label={i18n.translate('xpack.uptime.monitorStatusAlertAddFilter.popoverAriaLabel', {
        defaultMessage: 'Add alert filter options',
      })}
      button={button}
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="downLeft"
    >
      <EuiContextMenuPanel items={items} />
    </EuiPopover>
  );
};
