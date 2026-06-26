/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { EuiCallOut } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { EngineDescriptor } from '@kbn/entity-store/common';

export const EntityStoreErrorCallout: React.FC<{ engine?: EngineDescriptor; size?: 's' | 'm' }> = ({
  engine,
  size = 'm',
}) => {
  if (!engine?.error?.message) {
    return null;
  }

  let title;
  // Please update the following code when adding a new action type
  switch (engine.error.action) {
    case 'init':
      title = (
        <FormattedMessage
          id="xpack.securitySolution.entityAnalytics.entityStore.initError.title"
          defaultMessage="An error occurred during {engineType} entity store resource initialization"
          values={{ engineType: engine.type }}
        />
      );
      break;
  }

  return (
    <EuiCallOut title={title} color="danger" iconType="warning" size={size}>
      <p>{engine.error.message}</p>
    </EuiCallOut>
  );
};
