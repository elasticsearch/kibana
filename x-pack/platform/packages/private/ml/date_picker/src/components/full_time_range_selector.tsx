/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useMemo, useState } from 'react';

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';

import type { EuiRadioGroupOption } from '@elastic/eui';
import {
  EuiButton,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiPopover,
  EuiRadioGroup,
  EuiToolTip,
} from '@elastic/eui';

import { i18n } from '@kbn/i18n';
import type { DataView } from '@kbn/data-plugin/common';
import type { TimefilterContract } from '@kbn/data-plugin/public';
import { FormattedMessage } from '@kbn/i18n-react';
import { useDatePickerContext } from '../hooks/use_date_picker_context';
import {
  setFullTimeRange,
  type SetFullTimeRangeApiPath,
} from '../services/full_time_range_selector_service';
import type { GetTimeFieldRangeResponse } from '../services/types';
import { FROZEN_TIER_PREFERENCE, type FrozenTierPreference } from '../storage';

/**
 * FullTimeRangeSelectorProps React Component props interface
 */
export interface FullTimeRangeSelectorProps {
  /**
   * Frozen data preference ('exclude-frozen' | 'include-frozen')
   */
  frozenDataPreference: FrozenTierPreference;
  /**
   * Callback to set frozen data preference.
   * @param value - The updated frozen data preference.
   */
  setFrozenDataPreference: (value: FrozenTierPreference | undefined) => void;
  /**
   * timefilter service.
   */
  timefilter: TimefilterContract;
  /**
   * Current data view.
   */
  dataView: DataView;
  /**
   * Boolean flag to enable/disable the full time range button.
   */
  disabled: boolean;
  /**
   * Optional DSL query.
   */
  query?: QueryDslQueryContainer;
  /**
   * Optional callback.
   * @param value - The time field range response.
   */
  callback?: (value: GetTimeFieldRangeResponse) => void;
  /**
   * Optional API path.
   * @param value - The time field range response.
   */
  apiPath?: SetFullTimeRangeApiPath;
}

/**
 * Component for rendering a button which automatically sets the range of the time filter
 * to the time range of data in the index(es) mapped to the supplied Kibana data view or query.
 *
 * @type {FC<FullTimeRangeSelectorProps>}
 * @param props - `FullTimeRangeSelectorProps` component props
 * @returns {React.ReactElement} The FullTimeRangeSelector component.
 */
export const FullTimeRangeSelector: FC<FullTimeRangeSelectorProps> = (props) => {
  const {
    frozenDataPreference,
    setFrozenDataPreference,
    timefilter,
    dataView,
    query,
    disabled,
    callback,
    apiPath,
  } = props;

  const {
    http,
    notifications: { toasts },
    showFrozenDataTierChoice,
    cps,
  } = useDatePickerContext();

  // wrapper around setFullTimeRange to allow for the calling of the optional callBack prop
  const setRange = useCallback(async () => {
    try {
      const projectRouting = cps?.cpsManager?.getProjectRouting();
      const fullTimeRange = await setFullTimeRange(
        timefilter,
        dataView,
        toasts,
        http,
        query,
        showFrozenDataTierChoice === false
          ? false
          : frozenDataPreference === FROZEN_TIER_PREFERENCE.EXCLUDE,
        apiPath,
        projectRouting
      );
      if (typeof callback === 'function' && fullTimeRange !== undefined) {
        callback(fullTimeRange);
      }
    } catch (e) {
      toasts.addError(e, {
        title: i18n.translate(
          'xpack.ml.datePicker.fullTimeRangeSelector.errorSettingTimeRangeNotification',
          {
            defaultMessage:
              'An error occurred setting the time range. Please set the desired start and end times.',
          }
        ),
      });
    }
  }, [
    timefilter,
    dataView,
    toasts,
    http,
    query,
    showFrozenDataTierChoice,
    frozenDataPreference,
    apiPath,
    callback,
    cps?.cpsManager,
  ]);

  const [isPopoverOpen, setPopover] = useState(false);

  const setPreference = useCallback(
    (id: string) => {
      setFrozenDataPreference(id as FrozenTierPreference);
      closePopover();
    },
    [setFrozenDataPreference]
  );

  const onButtonClick = () => {
    setPopover(!isPopoverOpen);
  };

  const closePopover = () => {
    setPopover(false);
  };

  const sortOptions: EuiRadioGroupOption[] = useMemo(() => {
    return [
      {
        id: FROZEN_TIER_PREFERENCE.EXCLUDE,
        label: i18n.translate(
          'xpack.ml.datePicker.fullTimeRangeSelector.useFullDataExcludingFrozenMenuLabel',
          {
            defaultMessage: 'Exclude frozen data tier',
          }
        ),
      },
      {
        id: FROZEN_TIER_PREFERENCE.INCLUDE,
        label: i18n.translate(
          'xpack.ml.datePicker.fullTimeRangeSelector.useFullDataIncludingFrozenMenuLabel',
          {
            defaultMessage: 'Include frozen data tier',
          }
        ),
      },
    ];
  }, []);

  const popoverContent = useMemo(
    () => (
      <EuiPanel>
        <EuiRadioGroup
          options={sortOptions}
          idSelected={frozenDataPreference}
          onChange={setPreference}
          compressed
          name="frozenDataPreference"
        />
      </EuiPanel>
    ),
    [sortOptions, frozenDataPreference, setPreference]
  );

  const buttonTooltip = useMemo(() => {
    if (showFrozenDataTierChoice === false) {
      return (
        <FormattedMessage
          id="xpack.ml.datePicker.fullTimeRangeSelector.useFullData"
          defaultMessage="Use full range of data."
        />
      );
    } else {
      return frozenDataPreference === FROZEN_TIER_PREFERENCE.EXCLUDE ? (
        <FormattedMessage
          id="xpack.ml.datePicker.fullTimeRangeSelector.useFullDataExcludingFrozenButtonTooltip"
          defaultMessage="Use full range of data excluding frozen data tier."
        />
      ) : (
        <FormattedMessage
          id="xpack.ml.datePicker.fullTimeRangeSelector.useFullDataIncludingFrozenButtonTooltip"
          defaultMessage="Use full range of data including frozen data tier, which might have slower search results."
        />
      );
    }
  }, [frozenDataPreference, showFrozenDataTierChoice]);

  const moreOptionsLabel = i18n.translate(
    'xpack.ml.datePicker.fullTimeRangeSelector.moreOptionsButtonAriaLabel',
    { defaultMessage: 'More options' }
  );

  return (
    <EuiFlexGroup responsive={false} gutterSize="s">
      <EuiToolTip content={buttonTooltip}>
        <EuiButton
          isDisabled={disabled}
          onClick={() => setRange()}
          data-test-subj="mlDatePickerButtonUseFullData"
        >
          <FormattedMessage
            id="xpack.ml.datePicker.fullTimeRangeSelector.useFullDataButtonLabel"
            defaultMessage="Use full data"
          />
        </EuiButton>
      </EuiToolTip>
      {showFrozenDataTierChoice === false ? null : (
        <EuiFlexItem grow={false}>
          <EuiPopover
            id={'mlFullTimeRangeSelectorOption'}
            aria-label={i18n.translate(
              'xpack.ml.datePicker.fullTimeRangeSelector.frozenDataTierOptionsAriaLabel',
              {
                defaultMessage: 'Frozen data tier options',
              }
            )}
            button={
              <EuiToolTip content={moreOptionsLabel} disableScreenReaderOutput>
                <EuiButtonIcon
                  data-test-subj="mlDatePickerButtonDataTierOptions"
                  display="base"
                  size="m"
                  iconType="boxesVertical"
                  aria-label={moreOptionsLabel}
                  onClick={onButtonClick}
                />
              </EuiToolTip>
            }
            isOpen={isPopoverOpen}
            closePopover={closePopover}
            panelPaddingSize="none"
            anchorPosition="downRight"
          >
            {popoverContent}
          </EuiPopover>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
