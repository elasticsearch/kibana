/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { FilterExpressionBadge } from './filter_badge_expression';
import { phraseFilter } from '@kbn/data-plugin/common/stubs';
import { EMPTY_LABEL, NULL_LABEL } from '@kbn/field-formats-common';
import { getDisplayValueFromFilter } from '@kbn/data-plugin/public';

jest.mock('@kbn/data-plugin/public', () => ({
  getDisplayValueFromFilter: jest.fn(),
  getFieldDisplayValueFromFilter: jest.fn(() => ''),
}));

jest.mock('./filter_badge_invalid', () => ({
  FilterBadgeInvalidPlaceholder: () => <div data-test-subj="invalid-placeholder" />,
}));

jest.mock('./filter_content', () => ({
  FilterContent: ({ valueLabel }: { valueLabel: string }) => (
    <div data-test-subj="filter-content">{valueLabel}</div>
  ),
}));

const mockGetDisplayValue = getDisplayValueFromFilter as jest.Mock;

const renderBadge = (displayValue: string) => {
  mockGetDisplayValue.mockReturnValue(displayValue);
  return render(<FilterExpressionBadge filter={phraseFilter} dataViews={[]} />);
};

describe('FilterExpressionBadge', () => {
  describe('FilterBadgeContent', () => {
    it('renders filter content for a normal value', () => {
      renderBadge('ios');
      expect(screen.getByTestId('filter-content')).toHaveTextContent('ios');
      expect(screen.queryByTestId('invalid-placeholder')).toBeNull();
    });

    it('renders filter content when display value is an empty string', () => {
      // Previously `!''` was truthy and rendered the invalid placeholder;
      // the fix changes the check to `== null` so empty string is a valid label.
      renderBadge('');
      expect(screen.getByTestId('filter-content')).toBeInTheDocument();
      expect(screen.queryByTestId('invalid-placeholder')).toBeNull();
    });

    it('renders filter content with blank label for an empty string field value', () => {
      renderBadge(EMPTY_LABEL);
      expect(screen.getByTestId('filter-content')).toHaveTextContent(EMPTY_LABEL);
      expect(screen.queryByTestId('invalid-placeholder')).toBeNull();
    });

    it('renders filter content with null label for a null field value', () => {
      renderBadge(NULL_LABEL);
      expect(screen.getByTestId('filter-content')).toHaveTextContent(NULL_LABEL);
      expect(screen.queryByTestId('invalid-placeholder')).toBeNull();
    });

    it('uses filterLabelStatus when provided instead of computed display value', () => {
      mockGetDisplayValue.mockReturnValue('should-not-be-used');
      render(
        <FilterExpressionBadge
          filter={phraseFilter}
          dataViews={[]}
          filterLabelStatus="custom status"
        />
      );
      expect(screen.getByTestId('filter-content')).toHaveTextContent('custom status');
    });
  });
});
