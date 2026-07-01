/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { toMountPoint } from '@kbn/react-kibana-mount';
import type { SharePluginStart } from '@kbn/share-plugin/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { CoreStart } from '@kbn/core/public';
import type { LensPublicStart } from '@kbn/lens-plugin/public';
import type { DashboardStart } from '@kbn/dashboard-plugin/public';
import type { CPSPluginStart } from '@kbn/cps/public/types';
import { getMlGlobalServices } from '../../../application/util/get_services';

export interface FlyoutComponentProps {
  onClose: () => void;
}

export function createFlyout(
  FlyoutComponent: React.FunctionComponent<any>,
  coreStart: CoreStart,
  share: SharePluginStart,
  data: DataPublicPluginStart,
  dashboardService: DashboardStart,
  lens?: LensPublicStart,
  cps?: CPSPluginStart
): Promise<void> {
  const { http, overlays, ...startServices } = coreStart;

  return new Promise(async (resolve, reject) => {
    try {
      const onFlyoutClose = () => {
        flyoutSession.close();
        resolve();
      };

      const flyoutSession = overlays.openFlyout(
        toMountPoint(
          <KibanaContextProvider
            services={{
              ...coreStart,
              share,
              data,
              lens,
              cps,
              dashboardService,
              mlServices: getMlGlobalServices(coreStart, data.dataViews),
            }}
          >
            <FlyoutComponent
              onClose={() => {
                onFlyoutClose();
                resolve();
              }}
            />
          </KibanaContextProvider>,
          startServices
        ),
        {
          'data-test-subj': 'mlFlyoutLayerSelector',
          'aria-labelledby': 'ml-flyout-layer-title',
          ownFocus: true,
          onClose: onFlyoutClose,
          size: '35vw',
        }
      );
    } catch (error) {
      reject(error);
    }
  });
}
