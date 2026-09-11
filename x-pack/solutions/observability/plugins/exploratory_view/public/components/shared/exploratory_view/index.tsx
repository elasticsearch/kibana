/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { useHistory } from 'react-router-dom';

import {
  createKbnUrlStateStorage,
  withNotifyOnErrors,
  createSessionStorageStateStorage,
} from '@kbn/kibana-utils-plugin/public';
import type { TypedLensByValueInput } from '@kbn/lens-plugin/public';
import { useBreadcrumbs, useTrackPageview } from '@kbn/observability-shared-plugin/public';
import { ExploratoryView } from './exploratory_view';
import { useKibana } from './hooks/use_kibana';
import { DataViewContextProvider } from './hooks/use_app_data_view';
import { UrlStorageContextProvider } from './hooks/use_series_storage';

export interface ExploratoryViewPageProps {
  useSessionStorage?: boolean;
  saveAttributes?: (attr: TypedLensByValueInput['attributes'] | null) => void;
  app?: { id: string; label: string };
}

export function ExploratoryViewPage({
  app,
  saveAttributes,
  useSessionStorage = false,
}: ExploratoryViewPageProps) {
  const {
    services: { uiSettings, notifications, observabilityShared },
  } = useKibana();

  const history = useHistory();

  const ObservabilityPageTemplate = observabilityShared.navigation.PageTemplate;

  useTrackPageview({ app: 'observability-overview', path: 'exploratory-view' });
  useTrackPageview({
    app: 'observability-overview',
    path: 'exploratory-view',
    delay: 15000,
  });

  useBreadcrumbs(
    [
      {
        text: i18n.translate('xpack.exploratoryView.overview', {
          defaultMessage: 'Explore data',
        }),
      },
    ],
    { app, classicOnly: true }
  );

  const kbnUrlStateStorage = useSessionStorage
    ? createSessionStorageStateStorage()
    : createKbnUrlStateStorage({
        history,
        useHash: uiSettings!.get('state:storeInSessionStorage'),
        ...withNotifyOnErrors(notifications!.toasts),
      });

  return (
    <UrlStorageContextProvider storage={kbnUrlStateStorage}>
      <ObservabilityPageTemplate pageSectionProps={{ paddingSize: 'none' }}>
        <DataViewContextProvider>
          <ExploratoryView saveAttributes={saveAttributes} />
        </DataViewContextProvider>
      </ObservabilityPageTemplate>
    </UrlStorageContextProvider>
  );
}

// eslint-disable-next-line import/no-default-export
export default ExploratoryViewPage;
export { DataTypes } from './labels';
