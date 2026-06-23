/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiText,
} from '@elastic/eui';
import React, { type PropsWithChildren, useEffect, useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useObservable } from '@kbn/use-observable';
import type { ServerlessTierRequiredProducts } from '../../common/lib/availability';
import { useKibana } from '../../hooks/use_kibana';
import { useTelemetry } from '../../hooks/use_telemetry';
import { useWorkflowsBreadcrumbs } from '../../hooks/use_workflow_breadcrumbs/use_workflow_breadcrumbs';
import { AccessDenied } from '../access_denied/access_denied';

const isSafeBillingUrl = (url: string | undefined): url is string =>
  url?.startsWith('https://') ?? false;

/**
 * Wrapper component to render the workflows app with the availability check
 */
export const WorkflowsAvailabilityWrapper = React.memo<PropsWithChildren>(({ children }) => {
  const telemetry = useTelemetry();
  const { availability } = useKibana().services.workflowsManagement;

  const availability$ = useMemo(() => availability.getAvailabilityStatus$(), [availability]);
  const availabilityStatus = useObservable(availability$, availability.getAvailabilityStatus());

  if (!availabilityStatus.isAvailable) {
    if (availabilityStatus.unavailabilityReason === 'license') {
      telemetry.reportWorkflowAccessDeniedLicense();
      return <LicenseAccessDenied />;
    } else {
      telemetry.reportWorkflowAccessDeniedServerlessTier();
      return <ServerlessTierAccessDenied requiredProducts={availabilityStatus.requiredProducts} />;
    }
  }

  return <>{children}</>;
});
WorkflowsAvailabilityWrapper.displayName = 'WorkflowsAvailabilityWrapper';

/**
 * Component to render the access denied page when the license is not valid (stateful mode)
 */
const LicenseAccessDenied = React.memo(() => {
  useWorkflowsBreadcrumbs();
  const { application } = useKibana().services;

  const actions = useMemo(
    () => [
      <EuiButton fill href={'https://www.elastic.co/subscriptions'} target="_blank">
        <FormattedMessage
          id="platform.plugins.shared.workflows_management.ui.upgradeLicense.subscriptionPlansButton"
          defaultMessage="Subscription plans"
        />
        <EuiIcon type="popout" aria-hidden={true} />
      </EuiButton>,
      // eslint-disable-next-line @elastic/eui/href-or-on-click
      <EuiButtonEmpty
        onClick={(ev: React.MouseEvent<HTMLButtonElement>) => {
          ev.preventDefault();
          application.navigateToApp('management', { deepLinkId: 'license_management' });
        }}
        href={application.getUrlForApp('management', { deepLinkId: 'license_management' })}
      >
        <FormattedMessage
          id="platform.plugins.shared.workflows_management.ui.upgradeLicense.manageLicenseButton"
          defaultMessage="Manage your license"
        />
      </EuiButtonEmpty>,
    ],
    [application]
  );

  return (
    <AccessDenied
      data-test-subj="workflowsLicenseAccessDenied"
      title={i18n.translate(
        'platform.plugins.shared.workflows_management.ui.upgradeLicense.title',
        { defaultMessage: 'Upgrade your license' }
      )}
      description={i18n.translate(
        'platform.plugins.shared.workflows_management.ui.upgradeLicense.description',
        { defaultMessage: 'You need to upgrade your license to use Workflows.' }
      )}
      actions={actions}
      footer={<LicenseFooter />}
    />
  );
});
LicenseAccessDenied.displayName = 'LicenseAccessDenied';

const LicenseFooter = React.memo(() => (
  <EuiFlexGroup
    gutterSize="s"
    wrap
    direction="column"
    justifyContent="center"
    responsive={false}
    alignItems="center"
  >
    <EuiFlexItem>
      <EuiText color="subdued" textAlign="center" size="xs">
        <p css={{ marginBlock: 0 }}>
          <FormattedMessage
            id="platform.plugins.shared.workflows_management.ui.upgradeLicense.footer"
            defaultMessage="License required:"
          />
        </p>
      </EuiText>
    </EuiFlexItem>
    <EuiFlexItem grow={false}>
      <EuiBadge color="hollow">
        <FormattedMessage
          id="platform.plugins.shared.workflows_management.ui.upgradeLicense.footer.badge"
          defaultMessage="Enterprise"
        />
      </EuiBadge>
    </EuiFlexItem>
  </EuiFlexGroup>
));
LicenseFooter.displayName = 'LicenseFooter';

/**
 * Component to render the access denied page when the serverless tier is not valid (serverless mode)
 */
const ServerlessTierAccessDenied = React.memo<{
  requiredProducts: ServerlessTierRequiredProducts;
}>(({ requiredProducts }) => {
  useWorkflowsBreadcrumbs();

  const { cloud } = useKibana().services;
  const [billingUrl, setBillingUrl] = useState<string | undefined>();

  useEffect(() => {
    if (cloud) {
      cloud
        .getPrivilegedUrls()
        .then((urls) => setBillingUrl(urls.billingUrl))
        .catch(() => {});
    }
  }, [cloud]);

  const actions = useMemo(() => {
    if (isSafeBillingUrl(billingUrl)) {
      return [
        <EuiButton fill href={billingUrl} target="_blank">
          <FormattedMessage
            id="platform.plugins.shared.workflows_management.ui.unavailableInServerlessTier.manageSubscriptionButton"
            defaultMessage="Manage subscription"
          />
          <EuiIcon type="popout" aria-hidden={true} />
        </EuiButton>,
      ];
    }

    return [
      <EuiText color="subdued" textAlign="center" size="s">
        <FormattedMessage
          id="platform.plugins.shared.workflows_management.ui.unavailableInServerlessTier.contactAdmin"
          defaultMessage="Contact your administrator to upgrade your subscription."
        />
      </EuiText>,
    ];
  }, [billingUrl]);

  return (
    <AccessDenied
      data-test-subj="workflowsServerlessTierAccessDenied"
      title={i18n.translate(
        'platform.plugins.shared.workflows_management.ui.unavailableInServerlessTier.title',
        { defaultMessage: 'Upgrade your subscription' }
      )}
      description={i18n.translate(
        'platform.plugins.shared.workflows_management.ui.unavailableInServerlessTier.description',
        {
          defaultMessage:
            'You need to upgrade your serverless project subscription to use Workflows.',
        }
      )}
      actions={actions}
      footer={<ServerlessTierFooter requiredProducts={requiredProducts} />}
    />
  );
});
ServerlessTierAccessDenied.displayName = 'ServerlessTierAccessDenied';

const ServerlessTierFooter = React.memo<{
  requiredProducts: ServerlessTierRequiredProducts;
}>(({ requiredProducts }) => {
  return (
    <EuiFlexGroup
      gutterSize="s"
      wrap
      direction="column"
      justifyContent="center"
      responsive={false}
      alignItems="center"
    >
      <EuiFlexItem>
        <EuiText color="subdued" textAlign="center" size="xs">
          <p css={{ marginBlock: 0 }}>
            <FormattedMessage
              id="platform.plugins.shared.workflows_management.ui.unavailableInServerlessTier.requiredProducts"
              defaultMessage="To use Workflows, you need to upgrade your subscription to {count, plural, one {the following product tier} other {one of the following product tiers}}:"
              values={{ count: requiredProducts.length }}
            />
          </p>
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize="s" wrap>
          {requiredProducts?.map((product) => (
            <EuiFlexItem key={product} grow={false}>
              <EuiBadge color="hollow">{product}</EuiBadge>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
});
ServerlessTierFooter.displayName = 'ServerlessTierFooter';
