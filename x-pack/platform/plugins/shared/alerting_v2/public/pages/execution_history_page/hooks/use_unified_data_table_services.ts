/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { Storage } from '@kbn/kibana-utils-plugin/public';
import { PluginStart } from '@kbn/core-di';
import { CoreStart, useService } from '@kbn/core-di-browser';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';

// The execution-history app is not wrapped in a KibanaContextProvider (unlike the episodes app),
// so the `services` bag UnifiedDataTable needs is assembled from the DI container instead of
// `useKibana`. A single localStorage-backed Storage instance is shared across renders.
const storage = new Storage(localStorage);

/** Assembles the minimal Kibana services bag required by `UnifiedDataTable`. */
export const useUnifiedDataTableServices = () => {
  const theme = useService(CoreStart('theme'));
  const uiSettings = useService(CoreStart('uiSettings'));
  const notifications = useService(CoreStart('notifications'));
  const fieldFormats = useService<FieldFormatsStart>(PluginStart('fieldFormats'));
  const data = useService<DataPublicPluginStart>(PluginStart('data'));

  return useMemo(
    () => ({
      theme,
      uiSettings,
      toastNotifications: notifications.toasts,
      fieldFormats,
      data,
      storage,
    }),
    [theme, uiSettings, notifications, fieldFormats, data]
  );
};
