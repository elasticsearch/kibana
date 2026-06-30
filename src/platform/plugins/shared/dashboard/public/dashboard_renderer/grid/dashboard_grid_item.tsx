/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UseEuiTheme } from '@elastic/eui';
import { EuiLoadingChart, transparentize, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { EmbeddableRenderer } from '@kbn/embeddable-plugin/public';
import { useBatchedPublishingSubjects } from '@kbn/presentation-publishing';
import classNames from 'classnames';
import React, { useLayoutEffect, useMemo } from 'react';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { useDashboardApi } from '../../dashboard_api/use_dashboard_api';
import { useDashboardInternalApi } from '../../dashboard_api/use_dashboard_internal_api';
import { printViewportVisStyles } from '../print_styles';
import { DASHBOARD_MARGIN_SIZE } from './constants';
import { getHighlightStyles } from './highlight_styles';

type DivProps = Pick<React.HTMLAttributes<HTMLDivElement>, 'className' | 'style' | 'children'>;

export interface Props extends DivProps {
  appFixedViewport?: HTMLElement;
  id: string;
  index?: number;
  type: string;
  key: string;
  isRenderable?: boolean;
  setDragHandles?: (refs: Array<HTMLElement | null>) => void;
}

export const Item = React.forwardRef<HTMLDivElement, Props>(
  (
    {
      appFixedViewport,
      id,
      index,
      type,
      isRenderable = true,
      setDragHandles,
      children,
      className,
      ...rest
    },
    ref
  ) => {
    const dashboardApi = useDashboardApi();
    const dashboardInternalApi = useDashboardInternalApi();
    const [
      hidePanelBorders,
      highlightPanelId,
      scrollToPanelId,
      expandedPanelId,
      focusedPanelId,
      useMargins,
      viewMode,
      dashboardContainerRef,
      relatedPanelsIndicatorId,
      blurredPanelIds,
    ] = useBatchedPublishingSubjects(
      dashboardApi.hideBorder$,
      dashboardApi.highlightPanelId$,
      dashboardApi.scrollToPanelId$,
      dashboardApi.expandedPanelId$,
      dashboardApi.focusedPanelId$,
      dashboardApi.settings.useMargins$,
      dashboardApi.viewMode$,
      dashboardInternalApi.dashboardContainerRef$,
      dashboardApi.relatedPanelsIndicatorId$,
      dashboardApi.blurredPanelIds$
    );

    const expandPanel = expandedPanelId !== undefined && expandedPanelId === id;
    const hidePanel = expandedPanelId !== undefined && expandedPanelId !== id;

    const isIndicatingRelatedPanels =
      relatedPanelsIndicatorId !== undefined && relatedPanelsIndicatorId === id;

    const focusPanel =
      isIndicatingRelatedPanels || (focusedPanelId !== undefined && focusedPanelId === id);
    const focusedForEdit = focusedPanelId !== undefined && focusedPanelId === id;

    const blurPanel = blurredPanelIds.includes(id);

    const showBorder = useMargins && !hidePanelBorders; // we do not show panel borders when margins are disabled
    const classes = classNames('dshDashboardGrid__item', {
      'dshDashboardGrid__item--expanded': expandPanel,
      'dshDashboardGrid__item--hidden': hidePanel,
      'dshDashboardGrid__item--focused': focusPanel,
      'dshDashboardGrid__item--blurred': blurPanel,
      'dshDashboardGrid__item--selected': isIndicatingRelatedPanels,
      'dshDashboardGrid__item--hideHoverActions': blurPanel || focusedForEdit,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      printViewport__vis: viewMode === 'print',
    });

    useLayoutEffect(() => {
      if (typeof ref !== 'function' && ref?.current) {
        const panelRef = ref.current;
        if (scrollToPanelId === id) {
          dashboardApi.scrollToPanel(panelRef);
        }
        if (highlightPanelId === id) {
          dashboardApi.highlightPanel(panelRef);
        }

        panelRef.querySelectorAll('*').forEach((e) => {
          if (blurPanel) {
            // remove blurred panels and nested elements from tab order
            e.setAttribute('tabindex', '-1');
          } else {
            // restore tab order
            e.removeAttribute('tabindex');
          }
        });
      }
    }, [id, dashboardApi, scrollToPanelId, highlightPanelId, ref, blurPanel]);

    const dashboardContainerTopOffset = dashboardContainerRef?.offsetTop || 0;
    const globalNavTopOffset = appFixedViewport?.offsetTop || 0;
    const styles = useMemoCss(dashboardGridItemStyles);

    const renderedEmbeddable = useMemo(() => {
      const panelProps = {
        showBadges: true,
        showBorder,
        showNotifications: true,
        showShadow: false,
        setDragHandles,
      };

      return (
        <EmbeddableRenderer
          type={type}
          maybeId={id}
          getParentApi={() => dashboardApi}
          key={`${type}_${id}`}
          panelProps={panelProps}
          onApiAvailable={(api) => dashboardApi.registerChildApi(api)}
        />
      );
    }, [id, dashboardApi, type, showBorder, setDragHandles]);

    const { euiTheme } = useEuiTheme();
    const hoverActionsHeight = euiTheme.base * 2;

    const focusStyles = blurPanel
      ? styles.focusPanelBlur
      : css({
          scrollMarginTop: `${
            dashboardContainerTopOffset +
            globalNavTopOffset +
            DASHBOARD_MARGIN_SIZE +
            hoverActionsHeight
          }px`,
        });

    return (
      <div
        css={[focusStyles, styles.item]}
        className={[classes, className].join(' ')}
        data-test-subj="dashboardPanel"
        id={`panel-${id}`}
        ref={ref}
        {...rest}
      >
        {isRenderable ? (
          <>
            {renderedEmbeddable}
            {children}
          </>
        ) : (
          <div>
            <EuiLoadingChart size="l" />
          </div>
        )}
      </div>
    );
  }
);

export const DashboardGridItem = React.forwardRef<HTMLDivElement, Props>((props, ref) => {
  // The `labs:dashboard:deferBelowFold` setting is intentionally not honored: its deferred
  // (below-the-fold) loading behavior is currently broken, so panels are always rendered
  // eagerly. The advanced setting remains available but has no effect until it is fixed
  // (https://github.com/elastic/kibana/issues/150459)
  return <Item ref={ref} {...props} />;
});

const dashboardGridItemStyles = {
  item: (context: UseEuiTheme) =>
    css([
      {
        height: '100%',
        // Remove padding in fullscreen mode
        '.kbnAppWrapper--hiddenChrome &.dshDashboardGrid__item--expanded': {
          padding: 0,
        },
        '.kbnAppWrapper--hiddenChrome & .dshDashboardGrid__item--expanded': {
          padding: 0,
        },
        // Call out focused panels with a simple border
        '&.dshDashboardGrid__item--focused .embPanel': {
          outline: `${context.euiTheme.border.width.thick} solid ${context.euiTheme.colors.vis.euiColorVis0}`,
        },
        // Call out panels that are selected to indicate their related panels with the same border plus a semitransparent overlay
        '&.dshDashboardGrid__item--selected': {
          // Ensure the overall panel still has a plain background so we can apply the semitransparent overlay on top of it
          backgroundColor: context.euiTheme.colors.backgroundBasePlain,
          '& .embPanel': {
            backgroundColor: transparentize(context.euiTheme.colors.vis.euiColorVis0, 0.1),

            '& div, & button': {
              backgroundColor: 'transparent',
            },
          },
        },
      },
      getHighlightStyles(context),
      printViewportVisStyles(context),
    ]),
  focusPanelBlur: css({
    pointerEvents: 'none',
    opacity: '0.25',
  }),
};
