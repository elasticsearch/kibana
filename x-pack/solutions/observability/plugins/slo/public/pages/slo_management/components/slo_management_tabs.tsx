/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup } from '@elastic/eui';
import type { AppHeaderTab } from '@kbn/app-header';
import { i18n } from '@kbn/i18n';
import {
  SLOS_MANAGEMENT_PATH,
  SLOS_MANAGEMENT_TEMPLATES_PATH,
} from '@kbn/slo-shared-plugin/common/locators/paths';
import React, { useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { ActionModalProvider } from '../../../context/action_modal';
import { SloOutdatedFilterCallout } from './slo_definitions/slo_management_outdated_filter_callout';
import { SloManagementTable } from './slo_definitions/slo_management_table';
import { SloTemplatesTable } from './slo_templates/slo_templates_table';
import { BulkOperationProvider } from '../context/bulk_operation';
import { useTemplatesUrlSearchState } from '../hooks/use_templates_url_search_state';

export type ManagementTab = 'definitions' | 'templates';

export function useActiveManagementTab(): ManagementTab {
  const history = useHistory();
  return history.location.pathname === SLOS_MANAGEMENT_TEMPLATES_PATH ? 'templates' : 'definitions';
}

export function useSloManagementHeaderTabs(): AppHeaderTab[] {
  const history = useHistory();
  const activeTab = useActiveManagementTab();

  return useMemo(
    () => [
      {
        id: 'definitions',
        label: i18n.translate('xpack.slo.managementPage.tab.definitions', {
          defaultMessage: 'SLO Definitions',
        }),
        isSelected: activeTab === 'definitions',
        onClick: () => history.push(SLOS_MANAGEMENT_PATH),
        'data-test-subj': 'managementTabDefinitions',
      },
      {
        id: 'templates',
        label: i18n.translate('xpack.slo.managementPage.tab.templates', {
          defaultMessage: 'SLO Templates',
        }),
        isSelected: activeTab === 'templates',
        onClick: () => history.push(SLOS_MANAGEMENT_TEMPLATES_PATH),
        'data-test-subj': 'managementTabTemplates',
      },
    ],
    [activeTab, history]
  );
}

export function SloManagementTabContent() {
  const activeTab = useActiveManagementTab();
  const templatesSearchState = useTemplatesUrlSearchState();

  if (activeTab === 'templates') {
    return (
      <SloTemplatesTable
        state={templatesSearchState.state}
        onStateChange={templatesSearchState.onStateChange}
      />
    );
  }

  return (
    <BulkOperationProvider>
      <ActionModalProvider>
        <EuiFlexGroup direction="column" gutterSize="m">
          <SloOutdatedFilterCallout />
          <SloManagementTable />
        </EuiFlexGroup>
      </ActionModalProvider>
    </BulkOperationProvider>
  );
}
