/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import {
  EuiIcon,
  EuiIconTip,
  EuiNotificationBadge,
  EuiTab,
  EuiTabs,
  EuiToolTip,
} from '@elastic/eui';
import type { AppHeaderTab } from '../types';

export interface AppTabsProps {
  tabs?: AppHeaderTab[];
}

const renderTabBadge = (badge: AppHeaderTab['badge']) => {
  if (badge === undefined) return undefined;

  if (typeof badge === 'number') {
    return (
      <EuiNotificationBadge color="subdued" size="m">
        {badge}
      </EuiNotificationBadge>
    );
  }

  return badge.tooltip !== undefined ? (
    <EuiIconTip type={badge.iconType} content={badge.tooltip} position="bottom" />
  ) : (
    <EuiIcon type={badge.iconType} aria-hidden />
  );
};

export const AppTabs = React.memo<AppTabsProps>(({ tabs }) => {
  if (!tabs?.length) return null;

  return (
    <EuiTabs size="m" bottomBorder={false}>
      {tabs.map((tab) => (
        <EuiTab
          key={tab.id}
          isSelected={tab.isSelected}
          onClick={tab.onClick}
          href={tab.href}
          data-test-subj={tab['data-test-subj']}
          disabled={tab.disabled}
          append={renderTabBadge(tab.badge)}
        >
          {tab.toolTipContent !== undefined ? (
            <EuiToolTip content={tab.toolTipContent} position="bottom">
              <span tabIndex={0}>{tab.label}</span>
            </EuiToolTip>
          ) : (
            tab.label
          )}
        </EuiTab>
      ))}
    </EuiTabs>
  );
});

AppTabs.displayName = 'AppTabs';
