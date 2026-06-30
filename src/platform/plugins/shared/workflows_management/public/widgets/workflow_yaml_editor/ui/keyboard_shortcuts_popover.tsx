/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButtonIcon,
  EuiPopover,
  EuiToolTip,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { isMac } from '@kbn/shared-ux-utility';
import { useWorkflowBottomBarState } from '@kbn/workflows-ui';

const COMMAND_KEY = isMac ? '⌘' : 'Ctrl';

const shortcuts: Array<{ label: string; keys: string[] }> = [
  {
    label: i18n.translate('workflows.yamlEditor.shortcuts.run', {
      defaultMessage: 'Run workflow',
    }),
    keys: [COMMAND_KEY, 'Enter'],
  },
  {
    label: i18n.translate('workflows.yamlEditor.shortcuts.saveAndRun', {
      defaultMessage: 'Save and run',
    }),
    keys: [COMMAND_KEY, 'Shift', 'Enter'],
  },
  {
    label: i18n.translate('workflows.yamlEditor.shortcuts.save', {
      defaultMessage: 'Save',
    }),
    keys: [COMMAND_KEY, 'S'],
  },
  {
    label: i18n.translate('workflows.yamlEditor.shortcuts.comment', {
      defaultMessage: 'Comment/uncomment',
    }),
    keys: [COMMAND_KEY, '/'],
  },
  {
    label: i18n.translate('workflows.yamlEditor.shortcuts.actionsMenu', {
      defaultMessage: 'Open actions menu',
    }),
    keys: [COMMAND_KEY, 'K'],
  },
  {
    label: i18n.translate('workflows.yamlEditor.shortcuts.find', {
      defaultMessage: 'Find',
    }),
    keys: [COMMAND_KEY, 'F'],
  },
];

const PANEL_CLASS = 'workflowKeyboardShortcutsPopoverPanel';
const BUTTON_TEST_SUBJ = 'workflowYamlEditorKeyboardShortcutsButton';

export function KeyboardShortcutsPopover() {
  const { euiTheme } = useEuiTheme();
  const [isOpen, setIsOpen] = useState(false);
  const popoverTitleId = useGeneratedHtmlId();

  const label = i18n.translate('workflows.yamlEditor.shortcuts.label', {
    defaultMessage: 'Keyboard shortcuts',
  });

  // Close the popover when the bottom bar auto-collapses to its small pill —
  // the anchor button is no longer visible, so the floating panel would
  // otherwise sit orphaned on the canvas.
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

  return (
    <EuiPopover
      data-test-subj="workflowYamlEditorKeyboardShortcutsPopover"
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
            size="s"
            iconType="keyboard"
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
      {/* Body */}
      <div css={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {shortcuts.map(({ label: shortcutLabel, keys }) => (
          <div
            key={shortcutLabel}
            css={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              minHeight: 24,
            }}
          >
            <span
              css={{
                fontSize: 12,
                fontWeight: 400,
                lineHeight: '24px',
                color: euiTheme.colors.text,
              }}
            >
              {shortcutLabel}
            </span>
            <span css={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
              {keys.map((key) => (
                <kbd
                  key={key}
                  css={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 20,
                    height: 16,
                    paddingInline: 6,
                    paddingBlock: 3,
                    background: euiTheme.colors.emptyShade,
                    border: `1px solid ${euiTheme.colors.mediumShade}`,
                    borderRadius: 3,
                    fontFamily: 'inherit',
                    fontSize: 10,
                    fontWeight: 500,
                    lineHeight: 1,
                    color: euiTheme.colors.subduedText,
                  }}
                >
                  {key}
                </kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </EuiPopover>
  );
}
