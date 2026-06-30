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
  EuiButtonIcon,
  EuiContextMenuPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiText,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import React, { useCallback, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { CodeEditor } from '@kbn/code-editor';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useWorkflowsMonacoTheme, WORKFLOWS_MONACO_EDITOR_THEME } from '@kbn/workflows-ui';
import type { StepInfo } from '@kbn/workflows-yaml';
import { setCursorPosition } from '../../../entities/workflows/store/workflow_detail/slice';
import { StepIcon } from '../../../shared/ui/step_icons/step_icon';
import {
  CopyDevToolsOption,
  CopyWorkflowStepJsonOption,
  CopyWorkflowStepOption,
} from '../../../widgets/workflow_yaml_editor/ui/step_action_options';

export type FlyoutTarget =
  | { kind: 'step'; stepName: string; stepInfo?: StepInfo }
  | {
      kind: 'trigger';
      triggerType: string;
      triggerLabel: string;
      yamlSnippet: string;
    };

interface Props {
  readonly target: FlyoutTarget;
  readonly editorYaml: string;
  readonly canExecuteWorkflow: boolean;
  readonly isYamlValid: boolean;
  readonly onClose: () => void;
  readonly onOpenInYaml: () => void;
  readonly onRunStep: () => void;
}

function extractYamlSlice(editorYaml: string, stepInfo: StepInfo | undefined): string {
  if (!stepInfo) return '';
  const lines = editorYaml.split('\n');
  return lines.slice(Math.max(0, stepInfo.lineStart - 1), stepInfo.lineEnd).join('\n');
}

export function WorkflowVisualEditorFlyout({
  target,
  editorYaml,
  canExecuteWorkflow,
  isYamlValid,
  onClose,
  onOpenInYaml,
  onRunStep,
}: Props) {
  // Register the workflows Monaco theme so the CodeEditor below renders with
  // the same colors as the main YAML editor.
  useWorkflowsMonacoTheme();
  const { euiTheme } = useEuiTheme();
  const dispatch = useDispatch();
  const isTrigger = target.kind === 'trigger';
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);
  const openMenu = useCallback(() => {
    // Update the global focused-step state so the menu options pick up
    // this step from Redux (they read selectEditorFocusedStepInfo).
    if (target.kind === 'step' && target.stepInfo?.lineStart != null) {
      dispatch(setCursorPosition({ lineNumber: target.stepInfo.lineStart, column: 1 }));
    }
    setIsMenuOpen(true);
  }, [dispatch, target]);

  const title =
    target.kind === 'step' ? target.stepInfo?.stepId ?? target.stepName : target.triggerLabel;
  const subtitle =
    target.kind === 'step' ? target.stepInfo?.stepType : `trigger / ${target.triggerType}`;
  const iconStepType =
    target.kind === 'step' ? target.stepInfo?.stepType ?? 'package' : target.triggerType;

  const yamlSlice = useMemo(() => {
    if (target.kind === 'trigger') return target.yamlSnippet;
    return extractYamlSlice(editorYaml, target.stepInfo);
  }, [target, editorYaml]);

  const runDisabled = isTrigger || !canExecuteWorkflow || !isYamlValid;
  const runDisabledReason = isTrigger
    ? i18n.translate('workflows.visualEditor.flyout.runDisabledTrigger', {
        defaultMessage: 'Triggers cannot be run individually.',
      })
    : !canExecuteWorkflow
    ? i18n.translate('workflows.visualEditor.flyout.runDisabledNoCapability', {
        defaultMessage: 'You do not have permission to run workflows.',
      })
    : !isYamlValid
    ? i18n.translate('workflows.visualEditor.flyout.runDisabledInvalidYaml', {
        defaultMessage: 'Fix YAML errors to run this step.',
      })
    : i18n.translate('workflows.visualEditor.flyout.runStep', {
        defaultMessage: 'Run step',
      });

  return (
    <div
      data-test-subj="workflowVisualEditorFlyout"
      css={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: euiTheme.colors.backgroundBasePlain,
        borderRadius: 8,
        overflow: 'hidden',
        border: `1px solid ${euiTheme.colors.borderBasePlain}`,
      }}
    >
      {/* Header */}
      <div
        css={{
          height: 76,
          padding: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          borderBottom: `1px solid ${euiTheme.colors.borderBasePlain}`,
          flexShrink: 0,
        }}
      >
        <EuiFlexGroup
          alignItems="center"
          gutterSize="m"
          responsive={false}
          css={{ minWidth: 0, flex: '1 1 auto' }}
        >
          <EuiFlexItem grow={false}>
            <div
              css={{
                width: 40,
                height: 40,
                // Same light-gray inner-box stroke the graph step uses
                // (Figma FIGMA_STEP_INNER_BOX_BORDER) so the flyout header
                // visually echoes the row that opened it.
                border: `1px solid #e4e7f1`,
                borderRadius: 8,
                background: euiTheme.colors.backgroundBasePlain,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <StepIcon stepType={iconStepType} executionStatus={undefined} size="m" />
            </div>
          </EuiFlexItem>
          <EuiFlexItem css={{ minWidth: 0 }}>
            <div
              css={{
                fontFamily: euiTheme.font.family,
                fontSize: 14,
                fontWeight: 600,
                lineHeight: '20px',
                color: euiTheme.colors.textHeading,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={title}
            >
              {title}
            </div>
            {subtitle && (
              <div
                css={{
                  fontFamily: euiTheme.font.family,
                  fontSize: 12,
                  fontWeight: 400,
                  lineHeight: '20px',
                  color: euiTheme.colors.textSubdued,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={subtitle}
              >
                {subtitle}
              </div>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiFlexGroup
          alignItems="center"
          gutterSize="s"
          responsive={false}
          css={{ flex: '0 0 auto', marginLeft: 'auto' }}
        >
          <EuiFlexItem grow={false}>
            <EuiToolTip content={runDisabledReason}>
              <EuiButtonIcon
                iconType="play"
                color="text"
                size="s"
                onClick={onRunStep}
                isDisabled={runDisabled}
                aria-label={i18n.translate('workflows.visualEditor.flyout.runStep.aria', {
                  defaultMessage: 'Run step',
                })}
                data-test-subj="workflowVisualEditorFlyoutRunStep"
              />
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiPopover
              isOpen={isMenuOpen}
              closePopover={closeMenu}
              panelPaddingSize="none"
              anchorPosition="downRight"
              button={
                <EuiButtonIcon
                  iconType="boxesHorizontal"
                  color="text"
                  size="s"
                  aria-label={i18n.translate('workflows.visualEditor.flyout.more', {
                    defaultMessage: 'More actions',
                  })}
                  onClick={() => (isMenuOpen ? closeMenu() : openMenu())}
                  isDisabled={target.kind !== 'step'}
                  data-test-subj="workflowVisualEditorFlyoutMore"
                />
              }
            >
              <EuiContextMenuPanel
                items={(() => {
                  const items: JSX.Element[] = [];
                  if (target.kind === 'step') {
                    const stepType = target.stepInfo?.stepType ?? '';
                    if (stepType.startsWith('elasticsearch.') || stepType.startsWith('kibana.')) {
                      items.push(<CopyDevToolsOption key="copy-as-console" onClick={closeMenu} />);
                    }
                    items.push(
                      <CopyWorkflowStepOption key="copy-as-yaml" onClick={closeMenu} />,
                      <CopyWorkflowStepJsonOption key="copy-as-json" onClick={closeMenu} />
                    );
                  }
                  return items;
                })()}
              />
            </EuiPopover>
          </EuiFlexItem>
          <EuiFlexItem
            grow={false}
            css={{
              width: 1,
              height: 32,
              background: euiTheme.colors.borderBasePlain,
              margin: '0 4px',
            }}
          />
          <EuiFlexItem grow={false}>
            <EuiButtonIcon
              iconType="cross"
              color="text"
              size="s"
              onClick={onClose}
              aria-label={i18n.translate('workflows.visualEditor.flyout.close', {
                defaultMessage: 'Close',
              })}
              data-test-subj="workflowVisualEditorFlyoutClose"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </div>

      {/* Body */}
      <div
        css={{
          flex: '1 1 auto',
          overflow: 'hidden',
          background: euiTheme.colors.backgroundBaseSubdued,
        }}
        data-test-subj="workflowVisualEditorFlyoutYamlSlice"
      >
        {yamlSlice ? (
          <CodeEditor
            languageId="yaml"
            value={yamlSlice}
            height="100%"
            width="100%"
            options={{
              readOnly: true,
              lineNumbers: 'on',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              folding: false,
              fontSize: 12,
              renderLineHighlight: 'none',
              theme: WORKFLOWS_MONACO_EDITOR_THEME,
              padding: { top: 12, bottom: 12 },
            }}
          />
        ) : (
          <div css={{ padding: 16 }}>
            <EuiText size="s" color="subdued">
              <FormattedMessage
                id="workflows.visualEditor.flyout.unavailable"
                defaultMessage="Step details unavailable. The YAML may have errors."
              />
            </EuiText>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        css={{
          height: 53,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderTop: `1px solid ${euiTheme.colors.borderBasePlain}`,
          flexShrink: 0,
          background: euiTheme.colors.backgroundBasePlain,
        }}
      >
        <EuiButtonEmpty
          size="m"
          iconType="plusInCircle"
          onClick={onOpenInYaml}
          data-test-subj="workflowVisualEditorFlyoutOpenInYaml"
        >
          <FormattedMessage
            id="workflows.visualEditor.flyout.openInYaml"
            defaultMessage="Open in YAML editor"
          />
        </EuiButtonEmpty>
      </div>
    </div>
  );
}
