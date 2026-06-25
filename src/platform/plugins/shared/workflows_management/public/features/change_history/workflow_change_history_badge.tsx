/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiBadge } from '@elastic/eui';
import React from 'react';
import type { ChangeHistoryBadgeRenderFn } from '@kbn/change-history-ui';

import { CURRENT_VERSION_BADGE, CURRENT_VERSION_ONLY_BADGE, VERSION_BADGE } from './translations';

export const renderWorkflowChangeHistoryBadge: ChangeHistoryBadgeRenderFn = ({ item }) => {
  const version = item.metadata?.version;

  if (item.isCurrent) {
    if (typeof version === 'number') {
      return <EuiBadge color="hollow">{CURRENT_VERSION_BADGE(version)}</EuiBadge>;
    }

    return <EuiBadge color="hollow">{CURRENT_VERSION_ONLY_BADGE}</EuiBadge>;
  }

  if (typeof version !== 'number') {
    return null;
  }

  return <EuiBadge color="hollow">{VERSION_BADGE(version)}</EuiBadge>;
};
