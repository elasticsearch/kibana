/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiLoadingSpinner, EuiButtonEmpty, EuiIconTip } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { GetEntityStoreStatusResponse } from '@kbn/entity-store/common';
import { useInstallEntityStoreMutation } from '../../../hooks/use_entity_store';
import { isEngineLoading } from '../helpers';

export function EngineStatusHeaderAction({
  engine,
}: {
  engine: GetEntityStoreStatusResponse['engines'][0] | undefined;
}) {
  const installEntityStoreMutation = useInstallEntityStoreMutation();
  const installEntityStore = () => {
    installEntityStoreMutation.mutate();
  };
  const hasUninstalledComponent = engine?.components?.some(({ installed }) => !installed);

  if (installEntityStoreMutation.isLoading || isEngineLoading(engine?.status)) {
    return <EuiLoadingSpinner size="s" />;
  }

  if (!engine) {
    return (
      <EuiButtonEmpty onClick={installEntityStore}>
        <FormattedMessage
          id="xpack.securitySolution.entityAnalytics.entityStore.enginesStatus.installButton"
          defaultMessage="Install"
        />
      </EuiButtonEmpty>
    );
  }

  if (hasUninstalledComponent) {
    return (
      <div>
        <EuiButtonEmpty onClick={installEntityStore} iconType="refresh" color="warning">
          <FormattedMessage
            id="xpack.securitySolution.entityAnalytics.entityStore.enginesStatus.reinstallButton"
            defaultMessage="Reinstall"
          />
        </EuiButtonEmpty>

        <EuiIconTip
          content={
            <FormattedMessage
              id="xpack.securitySolution.entityAnalytics.entityStore.enginesStatus.reinstallToolTip"
              defaultMessage="The components associated with this entity type are experiencing issues. Reinstall them to restore functionality"
            />
          }
          color="warning"
          position="right"
          type="info"
        />
      </div>
    );
  }

  return null;
}
