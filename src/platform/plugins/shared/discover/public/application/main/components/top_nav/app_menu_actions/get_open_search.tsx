/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { DiscoverAppMenuItemType } from '@kbn/discover-utils';
import { AppMenuActionId } from '@kbn/discover-utils';
import { i18n } from '@kbn/i18n';
import { OpenSearchPanel } from '../open_search_panel';

export const getOpenSearchAppMenuItem = ({
  onOpenSavedSearch,
}: {
  onOpenSavedSearch: (savedSearchId: string) => void;
}): DiscoverAppMenuItemType => {
  return {
    id: AppMenuActionId.open,
    order: 3,
    label: i18n.translate('discover.localMenu.openDiscoverSessionTitle', {
      defaultMessage: 'Open session',
    }),
    iconType: 'folderOpen',
    testId: 'discoverOpenButton',
    render: ({ context: { onFinishAction } }) => {
      return <OpenSearchPanel onClose={onFinishAction} onOpenSavedSearch={onOpenSavedSearch} />;
    },
  };
};
