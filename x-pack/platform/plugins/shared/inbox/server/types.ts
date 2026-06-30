/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';
import type { FeaturesPluginSetup } from '@kbn/features-plugin/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { InboxActionProvider } from './services/inbox_action_provider';

/**
 * Public server-side setup contract. Exposed to plugins that depend on the
 * Inbox plugin so they can contribute their own HITL sources.
 */
export interface InboxPluginSetup {
  /**
   * Register an {@link InboxActionProvider} that contributes actions under
   * a specific `sourceApp` namespace. Idempotent across the server lifetime
   * for a given `sourceApp` — registering twice throws.
   *
   * If the Inbox plugin is disabled (`xpack.inbox.enabled: false`), this
   * call is a no-op, letting providers register unconditionally.
   */
  registerActionProvider(provider: InboxActionProvider): void;
}

export type InboxPluginStart = Record<string, never>;

export interface InboxSetupDependencies {
  features: FeaturesPluginSetup;
}

export interface InboxStartDependencies {
  /**
   * Optional at build time because the Inbox plugin still starts in
   * environments without spaces (e.g. some minimal FTR harnesses).
   * When present it is used to resolve the active space id for every
   * request — never assume `'default'`.
   */
  spaces?: SpacesPluginStart;
}

export type InboxRouter = IRouter;

export type {
  InboxActionProvider,
  InboxActionProviderFacetBucket,
  InboxActionProviderFacetsResult,
  InboxActionProviderListParams,
  InboxActionProviderListProcessedParams,
  InboxActionProviderListResult,
  InboxRequestContext,
} from './services/inbox_action_provider';
