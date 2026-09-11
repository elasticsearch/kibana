/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppHeaderBack } from '@kbn/app-header';
import type { LinkProps } from '@kbn/observability-shared-plugin/public/hooks/use_link_props';
import type { ParentBreadcrumbOption } from '../../../hooks/resolve_parent_breadcrumb_option';

/**
 * Maps the resolved parent breadcrumb to a single AppHeader back target.
 * `onClick` is kept when present so origin-search restore can `replace` via `navigateToApp`.
 */
export function toMetricsAppHeaderBack(
  option: ParentBreadcrumbOption<LinkProps>
): AppHeaderBack | undefined {
  const { href, onClick } = option.link;
  if (!href) {
    return undefined;
  }

  return {
    href,
    label: option.text,
    onClick,
  };
}
