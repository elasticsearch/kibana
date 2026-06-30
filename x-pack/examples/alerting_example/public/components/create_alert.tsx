/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useCallback } from 'react';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { ChartsPluginStart } from '@kbn/charts-plugin/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import type { CoreStart } from '@kbn/core/public';
import { RuleFormFlyout } from '@kbn/response-ops-rule-form/flyout';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { EuiIcon, EuiFlexItem, EuiCard, EuiFlexGroup } from '@elastic/eui';
import type { FieldsMetadataPublicStart } from '@kbn/fields-metadata-plugin/public';

import type { AlertingExampleComponentParams } from '../application';
import { ALERTING_EXAMPLE_APP_ID } from '../../common/constants';

type KibanaDeps = {
  dataViews: DataViewsPublicPluginStart;
  charts: ChartsPluginStart;
  data: DataPublicPluginStart;
  unifiedSearch: UnifiedSearchPublicPluginStart;
  fieldsMetadata: FieldsMetadataPublicStart;
} & CoreStart;

export const CreateAlert = ({
  triggersActionsUi: { ruleTypeRegistry, actionTypeRegistry },
}: Pick<AlertingExampleComponentParams, 'triggersActionsUi'>) => {
  const [ruleFlyoutVisible, setRuleFlyoutVisibility] = useState<boolean>(false);

  const { services } = useKibana<KibanaDeps>();

  const onCloseAlertFlyout = useCallback(
    () => setRuleFlyoutVisibility(false),
    [setRuleFlyoutVisibility]
  );

  return (
    <EuiFlexGroup>
      <EuiFlexItem grow={false}>
        <EuiCard
          icon={<EuiIcon size="xxl" type={`bell`} aria-hidden={true} />}
          title={`Create Rule`}
          description="Create a new Rule based on one of our example Rule Types ."
          onClick={() => setRuleFlyoutVisibility(true)}
        />
      </EuiFlexItem>
      <EuiFlexItem>
        {ruleFlyoutVisible ? (
          <RuleFormFlyout
            plugins={{ ...services, ruleTypeRegistry, actionTypeRegistry }}
            consumer={ALERTING_EXAMPLE_APP_ID}
            onCancel={onCloseAlertFlyout}
            onSubmit={onCloseAlertFlyout}
          />
        ) : null}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
