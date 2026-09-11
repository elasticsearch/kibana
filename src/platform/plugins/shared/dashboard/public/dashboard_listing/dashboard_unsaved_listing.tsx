/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UseEuiTheme } from '@elastic/eui';
import {
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiSpacer,
  EuiTitle,
  euiBreakpoint,
} from '@elastic/eui';
import React, { useCallback, useEffect, useState } from 'react';

import type { ViewMode } from '@kbn/presentation-publishing';
import { css } from '@emotion/react';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { KbnInfoCallout } from '@kbn/ui-callout';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { DASHBOARD_PANELS_UNSAVED_ID } from '../services/dashboard_backup_service';
import { dashboardUnsavedListingStrings, getNewDashboardTitle } from './_dashboard_listing_strings';
import { confirmDiscardUnsavedChanges } from './confirm_overlays';
import { findService } from '../dashboard_client';
import { getDashboardBackupService } from '../services/dashboard_api_services';

const unsavedItemStyles = {
  item: (euiThemeContext: UseEuiTheme) =>
    css({
      marginTop: euiThemeContext.euiTheme.size.m,
      [euiBreakpoint(euiThemeContext, ['xs', 's'])]: {
        marginTop: euiThemeContext.euiTheme.size.base,
      },
    }),
  heading: (euiThemeContext: UseEuiTheme) =>
    css({
      [euiBreakpoint(euiThemeContext, ['xs', 's'])]: {
        marginBottom: euiThemeContext.euiTheme.size.xs,
      },
    }),
  icon: (euiThemeContext: UseEuiTheme) =>
    css({
      marginRight: euiThemeContext.euiTheme.size.m,
    }),
  title: css({
    marginBottom: 0,
  }),
  titleLoading: (euiThemeContext: UseEuiTheme) =>
    css({
      color: `${euiThemeContext.euiTheme.colors.subduedText} !important`,
    }),
  actions: (euiThemeContext: UseEuiTheme) =>
    css({
      marginLeft: `calc(${euiThemeContext.euiTheme.size.l} + ${euiThemeContext.euiTheme.size.xs})`,
      [euiBreakpoint(euiThemeContext, ['xs', 's'])]: {
        flexDirection: 'column',
      },
    }),
};

const DashboardUnsavedItem = ({
  id,
  title,
  onOpenClick,
  onDiscardClick,
}: {
  id: string;
  title?: string;
  onOpenClick: () => void;
  onDiscardClick: () => void;
}) => {
  const styles = useMemoCss(unsavedItemStyles);
  return (
    <div css={styles.item} key={id}>
      <EuiFlexGroup alignItems="center" gutterSize="none" css={styles.heading} responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon
            color="text"
            css={styles.icon}
            type={title ? 'productDashboard' : 'clock'}
            aria-hidden={true}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xxs">
            <h4 css={[styles.title, !title && styles.titleLoading]}>
              {title || dashboardUnsavedListingStrings.getLoadingTitle()}
            </h4>
          </EuiTitle>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiFlexGroup
        alignItems="flexStart"
        gutterSize="none"
        css={styles.actions}
        responsive={false}
      >
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            flush="left"
            size="s"
            color="primary"
            disabled={!title}
            onClick={onOpenClick}
            data-test-subj={title ? `edit-unsaved-${title.split(' ').join('-')}` : undefined}
            aria-label={dashboardUnsavedListingStrings.getEditAriaLabel(title ?? id)}
          >
            {dashboardUnsavedListingStrings.getEditTitle()}
          </EuiButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            flush="left"
            size="s"
            color="danger"
            disabled={!title}
            onClick={onDiscardClick}
            data-test-subj={title ? `discard-unsaved-${title.split(' ').join('-')}` : undefined}
            aria-label={dashboardUnsavedListingStrings.getDiscardAriaLabel(title ?? id)}
          >
            {dashboardUnsavedListingStrings.getDiscardTitle()}
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};

interface UnsavedItemMap {
  [key: string]: DashboardState;
}

export interface DashboardUnsavedListingProps {
  unsavedDashboardIds: string[];
  refreshUnsavedDashboards: () => void;
  goToDashboard: (dashboardId?: string, viewMode?: ViewMode) => void;
}

export const DashboardUnsavedListing = ({
  goToDashboard,
  unsavedDashboardIds,
  refreshUnsavedDashboards,
}: DashboardUnsavedListingProps) => {
  const [items, setItems] = useState<UnsavedItemMap>({});

  const onOpen = useCallback(
    (id?: string) => {
      goToDashboard(id, 'edit');
    },
    [goToDashboard]
  );

  const onDiscard = useCallback(
    (id?: string) => {
      confirmDiscardUnsavedChanges(() => {
        getDashboardBackupService().clearState(id);
        refreshUnsavedDashboards();
      });
    },
    [refreshUnsavedDashboards]
  );

  useEffect(() => {
    if (unsavedDashboardIds?.length === 0) {
      return;
    }
    let canceled = false;
    const existingDashboardsWithUnsavedChanges = unsavedDashboardIds.filter(
      (id) => id !== DASHBOARD_PANELS_UNSAVED_ID
    );
    findService.findByIds(existingDashboardsWithUnsavedChanges).then((results) => {
      const dashboardMap = {};
      if (canceled) {
        return;
      }
      let hasError = false;
      const newItems = results.reduce((map, result) => {
        if (result.status === 'error') {
          hasError = true;
          if (result.error && result.notFound) {
            // Save object not found error
            getDashboardBackupService().clearState(result.id);
          }
          return map;
        }
        return {
          ...map,
          [result.id || DASHBOARD_PANELS_UNSAVED_ID]: result.attributes,
        };
      }, dashboardMap);
      if (hasError) {
        refreshUnsavedDashboards();
        return;
      }
      setItems(newItems);
    });

    return () => {
      canceled = true;
    };
  }, [refreshUnsavedDashboards, unsavedDashboardIds]);

  return unsavedDashboardIds.length === 0 ? null : (
    <>
      <KbnInfoCallout
        announceOnMount
        heading="h3"
        data-test-subj="unsavedDashboardsCallout"
        title={dashboardUnsavedListingStrings.getUnsavedChangesTitle(
          unsavedDashboardIds.length > 1
        )}
      >
        {unsavedDashboardIds.map((dashboardId: string) => {
          const title: string | undefined =
            dashboardId === DASHBOARD_PANELS_UNSAVED_ID
              ? getNewDashboardTitle()
              : items[dashboardId]?.title;
          const redirectId = dashboardId === DASHBOARD_PANELS_UNSAVED_ID ? undefined : dashboardId;
          return (
            <DashboardUnsavedItem
              key={dashboardId}
              id={dashboardId}
              title={title}
              onOpenClick={() => onOpen(redirectId)}
              onDiscardClick={() => onDiscard(redirectId)}
            />
          );
        })}
      </KbnInfoCallout>
      <EuiSpacer size="m" />
    </>
  );
};
