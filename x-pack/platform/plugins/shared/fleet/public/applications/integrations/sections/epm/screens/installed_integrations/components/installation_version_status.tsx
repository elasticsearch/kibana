/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiButtonEmpty,
  EuiPopover,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiCallOut,
  EuiButton,
  EuiToolTip,
  EuiLoadingSpinner,
} from '@elastic/eui';
import { FormattedDate, FormattedMessage, FormattedTime } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';

import { useAuthz } from '../../../../../../../hooks';
import type { InstallFailedAttempt } from '../../../../../../../../common/types';
import type { InstalledPackageUIPackageListItem } from '../types';
import { useInstalledIntegrationsActions } from '../hooks/use_installed_integrations_actions';

import { DisabledWrapperTooltip } from './disabled_wrapper_tooltip';

const InstalledVersionStatus: React.FunctionComponent<{
  item: InstalledPackageUIPackageListItem;
}> = React.memo(({ item }) => {
  return (
    <EuiFlexGroup gutterSize="s" alignItems="center">
      <EuiFlexItem grow={false}>
        <EuiIcon
          size="m"
          type="checkCircleFill"
          color="success"
          aria-label={item.installationInfo?.version ?? item.version}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>{item.installationInfo?.version ?? item.version}</EuiFlexItem>
    </EuiFlexGroup>
  );
});

const UpgradeAvailableVersionStatus: React.FunctionComponent<{
  item: InstalledPackageUIPackageListItem;
}> = React.memo(({ item }) => {
  const authz = useAuthz();
  const isDisabled = !authz.integrations.upgradePackages;
  const {
    actions: { bulkUpgradeIntegrationsWithConfirmModal },
  } = useInstalledIntegrationsActions();
  return (
    <DisabledWrapperTooltip
      tooltipContent={
        <FormattedMessage
          id="xpack.fleet.epmInstalledIntegrations.upgradeRequiredPermissionTooltip"
          defaultMessage={"You don't have permissions to upgrade. Contact your administrator."}
        />
      }
      disabled={isDisabled}
    >
      <EuiButtonEmpty
        size="s"
        iconType="gear"
        flush="left"
        onClick={() => {
          bulkUpgradeIntegrationsWithConfirmModal([item]);
        }}
        disabled={isDisabled}
      >
        <FormattedMessage
          id="xpack.fleet.epmInstalledIntegrations.upgradeAvailableButton"
          defaultMessage="Upgrade to {version}"
          values={{
            version: item.version,
          }}
        />
      </EuiButtonEmpty>
    </DisabledWrapperTooltip>
  );
});

const UpgradingVersionStatus: React.FunctionComponent<{
  item: InstalledPackageUIPackageListItem;
}> = React.memo(({ item }) => {
  return (
    <EuiToolTip
      content={
        <FormattedMessage
          id="xpack.fleet.epmInstalledIntegrations.upgradingTooltip"
          defaultMessage={'Upgrading to {version}'}
          values={{ version: item.version }}
        />
      }
    >
      <EuiFlexGroup gutterSize="s" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size={'m'} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <FormattedMessage
            id="xpack.fleet.epmInstalledIntegrations.upgradingText"
            defaultMessage="Upgrading..."
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiToolTip>
  );
});

const UninstallingVersionStatus: React.FunctionComponent<{
  item: InstalledPackageUIPackageListItem;
}> = React.memo(({ item }) => {
  return (
    <EuiFlexGroup gutterSize="s" alignItems="center">
      <EuiFlexItem grow={false}>
        <EuiLoadingSpinner size={'m'} />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <FormattedMessage
          id="xpack.fleet.epmInstalledIntegrations.uninstallingText"
          defaultMessage="Uninstalling..."
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
});

function formatAttempt(attempt: InstallFailedAttempt): React.ReactNode {
  return (
    <>
      <FormattedMessage
        id="xpack.fleet.packageCard.faileAttemptDescription"
        defaultMessage="Failed at {attemptDate}."
        values={{
          attemptDate: (
            <>
              <FormattedDate
                value={attempt.created_at}
                year="numeric"
                month="short"
                day="numeric"
              />
              <> @ </>
              <FormattedTime
                value={attempt.created_at}
                hour="numeric"
                minute="numeric"
                second="numeric"
              />
            </>
          ),
        }}
      />
      <p>
        {attempt.error?.name || ''} : {attempt.error?.message || ''}
      </p>
      {attempt.missing_assets && attempt.missing_assets.length > 0 && (
        <p>
          <FormattedMessage
            id="xpack.fleet.installationVersionStatus.missingAssetsDescription"
            defaultMessage="Missing assets: {assets}"
            values={{
              assets: attempt.missing_assets.map((a) => `${a.type}/${a.id}`).join(', '),
            }}
          />
        </p>
      )}
    </>
  );
}

const InstallUpgradeFailedVersionStatus: React.FunctionComponent<{
  item: InstalledPackageUIPackageListItem;
  isUpgradeFailed: boolean;
}> = React.memo(({ item, isUpgradeFailed }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  //  TODO handle failed install too
  // TODO permissions check and tooltip

  const button = (
    <EuiButtonEmpty
      size="s"
      flush="left"
      onClick={() => setIsPopoverOpen((currentVal) => !currentVal)}
    >
      <EuiFlexGroup gutterSize="s" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiIcon
            size="m"
            type="error"
            color="danger"
            aria-label={isUpgradeFailed ? 'Upgrade failed' : 'Install failed'}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          {isUpgradeFailed ? (
            <FormattedMessage
              id="xpack.fleet.epmInstalledIntegrations.statusUpgradeFailedLabel"
              defaultMessage="Upgrade failed"
            />
          ) : (
            <FormattedMessage
              id="xpack.fleet.epmInstalledIntegrations.statusInstallFailedLabel"
              defaultMessage="Install failed"
            />
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiButtonEmpty>
  );

  const latestAttempt = item.installationInfo?.latest_install_failed_attempts?.[0];

  return (
    <EuiPopover
      aria-label={i18n.translate('xpack.fleet.epmInstalledIntegrations.statusPopoverAriaLabel', {
        defaultMessage: 'Installation status details',
      })}
      button={button}
      isOpen={isPopoverOpen}
      closePopover={() => setIsPopoverOpen(false)}
    >
      <EuiCallOut
        css={{ maxWidth: 400 }}
        color="danger"
        title={
          isUpgradeFailed ? (
            <FormattedMessage
              id="xpack.fleet.epmInstalledIntegrations.statusUpgradeFailedLabel"
              defaultMessage="Upgrade to {version } failed"
              values={{
                version: latestAttempt?.target_version,
              }}
            />
          ) : (
            <FormattedMessage
              id="xpack.fleet.epmInstalledIntegrations.statusInstallFailedLabel"
              defaultMessage="Install failed"
            />
          )
        }
      >
        {latestAttempt ? formatAttempt(latestAttempt) : null}
        {isUpgradeFailed && (
          // TODO Implement on click https://github.com/elastic/kibana/issues/209867
          <EuiButton color="danger" fill={true}>
            <FormattedMessage
              id="xpack.fleet.epmInstalledIntegrations.retryUpgradeButtonLabel"
              defaultMessage="Retry Upgrade"
            />
          </EuiButton>
        )}
      </EuiCallOut>
    </EuiPopover>
  );
});

export const InstallationVersionStatus: React.FunctionComponent<{
  item: InstalledPackageUIPackageListItem;
}> = React.memo(({ item }) => {
  const status = item.ui.installation_status;

  if (
    status === 'installed' ||
    status === 'pending_upgrade_review' ||
    status === 'declined_review'
  ) {
    return <InstalledVersionStatus item={item} />;
  } else if (status === 'upgrade_available') {
    return <UpgradeAvailableVersionStatus item={item} />;
  } else if (status === 'upgrading') {
    return <UpgradingVersionStatus item={item} />;
  } else if (status === 'uninstalling') {
    return <UninstallingVersionStatus item={item} />;
  } else if (status === 'upgrade_failed') {
    return <InstallUpgradeFailedVersionStatus isUpgradeFailed={true} item={item} />;
  } else if (status === 'install_failed') {
    return <InstallUpgradeFailedVersionStatus isUpgradeFailed={false} item={item} />;
  } else return null;
});
