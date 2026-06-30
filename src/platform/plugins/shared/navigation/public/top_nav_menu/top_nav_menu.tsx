/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { css } from '@emotion/react';
import type { ReactElement } from 'react';
import React from 'react';

import type { MountPoint } from '@kbn/core/public';
import { MountPointPortal } from '@kbn/react-kibana-mount';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import type { StatefulSearchBarProps } from '@kbn/unified-search-plugin/public';
import type { AggregateQuery, Query } from '@kbn/es-query';
import type { EuiBreakpointSize, EuiHeaderLinksProps } from '@elastic/eui';
import type { TopNavMenuData } from './top_nav_menu_data';
import { TopNavMenuItems } from './top_nav_menu_items';
import { type TopNavMenuBadgeProps, TopNavMenuBadges } from './top_nav_menu_badges';

/**
 * @deprecated Use AppMenu from "@kbn/core-chrome-app-menu" instead
 */
type TopNavSearchBarProps<QT extends Query | AggregateQuery = Query> = Omit<
  Extract<StatefulSearchBarProps<QT>, { asCodeFilterMode?: false }>,
  'kibana' | 'intl' | 'timeHistory'
>;

export type TopNavMenuProps<QT extends Query | AggregateQuery = Query> = TopNavSearchBarProps<QT> & {
  config?: TopNavMenuData[];
  /**
   * @deprecated Use coreStart.chrome.setBreadcrumbsBadges API instead
   */
  badges?: TopNavMenuBadgeProps[];
  showSearchBar?: boolean;
  showQueryInput?: boolean;
  showDatePicker?: boolean;
  showFilterBar?: boolean;
  unifiedSearch?: UnifiedSearchPublicPluginStart;
  className?: string;
  visible?: boolean;
  gutterSize?: EuiHeaderLinksProps['gutterSize'];
  /**
   * If provided, the menu part of the component will be rendered as a portal inside the given mount point.
   *
   * This is meant to be used with the `setHeaderActionMenu` core API.
   *
   * @example
   * ```ts
   * export renderApp = ({ element, history, setHeaderActionMenu }: AppMountParameters) => {
   *   const topNavConfig = ...; // TopNavMenuProps
   *   return (
   *     <Router history=history>
   *       <TopNavMenu {...topNavConfig} setMenuMountPoint={setHeaderActionMenu}>
   *       <MyRoutes />
   *     </Router>
   *   )
   * }
   * ```
   */
  setMenuMountPoint?: (menuMount: MountPoint | undefined) => void;

  /**
   * A list of named breakpoints at which to show the popover version. If not provided, it will use the default set of ['xs', 's'] that is internally provided by EUI.
   */
  popoverBreakpoints?: EuiBreakpointSize[];
};

/*
 * Top Nav Menu is a convenience wrapper component for:
 * - Top navigation menu - configured by an array of `TopNavMenuData` objects
 * - Search Bar - which includes Filter Bar \ Query Input \ Timepicker.
 *
 * See SearchBar documentation to learn more about its properties.
 *
 **/

/**
 * @deprecated Use AppMenu from "@kbn/core-chrome-app-menu" instead
 */
export function TopNavMenu<QT extends AggregateQuery | Query = Query>(
  props: TopNavMenuProps<QT>
): ReactElement | null {
  const { config, badges, showSearchBar, gutterSize, ...searchBarProps } = props;

  if ((!config || config.length === 0) && (!showSearchBar || !props.unifiedSearch)) {
    return null;
  }

  function renderBadges(): ReactElement | null {
    return <TopNavMenuBadges badges={badges} />;
  }

  function renderMenu(): ReactElement | null {
    return (
      <TopNavMenuItems
        config={config}
        className={props.className}
        data-test-subj="kbn-top-nav-menu-wrapper"
        css={css`
          button:last-child {
            margin-right: 0;
          }
        `}
        popoverBreakpoints={props.popoverBreakpoints}
        gutterSize={gutterSize}
      />
    );
  }

  function renderSearchBar(): ReactElement | null {
    // Validate presence of all required fields
    if (!showSearchBar || !props.unifiedSearch) return null;
    const { AggregateQuerySearchBar } = props.unifiedSearch.ui;
    return <AggregateQuerySearchBar<QT> {...searchBarProps} />;
  }

  function renderLayout() {
    const { setMenuMountPoint, visible } = props;
    const styles = {
      badgeWrapper: css`
        display: flex;
        align-items: center;
      `,
      hidden: css`
        display: none;
      `,
    };
    if (setMenuMountPoint) {
      const badgesEl = renderBadges();
      const menuEl = renderMenu();
      return (
        <>
          {(badgesEl || menuEl) && (
            <MountPointPortal setMountPoint={setMenuMountPoint}>
              <span
                className="kbnTopNavMenu__wrapper"
                css={[styles.badgeWrapper, visible === false && styles.hidden]}
              >
                {badgesEl}
                {menuEl}
              </span>
            </MountPointPortal>
          )}

          {renderSearchBar()}
        </>
      );
    } else {
      return (
        <>
          <span css={[visible === false && styles.hidden]}>{renderMenu()}</span>
          {renderSearchBar()}
        </>
      );
    }
  }

  return renderLayout();
}

TopNavMenu.defaultProps = {
  showSearchBar: false,
  showQueryInput: true,
  showDatePicker: true,
  showFilterBar: true,
  screenTitle: '',
};
