/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { FormattedMessage, FormattedDate, FormattedTime } from '@kbn/i18n-react';
import { EuiBadge, EuiFlexItem, EuiSpacer, EuiToolTip } from '@elastic/eui';
import semverLt from 'semver/functions/lt';

import type {
  CustomIntegration,
  CustomIntegrationIcon,
} from '@kbn/custom-integrations-plugin/common';

import { hasDeferredInstallations } from '../../../../../../services/has_deferred_installations';
import { getPackageReleaseLabel } from '../../../../../../../common/services';

import { dataTypes, installationStatuses } from '../../../../../../../common/constants';
import type {
  DeprecationInfo,
  EpmPackageInstallStatus,
  InstallFailedAttempt,
  IntegrationCardReleaseLabel,
  PackageSpecIcon,
} from '../../../../../../../common/types';

import type { DynamicPage, DynamicPagePathValues, StaticPage } from '../../../../constants';
import { isPackageUnverified, isPackageUpdatable } from '../../../../services';

import type { PackageListItem } from '../../../../types';

export interface IntegrationCardItem {
  categories: string[];
  description: string;
  // Security Solution uses this prop to determine how many lines the card description should be truncated
  descriptionLineClamp?: number;
  extraLabelsBadges?: React.ReactNode[];
  fromIntegrations?: string;
  hasDataStreams?: boolean;
  icons: Array<PackageSpecIcon | CustomIntegrationIcon>;
  id: string;
  installStatus?: EpmPackageInstallStatus;
  integration: string;
  isCollectionCard?: boolean;
  isQuickstart?: boolean;
  isReauthorizationRequired?: boolean;
  isUnverified?: boolean;
  isUpdateAvailable?: boolean;
  isDeprecated?: boolean;
  deprecationInfo?: DeprecationInfo;
  maxCardHeight?: number;
  minCardHeight?: number;
  name: string;
  onCardClick?: () => void;
  release?: IntegrationCardReleaseLabel;
  showDescription?: boolean;
  showInstallationStatus?: boolean;
  showCompressedInstallationStatus?: boolean;
  showLabels?: boolean;
  showReleaseBadge?: boolean;
  title: string;
  // Security Solution uses this prop to determine how many lines the card title should be truncated
  titleLineClamp?: number;
  titleBadge?: React.ReactNode;
  titleSize?: 'xs' | 's';
  url: string;
  version: string;
  type?: string;
  supportsAgentless?: boolean;
  signalTypes?: string[];
}

export const mapToCard = ({
  getAbsolutePath,
  getHref,
  item,
  addBasePath,
  packageVerificationKeyId,
  selectedCategory,
}: {
  getAbsolutePath: (p: string) => string;
  getHref: (page: StaticPage | DynamicPage, values?: DynamicPagePathValues) => string;
  addBasePath: (url: string) => string;
  item: CustomIntegration | PackageListItem;
  packageVerificationKeyId?: string;
  selectedCategory?: string;
}): IntegrationCardItem => {
  let uiInternalPathUrl: string;

  let isUnverified = false;

  let version = 'version' in item ? item.version || '' : '';

  let isUpdateAvailable = false;
  let isReauthorizationRequired = false;
  let isDeprecated = false;
  let deprecationInfo: DeprecationInfo | undefined;

  if (item.type === 'ui_link') {
    uiInternalPathUrl = item.id.includes('language_client.')
      ? addBasePath(item.uiInternalPath)
      : item.uiExternalLink || getAbsolutePath(item.uiInternalPath);
  } else {
    if (item?.installationInfo?.version) {
      version = item.installationInfo.version || item.version;
      isUnverified = isPackageUnverified(item, packageVerificationKeyId);
      isUpdateAvailable = isPackageUpdatable(item);

      isReauthorizationRequired = hasDeferredInstallations(item);
    }

    // Extract deprecation information
    // officially deprecated items have a `deprecated` field
    if ('deprecated' in item && item.deprecated) {
      isDeprecated = true;
      deprecationInfo = item.deprecated;
    } else if (
      // bwc: unofficially deprecated items are marked as such in their title, description or name
      (item.title && /deprecated/i.test(item.title)) ||
      (item.description && /deprecated/i.test(item.description)) ||
      ('name' in item && item.name && /deprecated/i.test(item.name))
    ) {
      isDeprecated = true;
    }

    const url = getHref('integration_details_overview', {
      pkgkey: `${item.name}-${version}`,
      ...(item.integration ? { integration: item.integration } : {}),
    });

    uiInternalPathUrl = url;
  }

  const release: IntegrationCardReleaseLabel = getPackageReleaseLabel(version);

  let extraLabelsBadges: React.ReactNode[] | undefined;
  if (item.type === 'integration' || item.type === 'content') {
    extraLabelsBadges = getIntegrationLabels(item);
  }

  const cardResult: IntegrationCardItem = {
    id: `${item.type === 'ui_link' ? 'ui_link' : 'epr'}:${item.id}`,
    description: item.description || '',
    icons: !item.icons || !item.icons.length ? [] : item.icons,
    title: item.title,
    url: uiInternalPathUrl,
    fromIntegrations: selectedCategory,
    integration: 'integration' in item ? item.integration || '' : '',
    name: 'name' in item ? item.name : item.id,
    version,
    type: item.type,
    release,
    categories: ((item.categories || []) as string[]).filter((c: string) => !!c),
    isReauthorizationRequired,
    isUnverified,
    isUpdateAvailable,
    isDeprecated,
    deprecationInfo,
    extraLabelsBadges,
  };

  if (item.type === 'integration') {
    cardResult.installStatus = item.installationInfo?.install_status;
  }

  if ('supportsAgentless' in item && item.supportsAgentless) {
    cardResult.supportsAgentless = true;
  }

  const signalTypes = getSignalTypes(item);
  if (signalTypes.length > 0) {
    cardResult.signalTypes = signalTypes;
  }

  return cardResult;
};

// Derive the signal types (logs/metrics/traces) a card matches so the browse-page
// signal filter can include it. Integration packages expose their signal types via
// `data_streams`. Input packages have no concrete data streams, and the EPR search
// response doesn't carry their policy template `type`/`dynamic_signal_types`, so the
// signal type isn't knowable from the browse list. Since input packages choose the
// data stream type at configuration time, match them against every signal filter.
function getSignalTypes(item: CustomIntegration | PackageListItem): string[] {
  if ('type' in item && item.type === 'input') {
    return Object.values(dataTypes);
  }

  if ('data_streams' in item && Array.isArray(item.data_streams)) {
    return [...new Set(item.data_streams.map((ds) => ds.type))];
  }

  return [];
}

export function getIntegrationLabels(item: PackageListItem): React.ReactNode[] {
  const extraLabelsBadges: React.ReactNode[] = [];

  if (
    item?.installationInfo?.latest_install_failed_attempts?.some(
      (attempt) =>
        item.installationInfo && semverLt(item.installationInfo.version, attempt.target_version)
    )
  ) {
    const updateFailedAttempt = item.installationInfo?.latest_install_failed_attempts?.find(
      (attempt) =>
        item.installationInfo && semverLt(item.installationInfo.version, attempt.target_version)
    );
    extraLabelsBadges.push(
      <EuiFlexItem key="update_failed_badge" grow={false}>
        <EuiSpacer size="xs" />
        <span>
          <EuiToolTip
            title={
              <FormattedMessage
                id="xpack.fleet.packageCard.updateFailedTooltipTitle"
                defaultMessage="Update failed"
              />
            }
            content={updateFailedAttempt ? formatAttempt(updateFailedAttempt) : undefined}
          >
            <EuiBadge color="danger" iconType="error" tabIndex={0}>
              <FormattedMessage
                id="xpack.fleet.packageCard.updateFailed"
                defaultMessage="Update failed"
              />
            </EuiBadge>
          </EuiToolTip>
        </span>
      </EuiFlexItem>
    );
  }

  if (item.installationInfo?.install_status === installationStatuses.InstallFailed) {
    const installFailedAttempt = item.installationInfo?.latest_install_failed_attempts?.find(
      (attempt) => attempt.target_version === item.installationInfo?.version
    );

    extraLabelsBadges.push(
      <EuiFlexItem key="install_failed_badge" grow={false}>
        <EuiSpacer size="xs" />
        <span>
          <EuiToolTip
            title={
              <FormattedMessage
                id="xpack.fleet.packageCard.installFailedTooltipTitle"
                defaultMessage="Install failed"
              />
            }
            content={installFailedAttempt ? formatAttempt(installFailedAttempt) : undefined}
          >
            <EuiBadge color="danger" iconType="error" tabIndex={0}>
              <FormattedMessage
                id="xpack.fleet.packageCard.installFailed"
                defaultMessage="Install failed"
              />
            </EuiBadge>
          </EuiToolTip>
        </span>
      </EuiFlexItem>
    );
  }

  return extraLabelsBadges;
}

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
            id="xpack.fleet.packageCard.missingAssetsDescription"
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
