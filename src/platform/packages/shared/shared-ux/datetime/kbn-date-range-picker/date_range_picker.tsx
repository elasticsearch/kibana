/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useMemo, type ComponentType } from 'react';

import type { SerializedStyles } from '@emotion/react';
import type { IconType } from '@elastic/eui';

import type {
  TimeRangeBounds,
  TimeRangeBoundsOption,
  CalendarOptions,
  DateRangePickerSettings,
} from './types';
import type { TimeWindowButtonsConfig } from './date_range_picker_time_window_buttons';
import { DateRangePickerProvider } from './date_range_picker_context';
import { DateRangePickerLayout } from './date_range_picker_layout';
import { DateRangePickerDialog } from './date_range_picker_dialog';
import {
  DateRangePickerPanelNavigationProvider,
  DateRangePickerPanel,
  type DateRangePickerPanelDescriptor,
} from './date_range_picker_panel_navigation';
import { MainPanel } from './panels/main_panel';
import { CalendarPanel } from './panels/calendar_panel';
import { CustomTimeRangePanel } from './panels/custom_time_range_panel';
import { DocumentationPanel } from './panels/documentation_panel';
import { SettingsPanel } from './panels/settings_panel';
import { ExamplePanel, ExampleNestedPanel } from './panels/example_panel';

const DEFAULT_PANEL_ID = 'main' as const;

export type { TimeWindowButtonsConfig } from './date_range_picker_time_window_buttons';

/** Configuration for a consumer-provided panel inside the date range picker dialog. */
export interface DateRangePickerPanelConfig {
  /** Unique panel identifier, used for navigation */
  id: string;
  /** Title shown in panel header and navigation button */
  title: string;
  /** Icon type passed to `EuiIcon` for the panel navigation item */
  icon?: IconType;
  /**
   * Panel component to render. Must be a component reference (not an element).
   * Rendered inside the provider tree so it can use
   * `useDateRangePickerContext()` and `useDateRangePickerPanelNavigation()`.
   */
  component: ComponentType;
}

export interface DateRangePickerProps {
  /** Test subject selector added to the outermost container element. */
  'data-test-subj'?: string;
  /** Emotion CSS styles added to the outermost container element. */
  css?: SerializedStyles | SerializedStyles[];
  /** Passed to the main container. */
  className?: string;
  /**
   * Shows a loading spinner inside the form control.
   * @default false
   */
  isLoading?: boolean;
  /**
   * Text representation of the time range (controlled).
   * When provided, the component is controlled and `value` is the external source of truth.
   */
  value?: string;
  /** Initial text representation of the time range (uncontrolled, ignored when `value` is provided). */
  defaultValue?: string;
  /** Callback for when the time changes */
  onChange: (props: DateRangePickerOnChangeProps) => void;
  /**
   * Additional moment format strings accepted when parsing absolute dates the
   * user types, e.g. the Kibana `dateFormat` setting. Does not affect display.
   */
  inputDateFormats?: string[];
  /**
   * Locale used to recognise and generate named ranges, natural-language
   * durations/instants, and delimiters. English is always recognised
   * alongside the active locale.
   * @default `i18n.getLocale()`
   */
  locale?: string;
  /** Show invalid state */
  isInvalid?: boolean;
  /**
   * Disables the control and time window buttons.
   * @default false
   */
  disabled?: boolean;
  /**
   * Tooltip shown on the control and time window buttons while `disabled` is true.
   */
  disabledTooltip?: React.ReactNode;
  /**
   * Shows the current value but prevents changing it: the control and time
   * window buttons can't be interacted with, but (unlike `disabled`) the
   * control isn't visually dimmed. The auto-refresh play/pause button is
   * unaffected.
   * @default false
   */
  readOnly?: boolean;
  /**
   * Called when the editing input text changes.
   * @beta
   */
  onInputChange?: (value: string) => void;
  /**
   * Horizontal sizing behavior.
   * - `'auto'` — shrinks to fit content (inline-flex).
   * - `'restricted'` — sets the width of the control to a fixed value.
   * - `'full'` — stretches to 100% of the parent (flex).
   * @default 'auto'
   */
  width?: 'restricted' | 'auto' | 'full';
  /**
   * Reduce input height and padding
   * @default true
   */
  compressed?: boolean;
  /**
   * When true, hides the text label and shows only the duration badge.
   * The badge is hidden for relative-to-now ranges (e.g. "Last 15 minutes")
   * when not collapsed, since the label already conveys the duration.
   * @default false
   */
  collapsed?: boolean;
  /**
   * Show time window buttons (previous, zoom out, zoom in, next) beside the control.
   * Pass `true` for defaults, or a config object for fine-grained control.
   * @default false
   */
  showTimeWindowButtons?: boolean | TimeWindowButtonsConfig;
  /**
   * Additional panels rendered inside the dialog popover.
   * Each panel is navigatable via `useDateRangePickerPanelNavigation().navigateTo(id)`.
   */
  panels?: DateRangePickerPanelConfig[];
  /**
   * Predefined time range options shown in the Presets section.
   */
  presets?: TimeRangeBoundsOption[];
  /**
   * Recently used time ranges shown in the Recent section.
   * @default []
   */
  recent?: TimeRangeBoundsOption[];
  /** Called when the user wants to save the current input time range as a preset. */
  onPresetSave?: (option: TimeRangeBoundsOption) => void;
  /** Called when the user wants to delete a saved preset. */
  onPresetDelete?: (option: TimeRangeBoundsOption) => void;
  /** Calendar-specific options (e.g. first day of week). */
  calendarOptions?: CalendarOptions;
  /** Current picker settings (e.g. rounding, refresh). */
  settings: DateRangePickerSettings;
  /** Called when the user changes a setting in the settings panel. */
  onSettingsChange: (settings: DateRangePickerSettings) => void;
  /**
   * A valid time zone name, from the IANA database, e.g. "America/Los_Angeles".
   * This is only informational, it won't affect how dates are handled.
   * @link https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
   */
  timeZone?: string;
  /** Fires at the end of each auto-refresh interval while `settings.autoRefresh` exists, is enabled and timer is unpaused. */
  onRefresh?: () => void;
  /**
   * Increment this value whenever an external timer (e.g. the Kibana timefilter) triggers a
   * refresh, so the visual countdown resets to stay in sync with actual query cadence.
   * `undefined` on first render is ignored.
   */
  refreshEpoch?: number;
  /**
   * Prepends the Kibana server `basePath` to an internal URL path.
   * Typically provided as `core.http.basePath.prepend`.
   * When omitted, paths are used as-is.
   */
  prependBasePath?: (path: string) => string;
  /**
   * Whether the current user can access the Advanced Settings management page.
   * When `false`, links to Advanced Settings are hidden in the settings panel.
   * Typically derived from `capabilities.advancedSettings.save`.
   * @default false
   */
  canAccessAdvancedSettings?: boolean;
}

export interface DateRangePickerOnChangeProps extends TimeRangeBounds {
  /** Start as Date object */
  startDate: Date | null;
  /** End as Date object */
  endDate: Date | null;
  /** Text representation of the time range */
  value: string;
  /** Whether the time range is invalid */
  isInvalid: boolean;
}

/**
 * A date range picker component that accepts natural language and date math input.
 */
export function DateRangePicker({
  panels = [],
  className,
  'data-test-subj': dataTestSubj,
  css: cssStyles,
  ...props
}: DateRangePickerProps) {
  const defaultPanelId = DEFAULT_PANEL_ID;
  const panelDescriptors: DateRangePickerPanelDescriptor[] = useMemo(
    () => panels.map(({ id, title, icon }) => ({ id, title, icon })),
    [panels]
  );

  return (
    <DateRangePickerProvider {...props}>
      <DateRangePickerLayout className={className} data-test-subj={dataTestSubj} css={cssStyles}>
        <DateRangePickerDialog>
          <DateRangePickerPanelNavigationProvider
            defaultPanelId={defaultPanelId}
            panelDescriptors={panelDescriptors}
          >
            <DateRangePickerPanel id="main">
              <MainPanel />
            </DateRangePickerPanel>
            <DateRangePickerPanel id={CalendarPanel.PANEL_ID}>
              <CalendarPanel />
            </DateRangePickerPanel>
            <DateRangePickerPanel id={CustomTimeRangePanel.PANEL_ID}>
              <CustomTimeRangePanel />
            </DateRangePickerPanel>
            <DateRangePickerPanel id={DocumentationPanel.PANEL_ID}>
              <DocumentationPanel />
            </DateRangePickerPanel>
            <DateRangePickerPanel id={SettingsPanel.PANEL_ID}>
              <SettingsPanel />
            </DateRangePickerPanel>
            {panels.map(({ id, component: Component }) => (
              <DateRangePickerPanel key={id} id={id}>
                <Component />
              </DateRangePickerPanel>
            ))}
            {/* TODO Example panels, can be removed after initial development finishes */}
            <DateRangePickerPanel id={ExamplePanel.PANEL_ID}>
              <ExamplePanel />
            </DateRangePickerPanel>
            <DateRangePickerPanel id={ExampleNestedPanel.PANEL_ID}>
              <ExampleNestedPanel />
            </DateRangePickerPanel>
          </DateRangePickerPanelNavigationProvider>
        </DateRangePickerDialog>
      </DateRangePickerLayout>
    </DateRangePickerProvider>
  );
}
