/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, act, waitFor } from '@testing-library/react';
import type { DataViewFieldBase } from '@kbn/es-query';
import { buildDataTableRecord, type EsHitRecord } from '@kbn/discover-utils';
import { TestProviders } from '../../../../common/mock';
import { DocumentDetailsContext } from '../../../../flyout/document_details/shared/context';
import { mockContextValue } from '../../../../flyout/document_details/shared/mocks/mock_context';
import { usePrebuiltRuleCustomizationUpsellingMessage } from '../../../../detection_engine/rule_management/logic/prebuilt_rules/use_prebuilt_rule_customization_upselling_message';
import { useRuleIndexPattern } from '../../../../detection_engine/rule_creation_ui/pages/form';
import { HighlightedFieldsModal } from './highlighted_fields_modal';
import type { RuleResponse, RuleUpdateProps } from '../../../../../common/api/detection_engine';
import {
  HIGHLIGHTED_FIELDS_MODAL_CANCEL_BUTTON_TEST_ID,
  HIGHLIGHTED_FIELDS_MODAL_CUSTOM_FIELDS_TEST_ID,
  HIGHLIGHTED_FIELDS_MODAL_SAVE_BUTTON_TEST_ID,
  HIGHLIGHTED_FIELDS_MODAL_TEST_ID,
  HIGHLIGHTED_FIELDS_MODAL_DEFAULT_FIELDS_TEST_ID,
} from './test_ids';
import { useUpdateRule } from '../../../../detection_engine/rule_management/logic/use_update_rule';
import { useHighlightedFields } from '../hooks/use_highlighted_fields';

jest.mock(
  '../../../../detection_engine/rule_management/logic/prebuilt_rules/use_prebuilt_rule_customization_upselling_message'
);
jest.mock('../../../../detection_engine/rule_creation_ui/pages/form');
jest.mock('../../../../detection_engine/rule_management/logic/use_update_rule');
jest.mock('../hooks/use_highlighted_fields');
jest.mock('../../../rule/main/hooks/use_rule_details');

const mockAddSuccess = jest.fn();
jest.mock('../../../../common/hooks/use_app_toasts', () => ({
  useAppToasts: () => ({
    addSuccess: mockAddSuccess,
  }),
}));

const mockSetIsEditLoading = jest.fn();
const mockSetIsModalVisible = jest.fn();
const mockFieldOptions = [{ name: 'field1' }, { name: 'field2' }] as DataViewFieldBase[];
const mockUpdateRule = jest.fn();
const mockRule = { id: '123', name: 'test rule' } as RuleResponse;

const defaultProps = {
  rule: mockRule,
  customHighlightedFields: [] as string[],
  hit: buildDataTableRecord(mockContextValue.searchHit as EsHitRecord),
  setIsEditLoading: mockSetIsEditLoading,
  setIsModalVisible: mockSetIsModalVisible,
};

const renderHighlighedFieldsModal = (props = defaultProps) =>
  render(
    <TestProviders>
      <DocumentDetailsContext.Provider value={mockContextValue}>
        <HighlightedFieldsModal {...props} />
      </DocumentDetailsContext.Provider>
    </TestProviders>
  );

describe('<HighlighedFieldsModal />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (usePrebuiltRuleCustomizationUpsellingMessage as jest.Mock).mockReturnValue('upsell message');
    (useRuleIndexPattern as jest.Mock).mockReturnValue({
      indexPattern: { fields: [{ name: 'option1' }, { name: 'option2' }] },
      isIndexPatternLoading: false,
    });
    (useUpdateRule as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
    });
    (useHighlightedFields as jest.Mock).mockReturnValue({
      default1: { values: ['test'] },
      default2: { values: ['test2'] },
    });
    (useRuleIndexPattern as jest.Mock).mockReturnValue({
      indexPattern: { fields: mockFieldOptions },
      isIndexPatternLoading: false,
    });
  });

  it('should render modal without preselected custom fields', async () => {
    const { getByTestId, queryByTestId } = renderHighlighedFieldsModal();

    expect(getByTestId(HIGHLIGHTED_FIELDS_MODAL_TEST_ID)).toBeInTheDocument();

    const fields = getByTestId(HIGHLIGHTED_FIELDS_MODAL_DEFAULT_FIELDS_TEST_ID);
    for (const f of ['default1', 'default2']) {
      expect(fields).toHaveTextContent(f);
    }

    expect(getByTestId(HIGHLIGHTED_FIELDS_MODAL_CUSTOM_FIELDS_TEST_ID)).toBeInTheDocument();
    expect(queryByTestId('euiComboBoxPill')).not.toBeInTheDocument(); // no preselected custom fields
  });

  it('should render modal with preselectedcustom fields', () => {
    const { getByTestId, getAllByTestId } = renderHighlighedFieldsModal({
      ...defaultProps,
      customHighlightedFields: ['custom1', 'custom2'],
    });

    expect(getByTestId(HIGHLIGHTED_FIELDS_MODAL_TEST_ID)).toBeInTheDocument();

    expect(getByTestId(HIGHLIGHTED_FIELDS_MODAL_CUSTOM_FIELDS_TEST_ID)).toBeInTheDocument();
    expect(getAllByTestId('euiComboBoxPill')).toHaveLength(2);
    expect(getAllByTestId('euiComboBoxPill')[0]).toHaveTextContent('custom1');
    expect(getAllByTestId('euiComboBoxPill')[1]).toHaveTextContent('custom2');
  });

  it('should close modal when cancel button is clicked', async () => {
    const { getByTestId } = renderHighlighedFieldsModal();
    const cancelButton = getByTestId(HIGHLIGHTED_FIELDS_MODAL_CANCEL_BUTTON_TEST_ID);
    await act(async () => {
      fireEvent.click(cancelButton);
    });
    expect(mockSetIsModalVisible).toHaveBeenCalledWith(false);
  });

  it('should update rule when save button is clicked', async () => {
    (useUpdateRule as jest.Mock).mockReturnValue({ mutateAsync: mockUpdateRule });
    mockUpdateRule.mockResolvedValue({
      name: 'updated rule',
    } as RuleResponse);

    const { getByTestId } = renderHighlighedFieldsModal({
      ...defaultProps,
      customHighlightedFields: ['custom1', 'custom2'],
    });

    fireEvent.click(getByTestId(HIGHLIGHTED_FIELDS_MODAL_SAVE_BUTTON_TEST_ID));

    await waitFor(() => {
      expect(mockSetIsModalVisible).toHaveBeenCalledWith(false);
    });

    expect(mockUpdateRule).toHaveBeenCalledWith({
      name: mockRule.name,
      investigation_fields: { field_names: ['custom1', 'custom2'] },
    } as RuleUpdateProps);

    expect(mockAddSuccess).toHaveBeenCalledWith('updated rule was saved');
    expect(mockUpdateRule).toHaveBeenCalled();
    expect(mockSetIsEditLoading).toHaveBeenCalledTimes(2);
  });
});
