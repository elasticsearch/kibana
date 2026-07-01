/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useState } from 'react';

import {
  EuiButton,
  EuiButtonIcon,
  EuiTab,
  EuiTabs,
  EuiToolTip,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';

import type { TimeRangeBoundsOption } from '../types';
import {
  PanelContainer,
  PanelBody,
  PanelBodySection,
  PanelFooter,
  PanelListItem,
  PanelNavItem,
} from '../date_range_picker_panel_ui';
import { DocumentationPanel } from './documentation_panel';
import { SettingsPanel } from './settings_panel';
import { useDateRangePickerContext } from '../date_range_picker_context';
import { useDateRangePickerPanelNavigation } from '../date_range_picker_panel_navigation';
import { mainPanelStyles } from './main_panel.styles';
import { getOptionDisplayLabel, getOptionShorthand, getOptionInputText } from '../utils';
import { mainPanelTexts } from '../translations';
import { panelDividerStyles } from '../date_range_picker_panel_ui.styles';
import { useTimeZoneDisplay } from '../hooks/use_time_zone_display';

const toTestSubj = (prefix: string, label: string) =>
  `${prefix}-${label.replace(/→/g, '-').replace(/["'&]/g, '').replace(/\s+/g, '_')}`;

interface OptionsListProps {
  /** Options to render as list items. */
  options: TimeRangeBoundsOption[];
  /** When true, show the shorthand of the time range. */
  showShorthand?: boolean;
  /** When true, show the extra actions. */
  showExtraActions?: boolean;
}

/** Renders a list of time range options as selectable `PanelListItem` entries. */
const OptionsList = ({ options, showShorthand, showExtraActions }: OptionsListProps) => {
  const { applyRange, onPresetDelete, settings } = useDateRangePickerContext();
  const timePrecision = settings.timePrecision ?? 's';
  const euiThemeContext = useEuiTheme();
  const styles = mainPanelStyles(euiThemeContext);

  const handleSelect = useCallback(
    (option: TimeRangeBoundsOption) => {
      applyRange({ start: option.start, end: option.end }, getOptionInputText(option));
    },
    [applyRange]
  );

  return (
    <ul css={[styles.list, styles.scroller]}>
      {options.map((option, index) => (
        <PanelListItem
          key={`${option.start}-${option.end}-${index}`}
          data-test-subj={toTestSubj(
            'dateRangePickerPresetItem',
            option.label ?? getOptionDisplayLabel(option, { timePrecision })
          )}
          onClick={() => handleSelect(option)}
          suffix={showShorthand ? getOptionShorthand(option) ?? undefined : undefined}
          extraActions={
            showExtraActions && onPresetDelete ? (
              <EuiToolTip content={mainPanelTexts.deletePresetAriaLabel} disableScreenReaderOutput>
                <EuiButtonIcon
                  aria-label={mainPanelTexts.deletePresetAriaLabel}
                  iconType="trash"
                  color="danger"
                  size="xs"
                  data-test-subj="dateRangePickerDeletePresetButton"
                  onClick={() => onPresetDelete(option)}
                />
              </EuiToolTip>
            ) : undefined
          }
        >
          {getOptionDisplayLabel(option, { timePrecision })}
        </PanelListItem>
      ))}
    </ul>
  );
};

/** Tabbed view switching between presets and recently used ranges. */
const PresetsRecentTabs = () => {
  const { presets, recent } = useDateRangePickerContext();
  const [selectedTabId, setSelectedTabId] = useState<'presets' | 'recent'>('presets');
  const euiThemeContext = useEuiTheme();
  const styles = mainPanelStyles(euiThemeContext);
  const hasRecent = recent.length > 0;

  return (
    <>
      <EuiTabs size="s" css={styles.tabs}>
        <EuiTab
          isSelected={selectedTabId === 'presets'}
          onClick={() => setSelectedTabId('presets')}
          data-test-subj="dateRangePickerPresetsTab"
        >
          {mainPanelTexts.presetsLabel}
        </EuiTab>
        <EuiTab
          isSelected={selectedTabId === 'recent'}
          disabled={!hasRecent}
          onClick={() => setSelectedTabId('recent')}
          data-test-subj="dateRangePickerRecentTab"
        >
          {mainPanelTexts.recentLabel}
        </EuiTab>
      </EuiTabs>

      {selectedTabId === 'presets' && (
        <OptionsList options={presets} showShorthand showExtraActions />
      )}
      {selectedTabId === 'recent' && <OptionsList options={recent} />}
    </>
  );
};

const SubPanelMenu = () => {
  const { navigateTo, panelDescriptors } = useDateRangePickerPanelNavigation();
  const euiThemeContext = useEuiTheme();
  const styles = mainPanelStyles(euiThemeContext);

  return (
    <ul css={styles.list}>
      <PanelNavItem
        onClick={() => navigateTo('calendar-panel')}
        icon="calendar"
        data-test-subj="dateRangePickerCalendarNavItem"
      >
        {mainPanelTexts.calendarPanelTitle}
      </PanelNavItem>
      <PanelNavItem
        onClick={() => navigateTo('custom-time-range-panel')}
        icon="controls"
        data-test-subj="dateRangePickerCustomRangeNavItem"
      >
        {mainPanelTexts.customTimeRangePanelTitle}
      </PanelNavItem>
      {panelDescriptors.map(({ id, title, icon }) => (
        <PanelNavItem key={id} onClick={() => navigateTo(id)} icon={icon}>
          {title}
        </PanelNavItem>
      ))}
    </ul>
  );
};

const DocumentationButton = () => {
  const { navigateTo } = useDateRangePickerPanelNavigation();
  const euiThemeContext = useEuiTheme();
  const styles = mainPanelStyles(euiThemeContext);

  return (
    <div css={styles.documentationButtonWrapper}>
      <EuiButton
        size="s"
        iconType="documentation"
        fullWidth
        onClick={() => navigateTo(DocumentationPanel.PANEL_ID)}
      >
        Discover allowed formats and shorthands
      </EuiButton>
    </div>
  );
};

export function MainPanel() {
  const { onPresetSave, timeRange, applyRange, timeZone, displayText } =
    useDateRangePickerContext();
  const { navigateTo } = useDateRangePickerPanelNavigation();
  const timeZoneDisplay = useTimeZoneDisplay(timeZone, timeRange.startDate);
  const euiThemeContext = useEuiTheme();

  const handlePresetSave = useCallback(() => {
    if (timeRange.isInvalid || !onPresetSave) return;
    // Persist the human-readable display text as the label (e.g. "Last 14 days",
    // "Feb 3 → Feb 10"). It is display-only: `getOptionInputText` and `prettifyValue`
    // re-derive editable input from `start`/`end`, so the label never has to round-trip
    // as input text — which keeps the idle button and the saved preset consistent.
    onPresetSave({ start: timeRange.start, end: timeRange.end, label: displayText });
    applyRange();
  }, [onPresetSave, applyRange, timeRange, displayText]);

  const styles = mainPanelStyles(euiThemeContext);
  const dividerStyles = panelDividerStyles(euiThemeContext);

  return (
    <PanelContainer data-test-subj="dateRangePickerMainPanel">
      <PanelBody fill>
        <PanelBodySection spacingSide="none" css={styles.presetsArea}>
          {timeRange.value === '' && <DocumentationButton />}
          <PresetsRecentTabs />
        </PanelBodySection>
        <PanelBodySection spacingSide="none" css={styles.bottomSection}>
          <hr css={dividerStyles.root} />
          <SubPanelMenu />
        </PanelBodySection>
      </PanelBody>
      <PanelFooter
        primaryAction={
          onPresetSave ? (
            <EuiToolTip content={mainPanelTexts.savePresetTooltip} disableScreenReaderOutput>
              <EuiButtonIcon
                aria-label={mainPanelTexts.savePresetTooltip}
                iconType="save"
                display="base"
                color="text"
                size="s"
                disabled={timeRange.isInvalid}
                data-test-subj="dateRangePickerSavePresetButton"
                onClick={handlePresetSave}
              />
            </EuiToolTip>
          ) : undefined
        }
      >
        <EuiToolTip content={mainPanelTexts.settingsAriaLabel} disableScreenReaderOutput>
          <EuiButtonIcon
            aria-label={mainPanelTexts.settingsAriaLabel}
            iconType="gear"
            display="base"
            color="text"
            size="s"
            data-test-subj="dateRangePickerSettingsButton"
            onClick={() => navigateTo(SettingsPanel.PANEL_ID)}
          />
        </EuiToolTip>
        {timeZoneDisplay && (
          <EuiText color="subdued" size="xs" component="span">
            {timeZoneDisplay}
          </EuiText>
        )}
      </PanelFooter>
    </PanelContainer>
  );
}
