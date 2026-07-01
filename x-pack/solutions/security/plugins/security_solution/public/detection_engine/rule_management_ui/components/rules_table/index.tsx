/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiSpacer } from '@elastic/eui';
import React from 'react';
import { useRouteSpy } from '../../../../common/utils/route/use_route_spy';
import { useSyncRulesTableSavedState } from './rules_table/use_sync_rules_table_saved_state';
import { RulesTables } from './rules_tables';
import { AllRulesTabs, RulesTableToolbar } from './rules_table_toolbar';
import { UpgradePrebuiltRulesTable } from './upgrade_prebuilt_rules_table/upgrade_prebuilt_rules_table';
import { UpgradePrebuiltRulesTableContextProvider } from './upgrade_prebuilt_rules_table/upgrade_prebuilt_rules_table_context';
import { RuleGapsCallout } from '../../../rule_gaps/components/rule_gaps_callout';
import { GapSchedulerErrorsCallout } from '../../../rule_gaps/components/gap_scheduler_errors_callout';
import { MitreVersionUpgradedCallout } from './mitre_version_upgraded_callout';

/**
 * Table Component for displaying all Rules for a given cluster. Provides the ability to filter
 * by name, sort by enabled, and perform the following actions:
 *   * Enable/Disable
 *   * Duplicate
 *   * Delete
 *   * Import/Export
 */
export const AllRules = React.memo(() => {
  useSyncRulesTableSavedState();
  const [{ tabName }] = useRouteSpy();

  if (tabName !== AllRulesTabs.updates) {
    return (
      <>
        <MitreVersionUpgradedCallout />
        {tabName !== AllRulesTabs.monitoring && <RuleGapsCallout />}
        <GapSchedulerErrorsCallout />
        <RulesTableToolbar />
        <EuiSpacer />
        <RulesTables selectedTab={tabName as AllRulesTabs} />
      </>
    );
  } else {
    return (
      <UpgradePrebuiltRulesTableContextProvider>
        <MitreVersionUpgradedCallout />
        <RulesTableToolbar />
        <EuiSpacer />
        <UpgradePrebuiltRulesTable />
      </UpgradePrebuiltRulesTableContextProvider>
    );
  }
});

AllRules.displayName = 'AllRules';
