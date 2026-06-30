/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ReactWrapper, ShallowWrapper } from 'enzyme';
import { mount, shallow } from 'enzyme';
import { render, waitFor } from '@testing-library/react';

import { getExceptionBuilderComponentLazy } from '@kbn/lists-plugin/public';
import type { EntriesArray, EntryMatch } from '@kbn/securitysolution-io-ts-list-types';
import { getExceptionListItemSchemaMock } from '@kbn/lists-plugin/common/schemas/response/exception_list_item_schema.mock';
import { createStubIndexPattern, stubIndexPattern } from '@kbn/data-plugin/common/stubs';

import { AddExceptionFlyout } from '.';
import { initialState as exceptionItemsInitialState, createExceptionItemsReducer } from './reducer';
import { useFetchIndex } from '../../../../common/containers/source';
import { useCreateOrUpdateException } from '../../logic/use_create_update_exception';
import { useFetchIndexPatterns } from '../../logic/use_exception_flyout_data';
import { useSignalIndex } from '../../../../detections/containers/detection_engine/alerts/use_signal_index';
import { useAlertsPrivileges } from '../../../../detections/containers/detection_engine/alerts/use_alerts_privileges';
import * as helpers from '../../utils/helpers';
import type { Rule } from '../../../rule_management/logic/types';

import { TestProviders } from '../../../../common/mock';

import {
  getRulesEqlSchemaMock,
  getRulesSchemaMock,
} from '../../../../../common/api/detection_engine/model/rule_schema/mocks';
import type { AlertData } from '../../utils/types';

jest.mock('../../../../detections/containers/detection_engine/alerts/use_signal_index');
jest.mock('../../../../common/lib/kibana');
jest.mock('../../../../common/containers/source');
jest.mock('../../logic/use_create_update_exception');
jest.mock('../../logic/use_exception_flyout_data');
jest.mock('@kbn/lists-plugin/public');
jest.mock('../../../../detections/containers/detection_engine/alerts/use_alerts_privileges');
jest.mock('../../../rule_management/api/hooks/use_fetch_rule_by_id_query');

const mockGetExceptionBuilderComponentLazy = getExceptionBuilderComponentLazy as jest.Mock<
  ReturnType<typeof getExceptionBuilderComponentLazy>
>;
const mockUseAddOrUpdateException = useCreateOrUpdateException as jest.Mock<
  ReturnType<typeof useCreateOrUpdateException>
>;
const mockFetchIndexPatterns = useFetchIndexPatterns as jest.Mock<
  ReturnType<typeof useFetchIndexPatterns>
>;
const mockUseSignalIndex = useSignalIndex as jest.Mock<Partial<ReturnType<typeof useSignalIndex>>>;
const mockUseFetchIndex = useFetchIndex as jest.Mock;
const mockUseAlertsPrivileges = useAlertsPrivileges as jest.Mock;

const alertDataMock: AlertData = {
  '@timestamp': '1234567890',
  _id: 'test-id',
  file: { path: 'test/path' },
};

describe('When the add exception modal is opened', () => {
  let defaultEndpointItems: jest.SpyInstance<
    ReturnType<typeof helpers.defaultEndpointExceptionItems>
  >;
  beforeEach(() => {
    mockGetExceptionBuilderComponentLazy.mockReturnValue(
      <span data-test-subj="alertExceptionBuilder" />
    );
    defaultEndpointItems = jest.spyOn(helpers, 'defaultEndpointExceptionItems');

    mockUseAddOrUpdateException.mockImplementation(() => [false, jest.fn()]);

    mockUseSignalIndex.mockImplementation(() => ({
      loading: false,
      signalIndexName: 'mock-siem-signals-index',
    }));
    mockUseAlertsPrivileges.mockReturnValue({ hasAlertsUpdate: true });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('when the modal is loading', () => {
    let wrapper: ShallowWrapper;
    beforeEach(() => {
      // Mocks one of the hooks as loading
      mockFetchIndexPatterns.mockImplementation(() => ({
        isLoading: true,
        indexPatterns: { fields: [], title: 'foo' },
        getExtendedFields: () => Promise.resolve([]),
      }));

      wrapper = shallow(
        <AddExceptionFlyout
          rules={[{ ...getRulesSchemaMock() } as Rule]}
          isBulkAction={false}
          alertData={undefined}
          isAlertDataLoading={undefined}
          alertStatus={undefined}
          isEndpointItem={false}
          showAlertCloseOptions
          onCancel={jest.fn()}
          onConfirm={jest.fn()}
        />
      );
    });

    it('should show the loading spinner', () => {
      expect(wrapper.find('EuiSkeletonText').exists()).toBeTruthy();
    });
  });

  describe('exception list type of "endpoint"', () => {
    describe('common functionality to test regardless of alert input', () => {
      let wrapper: ShallowWrapper;
      beforeEach(async () => {
        wrapper = shallow(
          <AddExceptionFlyout
            rules={[
              {
                ...getRulesSchemaMock(),
                index: ['filebeat-*'],
                exceptions_list: [
                  {
                    id: 'endpoint_list',
                    list_id: 'endpoint_list',
                    namespace_type: 'agnostic',
                    type: 'endpoint',
                  },
                ],
              } as Rule,
            ]}
            isBulkAction={false}
            alertData={undefined}
            isAlertDataLoading={undefined}
            alertStatus={undefined}
            isEndpointItem
            showAlertCloseOptions
            onCancel={jest.fn()}
            onConfirm={jest.fn()}
          />
        );
      });

      it('should render item name input', () => {
        expect(wrapper.find('ExceptionsFlyoutMeta').exists()).toBeTruthy();
      });

      it('should render the exception builder', () => {
        expect(wrapper.find('ExceptionsConditions').exists()).toBeTruthy();
      });

      it('does NOT render options to add exception to a rule or shared list', () => {
        expect(wrapper.find('ExceptionsAddToRulesOrLists').exists()).toBeFalsy();
      });

      describe('warning callouts', () => {
        let mountWrapper: ReactWrapper;
        beforeEach(() => {
          mockUseFetchIndex.mockImplementation(() => [
            false,
            {
              indexPatterns: stubIndexPattern,
            },
          ]);

          mountWrapper = mount(
            <TestProviders>
              <AddExceptionFlyout
                rules={[
                  {
                    ...getRulesSchemaMock(),
                    index: ['filebeat-*'],
                    exceptions_list: [
                      {
                        id: 'endpoint_list',
                        list_id: 'endpoint_list',
                        namespace_type: 'agnostic',
                        type: 'endpoint',
                      },
                    ],
                  } as Rule,
                ]}
                isBulkAction={false}
                alertData={undefined}
                isAlertDataLoading={undefined}
                alertStatus={undefined}
                isEndpointItem
                showAlertCloseOptions
                onCancel={jest.fn()}
                onConfirm={jest.fn()}
              />
            </TestProviders>
          );
        });

        it('should show a warning callout if wildcard is used', async () => {
          const callProps = mockGetExceptionBuilderComponentLazy.mock.calls[0][0];
          await waitFor(() =>
            callProps.onChange({
              exceptionItems: [
                {
                  ...getExceptionListItemSchemaMock(),
                  entries: [
                    {
                      field: 'event.category',
                      operator: 'included',
                      type: 'match',
                      value: 'wildcardvalue*?',
                    },
                  ],
                },
              ],
            })
          );

          mountWrapper.update();
          expect(
            mountWrapper.find('[data-test-subj="wildcardWithWrongOperatorCallout"]').exists()
          ).toBeTruthy();
        });

        it('should show a warning callout if there is a partial code signature entry with only subject_name', async () => {
          const callProps = mockGetExceptionBuilderComponentLazy.mock.calls[0][0];
          await waitFor(() =>
            callProps.onChange({
              exceptionItems: [
                {
                  ...getExceptionListItemSchemaMock(),
                  entries: [
                    {
                      field: 'process.code_signature.subject_name',
                      operator: 'included',
                      type: 'match',
                      value: 'asdf',
                    },
                  ],
                },
              ],
            })
          );

          mountWrapper.update();
          expect(
            mountWrapper.find('[data-test-subj="partialCodeSignatureCallout"]').exists()
          ).toBeTruthy();
        });

        it('should show a warning callout if there is a partial code signature entry with only trusted field', async () => {
          const callProps = mockGetExceptionBuilderComponentLazy.mock.calls[0][0];
          await waitFor(() =>
            callProps.onChange({
              exceptionItems: [
                {
                  ...getExceptionListItemSchemaMock(),
                  entries: [
                    {
                      field: 'process.code_signature.trusted',
                      operator: 'included',
                      type: 'match',
                      value: 'true',
                    },
                  ],
                },
              ],
            })
          );

          mountWrapper.update();
          expect(
            mountWrapper.find('[data-test-subj="partialCodeSignatureCallout"]').exists()
          ).toBeTruthy();
        });
      });
    });

    describe('alert data is passed in', () => {
      let wrapper: ReactWrapper;
      beforeAll(async () => {
        mockUseFetchIndex.mockImplementation(() => [
          false,
          {
            indexPatterns: stubIndexPattern,
          },
        ]);

        wrapper = mount(
          <TestProviders>
            <AddExceptionFlyout
              rules={[
                {
                  ...getRulesSchemaMock(),
                  index: ['filebeat-*'],
                  exceptions_list: [
                    {
                      id: 'endpoint_list',
                      list_id: 'endpoint_list',
                      namespace_type: 'agnostic',
                      type: 'endpoint',
                    },
                  ],
                } as Rule,
              ]}
              isBulkAction={false}
              alertData={alertDataMock}
              isAlertDataLoading={false}
              alertStatus="open"
              isEndpointItem
              showAlertCloseOptions
              onCancel={jest.fn()}
              onConfirm={jest.fn()}
            />
          </TestProviders>
        );
        const callProps = mockGetExceptionBuilderComponentLazy.mock.calls[0][0];
        await waitFor(() =>
          callProps.onChange({ exceptionItems: [...callProps.exceptionListItems] })
        );
      });

      it('should prepopulate endpoint items', () => {
        expect(defaultEndpointItems).toHaveBeenCalled();
      });

      it('should render the close single alert checkbox', () => {
        expect(
          wrapper.find('[data-test-subj="closeAlertOnAddExceptionCheckbox"]').exists()
        ).toBeTruthy();
      });

      it('should have the bulk close alerts checkbox disabled', () => {
        expect(
          wrapper.find('input[data-test-subj="bulkCloseAlertOnAddExceptionCheckbox"]').getDOMNode()
        ).toBeDisabled();
      });

      it('should NOT render the os selection dropdown', () => {
        expect(wrapper.find('[data-test-subj="osSelectionDropdown"]').exists()).toBeFalsy();
      });
    });

    describe('bulk closeable alert data is passed in', () => {
      let wrapper: ReactWrapper;
      beforeEach(async () => {
        const stubFields = createStubIndexPattern({
          spec: {
            id: '1234',
            title: 'filebeat-*',
            fields: {
              'event.code': {
                name: 'event.code',
                type: 'string',
                aggregatable: true,
                searchable: true,
              },
              'file.path.caseless': {
                name: 'file.path.caseless',
                type: 'string',
                aggregatable: true,
                searchable: true,
              },
              subject_name: {
                name: 'subject_name',
                type: 'string',
                aggregatable: true,
                searchable: true,
              },
              trusted: {
                name: 'trusted',
                type: 'string',
                aggregatable: true,
                searchable: true,
              },
              'file.hash.sha256': {
                name: 'file.hash.sha256',
                type: 'string',
                aggregatable: true,
                searchable: true,
              },
            },
          },
        });
        mockUseFetchIndex.mockImplementation(() => [false, { indexPatterns: stubFields }]);
        // After elastic/kibana#253666 the bulk-close gate sources its fields
        // from `useFetchIndexPatterns` (the same data view backing the
        // exception field picker) instead of the alerts wildcard. Surface the
        // same set of fields here so the gate can recognise `file.hash.sha256`.
        mockFetchIndexPatterns.mockImplementation(() => ({
          isLoading: false,
          indexPatterns: stubFields,
          getExtendedFields: () => Promise.resolve([]),
        }));
        wrapper = mount(
          <TestProviders>
            <AddExceptionFlyout
              rules={[
                {
                  ...getRulesSchemaMock(),
                  index: ['filebeat-*'],
                  exceptions_list: [
                    {
                      id: 'endpoint_list',
                      list_id: 'endpoint_list',
                      namespace_type: 'agnostic',
                      type: 'endpoint',
                    },
                  ],
                } as Rule,
              ]}
              isBulkAction={false}
              alertData={alertDataMock}
              isAlertDataLoading={false}
              alertStatus="open"
              isEndpointItem
              showAlertCloseOptions
              onCancel={jest.fn()}
              onConfirm={jest.fn()}
            />
          </TestProviders>
        );
        const callProps = mockGetExceptionBuilderComponentLazy.mock.calls[0][0];
        await waitFor(() =>
          callProps.onChange({
            exceptionItems: [
              {
                ...getExceptionListItemSchemaMock(),
                entries: [
                  {
                    field: 'file.hash.sha256',
                    operator: 'included',
                    type: 'match',
                    value: 'some value',
                  },
                ],
              },
            ],
          })
        );
      });

      it('should prepopulate endpoint items', () => {
        expect(defaultEndpointItems).toHaveBeenCalled();
      });

      it('should render the close single alert checkbox', () => {
        expect(
          wrapper.find('[data-test-subj="closeAlertOnAddExceptionCheckbox"]').exists()
        ).toBeTruthy();
      });

      it('should have the bulk close checkbox enabled', () => {
        expect(
          wrapper.find('input[data-test-subj="bulkCloseAlertOnAddExceptionCheckbox"]').getDOMNode()
        ).not.toBeDisabled();
      });

      describe('when a "is in list" entry is added', () => {
        it('should have the bulk close checkbox disabled', async () => {
          const callProps = mockGetExceptionBuilderComponentLazy.mock.calls[0][0];

          await waitFor(() =>
            callProps.onChange({
              exceptionItems: [
                ...callProps.exceptionListItems,
                {
                  ...getExceptionListItemSchemaMock(),
                  entries: [
                    { field: 'event.code', operator: 'included', type: 'list' },
                  ] as EntriesArray,
                },
              ],
            })
          );

          expect(
            wrapper
              .find('input[data-test-subj="bulkCloseAlertOnAddExceptionCheckbox"]')
              .getDOMNode()
          ).toBeDisabled();
        });
      });
    });

    describe('alert data NOT passed in', () => {
      let wrapper: ShallowWrapper;
      beforeEach(async () => {
        wrapper = shallow(
          <AddExceptionFlyout
            rules={[
              {
                ...getRulesSchemaMock(),
                index: ['filebeat-*'],
                exceptions_list: [
                  {
                    id: 'endpoint_list',
                    list_id: 'endpoint_list',
                    namespace_type: 'agnostic',
                    type: 'endpoint',
                  },
                ],
              } as Rule,
            ]}
            isBulkAction={false}
            alertData={undefined}
            isAlertDataLoading={undefined}
            alertStatus={undefined}
            isEndpointItem
            showAlertCloseOptions
            onCancel={jest.fn()}
            onConfirm={jest.fn()}
          />
        );
      });

      it('should render the os selection dropdown', () => {
        expect(wrapper.find('ExceptionsConditions').prop('showOsTypeOptions')).toBeTruthy();
      });
    });
  });

  describe('exception list type is NOT "endpoint" ("rule_default" or "detection")', () => {
    describe('common features to test regardless of alert input', () => {
      let wrapper: ReactWrapper;
      beforeAll(async () => {
        wrapper = mount(
          <TestProviders>
            <AddExceptionFlyout
              rules={[
                {
                  ...getRulesSchemaMock(),
                  exceptions_list: [],
                } as Rule,
              ]}
              isBulkAction={false}
              alertData={alertDataMock}
              isAlertDataLoading={false}
              alertStatus="open"
              isEndpointItem={false}
              showAlertCloseOptions
              onCancel={jest.fn()}
              onConfirm={jest.fn()}
            />
          </TestProviders>
        );
        const callProps = mockGetExceptionBuilderComponentLazy.mock.calls[0][0];
        await waitFor(() =>
          callProps.onChange({ exceptionItems: [getExceptionListItemSchemaMock()] })
        );
      });

      it('should NOT prepopulate items', () => {
        expect(defaultEndpointItems).not.toHaveBeenCalled();
      });

      it('should render item name input', () => {
        expect(wrapper.find('[data-test-subj="exceptionFlyoutNameInput"]').exists()).toBeTruthy();
      });

      it('should NOT render the os selection dropdown', () => {
        expect(wrapper.find('[data-test-subj="osSelectionDropdown"]').exists()).toBeFalsy();
      });

      it('should render the exception builder', () => {
        expect(wrapper.find('[data-test-subj="alertExceptionBuilder"]').exists()).toBeTruthy();
      });

      it('renders options to add exception to a rule or shared list and has "add to rule" selected by default', () => {
        expect(
          wrapper.find('[data-test-subj="exceptionItemAddToRuleOrListSection"]').exists()
        ).toBeTruthy();
        expect(
          wrapper.find('[data-test-subj="addToRuleOptionsRadio"] input').getDOMNode()
        ).toBeChecked();
      });

      it('should NOT contain the endpoint specific documentation text', () => {
        expect(wrapper.find('[data-test-subj="addExceptionEndpointText"]').exists()).toBeFalsy();
      });

      it('should NOT display the eql sequence callout', () => {
        expect(wrapper.find('[data-test-subj="eqlSequenceCallout"]').exists()).not.toBeTruthy();
      });
    });

    describe('Auto populate rule exception', () => {
      beforeEach(() => {
        mockGetExceptionBuilderComponentLazy.mockImplementation((props) => {
          return (
            <span data-test-subj="alertExceptionBuilder">
              {props.exceptionListItems &&
                props.exceptionListItems[0] &&
                props.exceptionListItems[0].entries.map(
                  ({ field, operator, type, value }: EntryMatch) => (
                    <>
                      <span data-test-subj="entryField">{field} </span>
                      <span data-test-subj="entryOperator">{operator} </span>
                      <span data-test-subj="entryType">{type} </span>
                      <span data-test-subj="entryValue">{value} </span>
                    </>
                  )
                )}
            </span>
          );
        });
      });
      it('should auto populate the exception from alert highlighted fields', () => {
        const wrapper = render(
          (() => (
            <TestProviders>
              <AddExceptionFlyout
                rules={[
                  {
                    ...getRulesSchemaMock(),
                    exceptions_list: [],
                  } as Rule,
                ]}
                isBulkAction={false}
                alertData={alertDataMock}
                isAlertDataLoading={false}
                alertStatus="open"
                isEndpointItem={false}
                showAlertCloseOptions
                onCancel={jest.fn()}
                onConfirm={jest.fn()}
              />
            </TestProviders>
          ))()
        );
        const { getByTestId } = wrapper;
        expect(getByTestId('alertExceptionBuilder')).toBeInTheDocument();
        expect(getByTestId('entryField')).toHaveTextContent('file.path');
        expect(getByTestId('entryOperator')).toHaveTextContent('included');
        expect(getByTestId('entryType')).toHaveTextContent('match');
        expect(getByTestId('entryValue')).toHaveTextContent('test/path');
      });

      it('should include rule defined custom highlighted fields', () => {
        const wrapper = render(
          (() => (
            <TestProviders>
              <AddExceptionFlyout
                rules={[
                  {
                    ...getRulesSchemaMock(),
                    investigation_fields: { field_names: ['foo.bar'] },
                    exceptions_list: [],
                  } as Rule,
                ]}
                isBulkAction={false}
                alertData={{ ...alertDataMock, foo: { bar: 'blob' } } as AlertData}
                isAlertDataLoading={false}
                alertStatus="open"
                isEndpointItem={false}
                showAlertCloseOptions
                onCancel={jest.fn()}
                onConfirm={jest.fn()}
              />
            </TestProviders>
          ))()
        );
        const { getByTestId, getAllByTestId } = wrapper;
        expect(getByTestId('alertExceptionBuilder')).toBeInTheDocument();
        expect(getAllByTestId('entryField')[0]).toHaveTextContent('foo.bar');
        expect(getAllByTestId('entryOperator')[0]).toHaveTextContent('included');
        expect(getAllByTestId('entryType')[0]).toHaveTextContent('match');
        expect(getAllByTestId('entryValue')[0]).toHaveTextContent('blob');
        expect(getAllByTestId('entryField')[1]).toHaveTextContent('file.path');
        expect(getAllByTestId('entryOperator')[1]).toHaveTextContent('included');
        expect(getAllByTestId('entryType')[1]).toHaveTextContent('match');
        expect(getAllByTestId('entryValue')[1]).toHaveTextContent('test/path');
      });
    });
  });

  /* Say for example, from the lists management or lists details page */
  describe('when no rules are passed in', () => {
    let wrapper: ShallowWrapper;
    beforeAll(async () => {
      wrapper = shallow(
        <AddExceptionFlyout
          rules={null}
          isBulkAction={false}
          alertData={undefined}
          isAlertDataLoading={undefined}
          alertStatus={undefined}
          isEndpointItem={false}
          showAlertCloseOptions
          onCancel={jest.fn()}
          onConfirm={jest.fn()}
        />
      );
    });

    it('allows large value lists', () => {
      expect(wrapper.find('ExceptionsConditions').prop('allowLargeValueLists')).toBeTruthy();
    });

    it('defaults to selecting add to rule option, displaying rules selection table', () => {
      expect(wrapper.find('ExceptionsAddToRulesOrLists').prop('selectedRadioOption')).toEqual(
        'select_rules_to_add_to'
      );
    });
  });

  /* Say for example, from the rule details page, exceptions tab, or from an alert */
  describe('when a single rule is passed in', () => {
    describe('large value list selection', () => {
      it('does not allow large value list selection for query rule', () => {
        const shallowWrapper = shallow(
          <AddExceptionFlyout
            rules={[
              {
                ...getRulesSchemaMock(),
                exceptions_list: [],
              } as Rule,
            ]}
            isBulkAction={false}
            alertData={alertDataMock}
            isAlertDataLoading={false}
            alertStatus="open"
            isEndpointItem={false}
            showAlertCloseOptions
            onCancel={jest.fn()}
            onConfirm={jest.fn()}
          />
        );

        expect(
          shallowWrapper.find('ExceptionsConditions').prop('allowLargeValueLists')
        ).toBeTruthy();
      });

      it('does not allow large value list selection if EQL rule', () => {
        const shallowWrapper = shallow(
          <AddExceptionFlyout
            rules={[
              {
                ...getRulesEqlSchemaMock(),
                exceptions_list: [],
              } as Rule,
            ]}
            isBulkAction={false}
            alertData={alertDataMock}
            isAlertDataLoading={false}
            alertStatus="open"
            isEndpointItem={false}
            showAlertCloseOptions
            onCancel={jest.fn()}
            onConfirm={jest.fn()}
          />
        );

        expect(
          shallowWrapper.find('ExceptionsConditions').prop('allowLargeValueLists')
        ).toBeFalsy();
      });

      it('does not allow large value list selection if threshold rule', () => {
        const shallowWrapper = shallow(
          <AddExceptionFlyout
            rules={[
              {
                ...getRulesSchemaMock(),
                type: 'threshold',
              } as Rule,
            ]}
            isBulkAction={false}
            alertData={alertDataMock}
            isAlertDataLoading={false}
            alertStatus="open"
            isEndpointItem={false}
            showAlertCloseOptions
            onCancel={jest.fn()}
            onConfirm={jest.fn()}
          />
        );

        expect(
          shallowWrapper.find('ExceptionsConditions').prop('allowLargeValueLists')
        ).toBeFalsy();
      });

      it('does not allow large value list selection if new trems rule', () => {
        const shallowWrapper = shallow(
          <AddExceptionFlyout
            rules={[
              {
                ...getRulesSchemaMock(),
                type: 'new_terms',
              } as Rule,
            ]}
            isBulkAction={false}
            alertData={alertDataMock}
            isAlertDataLoading={false}
            alertStatus="open"
            isEndpointItem={false}
            showAlertCloseOptions
            onCancel={jest.fn()}
            onConfirm={jest.fn()}
          />
        );

        expect(
          shallowWrapper.find('ExceptionsConditions').prop('allowLargeValueLists')
        ).toBeFalsy();
      });
    });

    describe('add to rule/shared list selection', () => {
      let wrapper: ReactWrapper;
      beforeAll(async () => {
        wrapper = mount(
          <TestProviders>
            <AddExceptionFlyout
              rules={[
                {
                  ...getRulesSchemaMock(),
                  exceptions_list: [],
                } as Rule,
              ]}
              isBulkAction={false}
              alertData={undefined}
              isAlertDataLoading={undefined}
              alertStatus={undefined}
              isEndpointItem={false}
              showAlertCloseOptions
              onCancel={jest.fn()}
              onConfirm={jest.fn()}
            />
          </TestProviders>
        );
        const callProps = mockGetExceptionBuilderComponentLazy.mock.calls[0][0];
        await waitFor(() =>
          callProps.onChange({ exceptionItems: [...callProps.exceptionListItems] })
        );
      });

      it('defaults to selecting add to rule radio option', () => {
        expect(
          wrapper.find('[data-test-subj="exceptionItemAddToRuleOrListSection"]').exists()
        ).toBeTruthy();
        expect(
          wrapper.find('[data-test-subj="addToRuleOptionsRadio"] input').getDOMNode()
        ).toBeChecked();
      });

      it('disables add to shared lists option if rule has no shared exception lists attached already', () => {
        expect(
          wrapper.find('[data-test-subj="addToListsRadioOption"] input').getDOMNode()
        ).toBeDisabled();
      });

      it('enables add to shared lists option if rule has shared list', () => {
        wrapper = mount(
          <TestProviders>
            <AddExceptionFlyout
              rules={[
                {
                  ...getRulesSchemaMock(),
                  exceptions_list: [
                    {
                      id: 'test',
                      list_id: 'test',
                      namespace_type: 'single',
                      type: 'detection',
                    },
                  ],
                } as Rule,
              ]}
              isBulkAction={false}
              alertData={undefined}
              isAlertDataLoading={undefined}
              alertStatus={undefined}
              isEndpointItem={false}
              showAlertCloseOptions
              onCancel={jest.fn()}
              onConfirm={jest.fn()}
            />
          </TestProviders>
        );

        expect(
          wrapper.find('[data-test-subj="addToListsRadioOption"] input').getDOMNode()
        ).toBeEnabled();
      });
    });
  });

  /* Say for example, add exception item from rules bulk action */
  describe('when multiple rules are passed in - bulk action', () => {
    describe('large value lists selection', () => {
      it('allows large value lists', () => {
        const shallowWrapper = shallow(
          <AddExceptionFlyout
            rules={[
              {
                ...getRulesSchemaMock(),
                exceptions_list: [],
              } as Rule,
              {
                ...getRulesSchemaMock(),
                id: 'foo',
                rule_id: 'foo',
                exceptions_list: [],
              } as Rule,
            ]}
            isBulkAction
            alertData={alertDataMock}
            isAlertDataLoading={false}
            alertStatus="open"
            isEndpointItem={false}
            showAlertCloseOptions
            onCancel={jest.fn()}
            onConfirm={jest.fn()}
          />
        );

        expect(
          shallowWrapper.find('ExceptionsConditions').prop('allowLargeValueLists')
        ).toBeTruthy();
      });
    });

    describe('add to rules/lists selection', () => {
      let wrapper: ReactWrapper;
      beforeAll(async () => {
        wrapper = mount(
          <TestProviders>
            <AddExceptionFlyout
              rules={[
                {
                  ...getRulesSchemaMock(),
                  exceptions_list: [],
                } as Rule,
                {
                  ...getRulesSchemaMock(),
                  id: 'foo',
                  rule_id: 'foo',
                  exceptions_list: [
                    {
                      id: 'bar',
                      list_id: 'bar',
                      namespace_type: 'single',
                      type: 'detection',
                    },
                  ],
                } as Rule,
              ]}
              isBulkAction
              alertData={undefined}
              isAlertDataLoading={undefined}
              alertStatus={undefined}
              isEndpointItem={false}
              showAlertCloseOptions
              onCancel={jest.fn()}
              onConfirm={jest.fn()}
            />
          </TestProviders>
        );
        const callProps = mockGetExceptionBuilderComponentLazy.mock.calls[0][0];
        await waitFor(() =>
          callProps.onChange({ exceptionItems: [...callProps.exceptionListItems] })
        );
      });
      it('defaults to selecting add to rules radio option', () => {
        expect(
          wrapper.find('[data-test-subj="exceptionItemAddToRuleOrListSection"]').exists()
        ).toBeTruthy();
        expect(
          wrapper.find('[data-test-subj="addToRulesOptionsRadio"] input').getDOMNode()
        ).toBeChecked();
      });

      it('disables add to shared lists option if rules have no shared lists in common', () => {
        expect(
          wrapper.find('[data-test-subj="addToListsRadioOption"] input').getDOMNode()
        ).toBeDisabled();
      });

      it('enables add to shared lists option if rules have at least one shared list in common', () => {
        wrapper = mount(
          <TestProviders>
            <AddExceptionFlyout
              rules={[
                {
                  ...getRulesSchemaMock(),
                  exceptions_list: [
                    {
                      id: 'bar',
                      list_id: 'bar',
                      namespace_type: 'single',
                      type: 'detection',
                    },
                  ],
                } as Rule,
                {
                  ...getRulesSchemaMock(),
                  id: 'foo',
                  rule_id: 'foo',
                  exceptions_list: [
                    {
                      id: 'bar',
                      list_id: 'bar',
                      namespace_type: 'single',
                      type: 'detection',
                    },
                  ],
                } as Rule,
              ]}
              isBulkAction
              alertData={undefined}
              isAlertDataLoading={undefined}
              alertStatus={undefined}
              isEndpointItem={false}
              showAlertCloseOptions
              onCancel={jest.fn()}
              onConfirm={jest.fn()}
            />
          </TestProviders>
        );

        expect(
          wrapper.find('[data-test-subj="addToListsRadioOption"] input').getDOMNode()
        ).toBeEnabled();
      });
    });
  });
  describe('the reducer', () => {
    it('should update partialCodeSignatureWarningExists, when warning is true', () => {
      const updatedState = createExceptionItemsReducer();
      expect(
        updatedState(exceptionItemsInitialState, {
          type: 'setPartialCodeSignature',
          warningExists: true,
        })
      ).toEqual({ ...exceptionItemsInitialState, partialCodeSignatureWarningExists: true });
    });
  });

  describe('when the user does not have permissions to write alerts', () => {
    let wrapper: ReactWrapper;
    beforeAll(async () => {
      mockUseAlertsPrivileges.mockReturnValue({ hasAlertsUpdate: false });
      mockUseFetchIndex.mockImplementation(() => [
        false,
        {
          indexPatterns: stubIndexPattern,
        },
      ]);

      wrapper = mount(
        <TestProviders>
          <AddExceptionFlyout
            rules={[
              {
                ...getRulesSchemaMock(),
                index: ['filebeat-*'],
                exceptions_list: [
                  {
                    id: 'endpoint_list',
                    list_id: 'endpoint_list',
                    namespace_type: 'agnostic',
                    type: 'endpoint',
                  },
                ],
              } as Rule,
            ]}
            isBulkAction={false}
            alertData={alertDataMock}
            isAlertDataLoading={false}
            alertStatus="open"
            isEndpointItem
            showAlertCloseOptions
            onCancel={jest.fn()}
            onConfirm={jest.fn()}
          />
        </TestProviders>
      );
      const callProps = mockGetExceptionBuilderComponentLazy.mock.calls[0][0];
      await waitFor(() =>
        callProps.onChange({ exceptionItems: [...callProps.exceptionListItems] })
      );
    });

    afterAll(() => {
      mockUseAlertsPrivileges.mockReturnValue({ hasAlertsUpdate: true });
    });

    it('should not render the close single alert checkbox', () => {
      expect(
        wrapper.find('[data-test-subj="closeAlertOnAddExceptionCheckbox"]').exists()
      ).toBeFalsy();
    });

    it('should not render the bulk close alerts checkbox', () => {
      expect(
        wrapper.find('[data-test-subj="bulkCloseAlertOnAddExceptionCheckbox"]').exists()
      ).toBeFalsy();
    });
  });
});
