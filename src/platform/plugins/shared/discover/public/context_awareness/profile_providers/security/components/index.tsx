/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { withSuspense } from '@kbn/shared-ux-utility';
import { lazy } from 'react';

export const AlertEventOverviewLazy = withSuspense(
  lazy(() =>
    import('./alert_event_overview').then((module) => ({
      default: module.AlertEventOverview,
    }))
  )
);

export const EnhancedAlertEventOverviewLazy = withSuspense(
  lazy(() =>
    import('./enhanced_alert_event_overview').then((module) => ({
      default: module.EnhancedAlertEventOverview,
    }))
  )
);

export const EnhancedAlertFlyoutHeaderLazy = withSuspense(
  lazy(() =>
    import('./enhanced_alert_flyout_header').then((module) => ({
      default: module.EnhancedAlertFlyoutHeader,
    }))
  )
);

export const EnhancedAlertFlyoutFooterLazy = withSuspense(
  lazy(() =>
    import('./enhanced_alert_flyout_footer').then((module) => ({
      default: module.EnhancedAlertFlyoutFooter,
    }))
  )
);

export const EnhancedIOCOverviewLazy = withSuspense(
  lazy(() =>
    import('./enhanced_ioc_overview').then((module) => ({
      default: module.EnhancedIOCOverview,
    }))
  )
);

export const EnhancedIOCFlyoutFooterLazy = withSuspense(
  lazy(() =>
    import('./enhanced_ioc_flyout_footer').then((module) => ({
      default: module.EnhancedIOCFlyoutFooter,
    }))
  )
);

export const EnhancedIOCFlyoutHeaderLazy = withSuspense(
  lazy(() =>
    import('./enhanced_ioc_flyout_header').then((module) => ({
      default: module.EnhancedIOCFlyoutHeader,
    }))
  )
);

export const EnhancedAttackFlyoutHeaderLazy = withSuspense(
  lazy(() =>
    import('./enhanced_attack_flyout_header').then((module) => ({
      default: module.EnhancedAttackFlyoutHeader,
    }))
  )
);

export const EnhancedAttackFlyoutFooterLazy = withSuspense(
  lazy(() =>
    import('./enhanced_attack_flyout_footer').then((module) => ({
      default: module.EnhancedAttackFlyoutFooter,
    }))
  )
);

export const EnhancedAttackEventOverviewLazy = withSuspense(
  lazy(() =>
    import('./enhanced_attack_event_overview').then((module) => ({
      default: module.EnhancedAttackEventOverview,
    }))
  )
);
