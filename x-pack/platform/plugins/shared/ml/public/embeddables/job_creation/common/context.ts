/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { CoreStart } from '@kbn/core/public';

import { useKibana } from '@kbn/kibana-react-plugin/public';

import type { SharePluginStart } from '@kbn/share-plugin/public';
import type { LensPublicStart } from '@kbn/lens-plugin/public';
import type { CPSPluginStart } from '@kbn/cps/public/types';
import type { MlServicesContext } from '../../../application/app';

interface StartPlugins {
  data: DataPublicPluginStart;
  share: SharePluginStart;
  lens: LensPublicStart;
  cps: CPSPluginStart;
}
export type StartServices = CoreStart & StartPlugins & MlServicesContext;
export const useMlFromLensKibanaContext = () => useKibana<StartServices>();
