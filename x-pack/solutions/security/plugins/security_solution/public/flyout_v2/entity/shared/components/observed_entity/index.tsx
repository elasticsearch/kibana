/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiSpacer } from '@elastic/eui';

import React from 'react';
import { EntityTable } from '../../../../../flyout/entity_details/shared/components/entity_table';
import { InspectButtonContainer } from '../../../../../common/components/inspect';
import type {
  EntityTableLinkRenderer,
  EntityTableRows,
} from '../../../../../flyout/entity_details/shared/components/entity_table/types';
import type { ObservedEntityData } from './types';

export const ObservedEntity = <T,>({
  observedData,
  contextID,
  scopeId,
  observedFields,
  entityLink,
}: {
  observedData: ObservedEntityData<T>;
  contextID: string;
  scopeId: string;
  observedFields: EntityTableRows<ObservedEntityData<T>>;
  entityLink?: EntityTableLinkRenderer;
}) => {
  return (
    <InspectButtonContainer>
      <EuiSpacer size="m" />
      <EntityTable
        contextID={contextID}
        scopeId={scopeId}
        data={observedData}
        entityFields={observedFields}
        entityLink={entityLink}
      />
    </InspectButtonContainer>
  );
};
