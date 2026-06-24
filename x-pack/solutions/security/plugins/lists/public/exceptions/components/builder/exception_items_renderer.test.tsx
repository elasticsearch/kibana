/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ReactWrapper } from 'enzyme';
import { mount } from 'enzyme';
import { waitFor } from '@testing-library/react';
import { kqlPluginMock } from '@kbn/kql/public/mocks';
import { coreMock } from '@kbn/core/public/mocks';
import { EuiProvider } from '@elastic/eui';
import { fields, getField } from '@kbn/data-plugin/common/mocks';

import { getExceptionListItemSchemaMock } from '../../../../common/schemas/response/exception_list_item_schema.mock';
import { getEntryMatchAnyMock } from '../../../../common/schemas/types/entry_match_any.mock';
import { getEmptyValue } from '../../../common/empty_value';
import { MockedShowValueListModal } from '../__mock__/show_value_list_modal.mock';

import { ExceptionBuilderComponent } from './exception_items_renderer';

const mockKibanaHttpService = coreMock.createStart().http;
const { autocomplete: autocompleteStartMock } = kqlPluginMock.createStartContract();

describe('ExceptionBuilderComponent', () => {
  let wrapper: ReactWrapper;

  const getValueSuggestionsMock = jest.fn().mockResolvedValue(['value 1', 'value 2']);

  afterEach(() => {
    getValueSuggestionsMock.mockClear();
    jest.clearAllMocks();
    wrapper.unmount();
  });

  test('it displays empty entry if no "exceptionListItems" are passed in', () => {
    wrapper = mount(
      <EuiProvider>
        <ExceptionBuilderComponent
          allowLargeValueLists={true}
          autocompleteService={autocompleteStartMock}
          exceptionListItems={[]}
          httpService={mockKibanaHttpService}
          indexPatterns={{
            fields,
            id: '1234',
            title: 'logstash-*',
          }}
          isAndDisabled={false}
          isNestedDisabled={false}
          isOrDisabled={false}
          listId="list_id"
          listNamespaceType="single"
          listType="detection"
          ruleName="Test rule"
          onChange={jest.fn()}
          showValueListModal={MockedShowValueListModal}
        />
      </EuiProvider>
    );

    // console.log(wrapper.find('[data-test-subj="valuesAutocompleteMatch"] input').html());

    expect(wrapper.find('EuiFlexGroup[data-test-subj="exceptionItemEntryContainer"]')).toHaveLength(
      1
    );
    expect(
      wrapper.find('[data-test-subj="fieldAutocompleteComboBox"] input').props().placeholder
    ).toEqual('Search');
    expect(
      wrapper.find('[data-test-subj="operatorAutocompleteComboBox"] input').props().value
    ).toEqual('is');
    expect(
      wrapper.find('[data-test-subj="valuesAutocompleteMatch"] input').props().placeholder
    ).toEqual('Please select a field first...');
  });

  test('it displays "exceptionListItems" that are passed in', async () => {
    wrapper = mount(
      <EuiProvider>
        <ExceptionBuilderComponent
          allowLargeValueLists={true}
          autocompleteService={autocompleteStartMock}
          exceptionListItems={[
            {
              ...getExceptionListItemSchemaMock(),
              entries: [
                { ...getEntryMatchAnyMock(), field: getField('ip').name, value: ['some ip'] },
              ],
            },
          ]}
          httpService={mockKibanaHttpService}
          indexPatterns={{
            fields,
            id: '1234',
            title: 'logstash-*',
          }}
          isAndDisabled={false}
          isNestedDisabled={false}
          isOrDisabled={false}
          listId="list_id"
          listNamespaceType="single"
          listType="detection"
          ruleName="Test rule"
          onChange={jest.fn()}
          showValueListModal={MockedShowValueListModal}
        />
      </EuiProvider>
    );

    expect(wrapper.find('EuiFlexGroup[data-test-subj="exceptionItemEntryContainer"]')).toHaveLength(
      1
    );
    expect(
      wrapper.find('[data-test-subj="fieldAutocompleteComboBox"] input').props().value
    ).toEqual('ip');
    expect(
      wrapper.find('[data-test-subj="operatorAutocompleteComboBox"] input').props().value
    ).toEqual('is one of');
    expect(wrapper.find('[data-test-subj="valuesAutocompleteMatchAny"]').at(0).text()).toEqual(
      'some ip'
    );
  });

  test('it displays "is in list" operators if "allowLargeValueLists" is true', async () => {
    wrapper = mount(
      <EuiProvider>
        <ExceptionBuilderComponent
          allowLargeValueLists={true}
          autocompleteService={autocompleteStartMock}
          exceptionListItems={[
            {
              ...getExceptionListItemSchemaMock(),
              entries: [
                { ...getEntryMatchAnyMock(), field: getField('ip').name, value: ['some ip'] },
              ],
            },
          ]}
          httpService={mockKibanaHttpService}
          indexPatterns={{
            fields,
            id: '1234',
            title: 'logstash-*',
          }}
          isAndDisabled={false}
          isNestedDisabled={false}
          isOrDisabled={false}
          listId="list_id"
          listNamespaceType="single"
          listType="detection"
          ruleName="Test rule"
          onChange={jest.fn()}
          showValueListModal={MockedShowValueListModal}
        />
      </EuiProvider>
    );

    expect(
      wrapper.find('[data-test-subj="operatorAutocompleteComboBox"]').at(0).prop('options')
    ).toEqual(expect.arrayContaining([{ label: 'is in list' }, { label: 'is not in list' }]));
  });

  test('it still displays "is in list" operators if "allowLargeValueLists" is false', async () => {
    wrapper = mount(
      <EuiProvider>
        <ExceptionBuilderComponent
          allowLargeValueLists={false}
          autocompleteService={autocompleteStartMock}
          exceptionListItems={[
            {
              ...getExceptionListItemSchemaMock(),
              entries: [
                { ...getEntryMatchAnyMock(), field: getField('ip').name, value: ['some ip'] },
              ],
            },
          ]}
          httpService={mockKibanaHttpService}
          indexPatterns={{
            fields,
            id: '1234',
            title: 'logstash-*',
          }}
          isAndDisabled={false}
          isNestedDisabled={false}
          isOrDisabled={false}
          listId="list_id"
          listNamespaceType="single"
          listType="detection"
          ruleName="Test rule"
          onChange={jest.fn()}
          showValueListModal={MockedShowValueListModal}
        />
      </EuiProvider>
    );

    expect(
      wrapper.find('[data-test-subj="operatorAutocompleteComboBox"]').at(0).prop('options')
    ).toEqual(expect.arrayContaining([{ label: 'is in list' }, { label: 'is not in list' }]));
  });

  test('it displays "or", "and" and "add nested button" enabled', () => {
    wrapper = mount(
      <EuiProvider>
        <ExceptionBuilderComponent
          allowLargeValueLists={true}
          autocompleteService={autocompleteStartMock}
          exceptionListItems={[]}
          httpService={mockKibanaHttpService}
          indexPatterns={{
            fields,

            id: '1234',
            title: 'logstash-*',
          }}
          isAndDisabled={false}
          isNestedDisabled={false}
          isOrDisabled={false}
          listId="list_id"
          listType="detection"
          listNamespaceType="single"
          ruleName="Test rule"
          onChange={jest.fn()}
          showValueListModal={MockedShowValueListModal}
        />
      </EuiProvider>
    );

    expect(
      wrapper.find('[data-test-subj="exceptionsAndButton"] button').prop('disabled')
    ).toBeFalsy();
    expect(
      wrapper.find('[data-test-subj="exceptionsOrButton"] button').prop('disabled')
    ).toBeFalsy();
    expect(
      wrapper.find('[data-test-subj="exceptionsNestedButton"] button').prop('disabled')
    ).toBeFalsy();
  });

  test('it adds an entry when "and" clicked', async () => {
    wrapper = mount(
      <EuiProvider>
        <ExceptionBuilderComponent
          allowLargeValueLists={true}
          autocompleteService={autocompleteStartMock}
          exceptionListItems={[]}
          httpService={mockKibanaHttpService}
          indexPatterns={{
            fields,
            id: '1234',
            title: 'logstash-*',
          }}
          isAndDisabled={false}
          isNestedDisabled={false}
          isOrDisabled={false}
          listId="list_id"
          listType="detection"
          listNamespaceType="single"
          ruleName="Test rule"
          onChange={jest.fn()}
          showValueListModal={MockedShowValueListModal}
        />
      </EuiProvider>
    );

    expect(wrapper.find('EuiFlexGroup[data-test-subj="exceptionItemEntryContainer"]')).toHaveLength(
      1
    );

    wrapper.find('[data-test-subj="exceptionsAndButton"] button').simulate('click');

    await waitFor(() => {
      expect(
        wrapper.find('EuiFlexGroup[data-test-subj="exceptionItemEntryContainer"]')
      ).toHaveLength(2);
      expect(
        wrapper.find('[data-test-subj="exceptionBuilderEntryField"] input').at(0).props()
          .placeholder
      ).toEqual('Search');
      expect(
        wrapper.find('[data-test-subj="operatorAutocompleteComboBox"] input').at(0).props().value
      ).toEqual('is');
      expect(
        wrapper.find('[data-test-subj="valuesAutocompleteMatch"] input').at(0).props().placeholder
      ).toEqual('Please select a field first...');

      expect(
        wrapper.find('[data-test-subj="exceptionBuilderEntryField"] input').at(1).props()
          .placeholder
      ).toEqual('Search');
      expect(
        wrapper.find('[data-test-subj="operatorAutocompleteComboBox"] input').at(1).props().value
      ).toEqual('is');
      expect(
        wrapper.find('[data-test-subj="valuesAutocompleteMatch"] input').at(1).props().placeholder
      ).toEqual('Please select a field first...');
    });
  });

  test('it adds an exception item when "or" clicked', async () => {
    wrapper = mount(
      <EuiProvider>
        <ExceptionBuilderComponent
          allowLargeValueLists={true}
          autocompleteService={autocompleteStartMock}
          exceptionListItems={[]}
          httpService={mockKibanaHttpService}
          indexPatterns={{
            fields,
            id: '1234',
            title: 'logstash-*',
          }}
          isAndDisabled={false}
          isNestedDisabled={false}
          isOrDisabled={false}
          listId="list_id"
          listType="detection"
          listNamespaceType="single"
          ruleName="Test rule"
          onChange={jest.fn()}
          showValueListModal={MockedShowValueListModal}
        />
      </EuiProvider>
    );

    expect(wrapper.find('EuiFlexGroup[data-test-subj="exceptionEntriesContainer"]')).toHaveLength(
      1
    );

    wrapper.find('[data-test-subj="exceptionsOrButton"] button').simulate('click');

    await waitFor(() => {
      expect(wrapper.find('EuiFlexGroup[data-test-subj="exceptionEntriesContainer"]')).toHaveLength(
        2
      );

      const item1 = wrapper.find('EuiFlexGroup[data-test-subj="exceptionEntriesContainer"]').at(0);
      const item2 = wrapper.find('EuiFlexGroup[data-test-subj="exceptionEntriesContainer"]').at(1);

      expect(
        item1.find('[data-test-subj="exceptionBuilderEntryField"] input').at(0).props().placeholder
      ).toEqual('Search');
      expect(
        item1.find('[data-test-subj="operatorAutocompleteComboBox"] input').at(0).props().value
      ).toEqual('is');
      expect(
        item1.find('[data-test-subj="valuesAutocompleteMatch"] input').at(0).props().placeholder
      ).toEqual('Please select a field first...');

      expect(
        item2.find('[data-test-subj="exceptionBuilderEntryField"] input').at(0).props().placeholder
      ).toEqual('Search');
      expect(
        item2.find('[data-test-subj="operatorAutocompleteComboBox"] input').at(0).props().value
      ).toEqual('is');
      expect(
        item2.find('[data-test-subj="valuesAutocompleteMatch"] input').at(0).props().placeholder
      ).toEqual('Please select a field first...');
    });
  });

  test('it displays empty entry if user deletes last remaining entry', () => {
    wrapper = mount(
      <EuiProvider>
        <ExceptionBuilderComponent
          allowLargeValueLists={true}
          autocompleteService={autocompleteStartMock}
          exceptionListItems={[
            {
              ...getExceptionListItemSchemaMock(),
              entries: [
                { ...getEntryMatchAnyMock(), field: getField('ip').name, value: ['some ip'] },
              ],
            },
          ]}
          httpService={mockKibanaHttpService}
          indexPatterns={{
            fields,
            id: '1234',
            title: 'logstash-*',
          }}
          isAndDisabled={false}
          isNestedDisabled={false}
          isOrDisabled={false}
          listId="list_id"
          listType="detection"
          listNamespaceType="single"
          ruleName="Test rule"
          onChange={jest.fn()}
          showValueListModal={MockedShowValueListModal}
        />
      </EuiProvider>
    );

    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryField"] input').props().value
    ).toEqual('ip');
    expect(
      wrapper.find('[data-test-subj="operatorAutocompleteComboBox"] input').at(0).props().value
    ).toEqual('is one of');
    expect(wrapper.find('[data-test-subj="valuesAutocompleteMatchAny"]').at(0).text()).toEqual(
      'some ip'
    );

    wrapper.find('[data-test-subj="firstRowBuilderDeleteButton"] button').simulate('click');

    expect(
      wrapper.find('[data-test-subj="exceptionBuilderEntryField"] input').at(0).props().placeholder
    ).toEqual('Search');
    expect(
      wrapper.find('[data-test-subj="operatorAutocompleteComboBox"] input').at(0).props().value
    ).toEqual('is');
    expect(
      wrapper.find('[data-test-subj="valuesAutocompleteMatch"] input').at(0).props().placeholder
    ).toEqual('Please select a field first...');
  });

  test('it displays "and" badge if at least one exception item includes more than one entry', () => {
    wrapper = mount(
      <EuiProvider>
        <ExceptionBuilderComponent
          allowLargeValueLists={true}
          autocompleteService={autocompleteStartMock}
          exceptionListItems={[]}
          httpService={mockKibanaHttpService}
          indexPatterns={{
            fields,
            id: '1234',
            title: 'logstash-*',
          }}
          isAndDisabled={false}
          isNestedDisabled={false}
          isOrDisabled={false}
          listId="list_id"
          listType="detection"
          listNamespaceType="single"
          ruleName="Test rule"
          onChange={jest.fn()}
          showValueListModal={MockedShowValueListModal}
        />
      </EuiProvider>
    );

    expect(
      wrapper.find('[data-test-subj="exceptionItemEntryFirstRowAndBadge"]').exists()
    ).toBeFalsy();

    wrapper.find('[data-test-subj="exceptionsAndButton"] button').simulate('click');

    expect(
      wrapper.find('[data-test-subj="exceptionItemEntryFirstRowAndBadge"]').exists()
    ).toBeTruthy();
  });

  test('it does not display "and" badge if none of the exception items include more than one entry', () => {
    wrapper = mount(
      <EuiProvider>
        <ExceptionBuilderComponent
          allowLargeValueLists={true}
          autocompleteService={autocompleteStartMock}
          exceptionListItems={[]}
          httpService={mockKibanaHttpService}
          indexPatterns={{
            fields,
            id: '1234',
            title: 'logstash-*',
          }}
          isAndDisabled={false}
          isNestedDisabled={false}
          isOrDisabled={false}
          listId="list_id"
          listType="detection"
          listNamespaceType="single"
          ruleName="Test rule"
          onChange={jest.fn()}
          showValueListModal={MockedShowValueListModal}
        />
      </EuiProvider>
    );

    wrapper.find('[data-test-subj="exceptionsOrButton"] button').simulate('click');

    expect(
      wrapper.find('[data-test-subj="exceptionItemEntryFirstRowAndBadge"]').exists()
    ).toBeFalsy();

    wrapper.find('[data-test-subj="exceptionsOrButton"] button').simulate('click');

    expect(
      wrapper.find('[data-test-subj="exceptionItemEntryFirstRowAndBadge"]').exists()
    ).toBeFalsy();
  });

  describe('nested entry', () => {
    test('it adds a nested entry when "add nested entry" clicked', async () => {
      wrapper = mount(
        <EuiProvider>
          <ExceptionBuilderComponent
            allowLargeValueLists={true}
            autocompleteService={autocompleteStartMock}
            exceptionListItems={[]}
            httpService={mockKibanaHttpService}
            indexPatterns={{
              fields,
              id: '1234',
              title: 'logstash-*',
            }}
            isAndDisabled={false}
            isNestedDisabled={false}
            isOrDisabled={false}
            listId="list_id"
            listType="detection"
            listNamespaceType="single"
            ruleName="Test rule"
            onChange={jest.fn()}
            showValueListModal={MockedShowValueListModal}
          />
        </EuiProvider>
      );

      wrapper.find('[data-test-subj="exceptionsNestedButton"] button').simulate('click');

      await waitFor(() => {
        const entry2 = wrapper
          .find('EuiFlexGroup[data-test-subj="exceptionItemEntryContainer"]')
          .at(1);

        expect(
          entry2.find('[data-test-subj="exceptionBuilderEntryField"] input').at(0).props()
            .placeholder
        ).toEqual('Search nested field');
        expect(
          entry2.find('[data-test-subj="operatorAutocompleteComboBox"] input').at(0).props().value
        ).toEqual('is');
        expect(
          entry2.find('[data-test-subj="exceptionBuilderEntryFieldExists"] input').at(0).props()
            .placeholder
        ).toEqual(getEmptyValue());
      });
    });
  });
});
