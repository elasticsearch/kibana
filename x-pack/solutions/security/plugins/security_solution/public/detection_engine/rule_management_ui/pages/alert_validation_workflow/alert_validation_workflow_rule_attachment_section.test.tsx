/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { coreMock } from '@kbn/core/public/mocks';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { KibanaContextProvider } from '../../../../common/lib/kibana';
import {
  ALERT_VALIDATION_WORKFLOW_RULE_STATS_ROUTE,
  ALERT_VALIDATION_WORKFLOW_RULES_ROUTE,
} from './api';
import { AlertValidationWorkflowRuleAttachmentSection } from './alert_validation_workflow_rule_attachment_section';

const PAGE_1_RULES = [
  { id: 'p1-rule-1', name: 'Rule 1', enabled: true, attached: true },
  { id: 'p1-rule-2', name: 'Rule 2', enabled: true, attached: true },
  { id: 'p1-rule-3', name: 'Rule 3', enabled: true, attached: true },
  { id: 'p1-rule-4', name: 'Rule 4', enabled: true, attached: true },
  { id: 'p1-rule-5', name: 'Rule 5', enabled: true, attached: true },
];

const PAGE_2_RULES = [
  { id: 'p2-rule-1', name: 'Rule 6', enabled: false, attached: false },
  { id: 'p2-rule-2', name: 'Rule 7', enabled: false, attached: false },
  { id: 'p2-rule-3', name: 'Rule 8', enabled: false, attached: false },
  { id: 'p2-rule-4', name: 'Rule 9', enabled: false, attached: false },
  { id: 'p2-rule-5', name: 'Rule 10', enabled: false, attached: false },
];

const TOTAL_RULES = PAGE_1_RULES.length + PAGE_2_RULES.length;
const ATTACHED_RULES = PAGE_1_RULES.filter((r) => r.attached).length;
const PER_PAGE = 5;

describe('AlertValidationWorkflowRuleAttachmentSection', () => {
  const coreStart = coreMock.createStart();

  const setupFetchMock = () => {
    coreStart.http.fetch.mockImplementation(async (...args: unknown[]) => {
      const [path, options] = args as [
        string,
        { method?: string; query?: Record<string, unknown> }
      ];

      if (path === ALERT_VALIDATION_WORKFLOW_RULE_STATS_ROUTE) {
        return { total: TOTAL_RULES, attached: ATTACHED_RULES };
      }

      if (path === ALERT_VALIDATION_WORKFLOW_RULES_ROUTE) {
        const page = (options?.query?.page as number) ?? 1;
        const rules = page === 1 ? PAGE_1_RULES : PAGE_2_RULES;
        return { page, perPage: PER_PAGE, total: TOTAL_RULES, attached: ATTACHED_RULES, rules };
      }

      return {};
    });
  };

  const renderComponent = () => {
    coreStart.application.capabilities = {
      ...coreStart.application.capabilities,
      securitySolution: { show: true, crud: true },
    };

    setupFetchMock();

    const services = { ...coreStart };

    return renderWithI18n(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <KibanaContextProvider services={services}>
          <AlertValidationWorkflowRuleAttachmentSection />
        </KibanaContextProvider>
      </QueryClientProvider>
    );
  };

  it('navigating to page 2 does not create pending changes when no rules were manually selected', async () => {
    renderComponent();

    // Wait for page 1 to load — all 5 rules are attached so all rows appear selected
    await waitFor(() => {
      expect(screen.getByText('Rule 1')).toBeInTheDocument();
    });

    // Confirm no pending changes on page 1
    expect(screen.getByText('Changed 0 rules')).toBeInTheDocument();
    expect(screen.getByTestId('alertValidationWorkflowRuleAttachmentAttachButton')).toBeDisabled();

    // Navigate to page 2 via the EUI pagination next button
    const nextPageButton = screen.getByTestId('pagination-button-next');
    await userEvent.click(nextPageButton);

    // Wait for page 2 to render
    await waitFor(() => {
      expect(screen.getByText('Rule 6')).toBeInTheDocument();
    });

    // The key assertion: navigating pages must not create spurious pending changes
    expect(screen.getByText('Changed 0 rules')).toBeInTheDocument();
    expect(screen.getByTestId('alertValidationWorkflowRuleAttachmentAttachButton')).toBeDisabled();
  });
});
