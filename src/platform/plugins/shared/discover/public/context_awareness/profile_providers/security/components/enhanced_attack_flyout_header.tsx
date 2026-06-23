/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DocViewRenderProps } from '@kbn/unified-doc-viewer/types';
import type { ReactElement } from 'react';
import type { ProfileProviderServices } from '../../profile_provider_services';

const noop = () => {};

export interface EnhancedAttackFlyoutHeaderProps extends DocViewRenderProps {
  providerServices: ProfileProviderServices;
  refreshData?: () => void;
  fallbackRenderHeader?: (props: DocViewRenderProps) => ReactElement | undefined;
}

export const EnhancedAttackFlyoutHeader = ({
  hit,
  providerServices,
  refreshData,
  fallbackRenderHeader,
  ...docViewProps
}: EnhancedAttackFlyoutHeaderProps) => {
  const attackFlyoutHeaderFeature = providerServices.discoverShared.features.registry.getById(
    'security-solution-attack-flyout-header'
  );
  const handleAttackUpdated = refreshData ?? noop;

  const renderHeader = attackFlyoutHeaderFeature?.renderHeader;

  return renderHeader
    ? renderHeader({ hit, ...docViewProps, onAttackUpdated: handleAttackUpdated })
    : fallbackRenderHeader?.({ hit, ...docViewProps }) ?? null;
};
