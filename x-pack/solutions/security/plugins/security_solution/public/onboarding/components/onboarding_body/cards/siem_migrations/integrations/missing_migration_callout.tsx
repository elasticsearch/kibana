/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiPanel, EuiLink, EuiFlexGroup, EuiFlexItem, EuiIcon } from '@elastic/eui';
import { CardCallOut } from '../../common/card_callout';
import * as i18n from './translations';

interface MissingMigrationCalloutProps {
  onExpandMigrationsCard: () => void;
}

export const MissingMigrationCallout = React.memo<MissingMigrationCalloutProps>(
  ({ onExpandMigrationsCard }) => (
    <EuiPanel color="transparent" hasShadow={false} paddingSize="none">
      <CardCallOut
        color="warning"
        text={i18n.MIGRATION_MISSING_TEXT}
        action={
          <EuiLink onClick={onExpandMigrationsCard}>
            <EuiFlexGroup direction="row" gutterSize="xs" alignItems="center">
              <EuiFlexItem>{i18n.MIGRATION_MISSING_BUTTON}</EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiIcon type="chevronSingleRight" color="primary" size="s" aria-hidden={true} />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiLink>
        }
      />
    </EuiPanel>
  )
);
MissingMigrationCallout.displayName = 'MissingMigrationCallout';
