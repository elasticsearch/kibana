/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { EuiFormRow, EuiComboBox, EuiSkeletonText } from '@elastic/eui';

import { i18n } from '@kbn/i18n';
import type { DrilldownEditorProps } from '@kbn/embeddable-plugin/public';
import useDebounce from 'react-use/lib/useDebounce';
import { DEFAULT_DASHBOARD_NAVIGATION_OPTIONS } from '@kbn/dashboard-navigation-options-common';
import { DashboardNavigationOptionsEditor } from '@kbn/dashboard-navigation-options-components';
import type { DashboardDrilldownState } from '../../server';
import { findService } from '../dashboard_client';

export const DashboardDrilldownEditor = (props: DrilldownEditorProps<DashboardDrilldownState>) => {
  const [options, setOptions] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [selectedOption, setSelectedOption] = useState<
    EuiComboBoxOptionOption<string> | undefined
  >();
  const [isLoadingInitialDashboard, setIsLoadingInitialDashboard] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [searchString, setSearchString] = useState<string | undefined>();
  const [debouncedSearchString, setDebouncedSearchString] = useState<string | undefined>();

  useDebounce(
    () => {
      setDebouncedSearchString(searchString);
    },
    500,
    [searchString]
  );

  useEffect(() => {
    let canceled = false;
    setIsLoadingOptions(true);

    findService
      .search({
        query: debouncedSearchString ?? '',
        per_page: 100,
      })
      .then((results) => {
        if (canceled) {
          return;
        }

        setOptions(
          results.data.map(({ id, data }) => ({
            value: id,
            label: data.title,
          }))
        );
        setIsLoadingOptions(false);
      });

    return () => {
      canceled = true;
    };
  }, [debouncedSearchString]);

  useEffect(() => {
    const initialDashboardId = props.state.dashboard_id;
    if (!initialDashboardId) {
      return;
    }

    let canceled = false;
    setIsLoadingInitialDashboard(true);
    findService.findById(initialDashboardId).then((result) => {
      if (canceled) {
        return;
      }
      setIsLoadingInitialDashboard(false);
      // handle case when destination dashboard no longer exists
      if (result.status === 'error') {
        setError(
          result.notFound
            ? i18n.translate('dashboard.drilldown.errorDestinationDashboardIsMissing', {
                defaultMessage:
                  "Destination dashboard (''{dashboardId}'') no longer exists. Choose another dashboard.",
                values: {
                  dashboardId: initialDashboardId,
                },
              })
            : result.error.message
        );
        props.onChange({ ...props.state, dashboard_id: undefined });
        return;
      }

      setSelectedOption({
        value: initialDashboardId,
        label: result.attributes.title,
      });
    });

    return () => {
      canceled = true;
    };

    // run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigationOptions = useMemo(() => {
    return {
      ...DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
      ...props.state,
    };
  }, [props.state]);

  return (
    <EuiSkeletonText isLoading={isLoadingInitialDashboard}>
      <EuiFormRow
        label={i18n.translate(
          'dashboard.components.DashboardDrilldownConfig.chooseDestinationDashboard',
          {
            defaultMessage: 'Choose destination dashboard',
          }
        )}
        fullWidth
        isInvalid={!!error}
        error={error}
      >
        <EuiComboBox<string>
          async
          selectedOptions={selectedOption ? [selectedOption] : undefined}
          options={options}
          onChange={(nextSelectedOptions) => {
            setSelectedOption(nextSelectedOptions?.[0]);
            props.onChange({ ...props.state, dashboard_id: nextSelectedOptions?.[0]?.value });
            if (error) {
              setError(undefined);
            }
          }}
          onSearchChange={setSearchString}
          isLoading={isLoadingOptions}
          singleSelection={{ asPlainText: true }}
          fullWidth
          data-test-subj={'dashboardDrilldownSelectDashboard'}
          isInvalid={!!error}
        />
      </EuiFormRow>
      <DashboardNavigationOptionsEditor
        options={navigationOptions}
        onOptionChange={(changedState) => {
          props.onChange({
            ...props.state,
            ...changedState,
          });
        }}
      />
    </EuiSkeletonText>
  );
};
