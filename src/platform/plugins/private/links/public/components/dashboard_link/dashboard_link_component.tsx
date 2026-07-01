/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import classNames from 'classnames';
import React, { useMemo } from 'react';

import { type UseEuiTheme, EuiListGroupItem } from '@elastic/eui';
import { css } from '@emotion/react';
import { METRIC_TYPE } from '@kbn/analytics';
import { DEFAULT_DASHBOARD_NAVIGATION_OPTIONS } from '@kbn/dashboard-navigation-options-common';
import type { DashboardNavigationOptions } from '@kbn/dashboard-navigation-options-schema';
import type { DashboardLocatorParams } from '@kbn/dashboard-plugin/common';
import type { Query } from '@kbn/es-query';
import { isFilterPinned } from '@kbn/es-query';
import { useBatchedPublishingSubjects } from '@kbn/presentation-publishing';

import { DASHBOARD_LINK_TYPE, LINKS_VERTICAL_LAYOUT } from '../../../common/constants';
import type { LinksLayoutType } from '../../../common/types';
import type { DashboardLink } from '../../../server';
import { trackUiMetric } from '../../services/kibana_services';
import type { LinksParentApi, ResolvedLink } from '../../types';
import { DashboardLinkStrings } from './dashboard_link_strings';

export interface DashboardLinkProps {
  link: ResolvedLink;
  layout: LinksLayoutType;
  parentApi: LinksParentApi;
}

export const DashboardLinkComponent = ({ link, layout, parentApi }: DashboardLinkProps) => {
  const [
    parentDashboardId,
    parentDashboardTitle,
    parentDashboardDescription,
    timeRange,
    filters,
    query,
  ] = useBatchedPublishingSubjects(
    parentApi.savedObjectId$,
    parentApi.title$,
    parentApi.description$,
    parentApi.timeRange$,
    parentApi.filters$,
    parentApi.query$
  );

  /**
   * Returns the title and description of the dashboard that the link points to; note that, if the link points to
   * the current dashboard, then we need to get the most up-to-date information via the `parentDashboardInput` - this
   * will respond to changes so that the link label/tooltip remains in sync with the dashboard title/description.
   */
  const [dashboardTitle, dashboardDescription] = useMemo(() => {
    return link.destination === parentDashboardId
      ? [parentDashboardTitle, parentDashboardDescription]
      : [link.title, link.description];
  }, [link, parentDashboardId, parentDashboardTitle, parentDashboardDescription]);

  /**
   * Memoized link information
   */
  const linkLabel = useMemo(() => {
    return link.label || (dashboardTitle ?? DashboardLinkStrings.getDashboardErrorLabel());
  }, [link, dashboardTitle]);

  const { tooltipTitle, tooltipMessage } = useMemo(() => {
    if (link.error) {
      return {
        tooltipTitle: DashboardLinkStrings.getDashboardErrorLabel(),
        tooltipMessage: link.error.message,
      };
    }
    return {
      tooltipTitle: Boolean(dashboardDescription) ? linkLabel : undefined,
      tooltipMessage: dashboardDescription || linkLabel,
    };
  }, [link, linkLabel, dashboardDescription]);

  /**
   * Dashboard-to-dashboard navigation
   */
  const onClickProps = useMemo(() => {
    /** If the link points to the current dashboard, then there should be no `onClick` or `href` prop */
    if (!link.destination || link.destination === parentDashboardId) return;

    const linkOptions = {
      ...DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
      ...link.options,
    } as DashboardNavigationOptions;

    const params: DashboardLocatorParams = {
      dashboardId: link.destination,
    };
    if (linkOptions.use_filters && query) {
      params.query = query as Query;
    }

    if (linkOptions.use_time_range && timeRange) {
      params.time_range = timeRange;
    }

    params.filters = linkOptions.use_filters ? filters : filters?.filter(isFilterPinned);

    const locator = parentApi.locator;
    if (!locator) return;

    const href = locator.getRedirectUrl(params);
    return {
      href,
      onClick: async (event: React.MouseEvent) => {
        trackUiMetric?.(METRIC_TYPE.CLICK, `${DASHBOARD_LINK_TYPE}:click`);

        /**
         * If the link is being opened via a modified click, then we should use the default `href` navigation behaviour
         * by passing all the dashboard state via the URL - this will keep behaviour consistent across all browsers.
         */
        const modifiedClick = event.ctrlKey || event.metaKey || event.shiftKey;
        if (modifiedClick) {
          return;
        }

        /** Otherwise, prevent the default behaviour and handle click depending on `openInNewTab` option */
        event.preventDefault();
        if (linkOptions.open_in_new_tab) {
          window.open(href, '_blank');
        } else {
          await locator.navigate(params);
        }
      },
    };
  }, [
    link.destination,
    link.options,
    parentDashboardId,
    filters,
    parentApi.locator,
    query,
    timeRange,
  ]);

  const id = `dashboardLink--${link.id}`;
  const testId = `dashboardLink--${link.title}`;

  return (
    <EuiListGroupItem
      color="text"
      {...onClickProps}
      id={id}
      css={styles}
      showToolTip={true}
      toolTipProps={{
        title: tooltipTitle,
        content: tooltipMessage,
        position: layout === LINKS_VERTICAL_LAYOUT ? 'right' : 'bottom',
        repositionOnScroll: true,
        'data-test-subj': `${testId}--tooltip`,
      }}
      iconType={link.error ? 'warning' : undefined}
      iconProps={{ className: 'dashboardLinkIcon' }}
      isDisabled={Boolean(link.error)}
      className={classNames('linksPanelLink', {
        linkCurrent: link.destination === parentDashboardId,
        dashboardLinkError: Boolean(link.error),
        'dashboardLinkError--noLabel': !link.label,
      })}
      label={linkLabel}
      external={(link.options as DashboardLink['options'])?.open_in_new_tab}
      data-test-subj={link.error ? `${testId}--error` : `${testId}`}
      aria-current={link.destination === parentDashboardId}
    />
  );
};

const styles = ({ euiTheme }: UseEuiTheme) =>
  css({
    // universal current dashboard link styles
    '&.linkCurrent': {
      borderRadius: 0,
      cursor: 'default',
      '& .euiListItemLayout__text': {
        color: euiTheme.colors.textPrimary,
      },
    },

    // vertical layout - current dashboard border offset styles
    '.verticalLayoutWrapper & .euiListItemLayout__text': {
      paddingInlineStart: euiTheme.size.s,
    },

    // vertical layout - current dashboard link styles
    '.verticalLayoutWrapper &.linkCurrent': {
      paddingLeft: euiTheme.size.s,
      '&::before': {
        // add left border for current dashboard
        content: "''",
        position: 'absolute',
        height: '75%',
        width: `calc(.5 * ${euiTheme.size.xs})`,
        backgroundColor: euiTheme.colors.primary,
      },
    },

    // horizontal layout - current dashboard link styles
    '.horizontalLayoutWrapper &.linkCurrent': {
      padding: `0 ${euiTheme.size.s}`,
      '& .euiListItemLayout__text': {
        // add bottom border for current dashboard
        boxShadow: `${euiTheme.colors.textPrimary} 0 calc(-.5 * ${euiTheme.size.xs}) inset`,
        paddingInline: 0,
      },
    },

    // dashboard not found error styles
    '&.dashboardLinkError': {
      '&.dashboardLinkError--noLabel .euiListItemLayout__text': {
        fontStyle: 'italic',
      },

      '.dashboardLinkIcon': {
        marginRight: euiTheme.size.s,
      },
    },
  });
