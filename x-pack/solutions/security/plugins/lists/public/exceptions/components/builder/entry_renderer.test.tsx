/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { EuiComboBox } from '@elastic/eui';
import { coreMock } from '@kbn/core/public/mocks';
import {
  doesNotExistOperator,
  doesNotMatchOperator,
  existsOperator,
  isInListOperator,
  isNotInListOperator,
  isNotOneOfOperator,
  isNotOperator,
  isOneOfOperator,
  isOperator,
  matchesOperator,
} from '@kbn/securitysolution-list-utils';
import {
  CONTROL_CHARACTER_ERROR,
  hasControlCharacters,
  trimInputValues,
  validatePotentialWildcardInput,
} from '@kbn/securitysolution-utils';
import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';
import { useFindListsBySize } from '@kbn/securitysolution-list-hooks';
import type { FieldSpec } from '@kbn/data-plugin/common';
import { fields, getField } from '@kbn/data-plugin/common/mocks';
import { kqlPluginMock } from '@kbn/kql/public/mocks';
import { waitFor } from '@testing-library/react';
import type { ReactWrapper } from 'enzyme';
import { mount } from 'enzyme';

import { MockedShowValueListModal } from '../__mock__/show_value_list_modal.mock';
import { getFoundListsBySizeSchemaMock } from '../../../../common/schemas/response/found_lists_by_size_schema.mock';

import { BuilderEntryItem } from './entry_renderer';
import * as i18n from './translations';

jest.mock('@kbn/securitysolution-list-hooks');
jest.mock('@kbn/securitysolution-utils');

const mockKibanaHttpService = coreMock.createStart().http;
const { autocomplete: autocompleteStartMock } = kqlPluginMock.createStartContract();
const mockResult = getFoundListsBySizeSchemaMock();
mockResult.largeLists = [];

describe('BuilderEntryItem', () => {
  let wrapper: ReactWrapper;

  beforeEach(() => {
    (useFindListsBySize as jest.Mock).mockReturnValue({
      error: undefined,
      loading: false,
      result: mockResult,
      start: jest.fn(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    wrapper.unmount();
  });

  test('it renders field labels if "showLabel" is "true"', () => {
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: undefined,
          id: '123',
          nested: undefined,
          operator: isOperator,
          parent: undefined,
          value: undefined,
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        exceptionItemIndex={0}
        showLabel
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(wrapper.find('[data-test-subj="exceptionBuilderEntryFieldFormRow"]')).not.toEqual(0);
    expect(wrapper.find('.euiFormHelpText.euiFormRow__text').exists()).toBeFalsy();
  });

  test('it renders custom option text if "allowCustomOptions" is "true" and it is not a nested entry', () => {
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('ip'),
          id: '123',
          nested: undefined,
          operator: isOperator,
          parent: undefined,
          value: '1234',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel
        allowCustomOptions
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(wrapper.find('.euiFormHelpText.euiFormRow__text').at(0).text()).toEqual(
      i18n.CUSTOM_COMBOBOX_OPTION_TEXT
    );
    expect(wrapper.find('[data-test-subj="exceptionBuilderEntryField"]').at(0).props()).toEqual(
      expect.objectContaining({ acceptsCustomOptions: true })
    );
  });

  test('it does not render custom option text when "allowCustomOptions" is "true" and it is a nested entry', () => {
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('nestedField.child'),
          id: '64ce5d11-2076-4369-859a-297832a426d0',
          nested: 'parent',
          operator: isOperator,
          parent: undefined,
          value: undefined,
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel
        allowCustomOptions
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(wrapper.find('.euiFormHelpText.euiFormRow__text').exists()).toBeFalsy();
    expect(wrapper.find('[data-test-subj="exceptionBuilderEntryField"]').at(0).props()).toEqual(
      expect.objectContaining({ acceptsCustomOptions: false })
    );
  });

  test('it does not render custom option text when "allowCustomOptions" is "false"', () => {
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('ip'),
          id: '123',
          nested: undefined,
          operator: isOperator,
          parent: undefined,
          value: '1234',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel
        allowCustomOptions={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(wrapper.find('.euiFormHelpText.euiFormRow__text').exists()).toBeFalsy();
    expect(wrapper.find('[data-test-subj="exceptionBuilderEntryField"]').at(0).props()).toEqual(
      expect.objectContaining({ acceptsCustomOptions: false })
    );
  });

  test('it render mapping issues warning text when field has mapping conflicts', async () => {
    const field = getField('mapping issues');
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field,
          id: '123',
          nested: undefined,
          operator: isOperator,
          parent: undefined,
          value: '1234',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel
        allowCustomOptions
        getExtendedFields={(): Promise<FieldSpec[]> => Promise.resolve([field])}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    await waitFor(() => {
      wrapper.update();
      expect(wrapper.find('div.euiFormHelpText.euiFormRow__text').text()).toMatch(
        /This field is defined as different types across the following indices or is unmapped. This can cause unexpected query results./
      );
    });
  });

  test('it renders field values correctly when operator is "isOperator"', () => {
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('ip'),
          id: '123',
          nested: undefined,
          operator: isOperator,
          parent: undefined,
          value: '1234',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryField"] input').props().value
    ).toEqual('ip');
    expect(
      wrapper.find('[data-test-subj="operatorAutocompleteComboBox"] input').props().value
    ).toEqual('is');
    expect(
      wrapper.find('[data-test-subj="valuesAutocompleteMatchLabel"] input').props().value
    ).toEqual('1234');
  });

  test('it renders field values correctly when operator is "isNotOperator"', () => {
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('ip'),
          id: '123',
          nested: undefined,
          operator: isNotOperator,
          parent: undefined,
          value: '1234',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryField"] input').props().value
    ).toEqual('ip');
    expect(
      wrapper.find('[data-test-subj="operatorAutocompleteComboBox"] input').props().value
    ).toEqual('is not');
    expect(
      wrapper.find('[data-test-subj="valuesAutocompleteMatchLabel"] input').props().value
    ).toEqual('1234');
  });

  test('it renders field values correctly when operator is "isOneOfOperator"', () => {
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('ip'),
          id: '123',
          nested: undefined,
          operator: isOneOfOperator,
          parent: undefined,
          value: ['1234'],
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryField"] input').props().value
    ).toEqual('ip');
    expect(
      wrapper.find('[data-test-subj="operatorAutocompleteComboBox"] input').props().value
    ).toEqual('is one of');
    expect(wrapper.find('[data-test-subj="valuesAutocompleteMatchAny"]').first().text()).toEqual(
      '1234'
    );
  });

  test('it renders field values correctly when operator is "isNotOneOfOperator"', () => {
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('ip'),
          id: '123',
          nested: undefined,
          operator: isNotOneOfOperator,
          parent: undefined,
          value: ['1234'],
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryField"] input').props().value
    ).toEqual('ip');
    expect(
      wrapper.find('[data-test-subj="operatorAutocompleteComboBox"] input').props().value
    ).toEqual('is not one of');
    expect(wrapper.find('[data-test-subj="exceptionBuilderEntryFieldMatchAny"]').text()).toEqual(
      '1234'
    );
  });

  test('it renders field values correctly when operator is "isInListOperator"', () => {
    wrapper = mount(
      <BuilderEntryItem
        allowLargeValueLists
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('ip'),
          id: '123',
          nested: undefined,
          operator: isInListOperator,
          parent: undefined,
          value: 'some-list-id',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryField"] input').props().value
    ).toEqual('ip');
    expect(
      wrapper.find('[data-test-subj="operatorAutocompleteComboBox"] input').props().value
    ).toEqual('is in list');
    expect(
      wrapper.find('[data-test-subj="valuesAutocompleteComboBox listsComboxBox"] input').props()
        .value
    ).toEqual('some name');
  });

  test('it renders field values correctly when operator is "isNotInListOperator"', () => {
    wrapper = mount(
      <BuilderEntryItem
        allowLargeValueLists
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('ip'),
          id: '123',
          nested: undefined,
          operator: isNotInListOperator,
          parent: undefined,
          value: 'some-list-id',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryField"] input').props().value
    ).toEqual('ip');
    expect(
      wrapper.find('[data-test-subj="operatorAutocompleteComboBox"] input').props().value
    ).toEqual('is not in list');
    expect(
      wrapper.find('[data-test-subj="valuesAutocompleteComboBox listsComboxBox"] input').props()
        .value
    ).toEqual('some name');
  });

  test('it renders field values correctly when operator is "existsOperator"', () => {
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('ip'),
          id: '123',
          nested: undefined,
          operator: existsOperator,
          parent: undefined,
          value: undefined,
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryField"] input').props().value
    ).toEqual('ip');
    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryOperator"] input').props().value
    ).toEqual('exists');
    expect(
      wrapper.find('[data-test-subj="valuesAutocompleteComboBox existsComboxBox"] input').props()
        .placeholder
    ).toEqual('—');
    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryFieldExists"] input').props().disabled
    ).toBeTruthy();
  });

  test('it renders field values correctly when operator is "doesNotExistOperator"', () => {
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('ip'),
          id: '123',
          nested: undefined,
          operator: doesNotExistOperator,
          parent: undefined,
          value: undefined,
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryField"] input').props().value
    ).toEqual('ip');
    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryOperator"] input').props().value
    ).toEqual('does not exist');
    expect(
      wrapper.find('[data-test-subj="valuesAutocompleteComboBox existsComboxBox"] input').props()
        .placeholder
    ).toEqual('—');
    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryFieldExists"] input').props().disabled
    ).toBeTruthy();
  });

  test('it renders field values correctly when operator is "matchesOperator"', () => {
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('@tags'),
          id: '123',
          nested: undefined,
          operator: matchesOperator,
          parent: undefined,
          value: '1234*',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryField"] input').props().value
    ).toEqual('@tags');
    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryOperator"] input').props().value
    ).toEqual('matches');
    expect(
      wrapper.find('[data-test-subj="valuesAutocompleteWildcard"] input').props().value
    ).toEqual('1234*');
    // doesnt show warning label for non endpoint exception items
    expect(
      wrapper.find('[data-test-subj="valuesAutocompleteWildcardLabel"] .euiFormHelpText')
    ).toHaveLength(0);
  });

  test('it does not render matches filepath warning message for rule default list item', () => {
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('@tags'),
          id: '123',
          nested: undefined,
          operator: matchesOperator,
          parent: undefined,
          value: '1234*',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="rule_default"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    // doesnt show warning label for non endpoint exception items
    expect(
      wrapper.find('[data-test-subj="valuesAutocompleteWildcardLabel"] .euiFormHelpText')
    ).toHaveLength(0);
  });

  test('it renders field values correctly when operator is "doesNotMatchOperator"', () => {
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('@tags'),
          id: '123',
          nested: undefined,
          operator: doesNotMatchOperator,
          parent: undefined,
          value: '1234*',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryField"] input').props().value
    ).toEqual('@tags');
    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryOperator"] input').props().value
    ).toEqual('does not match');
    expect(
      wrapper.find('[data-test-subj="valuesAutocompleteWildcard"] input').props().value
    ).toEqual('1234*');
  });

  test('it uses "correspondingKeywordField" if it exists', () => {
    const correspondingKeywordField: FieldSpec = {
      aggregatable: true,
      count: 0,
      esTypes: ['keyword'],
      name: 'extension',
      readFromDocValues: true,
      scripted: false,
      searchable: true,
      type: 'string',
    };
    const field: FieldSpec = {
      aggregatable: false,
      count: 0,
      esTypes: ['text'],
      name: 'extension.text',
      readFromDocValues: true,
      scripted: false,
      searchable: false,
      type: 'string',
    };
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField,
          entryIndex: 0,
          field,
          id: '123',
          nested: undefined,
          operator: isOneOfOperator,
          parent: undefined,
          value: ['1234'],
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryFieldMatchAny"]').prop('selectedField')
    ).toEqual({
      aggregatable: true,
      count: 0,
      esTypes: ['keyword'],
      name: 'extension',
      readFromDocValues: true,
      scripted: false,
      searchable: true,
      type: 'string',
    });
  });

  test('it invokes "onChange" when new field is selected and resets operator and value fields', () => {
    const mockOnChange = jest.fn();
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('ip'),
          id: '123',
          nested: undefined,
          operator: isOperator,
          parent: undefined,
          value: '1234',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={mockOnChange}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    (
      wrapper.find(EuiComboBox).at(0).props() as unknown as {
        onChange: (a: EuiComboBoxOptionOption[]) => void;
      }
    ).onChange([{ label: 'machine.os' }]);

    expect(mockOnChange).toHaveBeenCalledWith(
      { field: 'machine.os', id: '123', operator: 'included', type: 'match', value: '' },
      0
    );
  });

  test('it invokes "onChange" when new operator is selected', () => {
    const mockOnChange = jest.fn();
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('ip'),
          id: '123',
          nested: undefined,
          operator: isOperator,
          parent: undefined,
          value: '1234',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={mockOnChange}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    (
      wrapper.find(EuiComboBox).at(1).props() as unknown as {
        onChange: (a: EuiComboBoxOptionOption[]) => void;
      }
    ).onChange([{ label: 'is not' }]);

    expect(mockOnChange).toHaveBeenCalledWith(
      { field: 'ip', id: '123', operator: 'excluded', type: 'match', value: '1234' },
      0
    );
  });

  test('it invokes "onChange" when new value field is entered for match operator', () => {
    const mockOnChange = jest.fn();
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('ip'),
          id: '123',
          nested: undefined,
          operator: isNotOperator,
          parent: undefined,
          value: '1234',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={mockOnChange}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    (
      wrapper.find(EuiComboBox).at(2).props() as unknown as {
        onCreateOption: (a: string) => void;
      }
    ).onCreateOption('127.0.0.1');

    expect(mockOnChange).toHaveBeenCalledWith(
      { field: 'ip', id: '123', operator: 'excluded', type: 'match', value: '127.0.0.1' },
      0
    );
  });

  test('it invokes "onChange" when new value field is entered for match_any operator', () => {
    const mockOnChange = jest.fn();
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('ip'),
          id: '123',
          nested: undefined,
          operator: isOneOfOperator,
          parent: undefined,
          value: '1234',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={mockOnChange}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    (
      wrapper.find(EuiComboBox).at(2).props() as unknown as {
        onCreateOption: (a: string) => void;
      }
    ).onCreateOption('127.0.0.1');

    expect(mockOnChange).toHaveBeenCalledWith(
      { field: 'ip', id: '123', operator: 'included', type: 'match_any', value: ['127.0.0.1'] },
      0
    );
  });

  test('it invokes "onChange" when new value field is entered for list operator', () => {
    const mockOnChange = jest.fn();
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('ip'),
          id: '123',
          nested: undefined,
          operator: isNotInListOperator,
          parent: undefined,
          value: '1234',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={mockOnChange}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    (
      wrapper.find(EuiComboBox).at(2).props() as unknown as {
        onChange: (a: EuiComboBoxOptionOption[]) => void;
      }
    ).onChange([{ label: 'some name' }]);

    expect(mockOnChange).toHaveBeenCalledWith(
      {
        field: 'ip',
        id: '123',
        list: { id: 'some-list-id', type: 'ip' },
        operator: 'excluded',
        type: 'list',
      },
      0
    );
  });

  test('it invokes "onChange" when new value field is entered for wildcard operator', () => {
    const mockOnChange = jest.fn();
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('ip'),
          id: '123',
          nested: undefined,
          operator: matchesOperator,
          parent: undefined,
          value: '1234*',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={mockOnChange}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    (
      wrapper.find(EuiComboBox).at(2).props() as unknown as {
        onCreateOption: (a: string) => void;
      }
    ).onCreateOption('5678*');

    expect(mockOnChange).toHaveBeenCalledWith(
      { field: 'ip', id: '123', operator: 'included', type: 'wildcard', value: '5678*' },
      0
    );
  });

  test('it invokes "setErrorsExist" when user touches value input and leaves empty', async () => {
    const mockSetErrorExists = jest.fn();
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('bytes'),
          id: '123',
          nested: undefined,
          operator: isOneOfOperator,
          parent: undefined,
          value: '',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={mockSetErrorExists}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    await waitFor(() => {
      (
        wrapper.find(EuiComboBox).at(2).props() as unknown as {
          onBlur: () => void;
        }
      ).onBlur();
    });

    expect(mockSetErrorExists).toHaveBeenCalledWith({ '123': true });
  });

  test('it invokes "setErrorsExist" when invalid value inputted for field value input', async () => {
    const mockSetErrorExists = jest.fn();
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('bytes'),
          id: '123',
          nested: undefined,
          operator: isOneOfOperator,
          parent: undefined,
          value: '',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={mockSetErrorExists}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    await waitFor(() => {
      (
        wrapper.find(EuiComboBox).at(2).props() as unknown as {
          onBlur: () => void;
        }
      ).onBlur();

      // Invalid input because field type is number
      (
        wrapper.find(EuiComboBox).at(2).props() as unknown as {
          onSearchChange: (arg: string) => void;
        }
      ).onSearchChange('hellooo');
    });

    expect(mockSetErrorExists).toHaveBeenCalledWith({ '123': true });
  });

  test('it invokes "setWarningsExist" when invalid value in field value input', async () => {
    const mockSetWarningsExists = jest.fn();

    (validatePotentialWildcardInput as jest.Mock).mockReturnValue('some warning message');
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('nestedField.nestedChild.doublyNestedChild'),
          id: '123',
          nested: undefined,
          operator: matchesOperator,
          parent: undefined,
          value: '',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logs-endpoint.events.*',
        }}
        listType="endpoint_events"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={mockSetWarningsExists}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    await waitFor(() => {
      (
        wrapper.find(EuiComboBox).at(2).props() as unknown as {
          onBlur: () => void;
        }
      ).onBlur();

      // Invalid input because field is just a string and not a path
      (
        wrapper.find(EuiComboBox).at(2).props() as unknown as {
          onSearchChange: (arg: string) => void;
        }
      ).onSearchChange('i243kjhfew');
    });

    expect(mockSetWarningsExists).toHaveBeenCalledWith(true);
  });

  test.each([
    ['trusted applications', 'endpoint', ENDPOINT_ARTIFACT_LISTS.trustedApps.id],
    ['event filters', 'endpoint_events', ENDPOINT_ARTIFACT_LISTS.eventFilters.id],
    ['blocklists', 'endpoint_blocklists', ENDPOINT_ARTIFACT_LISTS.blocklists.id],
    ['endpoint exceptions', 'endpoint', ENDPOINT_ARTIFACT_LISTS.endpointExceptions.id],
  ] as const)('it shows control-character feedback for %s match values', (_, listType, listId) => {
    (hasControlCharacters as jest.Mock).mockReturnValue(true);

    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('keyword'),
          id: '123',
          nested: undefined,
          operator: isOperator,
          parent: undefined,
          value: 'bad\u0000value',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{ fields, id: '1234', title: 'logs-endpoint.events.*' }}
        listId={listId}
        listType={listType}
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(wrapper.text()).toContain(CONTROL_CHARACTER_ERROR);
  });

  test('control-character feedback takes precedence over wildcard path feedback', () => {
    (hasControlCharacters as jest.Mock).mockReturnValue(true);
    (validatePotentialWildcardInput as jest.Mock).mockReturnValue('path warning');

    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('nestedField.nestedChild.doublyNestedChild'),
          id: '123',
          nested: undefined,
          operator: matchesOperator,
          parent: undefined,
          value: ' bad* ',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{ fields, id: '1234', title: 'logs-endpoint.events.*' }}
        listId={ENDPOINT_ARTIFACT_LISTS.eventFilters.id}
        listType="endpoint_events"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(wrapper.text()).toContain(CONTROL_CHARACTER_ERROR);
    expect(wrapper.text()).not.toContain('path warning');
    expect(validatePotentialWildcardInput).not.toHaveBeenCalled();
  });

  test('it shows control-character feedback for Endpoint artifact match_any values', () => {
    (hasControlCharacters as jest.Mock).mockReturnValue(true);

    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('keyword'),
          id: '123',
          nested: undefined,
          operator: isOneOfOperator,
          parent: undefined,
          value: ['clean', 'bad\u0000value'],
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{ fields, id: '1234', title: 'logs-endpoint.events.*' }}
        listId={ENDPOINT_ARTIFACT_LISTS.eventFilters.id}
        listType="endpoint_events"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(hasControlCharacters).toHaveBeenCalledWith(['clean', 'bad\u0000value']);
    expect(wrapper.text()).toContain(CONTROL_CHARACTER_ERROR);
  });

  test.each([
    ['detection', undefined],
    ['rule_default', undefined],
  ] as const)('it excludes %s exception match values', (listType, listId) => {
    (hasControlCharacters as jest.Mock).mockReturnValue(true);

    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('keyword'),
          id: '123',
          nested: undefined,
          operator: isOperator,
          parent: undefined,
          value: 'bad\u0000value',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{ fields, id: '1234', title: 'logstash-*' }}
        listId={listId}
        listType={listType}
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    expect(wrapper.text()).not.toContain(CONTROL_CHARACTER_ERROR);
    expect(hasControlCharacters).not.toHaveBeenCalled();
  });

  test.each([
    ['trims', 'endpoint_events', ENDPOINT_ARTIFACT_LISTS.eventFilters.id, true],
    ['does not trim', 'detection', undefined, false],
  ] as const)('it %s created match values for %s lists', (_, listType, listId, shouldTrim) => {
    (trimInputValues as jest.Mock).mockImplementation((value: string) => value.trim());
    const mockOnChange = jest.fn();

    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('keyword'),
          id: '123',
          nested: undefined,
          operator: isOperator,
          parent: undefined,
          value: '',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{ fields, id: '1234', title: 'logs-endpoint.events.*' }}
        listId={listId}
        listType={listType}
        onChange={mockOnChange}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    (
      wrapper.find(EuiComboBox).at(2).props() as unknown as {
        onCreateOption: (a: string) => void;
      }
    ).onCreateOption('  padded  ');

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: shouldTrim ? 'padded' : '  padded  ' }),
      0
    );
    if (!shouldTrim) {
      expect(trimInputValues).not.toHaveBeenCalled();
    }
  });

  test('it does not invoke "setWarningsExist" when valid value in field value input', async () => {
    const mockSetWarningsExists = jest.fn();

    (validatePotentialWildcardInput as jest.Mock).mockReturnValue(undefined);
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('nestedField.nestedChild.doublyNestedChild'),
          id: '123',
          nested: undefined,
          operator: matchesOperator,
          parent: undefined,
          value: '',
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logs-endpoint.events.*',
        }}
        listType="endpoint_events"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={mockSetWarningsExists}
        showLabel={false}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );

    await waitFor(() => {
      (
        wrapper.find(EuiComboBox).at(2).props() as unknown as {
          onBlur: () => void;
        }
      ).onBlur();

      // valid input as it is a path
      (
        wrapper.find(EuiComboBox).at(2).props() as unknown as {
          onSearchChange: (arg: string) => void;
        }
      ).onSearchChange('c:\\path.exe');
    });

    expect(mockSetWarningsExists).toHaveBeenCalledWith(false);
  });

  test('it disabled field inputs correctly when passed "isDisabled=true"', () => {
    wrapper = mount(
      <BuilderEntryItem
        autocompleteService={autocompleteStartMock}
        entry={{
          correspondingKeywordField: undefined,
          entryIndex: 0,
          field: getField('ip'),
          id: '123',
          nested: undefined,
          operator: isOneOfOperator,
          parent: undefined,
          value: ['1234'],
        }}
        httpService={mockKibanaHttpService}
        indexPattern={{
          fields,
          id: '1234',
          title: 'logstash-*',
        }}
        listType="detection"
        onChange={jest.fn()}
        setErrorsExist={jest.fn()}
        setWarningsExist={jest.fn()}
        osTypes={['windows']}
        showLabel={false}
        isDisabled={true}
        exceptionItemIndex={0}
        showValueListModal={MockedShowValueListModal}
      />
    );
    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryField"] input').props().disabled
    ).toBeTruthy();
    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryOperator"] input').props().disabled
    ).toBeTruthy();
    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryFieldMatchAny"] input').props().disabled
    ).toBeTruthy();
  });
});
