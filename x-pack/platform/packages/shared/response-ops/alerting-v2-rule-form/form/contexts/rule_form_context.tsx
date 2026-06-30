/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApplicationStart, HttpStart, NotificationsStart } from '@kbn/core/public';
import type { CPSPluginStart } from '@kbn/cps/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { LensPublicStart } from '@kbn/lens-plugin/public';
import type { UiActionsStart } from '@kbn/ui-actions-plugin/public';
import type { DashboardStart } from '@kbn/dashboard-plugin/public';
import type { PropsWithChildren } from 'react';
import React, { createContext, useContext, useMemo } from 'react';

export interface RuleFormServices {
  http: HttpStart;
  data: DataPublicPluginStart;
  dataViews: DataViewsPublicPluginStart;
  notifications: NotificationsStart;
  application: ApplicationStart;
  lens: LensPublicStart;
  uiActions?: UiActionsStart;
  dashboard?: DashboardStart;
  cps?: CPSPluginStart;
}

export type RuleFormLayout = 'page' | 'flyout';

export interface RuleFormMeta {
  /** Whether the form is rendered on a full page or inside a flyout. */
  layout: RuleFormLayout;
  /**
   * Optional additional DSL filter composed into the preview query (e.g.
   * exception exclusions). Consumed by the rule results preview.
   */
  additionalPreviewFilter?: unknown;
}

interface RuleFormContextValue {
  services: RuleFormServices;
  meta: RuleFormMeta;
}

const DEFAULT_META: RuleFormMeta = { layout: 'page' };

const RuleFormContext = createContext<RuleFormContextValue | undefined>(undefined);

/**
 * Provides services and metadata to all rule form descendants.
 *
 * `meta` defaults to `{ layout: 'page' }` when omitted.
 */
export const RuleFormProvider = ({
  children,
  services,
  meta = DEFAULT_META,
}: PropsWithChildren<{
  services: RuleFormServices;
  meta?: RuleFormMeta;
}>): React.ReactElement => {
  const value = useMemo(() => ({ services, meta }), [services, meta]);
  return <RuleFormContext.Provider value={value}>{children}</RuleFormContext.Provider>;
};

const useRuleFormContext = (): RuleFormContextValue => {
  const context = useContext(RuleFormContext);
  if (!context) {
    throw new Error('useRuleFormContext must be used within RuleFormProvider');
  }
  return context;
};

/** Backward-compatible hook that returns only the services object. */
export const useRuleFormServices = (): RuleFormServices => {
  const { services } = useRuleFormContext();
  return services;
};

/** Returns the form metadata (layout, etc.). */
export const useRuleFormMeta = (): RuleFormMeta => {
  const { meta } = useRuleFormContext();
  return meta;
};
