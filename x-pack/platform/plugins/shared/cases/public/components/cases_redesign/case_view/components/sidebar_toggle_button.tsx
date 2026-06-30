/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';
import * as i18n from '../../translations';
import { useSidebar } from './sidebar_context';

export const SidebarToggleButton: React.FC = () => {
  const { isSidebarOpen, toggleSidebar } = useSidebar();

  return (
    <EuiToolTip
      content={isSidebarOpen ? i18n.HIDE_FIELDS : i18n.SHOW_FIELDS}
      disableScreenReaderOutput
    >
      <EuiButtonIcon
        iconType={isSidebarOpen ? 'transitionLeftIn' : 'transitionLeftOut'}
        aria-label={isSidebarOpen ? i18n.HIDE_FIELDS : i18n.SHOW_FIELDS}
        onClick={toggleSidebar}
        display="base"
        color="text"
        size="m"
        data-test-subj="case-view-sidebar-toggle"
      />
    </EuiToolTip>
  );
};

SidebarToggleButton.displayName = 'SidebarToggleButton';
