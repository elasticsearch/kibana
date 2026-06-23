/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiPopover, EuiHeaderLink } from '@elastic/eui';
import {
  DeploymentDetailsKibanaProvider,
  DeploymentDetails as DeploymentDetailsComponent,
} from '@kbn/cloud/deployment_details';

import { useStartServices } from '../../hooks';

export const DeploymentDetails = () => {
  const [isOpen, setIsOpen] = React.useState(false);
  const { share, cloud, docLinks, application } = useStartServices();

  // If the cloud plugin isn't enabled, we can't display the flyout.
  if (!cloud) {
    return null;
  }

  const { isCloudEnabled, cloudId } = cloud;

  // If cloud isn't enabled or we don't have a cloudId we don't render the button.
  if (!isCloudEnabled || !cloudId) {
    return null;
  }

  const button = (
    <EuiHeaderLink onClick={() => setIsOpen(!isOpen)} isActive>
      {i18n.translate('xpack.fleet.integrations.connectionDetailsButton', {
        defaultMessage: 'Connection details',
      })}
    </EuiHeaderLink>
  );

  return (
    <DeploymentDetailsKibanaProvider
      core={{ application }}
      share={share}
      cloud={cloud}
      docLinks={docLinks}
    >
      <EuiPopover
        aria-label={i18n.translate('xpack.fleet.integrations.connectionDetailsPopoverAriaLabel', {
          defaultMessage: 'Connection details',
        })}
        isOpen={isOpen}
        closePopover={() => setIsOpen(false)}
        button={button}
        anchorPosition="downCenter"
      >
        <div style={{ width: 450 }}>
          <DeploymentDetailsComponent />
        </div>
      </EuiPopover>
    </DeploymentDetailsKibanaProvider>
  );
};
