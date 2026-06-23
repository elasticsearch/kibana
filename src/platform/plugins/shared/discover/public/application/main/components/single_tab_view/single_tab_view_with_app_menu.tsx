/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { AppMenu } from '@kbn/core-chrome-app-menu';
import { ChromeAppHeader, useIsChromeNextProjectHeader } from '../chrome_app_header';
import { SingleTabView, type SingleTabViewProps } from '.';
import { useDiscoverServices } from '../../../../hooks/use_discover_services';
import { useTopNavMenuItems } from '../top_nav/use_top_nav_menu_items';

export interface SingleTabViewWithAppMenuProps extends SingleTabViewProps {
  headerTitle: string;
}

export const SingleTabViewWithAppMenu = (props: SingleTabViewProps) => {
  const { chrome } = useDiscoverServices();
  const topNavMenuItems = useTopNavMenuItems();
  const isChromeNextProjectHeader = useIsChromeNextProjectHeader();

  return (
    <>
      {isChromeNextProjectHeader ? (
        <ChromeAppHeader menu={topNavMenuItems} />
      ) : (
        topNavMenuItems && <AppMenu config={topNavMenuItems} setAppMenu={chrome.setAppMenu} />
      )}
      <SingleTabView {...props} />
    </>
  );
};
