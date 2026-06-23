/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// TODO: Refactor this away from constate, which is unmaintained, as this is the only
// usage of it across the Fleet codebase
import createContainer from 'constate';

import React, { useCallback, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { toMountPoint } from '@kbn/react-kibana-mount';
import { useQueryClient } from '@kbn/react-query';

import type { PackageInfo } from '../../../types';
import type { InstallationInfo } from '../../../../common/types';
import type { FleetStartServices } from '../../../plugin';
import { sendInstallPackage, sendRemovePackage, useLink } from '../../../hooks';

import { InstallStatus } from '../../../types';
import { isVerificationError } from '../services';

import type { InstalledPackageUIPackageListItem } from '../sections/epm/screens/installed_integrations/types';

import { useConfirmForceInstall } from '.';

type StartServices = Pick<FleetStartServices, 'notifications' | 'analytics' | 'i18n' | 'theme'>;

interface PackagesInstall {
  [key: string]: PackageInstallItem;
}

interface PackageInstallItem {
  status: InstallStatus;
  version: string | null;
}

type InstallPackageProps = Pick<PackageInfo, 'name' | 'version' | 'title'> & {
  isReinstall?: boolean;
  isUpgrade?: boolean;
  force?: boolean;
};
type SetPackageInstallStatusProps = Pick<PackageInfo, 'name'> & PackageInstallItem;

function usePackageInstall({ startServices }: { startServices: StartServices }) {
  const history = useHistory();
  const { getPath } = useLink();
  const queryClient = useQueryClient();
  const [packages, setPackage] = useState<PackagesInstall>({});
  const confirmForceInstall = useConfirmForceInstall();
  const setPackageInstallStatus = useCallback(
    ({ name, status, version }: SetPackageInstallStatusProps) => {
      const packageProps: PackageInstallItem = {
        status,
        version,
      };
      setPackage((prev: PackagesInstall) => ({
        ...prev,
        [name]: packageProps,
      }));
    },
    []
  );

  const { notifications } = startServices;

  const getPackageInstallStatus = useCallback(
    (pkg: string): PackageInstallItem => {
      return packages[pkg];
    },
    [packages]
  );

  const optionallyForceInstall = async (
    installProps: InstallPackageProps,
    prevStatus: PackageInstallItem
  ): Promise<boolean> => {
    const forceInstall = await confirmForceInstall(installProps);
    if (forceInstall) {
      return installPackage({ ...installProps, force: true });
    } else {
      setPackageInstallStatus({ ...prevStatus, name: installProps.name });
      return false;
    }
  };

  const installPackage = useCallback(
    async (props: InstallPackageProps) => {
      const { name, version, title, isReinstall = false, isUpgrade = false, force = false } = props;
      const prevStatus = getPackageInstallStatus(name);
      const newStatus = {
        ...prevStatus,
        name,
        status: isReinstall ? InstallStatus.reinstalling : InstallStatus.installing,
      };
      setPackageInstallStatus(newStatus);

      try {
        const res = await sendInstallPackage(name, version, isReinstall || force);
        if (res.error) {
          throw res.error;
        }

        setPackageInstallStatus({ name, status: InstallStatus.installed, version });

        if (isReinstall) {
          notifications.toasts.addSuccess({
            title: toMountPoint(
              <FormattedMessage
                id="xpack.fleet.integrations.packageReinstallSuccessTitle"
                defaultMessage="Reinstalled {title}"
                values={{ title }}
              />,
              startServices
            ),
            text: toMountPoint(
              <FormattedMessage
                id="xpack.fleet.integrations.packageReinstallSuccessDescription"
                defaultMessage="Successfully reinstalled {title}"
                values={{ title }}
              />,
              startServices
            ),
          });
        } else if (isUpgrade) {
          notifications.toasts.addSuccess({
            title: toMountPoint(
              <FormattedMessage
                id="xpack.fleet.integrations.packageUpgradeSuccessTitle"
                defaultMessage="Upgraded {title}"
                values={{ title }}
              />,
              startServices
            ),
            text: toMountPoint(
              <FormattedMessage
                id="xpack.fleet.integrations.packageUpgradeSuccessDescription"
                defaultMessage="Successfully upgraded {title}"
                values={{ title }}
              />,
              startServices
            ),
          });
        } else {
          notifications.toasts.addSuccess({
            title: toMountPoint(
              <FormattedMessage
                id="xpack.fleet.integrations.packageInstallSuccessTitle"
                defaultMessage="Installed {title}"
                values={{ title }}
              />,
              startServices
            ),
            text: toMountPoint(
              <FormattedMessage
                id="xpack.fleet.integrations.packageInstallSuccessDescription"
                defaultMessage="Successfully installed {title}"
                values={{ title }}
              />,
              startServices
            ),
          });
        }
      } catch (error) {
        if (isVerificationError(error)) {
          return optionallyForceInstall(props, prevStatus);
        }
        if (isUpgrade) {
          // if there is an error during update, set it back to the previous version
          // as handling of bad update is not implemented yet
          setPackageInstallStatus({ ...prevStatus, name });
        } else {
          setPackageInstallStatus({ name, status: InstallStatus.notInstalled, version });
        }

        notifications.toasts.addError(error, {
          title: i18n.translate('xpack.fleet.integrations.packageInstallErrorTitle', {
            defaultMessage: 'Failed to install {title} package',
            values: { title },
          }),
          toastMessage: i18n.translate('xpack.fleet.integrations.packageInstallErrorDescription', {
            defaultMessage:
              'Something went wrong while trying to install this package. Please try again later.',
          }),
        });
        return false;
      }
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getPackageInstallStatus, setPackageInstallStatus, startServices, getPath, history]
  );

  const uninstallPackage = useCallback(
    async ({
      name,
      version,
      title,
      redirectToVersion,
    }: Pick<PackageInfo, 'name' | 'version' | 'title'> & { redirectToVersion: string }) => {
      setPackageInstallStatus({ name, status: InstallStatus.uninstalling, version });

      const res = await sendRemovePackage({ pkgName: name, pkgVersion: version });
      if (res.error) {
        setPackageInstallStatus({ name, status: InstallStatus.installed, version });
        notifications.toasts.addWarning({
          title: toMountPoint(
            <FormattedMessage
              id="xpack.fleet.integrations.packageUninstallErrorTitle"
              defaultMessage="Failed to uninstall {title} package"
              values={{ title }}
            />,
            startServices
          ),
          text: toMountPoint(
            <FormattedMessage
              id="xpack.fleet.integrations.packageUninstallErrorDescription"
              defaultMessage="Something went wrong while trying to uninstall this package. Please try again later."
            />,
            startServices
          ),
          iconType: 'error',
        });
      } else {
        setPackageInstallStatus({ name, status: InstallStatus.notInstalled, version: null });

        queryClient.invalidateQueries([name]);
        queryClient.invalidateQueries(['get-packages']);

        notifications.toasts.addSuccess({
          title: toMountPoint(
            <FormattedMessage
              id="xpack.fleet.integrations.packageUninstallSuccessTitle"
              defaultMessage="Uninstalled {title}"
              values={{ title }}
            />,
            startServices
          ),
          text: toMountPoint(
            <FormattedMessage
              id="xpack.fleet.integrations.packageUninstallSuccessDescription"
              defaultMessage="Successfully uninstalled {title}"
              values={{ title }}
            />,
            startServices
          ),
        });
        if (redirectToVersion !== version) {
          const settingsPath = getPath('integration_details_settings', {
            pkgkey: `${name}-${redirectToVersion}`,
          });
          history.push(settingsPath);
        }
      }
    },
    [notifications.toasts, setPackageInstallStatus, getPath, history, startServices, queryClient]
  );

  const rollbackPackage = useCallback(
    async (
      packageInfo: PackageInfo & { installationInfo?: InstallationInfo },
      bulkRollbackIntegrationsWithConfirmModal: (
        selectedItems: InstalledPackageUIPackageListItem[],
        onActionCompleted?: (status: string) => void
      ) => Promise<string>
    ) => {
      const { name, version } = packageInfo;
      const redirectToVersion = packageInfo.installationInfo?.previous_version!;
      const result = await bulkRollbackIntegrationsWithConfirmModal(
        [packageInfo as any],
        (status: string) => {
          setPackageInstallStatus({
            name,
            status: InstallStatus.installed,
            version,
          });
          if (status === 'success') {
            if (redirectToVersion !== version) {
              const settingsPath = getPath('integration_details_settings', {
                pkgkey: `${name}-${redirectToVersion}`,
              });
              history.push(settingsPath);
            }
          }
        }
      );
      if (result === 'confirmed') {
        setPackageInstallStatus({
          name,
          status: InstallStatus.rollingBack,
          version,
        });
      }
    },
    [setPackageInstallStatus, getPath, history]
  );

  return {
    packages,
    installPackage,
    setPackageInstallStatus,
    getPackageInstallStatus,
    uninstallPackage,
    rollbackPackage,
  };
}

export const [
  PackageInstallProvider,
  useInstallPackage,
  useSetPackageInstallStatus,
  useGetPackageInstallStatus,
  useUninstallPackage,
  useRollbackPackage,
] = createContainer(
  usePackageInstall,
  (value) => value.installPackage,
  (value) => value.setPackageInstallStatus,
  (value) => value.getPackageInstallStatus,
  (value) => value.uninstallPackage,
  (value) => value.rollbackPackage
);
