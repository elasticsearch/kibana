/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiPageTemplate, EuiScreenReaderOnly, EuiText, useEuiTheme } from '@elastic/eui';
import React from 'react';
import { i18n } from '@kbn/i18n';
import { WorkflowExecutionsPageContent } from './workflow_executions_page_content';
import { useWorkflowsBreadcrumbs } from '../../hooks/use_workflow_breadcrumbs/use_workflow_breadcrumbs';

const executionsPageTitle = i18n.translate('workflowsManagement.executionsPage.pageTitle', {
  defaultMessage: 'Executions',
});

const executionsPageDescription = i18n.translate(
  'workflowsManagement.executionsPage.pageDescription',
  {
    defaultMessage: 'Browse and filter workflow executions across your space.',
  }
);

export function WorkflowExecutionsPage() {
  const { euiTheme } = useEuiTheme();

  useWorkflowsBreadcrumbs(executionsPageTitle);

  return (
    <EuiPageTemplate
      offset={0}
      css={{ backgroundColor: euiTheme.colors.backgroundBasePlain }}
      data-test-subj="workflowExecutionsPage"
    >
      <EuiPageTemplate.Header bottomBorder pageTitle={executionsPageTitle}>
        <EuiScreenReaderOnly>
          <h2 id="workflowExecutionsTableLabel">{executionsPageTitle}</h2>
        </EuiScreenReaderOnly>
        <EuiText size="s" color="subdued">
          <p>{executionsPageDescription}</p>
        </EuiText>
      </EuiPageTemplate.Header>
      <EuiPageTemplate.Section paddingSize="m" grow>
        <WorkflowExecutionsPageContent />
      </EuiPageTemplate.Section>
    </EuiPageTemplate>
  );
}
