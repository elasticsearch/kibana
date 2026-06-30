/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiBadge } from '@elastic/eui';
import type { ActionPolicyDestination } from '@kbn/alerting-v2-schemas';
import React from 'react';
import { WorkflowDestinationLink } from '../workflow_destination_link';

interface Props {
  destination: ActionPolicyDestination;
}

export const DestinationRow = ({ destination }: Props) => {
  if (destination.type === 'workflow') {
    return (
      <EuiBadge color="hollow" iconType="workflow" title="" css={{ alignSelf: 'flex-start' }}>
        <WorkflowDestinationLink id={destination.id} />
      </EuiBadge>
    );
  }
  return null;
};
