/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { render } from '@testing-library/react';
import { buildDataTableRecord, type EsHitRecord } from '@kbn/discover-utils';
import { InvestigationGuide } from '.';
import { mockContextValue } from '../../../../flyout/document_details/shared/mocks/mock_context';
import { useRuleWithFallback } from '../../../../detection_engine/rule_management/logic/use_rule_with_fallback';

jest.mock('../../../../detection_engine/rule_management/logic/use_rule_with_fallback');
jest.mock('../../../shared/components/document_tools_flyout_header', () => ({
  DocumentToolsFlyoutHeader: ({ title }: { title: string }) => (
    <div data-test-subj="mockDocumentToolsFlyoutHeader">{title}</div>
  ),
}));

const renderInvestigationGuide = ({
  hit = buildDataTableRecord(mockContextValue.searchHit as EsHitRecord),
}: {
  hit?: ReturnType<typeof buildDataTableRecord>;
} = {}) =>
  render(
    <IntlProvider locale="en">
      <InvestigationGuide hit={hit} />
    </IntlProvider>
  );

describe('<InvestigationGuide />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading skeleton when rule is loading', () => {
    (useRuleWithFallback as jest.Mock).mockReturnValue({
      loading: true,
      error: false,
      rule: null,
    });

    const { getByLabelText, queryByTestId } = renderInvestigationGuide();

    expect(getByLabelText(/investigation guide/i)).toBeInTheDocument();
    expect(queryByTestId('investigation-guide-full-view')).not.toBeInTheDocument();
  });

  it('should render full investigation guide when rule note exists', () => {
    (useRuleWithFallback as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      rule: { note: 'test note' },
    });

    const { getByTestId } = renderInvestigationGuide();

    expect(useRuleWithFallback).toHaveBeenCalledWith('ruleId');
    expect(getByTestId('investigation-guide-full-view')).toHaveTextContent('test note');
  });

  it("should render a no data message when there's no rule id in the document", () => {
    (useRuleWithFallback as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      rule: { note: 'test note' },
    });

    const hit = buildDataTableRecord({
      ...mockContextValue.searchHit,
      fields: {},
    } as unknown as EsHitRecord);

    const { getByText, queryByTestId } = renderInvestigationGuide({ hit });

    expect(queryByTestId('investigation-guide-full-view')).not.toBeInTheDocument();
    expect(getByText("There's no investigation guide for this rule.")).toBeInTheDocument();
  });

  it('should render a no data message when rule note is missing', () => {
    (useRuleWithFallback as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      rule: { note: undefined },
    });

    const { getByText, queryByTestId } = renderInvestigationGuide();

    expect(queryByTestId('investigation-guide-full-view')).not.toBeInTheDocument();
    expect(getByText("There's no investigation guide for this rule.")).toBeInTheDocument();
  });

  it('should request the signal rule id when the document is not an alert', () => {
    (useRuleWithFallback as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      rule: { note: undefined },
    });

    const hit = buildDataTableRecord({
      ...mockContextValue.searchHit,
      fields: {
        'signal.rule.id': ['signalRuleId'],
      },
    } as unknown as EsHitRecord);

    renderInvestigationGuide({ hit });

    expect(useRuleWithFallback).toHaveBeenCalledWith('signalRuleId');
  });
});
