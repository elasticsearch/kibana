/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC, ReactNode } from 'react';
import React, { useEffect } from 'react';
import { AppMenu } from '@kbn/core-chrome-app-menu';
import {
  internalStateActions,
  TabsBarVisibility,
  useInternalStateDispatch,
} from '../../state_management/redux';
import { useDiscoverServices } from '../../../../hooks/use_discover_services';
import { useTopNavMenuItems } from '../top_nav/use_top_nav_menu_items';
import type { DiscoverCustomizationContext } from '../../../../customizations';
import { useIsChromeNextProjectHeader } from '../chrome_app_header';

export const HideTabsBar: FC<{
  customizationContext: DiscoverCustomizationContext;
  children: ReactNode;
}> = ({ customizationContext, children }) => {
  const dispatch = useInternalStateDispatch();
  const { chrome } = useDiscoverServices();
  const isChromeNextProjectHeader = useIsChromeNextProjectHeader();
  const topNavMenuItems = useTopNavMenuItems();

  useEffect(() => {
    dispatch(internalStateActions.setTabsBarVisibility(TabsBarVisibility.hidden));
    return () => {
      dispatch(internalStateActions.setTabsBarVisibility(TabsBarVisibility.default));
    };
  }, [dispatch]);

  return (
    <>
      {
        /**
         * The tabs bar renders the app menu, but it still needs to be shown when tabs are hidden
         */
        !isChromeNextProjectHeader &&
          customizationContext.displayMode === 'standalone' &&
          topNavMenuItems && <AppMenu config={topNavMenuItems} setAppMenu={chrome.setAppMenu} />
      }
      {children}
    </>
  );
};
