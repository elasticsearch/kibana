/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Fragment, useState } from 'react';
import {
  EuiButtonIcon,
  EuiPopover,
  EuiPopoverTitle,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { MonitorSearchableList } from './monitor_searchable_list';

export const MonitorSelector = () => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const monitorSelectorPopoverTitleId = useGeneratedHtmlId();

  const onButtonClick = () => {
    setIsPopoverOpen(!isPopoverOpen);
  };

  const closePopover = () => {
    setIsPopoverOpen(false);
  };

  const button = (
    <EuiToolTip content={SELECT_MONITOR} disableScreenReaderOutput>
      <EuiButtonIcon
        data-test-subj="syntheticsMonitorSelectorButton"
        size="s"
        iconType="chevronSingleDown"
        onClick={onButtonClick}
        aria-label={SELECT_MONITOR}
      />
    </EuiToolTip>
  );

  return (
    <Fragment>
      <EuiPopover
        id={'monitorSelector'}
        panelPaddingSize="none"
        button={button}
        isOpen={isPopoverOpen}
        closePopover={closePopover}
        aria-labelledby={monitorSelectorPopoverTitleId}
      >
        <EuiPopoverTitle id={monitorSelectorPopoverTitleId} paddingSize="s">
          {GO_TO_MONITOR}
        </EuiPopoverTitle>
        <MonitorSearchableList closePopover={closePopover} />
      </EuiPopover>
    </Fragment>
  );
};

const GO_TO_MONITOR = i18n.translate('xpack.synthetics.monitorSummary.goToMonitor', {
  defaultMessage: 'Go to monitor',
});

const SELECT_MONITOR = i18n.translate('xpack.synthetics.monitorSummary.selectMonitor', {
  defaultMessage: 'Select a different monitor to view its details',
});
