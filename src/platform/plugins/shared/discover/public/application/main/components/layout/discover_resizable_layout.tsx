/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEuiTheme, useIsWithinBreakpoints } from '@elastic/eui';
import {
  ResizableLayout,
  ResizableLayoutDirection,
  ResizableLayoutMode,
} from '@kbn/resizable-layout';
import React, { useState, type ReactNode, useCallback, type ComponentProps } from 'react';
import { css } from '@emotion/react';
import { createHtmlPortalNode, InPortal, OutPortal } from 'react-reverse-portal';
import useObservable from 'react-use/lib/useObservable';
import type { BehaviorSubject } from 'rxjs';
import type { SidebarToggleState } from '../../../types';
import { withRestorableState, useRestorableState } from './discover_layout_restorable_state';
import { useDiscoverServices } from '../../../../hooks/use_discover_services';

export const SIDEBAR_WIDTH_KEY = 'discover:sidebarWidth';

export const InternalDiscoverResizableLayout = ({
  sidebarToggleState$,
  isSidebarHidden,
  sidebarPanel,
  mainPanel,
}: {
  sidebarToggleState$: BehaviorSubject<SidebarToggleState>;
  isSidebarHidden?: boolean;
  sidebarPanel: ReactNode;
  mainPanel: ReactNode;
}) => {
  const { storage } = useDiscoverServices();
  const [sidebarPanelNode] = useState(() =>
    createHtmlPortalNode({ attributes: { class: 'eui-fullHeight' } })
  );
  const [mainPanelNode] = useState(() =>
    createHtmlPortalNode({ attributes: { class: 'eui-fullHeight' } })
  );

  const { euiTheme } = useEuiTheme();
  const minSidebarWidth = euiTheme.base * 13;
  const defaultSidebarWidth = euiTheme.base * 19;
  const minMainPanelWidth = euiTheme.base * 24;

  const [sidebarWidth, setSidebarWidth] = useRestorableState(
    'sidebarWidth',
    () => {
      const widthInLocalStorage = Number(storage?.get(SIDEBAR_WIDTH_KEY));
      return widthInLocalStorage || defaultSidebarWidth;
    },
    {
      shouldStoreDefaultValueRightAway: true, // otherwise, it would re-initialize with the localStorage value which might get updated in the meantime
    }
  );

  const setSidebarWidthAndUpdateInStorage = useCallback(
    (width: number) => {
      setSidebarWidth(width);
      storage.set(SIDEBAR_WIDTH_KEY, width);
    },
    [setSidebarWidth, storage]
  );

  const sidebarToggleState = useObservable(sidebarToggleState$);
  const isSidebarCollapsed = sidebarToggleState?.isCollapsed ?? false;

  const isMobile = useIsWithinBreakpoints(['xs', 's']);
  const layoutMode = isSidebarHidden
    ? ResizableLayoutMode.Single
    : isMobile || isSidebarCollapsed
    ? ResizableLayoutMode.Static
    : ResizableLayoutMode.Resizable;
  const layoutDirection = isMobile
    ? ResizableLayoutDirection.Vertical
    : ResizableLayoutDirection.Horizontal;

  return (
    <>
      <InPortal node={sidebarPanelNode}>{sidebarPanel}</InPortal>
      <InPortal node={mainPanelNode}>{mainPanel}</InPortal>
      <ResizableLayout
        className="dscPageBody__contents" // class is used in other styles
        css={dscPageBodyContentsCss}
        mode={layoutMode}
        direction={layoutDirection}
        fixedPanelSize={sidebarWidth ?? defaultSidebarWidth}
        minFixedPanelSize={minSidebarWidth}
        minFlexPanelSize={minMainPanelWidth}
        fixedPanel={<OutPortal node={sidebarPanelNode} />}
        flexPanel={<OutPortal node={mainPanelNode} />}
        data-test-subj="discoverLayout"
        onFixedPanelSizeChange={setSidebarWidthAndUpdateInStorage}
      />
    </>
  );
};

export const DiscoverResizableLayout = withRestorableState(InternalDiscoverResizableLayout);

export type DiscoverResizableLayoutProps = ComponentProps<typeof DiscoverResizableLayout>;

const dscPageBodyContentsCss = css`
  overflow: hidden;
  height: 100%;
`;
