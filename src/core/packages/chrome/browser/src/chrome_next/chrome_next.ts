/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReactElement, ReactNode, MouseEventHandler } from 'react';
import type { Observable } from 'rxjs';
import type { AppMenuConfig } from '@kbn/core-chrome-app-menu-components';
import type { GlobalHeaderAiButton } from './ai_button';
import type { GlobalSearchConfig } from './global_search';

/** @public */
export type AppHeaderBack = string | AppHeaderBackTarget;

/** @public */
export interface AppHeaderBackTarget {
  href: string;
  /** Click handler, called alongside href navigation when provided. */
  onClick?: MouseEventHandler;
  /** Destination name for accessibility (e.g. "Back to {label}"). */
  label?: string;
}

/** @public */
export interface AppHeaderBadge {
  label: string;
  /** EUI badge color. `filled` is intentionally excluded. */
  color?: 'hollow' | 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'accent';
  tooltip?: string;
  onClick?: () => void;
  onClickAriaLabel?: string;
  'data-test-subj'?: string;
  /** @deprecated Used for compatibility with existing breadcrumb badge custom renderers. */
  renderCustomBadge?: (props: { badgeText: string }) => ReactElement;
  /** Popover menu items for badge context menus. When provided, the badge becomes a dropdown trigger. */
  items?: AppHeaderBadgeItem[];
  /** Width of the popover menu panel in pixels. */
  popoverWidth?: number;
}

/** @public */
export interface AppHeaderBadgeItem {
  name: string;
  icon?: string;
  onClick?: () => void;
  items?: AppHeaderBadgeItem[];
  popoverWidth?: number;
  'data-test-subj'?: string;
  disabled?: boolean;
  toolTipContent?: string;
}

/** @public */
export interface AppHeaderTabIconBadge {
  /** EUI icon type rendered in the tab badge. */
  iconType: string;
  /** Optional tooltip shown when hovering the badge icon. */
  tooltip?: string;
}

/**
 * Tab badge: either a numeric count (rendered as a notification badge) or an icon
 * with an optional tooltip.
 *
 * @public
 */
export type AppHeaderTabBadge = number | AppHeaderTabIconBadge;

/** @public */
export interface AppHeaderTab {
  id: string;
  label: string;
  isSelected?: boolean;
  onClick?: () => void;
  href?: string;
  badge?: AppHeaderTabBadge;
  'data-test-subj'?: string;
  disabled?: boolean;
  toolTipContent?: string;
}

/** @public */
export type AppHeaderMetadataItem =
  | AppHeaderMetadataTextItem
  | AppHeaderMetadataButtonItem
  | AppHeaderMetadataHealthItem;

/** @public */
export type AppHeaderMetadataItems = readonly [
  AppHeaderMetadataItem,
  AppHeaderMetadataItem?,
  AppHeaderMetadataItem?
];

/** @public */
export interface AppHeaderMetadataTextItem {
  type: 'text';
  label: string;
  'data-test-subj'?: string;
}

/** @public */
export type AppHeaderMetadataButtonItem =
  | AppHeaderMetadataButtonAction
  | AppHeaderMetadataButtonLink;

/** @public */
export interface AppHeaderMetadataButtonBase {
  type: 'button';
  label: string;
  iconType?: string;
  'data-test-subj'?: string;
}

/** @public */
export interface AppHeaderMetadataButtonAction extends AppHeaderMetadataButtonBase {
  onClick: () => void;
  href?: never;
}

/** @public */
export interface AppHeaderMetadataButtonLink extends AppHeaderMetadataButtonBase {
  href: string;
  onClick?: never;
}

/** @public */
export interface AppHeaderMetadataHealthItem {
  type: 'health';
  label: string;
  color: string;
  'data-test-subj'?: string;
}

/** @public */
export type AppHeaderTitleSaveResult = string | void;

/** @public */
export interface AppHeaderEditableTitle {
  /** Current title text rendered in the header. */
  text: string;
  /**
   * Commits a rename. Receives the trimmed new title. Return nothing on success; return an
   * error string to reject the value -- it is shown inline and the editor stays open.
   * Thrown or rejected errors are caught and surfaced as a generic error.
   */
  onSave: (nextTitle: string) => AppHeaderTitleSaveResult | Promise<AppHeaderTitleSaveResult>;
  /**
   * Accessible label for the edit input, naming what is being renamed (the title is the
   * dashboard/case/etc. name, not a generic "page title"). Prefer a context-specific label
   * such as "Edit dashboard name". Falls back to a generic label when omitted.
   */
  ariaLabel?: string;
  /**
   * Hint shown when the title is empty: muted text in read mode and the input placeholder
   * in edit mode. Name the entity being created, e.g. "Untitled dashboard".
   */
  placeholder?: string;
}

/** @public */
export type AppHeaderTitle = string | AppHeaderEditableTitle;

/** @public */
export interface AppHeaderConfig {
  title?: AppHeaderTitle;
  back?: AppHeaderBack;
  tabs?: AppHeaderTab[];
  badges?: AppHeaderBadge[];
  menu?: AppMenuConfig;
  favorite?: ReactNode;
  metadata?: AppHeaderMetadataItems;
}

/**
 * Chrome Next rollout APIs.
 *
 * @remarks
 * This namespace starts with the rollout state and will host additional Chrome Next APIs as
 * follow-up feature slices land behind the same flag.
 *
 * @public
 */
export interface ChromeNext {
  /** Whether the Chrome Next feature flag is enabled. */
  readonly isEnabled: boolean;
  aiButton: {
    /**
     * Register an AI button rendered in a fixed slot in the Chrome-Next global header.
     * Returns an unregister callback. Global — persists across app changes.
     *
     * @remarks
     * Stop-gap for the Chrome-Next transition. The end goal is a single, chrome-owned
     * AI button with one registration point. We are not there yet: the legacy header
     * lets every solution register its own button and self-manage visibility, so apps
     * can have more than one in flight at a time. To migrate those apps without
     * regressing behavior, `register` mirrors that model — it accepts multiple
     * registrations and renders each registered button as-is (each owner remains
     * responsible for its own visibility). Once the single-button model lands, this
     * should collapse to one registration and the multi-button handling can be removed.
     *
     * Tech debt: https://github.com/elastic/kibana/issues/272279
     */
    register(button: GlobalHeaderAiButton): () => void;
  };
  /** Global search configuration. */
  globalSearch: {
    /**
     * Set the global search configuration for the Chrome-Next header.
     * Chrome renders a search button; clicking it fires `onClick`.
     * Pass `undefined` to remove. Global — persists across app changes.
     */
    set(config?: GlobalSearchConfig): void;
  };
  /** Context switcher content. */
  contextSwitcher: {
    /**
     * Set the context switcher content for the Chrome-Next header.
     * Pass `undefined` to remove. Global — persists across app changes.
     */
    set(content?: ReactNode): void;
  };
  appHeader: {
    /**
     * Set the app header configuration for the Chrome Next project header.
     * Chrome renders an application top bar with back navigation, title, tabs,
     * badges, menu, share action, and favorite action based on this config.
     * Pass the config to show; the returned callback removes it.
     * Per-app, cleared on app change.
     */
    set(config: AppHeaderConfig): () => void;
  };
  userMenu: {
    /**
     * Set the user menu content for the Chrome-Next global header.
     * Pass `undefined` to remove. Global — persists across app changes.
     */
    set(content?: ReactNode): void;
  };
  /**
   * Register a handler that opens the feedback UI in the Chrome Next help menu.
   *
   * @returns A function to unregister the handler.
   */
  registerFeedbackHandler(handler: () => void): () => void;
  /** Get the currently registered Chrome Next feedback handler. */
  getFeedbackHandler$(): Observable<(() => void) | undefined>;
  /**
   * Register a handler that opens the newsfeed UI in the Chrome Next help menu.
   *
   * @returns A function to unregister the handler.
   */
  registerNewsfeedHandler(handler: { open: () => void; hasNew$: Observable<boolean> }): () => void;
  /** Get the currently registered Chrome Next newsfeed handler. */
  getNewsfeedHandler$(): Observable<{ open: () => void; hasNew$: Observable<boolean> } | undefined>;
}
