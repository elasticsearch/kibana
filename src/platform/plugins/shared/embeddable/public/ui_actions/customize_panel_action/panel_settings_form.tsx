/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButtonEmpty,
  EuiForm,
  EuiFormRow,
  EuiSpacer,
  EuiSuperDatePicker,
  EuiSwitch,
  EuiTextArea,
} from '@elastic/eui';
import { UI_SETTINGS } from '@kbn/data-plugin/public';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { TimeRange } from '@kbn/es-query';
import { apiPublishesTimeRange, getDescription } from '@kbn/presentation-publishing';
import React, { useMemo, useState } from 'react';
import useObservable from 'react-use/lib/useObservable';
import { BehaviorSubject } from 'rxjs';
import { core } from '../../kibana_services';
import type { PanelSettingsApi } from './inline_panel_settings';

const undefinedString$ = new BehaviorSubject<string | undefined>(undefined);
const undefinedTimeRange$ = new BehaviorSubject<TimeRange | undefined>(undefined);
const undefinedBoolean$ = new BehaviorSubject<boolean | undefined>(undefined);

interface TimePickerQuickRange {
  from: string;
  to: string;
  display: string;
}

export const PanelSettingsForm = ({ api }: { api: PanelSettingsApi }) => {
  const description = useObservable(
    api.description$ ?? undefinedString$,
    api.description$?.getValue()
  );
  const defaultDescription = useObservable(
    api.defaultDescription$ ?? undefinedString$,
    api.defaultDescription$?.getValue()
  );
  const hideBorder = useObservable(
    api.hideBorder$ ?? undefinedBoolean$,
    api.hideBorder$?.getValue()
  );
  const timeRange = useObservable(
    api.timeRange$ ?? undefinedTimeRange$,
    api.timeRange$?.getValue()
  );

  const [hasOwnTimeRange, setHasOwnTimeRange] = useState<boolean>(Boolean(timeRange));

  const commonlyUsedRangesForDatePicker = useMemo(() => {
    const commonlyUsedRanges = core.uiSettings.get<TimePickerQuickRange[]>(
      UI_SETTINGS.TIMEPICKER_QUICK_RANGES
    );
    if (!commonlyUsedRanges) return [];
    return commonlyUsedRanges.map(({ from, to, display }: TimePickerQuickRange) => ({
      start: from,
      end: to,
      label: display,
    }));
  }, []);

  const dateFormat = useMemo(() => core.uiSettings.get<string>(UI_SETTINGS.DATE_FORMAT), []);
  const { setTimeRange } = api;

  const showTimeRange =
    apiPublishesTimeRange(api) && (api.isCompatibleWithUnifiedSearch?.() ?? true);

  const parentTimeRange =
    api.parentApi && apiPublishesTimeRange(api.parentApi)
      ? api.parentApi.timeRange$.getValue()
      : undefined;

  const pickerTimeRange: TimeRange | undefined = timeRange ?? parentTimeRange;

  const panelDescription = description ?? getDescription(api) ?? '';

  return (
    <EuiForm data-test-subj="inlinePanelSettingsForm">
      <EuiFormRow
        label={
          <FormattedMessage
            id="embeddableApi.action.customizePanel.flyout.optionsMenuForm.panelDescriptionFormRowLabel"
            defaultMessage="Description"
          />
        }
        labelAppend={
          defaultDescription ? (
            <EuiButtonEmpty
              size="xs"
              data-test-subj="resetCustomEmbeddablePanelDescriptionButton"
              onClick={() => api.setDescription?.(defaultDescription)}
              disabled={defaultDescription === panelDescription}
              aria-label={i18n.translate(
                'embeddableApi.action.customizePanel.flyout.optionsMenuForm.resetCustomDescriptionButtonAriaLabel',
                {
                  defaultMessage: 'Reset description to default',
                }
              )}
            >
              <FormattedMessage
                id="embeddableApi.action.customizePanel.modal.optionsMenuForm.resetCustomDescriptionButtonLabel"
                defaultMessage="Reset to default"
              />
            </EuiButtonEmpty>
          ) : undefined
        }
      >
        <EuiTextArea
          id="panelDescriptionInput"
          data-test-subj="customEmbeddablePanelDescriptionInput"
          name="description"
          value={panelDescription}
          onChange={(e) => api.setDescription?.(e.target.value)}
          aria-label={i18n.translate(
            'embeddableApi.action.customizePanel.flyout.optionsMenuForm.panelDescriptionAriaLabel',
            {
              defaultMessage: 'Enter a custom description for your panel',
            }
          )}
        />
      </EuiFormRow>
      <EuiFormRow>
        <EuiSwitch
          compressed
          checked={!hideBorder}
          data-test-subj="customizePanelBorderlessToggle"
          id="borderlessToggle"
          label={
            <FormattedMessage
              defaultMessage="Show panel border"
              id="embeddableApi.action.customizePanel.flyout.optionsMenuForm.borderlessToggleSwitch"
            />
          }
          onChange={(e) => api.setHideBorder?.(!e.target.checked)}
        />
      </EuiFormRow>
      {showTimeRange ? (
        <>
          <EuiFormRow>
            <EuiSwitch
              compressed
              checked={hasOwnTimeRange}
              data-test-subj="customizePanelShowCustomTimeRange"
              id="showCustomTimeRange"
              label={
                <FormattedMessage
                  defaultMessage="Apply custom time range"
                  id="embeddableApi.action.customizePanel.flyout.optionsMenuForm.showCustomTimeRangeSwitch"
                />
              }
              onChange={(e) => {
                const nextHasOwnTimeRange = e.target.checked;
                setHasOwnTimeRange(nextHasOwnTimeRange);
                if (nextHasOwnTimeRange) {
                  setTimeRange?.(pickerTimeRange);
                } else {
                  setTimeRange?.(undefined);
                }
              }}
            />
          </EuiFormRow>
          {hasOwnTimeRange ? (
            <EuiFormRow
              label={
                <FormattedMessage
                  id="embeddableApi.action.customizePanel.flyout.optionsMenuForm.panelTimeRangeFormRowLabel"
                  defaultMessage="Time range"
                />
              }
            >
              <EuiSuperDatePicker
                start={pickerTimeRange?.from}
                end={pickerTimeRange?.to}
                onTimeChange={({ start, end }) => setTimeRange?.({ from: start, to: end })}
                showUpdateButton={false}
                dateFormat={dateFormat}
                commonlyUsedRanges={commonlyUsedRangesForDatePicker}
                data-test-subj="customizePanelTimeRangeDatePicker"
              />
            </EuiFormRow>
          ) : null}
        </>
      ) : null}
      <EuiSpacer size="m" />
    </EuiForm>
  );
};
