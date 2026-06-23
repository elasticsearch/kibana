/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DocViewRenderProps } from '@kbn/unified-doc-viewer/types';
import type { ProfileProviderServices } from '../../profile_provider_services';

const noop = () => {};

export interface EnhancedAttackEventOverviewProps extends DocViewRenderProps {
  providerServices: ProfileProviderServices;
  refreshData?: () => void;
}

export const EnhancedAttackEventOverview = ({
  hit,
  providerServices,
  refreshData,
  ...docViewProps
}: EnhancedAttackEventOverviewProps) => {
  const attackFlyoutOverviewTabFeature = providerServices.discoverShared.features.registry.getById(
    'security-solution-attack-flyout-overview-tab'
  );
  const handleAttackUpdated = refreshData ?? noop;

  const render = attackFlyoutOverviewTabFeature?.render;
  return render ? render({ hit, ...docViewProps, onAttackUpdated: handleAttackUpdated }) : null;
};
