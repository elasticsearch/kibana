/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';

import { openLazyFlyout } from '@kbn/presentation-util';
import { coreServices } from '../../services/kibana_services';

export const openImportDashboardJsonFlyout = ({
  onImportSuccess,
  returnFocus,
}: {
  onImportSuccess: (id: string, title: string) => void;
  returnFocus?: () => void;
}) => {
  openLazyFlyout({
    core: coreServices,
    returnFocus,
    loadContent: async ({ closeFlyout, ariaLabelledBy }) => {
      const { ImportDashboardJsonFlyout } = await import('./import_dashboard_json_flyout');
      return (
        <ImportDashboardJsonFlyout
          closeFlyout={closeFlyout}
          onImportSuccess={onImportSuccess}
          titleId={ariaLabelledBy}
        />
      );
    },
    flyoutProps: {
      'data-test-subj': 'importDashboardJsonFlyout',
      type: 'overlay',
    },
  });
};
