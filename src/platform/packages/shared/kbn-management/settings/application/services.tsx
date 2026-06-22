/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC, PropsWithChildren } from 'react';
import React, { useContext } from 'react';

import {
  FormProvider,
  FormKibanaProvider,
  type FormKibanaDependencies,
  type FormServices,
} from '@kbn/management-settings-components-form';
import type { SettingsCapabilities, UiSettingMetadata } from '@kbn/management-settings-types';
import type { IUiSettingsClient, IUiSettingsMetadataClient } from '@kbn/core-ui-settings-browser';
import { normalizeSettings } from '@kbn/management-settings-utilities';
import type { Subscription } from 'rxjs';
import type { ApplicationStart, ScopedHistory } from '@kbn/core-application-browser';
import type { UiSettingsScope } from '@kbn/core-ui-settings-common';
import type {
  RegistryEntry,
  SectionRegistryStart,
} from '@kbn/management-settings-section-registry';
import type { ToastsStart } from '@kbn/core-notifications-browser';
import type { ChromeBadge, ChromeStart } from '@kbn/core-chrome-browser';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { Space } from '@kbn/spaces-plugin/common';
import type { SolutionView } from '@kbn/spaces-plugin/common';

export interface Services {
  getAllowlistedSettings: (
    scope: UiSettingsScope,
    solution: SolutionView | undefined
  ) => Promise<Record<string, UiSettingMetadata>>;
  getSections: (scope: UiSettingsScope) => RegistryEntry[];
  getToastsService: () => ToastsStart;
  getCapabilities: () => SettingsCapabilities;
  setBadge: (badge: ChromeBadge) => void;
  subscribeToUpdates: (fn: () => void, scope: UiSettingsScope) => Subscription;
  isCustomSetting: (key: string, scope: UiSettingsScope) => boolean;
  isOverriddenSetting: (key: string, scope: UiSettingsScope) => boolean;
  addUrlToHistory: (url: string) => void;
  getActiveSpace: () => Promise<Pick<Space, 'solution'>>;
  subscribeToActiveSpace: (fn: () => void) => Subscription;
}

export type SettingsApplicationServices = Services & FormServices;

export interface KibanaDependencies {
  settings: {
    client: Pick<IUiSettingsClient, 'isCustom' | 'isOverridden' | 'getUpdate$' | 'validateValue'>;
    globalClient: Pick<
      IUiSettingsClient,
      'isCustom' | 'isOverridden' | 'getUpdate$' | 'validateValue'
    >;
    metadata: IUiSettingsMetadataClient;
  };
  history: ScopedHistory;
  sectionRegistry: SectionRegistryStart;
  notifications: {
    toasts: ToastsStart;
  };
  application: Pick<ApplicationStart, 'capabilities'>;
  chrome: Pick<ChromeStart, 'setBadge'>;
  spaces: Pick<SpacesPluginStart, 'getActiveSpace' | 'getActiveSpace$'>;
}

export type SettingsApplicationKibanaDependencies = KibanaDependencies & FormKibanaDependencies;

const SettingsApplicationContext = React.createContext<Services | null>(null);

/**
 * A Context Provider that provides services to the component and its dependencies.
 */
export const SettingsApplicationProvider: FC<PropsWithChildren<SettingsApplicationServices>> = ({
  children,
  ...services
}) => {
  // Destructure the services to avoid a type-widening inclusion of unrelated services.
  const {
    saveChanges,
    showError,
    validateChange,
    showReloadPagePrompt,
    links,
    showDanger,
    getAllowlistedSettings,
    getSections,
    getCapabilities,
    setBadge,
    getToastsService,
    subscribeToUpdates,
    isCustomSetting,
    isOverriddenSetting,
    addUrlToHistory,
    getActiveSpace,
    subscribeToActiveSpace,
  } = services;

  return (
    <SettingsApplicationContext.Provider
      value={{
        getAllowlistedSettings,
        getSections,
        getToastsService,
        getCapabilities,
        setBadge,
        subscribeToUpdates,
        isCustomSetting,
        isOverriddenSetting,
        addUrlToHistory,
        getActiveSpace,
        subscribeToActiveSpace,
      }}
    >
      <FormProvider
        {...{ saveChanges, showError, validateChange, showReloadPagePrompt, links, showDanger }}
      >
        {children}
      </FormProvider>
    </SettingsApplicationContext.Provider>
  );
};

/**
 * Kibana-specific Provider that maps dependencies to services.
 */
export const SettingsApplicationKibanaProvider: FC<
  PropsWithChildren<SettingsApplicationKibanaDependencies>
> = ({ children, ...dependencies }) => {
  const {
    docLinks,
    notifications,
    userProfile,
    theme,
    i18n,
    settings,
    history,
    sectionRegistry,
    application,
    chrome,
    spaces,
  } = dependencies;
  const { client, globalClient, metadata } = settings;

  const getScopeClient = (scope: UiSettingsScope) => {
    return scope === 'namespace' ? client : globalClient;
  };

  const getAllowlistedSettings = async (
    scope: UiSettingsScope,
    solution: SolutionView | undefined
  ) => {
    const { filterSettings } = application.capabilities;
    const allSettings = await metadata.getAll(scope);
    const rawSettings = Object.fromEntries(
      Object.entries(allSettings).filter(
        ([settingId, settingDef]) =>
          !settingDef.readonly &&
          !client.isCustom(settingId) &&
          (!filterSettings.bySolutionView ||
            !solution ||
            !settingDef.solutionViews ||
            settingDef.solutionViews.includes(solution))
      )
    );
    return normalizeSettings(rawSettings);
  };

  const getSections = (scope: UiSettingsScope) => {
    return scope === 'namespace'
      ? sectionRegistry.getSpacesSections()
      : sectionRegistry.getGlobalSections();
  };

  const getCapabilities = () => {
    const { advancedSettings, globalSettings, filterSettings } = application.capabilities;
    return {
      spaceSettings: {
        show: advancedSettings.show as boolean,
        save: advancedSettings.save as boolean,
      },
      globalSettings: {
        show: globalSettings.show as boolean,
        save: globalSettings.save as boolean,
      },
      filterSettings: {
        bySolutionView: filterSettings.bySolutionView as boolean,
      },
    };
  };

  const isCustomSetting = (key: string, scope: UiSettingsScope) => {
    const scopeClient = getScopeClient(scope);
    return scopeClient.isCustom(key);
  };

  const isOverriddenSetting = (key: string, scope: UiSettingsScope) => {
    const scopeClient = getScopeClient(scope);
    return scopeClient.isOverridden(key);
  };

  const subscribeToUpdates = (fn: () => void, scope: UiSettingsScope) => {
    const scopeClient = getScopeClient(scope);
    return scopeClient.getUpdate$().subscribe(fn);
  };

  const services: Services = {
    getAllowlistedSettings,
    getSections,
    getToastsService: () => notifications.toasts,
    getCapabilities,
    setBadge: (badge: ChromeBadge) => chrome.setBadge(badge),
    isCustomSetting,
    isOverriddenSetting,
    subscribeToUpdates,
    addUrlToHistory: (url: string) => history.replace({ pathname: '', search: url }),
    getActiveSpace: spaces.getActiveSpace,
    subscribeToActiveSpace: (fn: () => void) => {
      return spaces.getActiveSpace$().subscribe(fn);
    },
  };

  return (
    <SettingsApplicationContext.Provider value={services}>
      <FormKibanaProvider {...{ docLinks, notifications, userProfile, theme, i18n, settings }}>
        {children}
      </FormKibanaProvider>
    </SettingsApplicationContext.Provider>
  );
};

/**
 * React hook for accessing pre-wired services.
 */
export const useServices = () => {
  const context = useContext(SettingsApplicationContext);

  if (!context) {
    throw new Error(
      'SettingsApplicationContext is missing.  Ensure your component or React root is wrapped with SettingsApplicationProvider.'
    );
  }

  return context;
};
