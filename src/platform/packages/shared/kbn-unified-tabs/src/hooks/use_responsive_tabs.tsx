/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { EuiButtonIcon, EuiToolTip, useEuiTheme, useResizeObserver } from '@elastic/eui';
import { throttle } from 'lodash';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import useEvent from 'react-use/lib/useEvent';
import type { TabItem } from '../types';
import { calculateResponsiveTabs } from '../utils/calculate_responsive_tabs';

const SCROLL_STEP = 200;

interface ScrollState {
  isScrollableLeft: boolean;
  isScrollableRight: boolean;
}

export interface UseResponsiveTabsProps {
  items: TabItem[];
  hasReachedMaxItemsCount: boolean;
  tabsContainerWithPlusElement: Element | null;
  tabsContainerElement: Element | null;
}

export const useResponsiveTabs = ({
  items,
  hasReachedMaxItemsCount,
  tabsContainerWithPlusElement,
  tabsContainerElement,
}: UseResponsiveTabsProps) => {
  const { euiTheme } = useEuiTheme();
  const dimensions = useResizeObserver(tabsContainerWithPlusElement);
  const horizontalGap = parseInt(euiTheme.size.s, 10); // matches gap between tabs

  const tabsSizeConfig = useMemo(() => {
    return calculateResponsiveTabs({
      items,
      containerWidth: dimensions.width,
      hasReachedMaxItemsCount,
      horizontalGap,
    });
  }, [items, dimensions.width, hasReachedMaxItemsCount, horizontalGap]);

  const [scrollState, setScrollState] = useState<ScrollState>();

  const scrollLeftButtonLabel = i18n.translate('unifiedTabs.scrollLeftButton', {
    defaultMessage: 'Scroll left',
  });

  const scrollRightButtonLabel = i18n.translate('unifiedTabs.scrollRightButton', {
    defaultMessage: 'Scroll right',
  });

  const onScroll = useCallback(() => {
    setScrollState(calculateScrollState(tabsContainerElement));
  }, [tabsContainerElement, setScrollState]);

  const onScrollThrottled = useMemo(
    () => throttle(onScroll, 200, { leading: false, trailing: true }),
    [onScroll]
  );

  useEvent('scroll', onScrollThrottled, tabsContainerElement);

  useEffect(() => {
    onScroll();
    // `dimensions.width` added here to trigger in cases when the container width changes
    // `tabsSizeConfig.isScrollable` added here to trigger scroll state recalculation
    // when items are added/removed and scrollability changes (e.g. after tab restoration)
  }, [onScroll, dimensions.width, tabsSizeConfig.isScrollable]);

  const scrollLeft = useCallback(() => {
    if (tabsContainerElement) {
      tabsContainerElement.scrollLeft = Math.max(tabsContainerElement.scrollLeft - SCROLL_STEP, 0);
      onScrollThrottled();
    }
  }, [tabsContainerElement, onScrollThrottled]);

  const scrollRight = useCallback(() => {
    if (tabsContainerElement) {
      tabsContainerElement.scrollLeft = Math.min(
        tabsContainerElement.scrollLeft + SCROLL_STEP,
        tabsContainerElement.scrollWidth
      );
      onScrollThrottled();
    }
  }, [tabsContainerElement, onScrollThrottled]);

  const scrollLeftButton = useMemo(
    () =>
      tabsSizeConfig.isScrollable ? (
        <EuiToolTip content={scrollLeftButtonLabel} disableScreenReaderOutput>
          <EuiButtonIcon
            data-test-subj="unifiedTabs_tabsBar_scrollLeftBtn"
            iconType="chevronSingleLeft"
            color="text"
            disabled={scrollState?.isScrollableLeft === false}
            aria-label={scrollLeftButtonLabel}
            onClick={scrollLeft}
          />
        </EuiToolTip>
      ) : null,
    [scrollLeftButtonLabel, scrollLeft, tabsSizeConfig.isScrollable, scrollState?.isScrollableLeft]
  );

  const scrollRightButton = useMemo(
    () =>
      tabsSizeConfig.isScrollable ? (
        <EuiToolTip content={scrollRightButtonLabel} disableScreenReaderOutput>
          <EuiButtonIcon
            data-test-subj="unifiedTabs_tabsBar_scrollRightBtn"
            iconType="chevronSingleRight"
            color="text"
            disabled={scrollState?.isScrollableRight === false}
            aria-label={scrollRightButtonLabel}
            onClick={scrollRight}
          />
        </EuiToolTip>
      ) : null,
    [
      scrollRightButtonLabel,
      scrollRight,
      tabsSizeConfig.isScrollable,
      scrollState?.isScrollableRight,
    ]
  );

  const tabsContainerCss = useMemo(() => {
    let overflowGradient = '';
    if (scrollState?.isScrollableLeft && scrollState?.isScrollableRight) {
      overflowGradient = `
        mask-image: linear-gradient(
          to right,
          rgba(255, 0, 0, 0.1) 0%,
          rgb(255, 0, 0) ${euiTheme.size.s},
          rgb(255, 0, 0) calc(100% - ${euiTheme.size.s}),
          rgba(255, 0, 0, 0.1) 100%
        );
      `;
    } else if (scrollState?.isScrollableLeft) {
      overflowGradient = `
        mask-image: linear-gradient(
          to right,
          rgba(255, 0, 0, 0.1) 0%,
          rgb(255, 0, 0) ${euiTheme.size.s}
        );
      `;
    } else if (scrollState?.isScrollableRight) {
      overflowGradient = `
        mask-image: linear-gradient(
          to right,
          rgb(255, 0, 0) calc(100% - ${euiTheme.size.s}),
          rgba(255, 0, 0, 0.1) 100%
        );
      `;
    }

    return css`
      overflow-x: auto;
      max-width: 100%;
      user-select: none;
      scrollbar-width: none; // hide the scrollbar
      scroll-behavior: smooth;
      padding-inline: ${euiTheme.size.xs}; // space for curved notch
      // Extend the clip box downward (net-zero layout) so the active tab can overlap the
      // container's bottom border without being clipped by overflow-x (which forces overflow-y to clip).
      padding-bottom: ${euiTheme.size.s};
      margin-bottom: -${euiTheme.size.s};
      &::-webkit-scrollbar {
        display: none;
      }
      transform: translateZ(0);
      ${overflowGradient}
    `;
  }, [scrollState, euiTheme.size.s, euiTheme.size.xs]);

  return {
    tabsSizeConfig,
    scrollLeftButton,
    scrollRightButton,
    tabsContainerCss,
  };
};

function calculateScrollState(tabsContainerElement: Element | null): ScrollState | undefined {
  if (tabsContainerElement) {
    const { scrollLeft, scrollWidth, clientWidth } = tabsContainerElement;
    const isScrollableLeft = scrollLeft > 0;
    const isScrollableRight = scrollLeft + clientWidth < scrollWidth;

    return { isScrollableLeft, isScrollableRight };
  }
}
