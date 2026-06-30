/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiButtonGroupOptionProps } from '@elastic/eui';
import {
  EuiButtonGroup,
  EuiButtonIcon,
  EuiPopover,
  EuiSwitch,
  EuiToolTip,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import React, { useCallback, useEffect, useState } from 'react';
import { i18n } from '@kbn/i18n';
import type { monaco } from '@kbn/monaco';
import type { LayoutDirection } from '@kbn/workflows';
import { useWorkflowBottomBarState } from '@kbn/workflows-ui';

interface EditorSettingsPopoverProps {
  editorRef: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  graphDirection?: LayoutDirection;
  onGraphDirectionChange?: (next: LayoutDirection) => void;
  /**
   * "Hide controls menu" toggle. When true the bottom bar auto-collapses;
   * when false it stays expanded.
   */
  hideControlsMenu?: boolean;
  onHideControlsMenuChange?: (next: boolean) => void;
}

const directionOptions: EuiButtonGroupOptionProps[] = [
  {
    id: 'TB',
    iconType: 'arrowDown',
    label: i18n.translate('workflows.yamlEditor.editorSettings.directionVertical', {
      defaultMessage: 'Vertical',
    }),
  },
  {
    id: 'LR',
    iconType: 'arrowRight',
    label: i18n.translate('workflows.yamlEditor.editorSettings.directionHorizontal', {
      defaultMessage: 'Horizontal',
    }),
  },
];

const PANEL_CLASS = 'workflowEditorSettingsPopoverPanel';
const BUTTON_TEST_SUBJ = 'workflowYamlEditorSettingsButton';

export function EditorSettingsPopover({
  editorRef,
  graphDirection,
  onGraphDirectionChange,
  hideControlsMenu = true,
  onHideControlsMenuChange,
}: EditorSettingsPopoverProps) {
  const { euiTheme } = useEuiTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [showIndentGuides, setShowIndentGuides] = useState(true);
  const [showWhitespace, setShowWhitespace] = useState(false);

  // Close when the bottom bar auto-collapses to its small pill so the
  // floating panel doesn't sit orphaned over the canvas.
  const { isExpanded: isBottomBarExpanded } = useWorkflowBottomBarState();
  useEffect(() => {
    if (!isBottomBarExpanded) setIsOpen(false);
  }, [isBottomBarExpanded]);

  // EuiPopover's built-in outside-click detector listens on the bubble phase,
  // but React Flow / Monaco can swallow the event before it reaches the
  // document. Subscribing on the capture phase guarantees we see the
  // mousedown first and can close the panel ourselves.
  useEffect(() => {
    if (!isOpen) return undefined;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(`[data-test-subj="${BUTTON_TEST_SUBJ}"]`)) return;
      if (target.closest(`.${PANEL_CLASS}`)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [isOpen]);

  const popoverTitleId = useGeneratedHtmlId({ prefix: 'wf-editor-settings-title' });

  const handleIndentGuidesChange = useCallback(() => {
    setShowIndentGuides(!showIndentGuides);
    editorRef.current?.updateOptions({
      guides: { indentation: !showIndentGuides },
    });
  }, [editorRef, showIndentGuides]);

  const handleWhitespaceChange = useCallback(() => {
    setShowWhitespace(!showWhitespace);
    editorRef.current?.updateOptions({
      renderWhitespace: !showWhitespace ? 'all' : 'none',
    });
  }, [editorRef, showWhitespace]);

  const label = i18n.translate('workflows.yamlEditor.editorSettings.label', {
    defaultMessage: 'Settings',
  });
  const directionLabel = i18n.translate('workflows.yamlEditor.editorSettings.directionLabel', {
    defaultMessage: 'Direction',
  });

  return (
    <EuiPopover
      data-test-subj="workflowYamlEditorSettingsPopover"
      aria-labelledby={popoverTitleId}
      isOpen={isOpen}
      closePopover={() => setIsOpen(false)}
      anchorPosition="upCenter"
      panelPaddingSize="none"
      panelClassName={PANEL_CLASS}
      panelStyle={{ width: 269 }}
      button={
        <EuiToolTip content={label} disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="controlsHorizontal"
            size="s"
            data-test-subj={BUTTON_TEST_SUBJ}
            onClick={() => setIsOpen(!isOpen)}
            aria-label={label}
            color="text"
          />
        </EuiToolTip>
      }
    >
      {/* Header */}
      <div
        id={popoverTitleId}
        css={{
          padding: 12,
          fontSize: 14,
          fontWeight: 600,
          lineHeight: '20px',
          color: euiTheme.colors.title,
          borderBottom: `1px solid ${euiTheme.colors.lightShade}`,
        }}
      >
        {label}
      </div>

      {/* Editors section */}
      <Section
        title={i18n.translate('workflows.yamlEditor.editorSettings.editorSectionTitle', {
          defaultMessage: 'Editors',
        })}
      >
        <EuiSwitch
          compressed
          label={i18n.translate('workflows.yamlEditor.editorSettings.showIndentGuides', {
            defaultMessage: 'Show indent guides',
          })}
          labelProps={{ style: { color: euiTheme.colors.text, fontSize: 14, fontWeight: 400 } }}
          checked={showIndentGuides}
          onChange={handleIndentGuidesChange}
        />
        <EuiSwitch
          compressed
          label={i18n.translate('workflows.yamlEditor.editorSettings.showWhitespace', {
            defaultMessage: 'Show whitespace characters',
          })}
          labelProps={{ style: { color: euiTheme.colors.text, fontSize: 14, fontWeight: 400 } }}
          checked={showWhitespace}
          onChange={handleWhitespaceChange}
        />
      </Section>

      {/* Graph view section (only when the canvas exposes a direction) */}
      {graphDirection && onGraphDirectionChange && (
        <Section
          title={i18n.translate('workflows.yamlEditor.editorSettings.directionSectionTitle', {
            defaultMessage: 'Graph view',
          })}
          topBorder
        >
          <EuiButtonGroup
            legend={directionLabel}
            options={directionOptions}
            idSelected={graphDirection}
            onChange={(id) => onGraphDirectionChange(id as LayoutDirection)}
            buttonSize="compressed"
            isFullWidth
          />
        </Section>
      )}

      {/* Controls menu section — toggles the bottom bar's auto-collapse */}
      {onHideControlsMenuChange && (
        <Section
          title={i18n.translate('workflows.yamlEditor.editorSettings.controlsSectionTitle', {
            defaultMessage: 'Controls menu',
          })}
          topBorder
        >
          <EuiSwitch
            compressed
            label={i18n.translate('workflows.yamlEditor.editorSettings.hideControlsMenu', {
              defaultMessage: 'Hide controls menu',
            })}
            labelProps={{ style: { color: euiTheme.colors.text, fontSize: 14, fontWeight: 400 } }}
            checked={hideControlsMenu}
            onChange={(e) => onHideControlsMenuChange(e.target.checked)}
            data-test-subj="workflowHideControlsMenuSwitch"
          />
        </Section>
      )}
    </EuiPopover>
  );
}

function Section({
  title,
  topBorder,
  children,
}: {
  title: string;
  topBorder?: boolean;
  children: React.ReactNode;
}) {
  const { euiTheme } = useEuiTheme();
  return (
    <div
      css={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        borderTop: topBorder ? `1px solid ${euiTheme.colors.lightShade}` : undefined,
      }}
    >
      <div
        css={{
          fontSize: 12,
          fontWeight: 600,
          lineHeight: '16px',
          color: euiTheme.colors.title,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
