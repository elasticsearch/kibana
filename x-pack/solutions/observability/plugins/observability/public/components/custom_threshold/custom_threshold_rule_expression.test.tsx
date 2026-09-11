/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { RuleTypeParams } from '@kbn/alerting-plugin/common';
import type { Query } from '@kbn/data-plugin/common';
import { FilterStateStore } from '@kbn/es-query';
import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import { mountWithIntl, nextTick } from '@kbn/test-jest-helpers';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { act } from 'react-dom/test-utils';
import { COMPARATORS } from '@kbn/alerting-comparators';
import { Aggregators } from '../../../common/custom_threshold_rule/types';
import type { KqlPluginStart } from '@kbn/kql/public';
import { useKibana } from '../../utils/kibana_react';
import { kibanaStartMock } from '../../utils/kibana_react.mock';
import Expressions, { getNoDataBehaviorValue } from './custom_threshold_rule_expression';
import type { AlertParams, CustomThresholdPrefillOptions } from './types';

jest.mock('../../utils/kibana_react');
jest.mock('../rule_condition_chart/rule_condition_chart', () => ({
  RuleConditionChart: jest.fn(() => <div data-test-subj="RuleConditionChart" />),
}));

const useKibanaMock = useKibana as jest.Mock;

const mockKibana = () => {
  useKibanaMock.mockReturnValue({
    ...kibanaStartMock.startContract(),
  });
};

const dataViewMock = dataViewPluginMocks.createStartContract();

describe('Expression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    mockKibana();
  });

  async function setup(
    currentOptions?: CustomThresholdPrefillOptions,
    customRuleParams?: Partial<RuleTypeParams & AlertParams>
  ) {
    const ruleParams: RuleTypeParams & AlertParams = {
      criteria: [],
      groupBy: undefined,
      sourceId: 'default',
      searchConfiguration: {
        index: 'mockedIndex',
        query: {
          query: '',
          language: 'kuery',
        },
      },
      ...customRuleParams,
    };
    const metadata = {
      currentOptions,
      adHocDataViewList: [],
    };
    const queryClient = new QueryClient();
    const wrapper = mountWithIntl(
      <QueryClientProvider client={queryClient}>
        <Expressions
          kql={{} as KqlPluginStart}
          ruleInterval="1m"
          ruleThrottle="1m"
          alertNotifyWhen="onThrottleInterval"
          ruleParams={ruleParams}
          errors={{}}
          setRuleParams={(key, value) => Reflect.set(ruleParams, key, value)}
          setRuleProperty={() => {}}
          metadata={metadata}
          dataViews={dataViewMock}
          onChangeMetaData={jest.fn()}
        />
      </QueryClientProvider>
    );

    const update = async () =>
      await act(async () => {
        await nextTick();
        wrapper.update();
      });

    await update();

    return { wrapper, update, ruleParams };
  }

  const updateUseKibanaMock = (mockedIndex: any) => {
    const mockedDataView = {
      getIndexPattern: () => 'mockedIndexPattern',
      getName: () => 'mockedName',
      ...mockedIndex,
    };
    const mockedSearchSource = {
      id: 'data_source',
      shouldOverwriteDataViewType: false,
      requestStartHandlers: [],
      inheritOptions: {},
      history: [],
      fields: {
        index: mockedIndex,
      },
      getField: jest.fn(() => mockedDataView),
      setField: jest.fn(),
      getSerializedFields: jest.fn().mockReturnValue({ index: mockedIndex }),
      dependencies: {
        aggs: {
          types: {},
        },
      },
    };
    const kibanaMock = kibanaStartMock.startContract();
    useKibanaMock.mockReturnValue({
      ...kibanaMock,
      services: {
        ...kibanaMock.services,
        data: {
          dataViews: {
            create: jest.fn(),
            getDefaultDataView: jest.fn(),
          },
          query: {
            timefilter: {
              timefilter: jest.fn(),
            },
            queryString: {
              getDefaultQuery: jest.fn(),
            },
          },
          search: {
            searchSource: {
              create: jest.fn(() => mockedSearchSource),
              createEmpty: jest.fn(() => mockedSearchSource),
            },
          },
        },
      },
    });
  };

  it('should use default metrics', async () => {
    const { ruleParams } = await setup();
    expect(ruleParams.criteria).toEqual([
      {
        metrics: [
          {
            name: 'A',
            aggType: Aggregators.COUNT,
          },
        ],
        comparator: COMPARATORS.GREATER_THAN,
        threshold: [100],
        timeSize: 5,
        timeUnit: 'm',
      },
    ]);
  });

  it('should derive noDataBehavior from alertOnNoData when noDataBehavior is undefined', async () => {
    const { ruleParams } = await setup(undefined, {
      alertOnNoData: true,
      noDataBehavior: undefined,
    });

    expect(ruleParams.noDataBehavior).toBe('alertOnNoData');
  });

  it('should prefill the rule using the context metadata', async () => {
    const index = 'changedMockedIndex';
    const currentOptions: CustomThresholdPrefillOptions = {
      alertOnGroupDisappear: true,
      alertOnNoData: true,
      groupBy: ['host.hostname'],
      searchConfiguration: {
        index,
        query: {
          query: 'foo',
          language: 'kuery',
        },
      },
      criteria: [
        {
          metrics: [
            { name: 'A', aggType: Aggregators.AVERAGE, field: 'system.load.1' },
            { name: 'B', aggType: Aggregators.CARDINALITY, field: 'system.cpu.user.pct' },
          ],
          comparator: COMPARATORS.LESS_THAN_OR_EQUALS,
          equation: 'A * B',
          label: 'prefill label',
          threshold: [500],
          timeSize: 7,
          timeUnit: 'h',
        },
      ],
    };

    const { ruleParams } = await setup(currentOptions, { searchConfiguration: undefined });

    expect(ruleParams.groupBy).toEqual(['host.hostname']);
    expect((ruleParams.searchConfiguration.query as Query).query).toBe('foo');
    expect(ruleParams.searchConfiguration.index).toBe(index);
    expect(ruleParams.criteria).toEqual([
      {
        metrics: [
          { name: 'A', aggType: Aggregators.AVERAGE, field: 'system.load.1' },
          { name: 'B', aggType: Aggregators.CARDINALITY, field: 'system.cpu.user.pct' },
        ],
        comparator: COMPARATORS.LESS_THAN_OR_EQUALS,
        equation: 'A * B',
        label: 'prefill label',
        threshold: [500],
        timeSize: 7,
        timeUnit: 'h',
      },
    ]);
  });

  it('should show an error message when searchSource throws an error', async () => {
    // Freeze timers so EuiCallOut's `announceOnMount` screen-reader live region never populates a
    // delayed title/text duplicate that the callout `.text()` read would scoop up; keep `nextTick`
    // real so the async `setup()` update still flushes.
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    const errorMessage = 'Error fetching search sourceCould not locate that data view (id: )';
    const kibanaMock = kibanaStartMock.startContract();
    useKibanaMock.mockReturnValue({
      ...kibanaMock,
      services: {
        ...kibanaMock.services,
        data: {
          dataViews: {
            create: jest.fn(),
          },
          query: {
            timefilter: {
              timefilter: jest.fn(),
            },
          },
          search: {
            searchSource: {
              create: jest.fn(() => {
                throw new Error(errorMessage);
              }),
            },
          },
        },
      },
    });
    const { wrapper } = await setup();
    expect(wrapper.find(`[data-test-subj="thresholdRuleExpressionError"]`).first().text()).toBe(
      errorMessage + 'Click here to choose a new data view'
    );
  });

  it('should show no timestamp error when selected data view does not have a timeField', async () => {
    const mockedIndex = {
      id: 'c34a7c79-a88b-4b4a-ad19-72f6d24104e4',
      title: 'metrics-fake_hosts',
      fieldFormatMap: {},
      typeMeta: {},
      // We should not provide timeFieldName here to show thresholdRuleDataViewErrorNoTimestamp error
      // timeFieldName: '@timestamp',
    };
    updateUseKibanaMock(mockedIndex);
    const { wrapper } = await setup();
    expect(
      wrapper.find(`[data-test-subj="thresholdRuleDataViewErrorNoTimestamp"]`).first().text()
    ).toBe(
      'The selected data view does not have a timestamp field, please select another data view.'
    );
  });

  it('should re-add $state to saved filters before passing them to the SearchBar', async () => {
    const kibanaMock = kibanaStartMock.startContract();
    const searchBarMock = kibanaMock.services.unifiedSearch.ui.SearchBar as jest.Mock;
    searchBarMock.mockClear();
    useKibanaMock.mockReturnValue(kibanaMock);

    const savedFilter = {
      meta: { index: 'mockedIndex', key: 'host.name', type: 'phrase' },
      query: { match_phrase: { 'host.name': 'host-1' } },
    };

    await setup(undefined, {
      searchConfiguration: {
        index: 'mockedIndex',
        query: { query: '', language: 'kuery' },
        filter: [savedFilter],
      },
    });

    expect(searchBarMock).toHaveBeenCalled();
    const { filters } = searchBarMock.mock.calls[searchBarMock.mock.calls.length - 1][0];
    expect(filters).toEqual([
      {
        ...savedFilter,
        $state: { store: FilterStateStore.APP_STATE },
      },
    ]);
  });

  it('should use output of getSerializedFields() as searchConfiguration', async () => {
    const mockedIndex = {
      id: 'c34a7c79-a88b-4b4a-ad19-72f6d24104e4',
      title: 'metrics-fake_hosts',
      fieldFormatMap: {},
      typeMeta: {},
      timeFieldName: '@timestamp',
    };
    updateUseKibanaMock(mockedIndex);
    const { ruleParams } = await setup(undefined, { searchConfiguration: undefined });
    expect(ruleParams.searchConfiguration).toEqual({
      index: mockedIndex,
    });
  });
});

describe('getNoDataBehaviorValue', () => {
  const baseRuleParams = {
    criteria: [],
    groupBy: undefined,
    sourceId: 'default',
    searchConfiguration: {
      index: 'default',
      query: { query: '', language: 'kuery' as const },
    },
  };

  describe('when noDataBehavior is set', () => {
    it('should return the noDataBehavior value', () => {
      expect(
        getNoDataBehaviorValue({ ...baseRuleParams, noDataBehavior: 'alertOnNoData' }, false)
      ).toBe('alertOnNoData');
      expect(getNoDataBehaviorValue({ ...baseRuleParams, noDataBehavior: 'recover' }, true)).toBe(
        'recover'
      );
      expect(
        getNoDataBehaviorValue({ ...baseRuleParams, noDataBehavior: 'remainActive' }, false)
      ).toBe('remainActive');
    });

    it('should ignore legacy params when noDataBehavior is set', () => {
      expect(
        getNoDataBehaviorValue(
          { ...baseRuleParams, noDataBehavior: 'recover', alertOnNoData: true },
          false
        )
      ).toBe('recover');
      expect(
        getNoDataBehaviorValue(
          { ...baseRuleParams, noDataBehavior: 'alertOnNoData', alertOnGroupDisappear: false },
          true
        )
      ).toBe('alertOnNoData');
      expect(
        getNoDataBehaviorValue(
          {
            ...baseRuleParams,
            noDataBehavior: 'remainActive',
            alertOnNoData: true,
            alertOnGroupDisappear: true,
          },
          true
        )
      ).toBe('remainActive');
      expect(
        getNoDataBehaviorValue(
          {
            ...baseRuleParams,
            noDataBehavior: 'remainActive',
            alertOnNoData: false,
            alertOnGroupDisappear: false,
          },
          false
        )
      ).toBe('remainActive');
      expect(
        getNoDataBehaviorValue(
          {
            ...baseRuleParams,
            noDataBehavior: 'recover',
            alertOnNoData: true,
            alertOnGroupDisappear: true,
          },
          true
        )
      ).toBe('recover');
      expect(
        getNoDataBehaviorValue(
          {
            ...baseRuleParams,
            noDataBehavior: 'alertOnNoData',
            alertOnNoData: false,
            alertOnGroupDisappear: true,
          },
          false
        )
      ).toBe('alertOnNoData');
      expect(
        getNoDataBehaviorValue(
          {
            ...baseRuleParams,
            noDataBehavior: 'alertOnNoData',
            alertOnNoData: false,
            alertOnGroupDisappear: false,
          },
          true
        )
      ).toBe('alertOnNoData');
    });
  });

  describe('when noDataBehavior is not set (legacy params)', () => {
    describe('with groupBy', () => {
      it('should return alertOnNoData when alertOnGroupDisappear is true', () => {
        expect(
          getNoDataBehaviorValue({ ...baseRuleParams, alertOnGroupDisappear: true }, true)
        ).toBe('alertOnNoData');
      });

      it('should return recover when alertOnGroupDisappear is false', () => {
        expect(
          getNoDataBehaviorValue({ ...baseRuleParams, alertOnGroupDisappear: false }, true)
        ).toBe('recover');
      });

      it('should return recover when alertOnGroupDisappear is undefined', () => {
        expect(getNoDataBehaviorValue({ ...baseRuleParams }, true)).toBe('recover');
      });

      it('should return alertOnNoData when alertOnGroupDisappear is true and alertOnNoData is true', () => {
        expect(
          getNoDataBehaviorValue(
            { ...baseRuleParams, alertOnGroupDisappear: true, alertOnNoData: true },
            true
          )
        ).toBe('alertOnNoData');
      });

      it('should return alertOnNoData when alertOnGroupDisappear is true and alertOnNoData is false', () => {
        expect(
          getNoDataBehaviorValue(
            { ...baseRuleParams, alertOnGroupDisappear: true, alertOnNoData: false },
            true
          )
        ).toBe('alertOnNoData');
      });

      it('should return recover when alertOnGroupDisappear is false and alertOnNoData is true', () => {
        expect(
          getNoDataBehaviorValue(
            { ...baseRuleParams, alertOnGroupDisappear: false, alertOnNoData: true },
            true
          )
        ).toBe('recover');
      });

      it('should return recover when alertOnGroupDisappear and alertOnNoData are undefined', () => {
        expect(
          getNoDataBehaviorValue(
            { ...baseRuleParams, alertOnGroupDisappear: undefined, alertOnNoData: undefined },
            true
          )
        ).toBe('recover');
      });
    });

    describe('without groupBy', () => {
      it('should return alertOnNoData when alertOnNoData is true', () => {
        expect(getNoDataBehaviorValue({ ...baseRuleParams, alertOnNoData: true }, false)).toBe(
          'alertOnNoData'
        );
      });

      it('should return recover when alertOnNoData is false', () => {
        expect(getNoDataBehaviorValue({ ...baseRuleParams, alertOnNoData: false }, false)).toBe(
          'recover'
        );
      });

      it('should return recover when alertOnNoData is undefined', () => {
        expect(getNoDataBehaviorValue({ ...baseRuleParams }, false)).toBe('recover');
      });

      it('should return alertOnNoData when alertOnNoData is true and alertOnGroupDisappear is true', () => {
        expect(
          getNoDataBehaviorValue(
            { ...baseRuleParams, alertOnNoData: true, alertOnGroupDisappear: true },
            false
          )
        ).toBe('alertOnNoData');
      });

      it('should return recover when alertOnNoData is false and alertOnGroupDisappear is true', () => {
        expect(
          getNoDataBehaviorValue(
            { ...baseRuleParams, alertOnNoData: false, alertOnGroupDisappear: true },
            false
          )
        ).toBe('recover');
      });

      it('should return recover when alertOnNoData is true and alertOnGroupDisappear is false', () => {
        expect(
          getNoDataBehaviorValue(
            { ...baseRuleParams, alertOnNoData: true, alertOnGroupDisappear: false },
            false
          )
        ).toBe('alertOnNoData');
      });

      it('should return recover when alertOnNoData and alertOnGroupDisappear are undefined', () => {
        expect(
          getNoDataBehaviorValue(
            { ...baseRuleParams, alertOnNoData: undefined, alertOnGroupDisappear: undefined },
            false
          )
        ).toBe('recover');
      });
    });
  });
});
