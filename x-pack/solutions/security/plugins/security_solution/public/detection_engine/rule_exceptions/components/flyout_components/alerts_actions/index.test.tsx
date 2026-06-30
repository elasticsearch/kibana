/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { mountWithIntl } from '@kbn/test-jest-helpers';
import { getExceptionListItemSchemaMock } from '@kbn/lists-plugin/common/schemas/response/exception_list_item_schema.mock';
import type { EntriesArray } from '@kbn/securitysolution-io-ts-list-types';
import { ExceptionListTypeEnum } from '@kbn/securitysolution-io-ts-list-types';
import { stubIndexPattern } from '@kbn/data-plugin/common/stubs';
import type { DataViewBase, DataViewFieldBase } from '@kbn/es-query';

import { ExceptionItemsFlyoutAlertsActions } from '.';
import * as i18n from './translations';
import { TestProviders } from '../../../../../common/mock';
import type { AlertData } from '../../../utils/types';
import { useFetchIndex } from '../../../../../common/containers/source';
import { useSignalIndex } from '../../../../../detections/containers/detection_engine/alerts/use_signal_index';

const sourceIndexPatternFor = (
  fields: Array<Partial<DataViewFieldBase> & { name: string }>
): DataViewBase =>
  ({
    title: 'rule-source',
    fields: fields.map((f) => ({ type: 'string', ...f })) as DataViewFieldBase[],
  } as DataViewBase);

jest.mock('../../../../../common/lib/kibana');
jest.mock('../../../../../common/containers/source');
jest.mock('../../../../../detections/containers/detection_engine/alerts/use_signal_index');

const alertDataMock: AlertData = {
  '@timestamp': '1234567890',
  _id: 'test-id',
  file: { path: 'test/path' },
};

const mockUseSignalIndex = useSignalIndex as jest.Mock<Partial<ReturnType<typeof useSignalIndex>>>;
const mockUseFetchIndex = useFetchIndex as jest.Mock;

describe('ExceptionItemsFlyoutAlertsActions', () => {
  beforeEach(() => {
    mockUseSignalIndex.mockImplementation(() => ({
      loading: false,
      signalIndexName: 'mock-siem-signals-index',
    }));
    mockUseFetchIndex.mockImplementation(() => [false, { indexPatterns: stubIndexPattern }]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Endpoint specific logic', () => {
    it('it displays endpoint quarantine text if exception list type is "endpoint"', () => {
      const wrapper = mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={[getExceptionListItemSchemaMock()]}
            exceptionListType={ExceptionListTypeEnum.ENDPOINT}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={false}
            disableBulkClose={false}
            alertData={alertDataMock}
            alertStatus="open"
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            isAlertDataLoading={false}
          />
        </TestProviders>
      );

      expect(wrapper.find('[data-test-subj="addExceptionEndpointText"]').exists()).toBeTruthy();
    });
  });

  describe('alert data exists', () => {
    it('it displays single alert close checkbox if alert status is not "closed" and "alertData" exists', () => {
      const wrapper = mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={[getExceptionListItemSchemaMock()]}
            exceptionListType={ExceptionListTypeEnum.DETECTION}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={false}
            disableBulkClose={false}
            alertData={alertDataMock}
            alertStatus="open"
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            isAlertDataLoading={false}
          />
        </TestProviders>
      );

      expect(
        wrapper.find('[data-test-subj="closeAlertOnAddExceptionCheckbox"]').exists()
      ).toBeTruthy();
      expect(
        wrapper.find('[data-test-subj="closeAlertOnAddExceptionCheckbox"] input').prop('disabled')
      ).toBeFalsy();
    });

    it('it displays single alert close checkbox disabled if "isAlertDataLoading" is true', () => {
      const wrapper = mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={[getExceptionListItemSchemaMock()]}
            exceptionListType={ExceptionListTypeEnum.DETECTION}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={false}
            disableBulkClose={false}
            alertData={alertDataMock}
            alertStatus="open"
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            isAlertDataLoading
          />
        </TestProviders>
      );

      expect(
        wrapper.find('[data-test-subj="closeAlertOnAddExceptionCheckbox"] input').prop('disabled')
      ).toBeTruthy();
    });

    it('it displays single alert close checkbox disabled if "isSignalIndexLoading" is true', () => {
      mockUseSignalIndex.mockImplementation(() => ({
        loading: true,
        signalIndexName: 'mock-siem-signals-index',
      }));

      const wrapper = mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={[getExceptionListItemSchemaMock()]}
            exceptionListType={ExceptionListTypeEnum.DETECTION}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={false}
            disableBulkClose={false}
            alertData={alertDataMock}
            alertStatus="open"
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            isAlertDataLoading={false}
          />
        </TestProviders>
      );

      expect(
        wrapper.find('[data-test-subj="closeAlertOnAddExceptionCheckbox"] input').prop('disabled')
      ).toBeTruthy();
    });

    it('it does not display single alert close checkbox if alert status is "closed"', () => {
      const wrapper = mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={[getExceptionListItemSchemaMock()]}
            exceptionListType={ExceptionListTypeEnum.DETECTION}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={false}
            disableBulkClose={false}
            alertData={alertDataMock}
            alertStatus="closed"
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            isAlertDataLoading={false}
          />
        </TestProviders>
      );

      expect(
        wrapper.find('[data-test-subj="closeAlertOnAddExceptionCheckbox"]').exists()
      ).toBeFalsy();
    });
  });

  describe('bulk close alert', () => {
    it('it does not display single alert close checkbox if "alertData" does not exist', () => {
      const wrapper = mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={[getExceptionListItemSchemaMock()]}
            exceptionListType={ExceptionListTypeEnum.DETECTION}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={false}
            disableBulkClose={false}
            alertData={undefined}
            alertStatus="open"
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            isAlertDataLoading={false}
          />
        </TestProviders>
      );

      expect(
        wrapper.find('[data-test-subj="closeAlertOnAddExceptionCheckbox"]').exists()
      ).toBeFalsy();
    });

    it('it displays bulk close checkbox', () => {
      const wrapper = mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={[getExceptionListItemSchemaMock()]}
            exceptionListType={ExceptionListTypeEnum.DETECTION}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={false}
            disableBulkClose={false}
            alertData={alertDataMock}
            alertStatus="open"
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            isAlertDataLoading={false}
          />
        </TestProviders>
      );

      expect(
        wrapper.find('[data-test-subj="bulkCloseAlertOnAddExceptionCheckbox"]').exists()
      ).toBeTruthy();
    });

    it('it displays checkboxes disabled if "isAlertDataLoading" is "true"', () => {
      const wrapper = mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={[getExceptionListItemSchemaMock()]}
            exceptionListType={ExceptionListTypeEnum.DETECTION}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={false}
            disableBulkClose={false}
            alertData={alertDataMock}
            alertStatus="open"
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            isAlertDataLoading
          />
        </TestProviders>
      );

      expect(
        wrapper.find('[data-test-subj="bulkCloseAlertOnAddExceptionCheckbox"]').at(0).props()
          .disabled
      ).toBeTruthy();
      expect(
        wrapper.find('[data-test-subj="closeAlertOnAddExceptionCheckbox"]').at(0).props().disabled
      ).toBeTruthy();
    });

    it('it displays bulk close checkbox disabled if "disableBulkCloseAlert" is "true"', () => {
      const wrapper = mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={[getExceptionListItemSchemaMock()]}
            exceptionListType={ExceptionListTypeEnum.DETECTION}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={false}
            disableBulkClose={true}
            alertData={alertDataMock}
            alertStatus="open"
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            isAlertDataLoading={false}
          />
        </TestProviders>
      );

      expect(
        wrapper.find('[data-test-subj="bulkCloseAlertOnAddExceptionCheckbox"]').at(0).props()
          .disabled
      ).toBeTruthy();
      expect(wrapper.find('[data-test-subj="addExceptionEndpointText"]').exists()).toBeFalsy();
    });

    it('it displays bulk close checkbox disabled if "isSignalIndexLoading" is "true"', () => {
      mockUseSignalIndex.mockImplementation(() => ({
        loading: true,
        signalIndexName: 'mock-siem-signals-index',
      }));

      const wrapper = mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={[getExceptionListItemSchemaMock()]}
            exceptionListType={ExceptionListTypeEnum.DETECTION}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={false}
            disableBulkClose={false}
            alertData={alertDataMock}
            alertStatus="open"
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            isAlertDataLoading={false}
          />
        </TestProviders>
      );

      expect(
        wrapper.find('[data-test-subj="bulkCloseAlertOnAddExceptionCheckbox"]').at(0).props()
          .disabled
      ).toBeTruthy();
    });
  });

  describe('runtime / non-ECS field warning', () => {
    const nonEcsExceptionItems = [
      {
        ...getExceptionListItemSchemaMock(),
        // The stub alerts index pattern doesn't have this field, so the
        // component should treat it as a runtime / non-ECS field.
        entries: [{ field: 'source.ip_ecs', operator: 'included', type: 'match' }] as EntriesArray,
      },
    ];

    it('does not show the warning callout when bulk close is unchecked, even if the field is not on the alerts index', () => {
      const wrapper = mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={nonEcsExceptionItems}
            exceptionListType={ExceptionListTypeEnum.DETECTION}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={false}
            disableBulkClose={false}
            alertData={alertDataMock}
            alertStatus="open"
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            isAlertDataLoading={false}
          />
        </TestProviders>
      );

      expect(wrapper.find('[data-test-subj="bulkCloseRuntimeFieldWarning"]').exists()).toBeFalsy();
    });

    it('shows the warning callout with the title and main body when bulk close is checked and the exception references a field not on the alerts index', () => {
      const wrapper = mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={nonEcsExceptionItems}
            exceptionListType={ExceptionListTypeEnum.DETECTION}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={true}
            disableBulkClose={false}
            alertData={alertDataMock}
            alertStatus="open"
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            isAlertDataLoading={false}
          />
        </TestProviders>
      );

      const callout = wrapper.find('[data-test-subj="bulkCloseRuntimeFieldWarning"]').first();
      expect(callout.exists()).toBe(true);
      expect(callout.text()).toContain(i18n.BULK_CLOSE_RUNTIME_FIELD_WARNING_TITLE);
      expect(callout.text()).toContain(i18n.BULK_CLOSE_RUNTIME_FIELD_WARNING_BODY);
    });

    it('does not show the warning callout when all entries reference fields present on the alerts index', () => {
      // `stubIndexPattern` (returned by mockUseFetchIndex) contains
      // `machine.os.raw`, so the entry below should be treated as ECS-OK.
      const ecsExceptionItems = [
        {
          ...getExceptionListItemSchemaMock(),
          entries: [
            { field: 'machine.os.raw', operator: 'included', type: 'match', value: 'linux' },
          ] as EntriesArray,
        },
      ];

      const wrapper = mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={ecsExceptionItems}
            exceptionListType={ExceptionListTypeEnum.DETECTION}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={true}
            disableBulkClose={false}
            alertData={alertDataMock}
            alertStatus="open"
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            isAlertDataLoading={false}
          />
        </TestProviders>
      );

      expect(wrapper.find('[data-test-subj="bulkCloseRuntimeFieldWarning"]').exists()).toBeFalsy();
    });
  });

  describe('runtime fields map (onRuntimeFieldsChange)', () => {
    const runtimeFieldExceptionItems = [
      {
        ...getExceptionListItemSchemaMock(),
        // Field is not on the stub alerts index, so treated as non-ECS.
        entries: [{ field: 'source.ip_ecs', operator: 'included', type: 'match' }] as EntriesArray,
      },
    ];

    it('does not invoke onRuntimeFieldsChange with a populated map when bulk close is unchecked', () => {
      const onRuntimeFieldsChange = jest.fn();
      mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={runtimeFieldExceptionItems}
            exceptionListType={ExceptionListTypeEnum.DETECTION}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={false}
            disableBulkClose={false}
            alertData={alertDataMock}
            alertStatus="open"
            sourceIndexPatterns={sourceIndexPatternFor([
              { name: 'source.ip_ecs', esTypes: ['ip'] },
            ])}
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            onRuntimeFieldsChange={onRuntimeFieldsChange}
            isAlertDataLoading={false}
          />
        </TestProviders>
      );

      // Component still fires the callback (with an empty map) so the parent
      // can clear any stale state; what we assert is that no real runtime
      // field types are surfaced when the user hasn't opted in to bulk close.
      expect(onRuntimeFieldsChange).toHaveBeenCalledWith({}, false);
    });

    it('emits the resolved type for a non-ECS field present on the source data view', () => {
      const onRuntimeFieldsChange = jest.fn();
      mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={runtimeFieldExceptionItems}
            exceptionListType={ExceptionListTypeEnum.DETECTION}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={true}
            disableBulkClose={false}
            alertData={alertDataMock}
            alertStatus="open"
            sourceIndexPatterns={sourceIndexPatternFor([
              { name: 'source.ip_ecs', esTypes: ['ip'] },
            ])}
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            onRuntimeFieldsChange={onRuntimeFieldsChange}
            isAlertDataLoading={false}
          />
        </TestProviders>
      );

      expect(onRuntimeFieldsChange).toHaveBeenLastCalledWith({ 'source.ip_ecs': 'ip' }, false);
    });

    it('falls back to keyword + hasUntypedFields=true when the field is missing from the source data view', () => {
      const onRuntimeFieldsChange = jest.fn();
      mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={runtimeFieldExceptionItems}
            exceptionListType={ExceptionListTypeEnum.DETECTION}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={true}
            disableBulkClose={false}
            alertData={alertDataMock}
            alertStatus="open"
            // Source data view doesn't contain the field — rule-drift scenario.
            sourceIndexPatterns={sourceIndexPatternFor([])}
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            onRuntimeFieldsChange={onRuntimeFieldsChange}
            isAlertDataLoading={false}
          />
        </TestProviders>
      );

      expect(onRuntimeFieldsChange).toHaveBeenLastCalledWith({ 'source.ip_ecs': 'keyword' }, true);
    });

    it('emits an empty map when sourceIndexPatterns is not provided', () => {
      const onRuntimeFieldsChange = jest.fn();
      mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={runtimeFieldExceptionItems}
            exceptionListType={ExceptionListTypeEnum.DETECTION}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={true}
            disableBulkClose={false}
            alertData={alertDataMock}
            alertStatus="open"
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            onRuntimeFieldsChange={onRuntimeFieldsChange}
            isAlertDataLoading={false}
          />
        </TestProviders>
      );

      // Endpoint exceptions and other rule-less callers go through this path.
      expect(onRuntimeFieldsChange).toHaveBeenCalledWith({}, false);
    });

    it('renders the untyped-fallback callout body when any field defaults to keyword', () => {
      const wrapper = mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={runtimeFieldExceptionItems}
            exceptionListType={ExceptionListTypeEnum.DETECTION}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={true}
            disableBulkClose={false}
            alertData={alertDataMock}
            alertStatus="open"
            sourceIndexPatterns={sourceIndexPatternFor([])}
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            isAlertDataLoading={false}
          />
        </TestProviders>
      );

      const callout = wrapper.find('[data-test-subj="bulkCloseRuntimeFieldWarning"]').first();
      expect(callout.exists()).toBeTruthy();
      expect(callout.text()).toContain(i18n.BULK_CLOSE_RUNTIME_FIELD_WARNING_UNTYPED_BODY);
    });

    it('does not render the untyped-fallback callout body when every field has a resolved type', () => {
      const wrapper = mountWithIntl(
        <TestProviders>
          <ExceptionItemsFlyoutAlertsActions
            exceptionListItems={runtimeFieldExceptionItems}
            exceptionListType={ExceptionListTypeEnum.DETECTION}
            shouldCloseSingleAlert={false}
            shouldBulkCloseAlert={true}
            disableBulkClose={false}
            alertData={alertDataMock}
            alertStatus="open"
            sourceIndexPatterns={sourceIndexPatternFor([
              { name: 'source.ip_ecs', esTypes: ['ip'] },
            ])}
            onDisableBulkClose={jest.fn()}
            onUpdateBulkCloseIndex={jest.fn()}
            onBulkCloseCheckboxChange={jest.fn()}
            onSingleAlertCloseCheckboxChange={jest.fn()}
            isAlertDataLoading={false}
          />
        </TestProviders>
      );

      const callout = wrapper.find('[data-test-subj="bulkCloseRuntimeFieldWarning"]').first();
      expect(callout.exists()).toBeTruthy();
      expect(callout.text()).not.toContain(i18n.BULK_CLOSE_RUNTIME_FIELD_WARNING_UNTYPED_BODY);
    });
  });
});
