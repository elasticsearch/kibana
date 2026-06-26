/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { type FC, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { pick } from 'lodash';

import type { AppMountParameters, CoreStart } from '@kbn/core/public';
import { DatePickerContextProvider, type DatePickerDependencies } from '@kbn/ml-date-picker';
import { Storage } from '@kbn/kibana-utils-plugin/public';
import { UI_SETTINGS } from '@kbn/data-plugin/common';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import { StorageContextProvider } from '@kbn/ml-local-storage';
import useLifecycles from 'react-use/lib/useLifecycles';
import useObservable from 'react-use/lib/useObservable';
import type { ManagementAppMountParams } from '@kbn/management-plugin/public';
import { ML_STORAGE_KEYS } from '@kbn/ml-common-types/storage';
import type { ExperimentalFeatures, MlFeatures, NLPSettings } from '../../common/constants/app';
import type { MlSetupDependencies, MlStartDependencies } from '../plugin';
import { setLicenseCache } from './license';
import { MlRouter } from './routing';
import type { PageDependencies } from './routing/router';
import { EnabledFeaturesContextProvider, MlServerInfoContextProvider } from './contexts/ml';
import type { StartServices } from './contexts/kibana';
import { getMlGlobalServices } from './util/get_services';
import { MlTelemetryContextProvider } from './contexts/ml/ml_telemetry_context';
import type { ManagementSectionId } from './management';

export type MlDependencies = Omit<
  MlSetupDependencies,
  'share' | 'fieldFormats' | 'maps' | 'cases' | 'licensing' | 'uiActions'
> &
  MlStartDependencies;

interface AppProps {
  coreStart: CoreStart;
  deps: MlDependencies;
  appMountParams: ManagementAppMountParams | AppMountParameters;
  isServerless: boolean;
  mlFeatures: MlFeatures;
  experimentalFeatures: ExperimentalFeatures;
  nlpSettings: NLPSettings;
  entryPoint?: ManagementSectionId;
}

const localStorage = new Storage(window.localStorage);

export interface MlServicesContext {
  mlServices: MlGlobalServices;
}

export type MlGlobalServices = ReturnType<typeof getMlGlobalServices>;

export const App: FC<AppProps> = ({
  coreStart,
  deps,
  appMountParams,
  isServerless,
  mlFeatures,
  experimentalFeatures,
  nlpSettings,
  entryPoint,
}) => {
  const pageDeps: PageDependencies = {
    history: appMountParams.history,
    setBreadcrumbs: coreStart.chrome!.setBreadcrumbs,
  };

  const chromeStyle = useObservable(coreStart.chrome.getChromeStyle$(), 'classic');

  const services: StartServices = useMemo(() => {
    return {
      ...coreStart,
      cases: deps.cases,
      charts: deps.charts,
      contentManagement: deps.contentManagement,
      dashboard: deps.dashboard,
      data: deps.data,
      dataViewEditor: deps.dataViewEditor,
      dataViewFieldEditor: deps.dataViewFieldEditor,
      dataViews: deps.data.dataViews,
      dataVisualizer: deps.dataVisualizer,
      embeddable: deps.embeddable,
      fieldFormats: deps.fieldFormats,
      kibanaVersion: deps.kibanaVersion,
      lens: deps.lens,
      licensing: deps.licensing,
      licenseManagement: deps.licenseManagement,
      maps: deps.maps,
      observabilityAIAssistant: deps.observabilityAIAssistant,
      presentationUtil: deps.presentationUtil,
      savedObjectsManagement: deps.savedObjectsManagement,
      savedSearch: deps.savedSearch,
      security: deps.security,
      share: deps.share,
      storage: localStorage,
      triggersActionsUi: deps.triggersActionsUi,
      uiActions: deps.uiActions,
      unifiedSearch: deps.unifiedSearch,
      kql: deps.kql,
      usageCollection: deps.usageCollection,
      mlServices: getMlGlobalServices(coreStart, deps.data.dataViews, deps.usageCollection),
      spaces: deps.spaces,
      fieldsMetadata: deps.fieldsMetadata,
      fileUpload: deps.fileUpload,
      cps: deps.cps,
    };
  }, [deps, coreStart]);

  useLifecycles(
    function setupLicenseOnMount() {
      setLicenseCache(services.mlServices.mlLicense);
      services.mlServices.mlLicense.setup(deps.licensing.license$);
    },
    function destroyLicenseOnUnmount() {
      services.mlServices.mlLicense.unsubscribe();
    }
  );

  // Wait for license and capabilities to be retrieved before rendering the app.
  const licenseReady = useObservable(services.mlServices.mlLicense.isLicenseReady$, false);
  const mlCapabilities = useObservable(
    services.mlServices.mlCapabilities.capabilities$,
    services.mlServices.mlCapabilities.getCapabilities()
  );

  if (!licenseReady || !mlCapabilities) return null;

  const startServices = pick(coreStart, 'analytics', 'i18n', 'theme', 'userProfile', 'chrome');
  const datePickerDeps: DatePickerDependencies = {
    ...pick(services, [
      'data',
      'http',
      'notifications',
      'theme',
      'uiSettings',
      'userProfile',
      'i18n',
    ]),
    uiSettingsKeys: UI_SETTINGS,
    showFrozenDataTierChoice: !isServerless,
  };

  const ApplicationUsageTrackingProvider =
    deps.usageCollection?.components.ApplicationUsageTrackingProvider ?? React.Fragment;

  return (
    <KibanaRenderContextProvider {...startServices}>
      <ApplicationUsageTrackingProvider>
        <KibanaContextProvider services={services}>
          <StorageContextProvider storage={localStorage} storageKeys={ML_STORAGE_KEYS}>
            <DatePickerContextProvider {...datePickerDeps}>
              <EnabledFeaturesContextProvider
                isServerless={isServerless}
                mlFeatures={mlFeatures}
                showMLNavMenu={chromeStyle === 'classic'}
                experimentalFeatures={experimentalFeatures}
              >
                <MlServerInfoContextProvider nlpSettings={nlpSettings}>
                  <MlTelemetryContextProvider telemetryClient={deps.telemetry}>
                    <MlRouter pageDeps={pageDeps} entryPoint={entryPoint} />
                  </MlTelemetryContextProvider>
                </MlServerInfoContextProvider>
              </EnabledFeaturesContextProvider>
            </DatePickerContextProvider>
          </StorageContextProvider>
        </KibanaContextProvider>
      </ApplicationUsageTrackingProvider>
    </KibanaRenderContextProvider>
  );
};

export const renderApp = (
  coreStart: CoreStart,
  deps: MlDependencies,
  appMountParams: AppMountParameters,
  isServerless: boolean,
  mlFeatures: MlFeatures,
  experimentalFeatures: ExperimentalFeatures,
  nlpSettings: NLPSettings
) => {
  appMountParams.onAppLeave((actions) => actions.default());

  ReactDOM.render(
    <App
      coreStart={coreStart}
      deps={deps}
      appMountParams={appMountParams}
      isServerless={isServerless}
      mlFeatures={mlFeatures}
      experimentalFeatures={experimentalFeatures}
      nlpSettings={nlpSettings}
    />,
    appMountParams.element
  );

  return () => {
    ReactDOM.unmountComponentAtNode(appMountParams.element);
    deps.data.search.session.clear();
  };
};
