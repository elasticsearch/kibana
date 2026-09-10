/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreStart, FeatureFlagsStart, HttpStart, ThemeServiceStart } from '@kbn/core/public';
import { createGetterSetter } from '@kbn/kibana-utils-plugin/public';
import type { DataViewsContract } from '@kbn/data-views-plugin/common';
import type { DataPublicPluginStart } from './types';

export const [getUiSettings, setUiSettings] =
  createGetterSetter<CoreStart['uiSettings']>('UiSettings');

export const [getOverlays, setOverlays] = createGetterSetter<CoreStart['overlays']>('Overlays');

export const [getIndexPatterns, setIndexPatterns] =
  createGetterSetter<DataViewsContract>('IndexPatterns');

export const [getHttp, setHttp] = createGetterSetter<HttpStart>('Http', false);

export const [getSearchService, setSearchService] =
  createGetterSetter<DataPublicPluginStart['search']>('Search');

export const [getTheme, setTheme] = createGetterSetter<ThemeServiceStart>('Theme');

export const [getFeatureFlags, setFeatureFlags] = createGetterSetter<FeatureFlagsStart>(
  'FeatureFlags',
  false
);
