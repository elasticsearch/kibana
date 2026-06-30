/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FunctionComponent } from 'react';
import React, { useState } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { css } from '@emotion/react';
import {
  EuiTitle,
  EuiDescriptionList,
  EuiDescriptionListTitle,
  EuiDescriptionListDescription,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCodeBlock,
  EuiToolTip,
  EuiText,
  EuiSpacer,
  EuiSplitPanel,
  EuiIcon,
  EuiButtonIcon,
  EuiPopover,
  EuiContextMenu,
  EuiButton,
  EuiButtonEmpty,
  useEuiTheme,
  EuiBadge,
  EuiSkeletonTitle,
  EuiSkeletonText,
  EuiSkeletonRectangle,
} from '@elastic/eui';

import type { FieldAccessPattern, Pipeline } from '../../../../../common/types';

import { deprecatedPipelineBadge } from '../table';
import { PipelineDetailsJsonBlock } from '../details_json_block';
import { stringifyJson } from '../../../lib/utils';

export interface Props {
  pipeline: Pipeline;
  isLoading: boolean;
  onEditClick: (pipelineName: string) => void;
  onCloneClick: (pipelineName: string) => void;
  onDeleteClick: (pipelineName: Pipeline[]) => void;
  renderActions: boolean;
  renderViewTreeButton: boolean;
  onViewTreeClick: () => void;
}

const useStyles = () => {
  const { euiTheme } = useEuiTheme();

  return {
    deleteAction: css`
      color: ${euiTheme.colors.dangerText};
    `,
    contextMenu: css`
      width: 150px;
    `,
    badge: css`
      margin-left: ${euiTheme.size.s};
      border-radius: 999px;
      text-transform: uppercase;
      font-size: 0.75rem;
      font-weight: ${euiTheme.font.weight.medium};
      padding: 0 ${euiTheme.size.m};
    `,
  };
};

export const DetailsPanel: FunctionComponent<Props> = ({
  pipeline,
  isLoading,
  onEditClick,
  onCloneClick,
  onDeleteClick,
  renderActions,
  renderViewTreeButton,
  onViewTreeClick,
}) => {
  const styles = useStyles();
  const [showPopover, setShowPopover] = useState(false);
  const popoverActions = [
    /**
     * Duplicate pipeline
     */
    {
      name: i18n.translate('xpack.ingestPipelines.list.pipelineDetails.duplicateActionLabel', {
        defaultMessage: 'Duplicate',
      }),
      icon: <EuiIcon type="copy" aria-hidden={true} />,
      onClick: () => onCloneClick(pipeline.name),
    },
    /**
     * Delete pipeline
     */
    {
      name: i18n.translate('xpack.ingestPipelines.list.pipelineDetails.deleteActionLabel', {
        defaultMessage: 'Delete',
      }),
      icon: <EuiIcon type="trash" aria-hidden={true} />,
      'data-test-subj': 'deletePipelineButton',
      onClick: () => {
        setShowPopover(false);
        onDeleteClick([pipeline]);
      },
      css: styles.deleteAction,
    },
  ];

  const actionsPopoverButton = (
    <EuiToolTip
      content={i18n.translate(
        'xpack.ingestPipelines.list.pipelineDetails.popoverPipelineActionsAriaLabel',
        {
          defaultMessage: 'Other actions',
        }
      )}
      disableScreenReaderOutput
    >
      <EuiButtonIcon
        display="base"
        size="m"
        data-test-subj="actionsPopoverButton"
        aria-label={i18n.translate(
          'xpack.ingestPipelines.list.pipelineDetails.popoverPipelineActionsAriaLabel',
          {
            defaultMessage: 'Other actions',
          }
        )}
        onClick={() => setShowPopover((previousBool) => !previousBool)}
        iconType="boxesVertical"
      />
    </EuiToolTip>
  );

  const fieldAccessPatternLabels: Record<FieldAccessPattern, string> = {
    classic: i18n.translate(
      'xpack.ingestPipelines.list.pipelineDetails.fieldAccessPatternClassic',
      {
        defaultMessage: 'Classic',
      }
    ),
    flexible: i18n.translate(
      'xpack.ingestPipelines.list.pipelineDetails.fieldAccessPatternFlexible',
      {
        defaultMessage: 'Flexible',
      }
    ),
  };

  return (
    <EuiSplitPanel.Inner grow={true} paddingSize="none">
      <EuiSplitPanel.Outer hasShadow={false} grow={true} css={{ height: '100%' }}>
        <EuiSplitPanel.Inner style={{ overflowY: 'auto' }} paddingSize="l" grow={true}>
          <EuiSkeletonTitle isLoading={isLoading}>
            <EuiTitle id="pipelineDetailsFlyoutTitle" data-test-subj="detailsPanelTitle">
              <h2>{pipeline.name}</h2>
            </EuiTitle>
          </EuiSkeletonTitle>

          <EuiSpacer size="s" />

          <EuiFlexGroup alignItems="center" gutterSize="none">
            {/* Pipeline version */}
            {pipeline.version && (
              <EuiFlexItem grow={false}>
                <EuiSkeletonText isLoading={isLoading} lines={1} size="s">
                  <EuiText color="subdued" size="s">
                    {i18n.translate('xpack.ingestPipelines.list.pipelineDetails.versionTitle', {
                      defaultMessage: 'Version',
                    })}{' '}
                    {String(pipeline.version)}
                  </EuiText>
                </EuiSkeletonText>
              </EuiFlexItem>
            )}

            {/* Managed badge*/}
            {pipeline.isManaged && (
              <EuiFlexItem grow={false}>
                <EuiSkeletonText isLoading={isLoading} lines={1} size="s">
                  <EuiBadge color="hollow" css={styles.badge}>
                    {i18n.translate(
                      'xpack.ingestPipelines.list.pipelineDetails.managedBadgeLabel',
                      {
                        defaultMessage: 'Managed',
                      }
                    )}
                  </EuiBadge>
                </EuiSkeletonText>
              </EuiFlexItem>
            )}

            {/* Deprecated badge*/}
            {pipeline.deprecated && (
              <EuiFlexItem grow={false}>
                <EuiToolTip content={deprecatedPipelineBadge.badgeTooltip}>
                  <EuiSkeletonText isLoading={isLoading} lines={1} size="s">
                    <EuiBadge color="hollow" css={styles.badge}>
                      {deprecatedPipelineBadge.badge}
                    </EuiBadge>
                  </EuiSkeletonText>
                </EuiToolTip>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>

          <EuiSpacer size="s" />

          <EuiDescriptionList rowGutterSize="m">
            {/* Pipeline description */}
            {pipeline.description && (
              <>
                <EuiDescriptionListTitle />
                <EuiDescriptionListDescription>
                  <EuiSkeletonText isLoading={isLoading} lines={1} size="s">
                    {pipeline.description}
                  </EuiSkeletonText>
                </EuiDescriptionListDescription>
              </>
            )}

            {/* Field access pattern */}
            {pipeline.field_access_pattern && (
              <>
                <EuiSpacer size="m" />
                <EuiSkeletonText isLoading={isLoading} lines={1} size="s">
                  <EuiText size="s" data-test-subj="fieldAccessPatternValue">
                    <FormattedMessage
                      id="xpack.ingestPipelines.list.pipelineDetails.fieldAccessPatternTitle"
                      defaultMessage="{label}: {pattern}"
                      values={{
                        label: (
                          <strong>
                            <FormattedMessage
                              id="xpack.ingestPipelines.list.pipelineDetails.fieldAccessPatternLabel"
                              defaultMessage="Field access pattern"
                            />
                          </strong>
                        ),
                        pattern: fieldAccessPatternLabels[pipeline.field_access_pattern],
                      }}
                    />
                  </EuiText>
                </EuiSkeletonText>

                <EuiSpacer size="s" />
              </>
            )}

            {/* Processors JSON */}
            <EuiDescriptionListTitle>
              <EuiSkeletonText isLoading={isLoading} lines={1} size="s">
                {i18n.translate('xpack.ingestPipelines.list.pipelineDetails.processorsTitle', {
                  defaultMessage: 'Processors',
                })}
              </EuiSkeletonText>
            </EuiDescriptionListTitle>
            <EuiDescriptionListDescription>
              <EuiSkeletonRectangle isLoading={isLoading} height={1}>
                <PipelineDetailsJsonBlock json={pipeline.processors} />
              </EuiSkeletonRectangle>
            </EuiDescriptionListDescription>

            {/* On Failure Processor JSON */}
            {pipeline.on_failure?.length && (
              <>
                <EuiDescriptionListTitle>
                  <EuiSkeletonText isLoading={isLoading} lines={1} size="s">
                    {i18n.translate(
                      'xpack.ingestPipelines.list.pipelineDetails.failureProcessorsTitle',
                      {
                        defaultMessage: 'Failure processors',
                      }
                    )}
                  </EuiSkeletonText>
                </EuiDescriptionListTitle>
                <EuiDescriptionListDescription>
                  <EuiSkeletonRectangle isLoading={isLoading} height={1}>
                    <PipelineDetailsJsonBlock json={pipeline.on_failure} />
                  </EuiSkeletonRectangle>
                </EuiDescriptionListDescription>
              </>
            )}

            {/* Metadata (optional) */}
            {pipeline._meta && (
              <>
                <EuiDescriptionListTitle data-test-subj="metaTitle">
                  <EuiSkeletonText isLoading={isLoading} lines={1} size="s">
                    <FormattedMessage
                      id="xpack.ingestPipelines.list.pipelineDetails.metaDescriptionListTitle"
                      defaultMessage="Metadata"
                    />
                  </EuiSkeletonText>
                </EuiDescriptionListTitle>
                <EuiDescriptionListDescription>
                  <EuiSkeletonRectangle isLoading={isLoading} height={1}>
                    <EuiCodeBlock language="json">
                      {stringifyJson(pipeline._meta, false)}
                    </EuiCodeBlock>
                  </EuiSkeletonRectangle>
                </EuiDescriptionListDescription>
              </>
            )}
          </EuiDescriptionList>
        </EuiSplitPanel.Inner>

        <EuiSkeletonRectangle isLoading={isLoading} height={1}>
          <EuiSplitPanel.Inner color="subdued" grow={false}>
            <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
              {renderViewTreeButton && (
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    onClick={onViewTreeClick}
                    flush="left"
                    data-test-subj="viewTreeButton"
                  >
                    {i18n.translate('xpack.ingestPipelines.list.pipelineDetails.viewTreeLabel', {
                      defaultMessage: 'View full hierarchy',
                    })}
                  </EuiButtonEmpty>
                </EuiFlexItem>
              )}
              {renderActions && (
                <EuiFlexGroup
                  gutterSize="s"
                  alignItems="center"
                  justifyContent="flexEnd"
                  responsive={false}
                >
                  <EuiFlexItem grow={false}>
                    <EuiButton
                      data-test-subj="editPipelineButton"
                      aria-label={i18n.translate(
                        'xpack.ingestPipelines.list.pipelineDetails.editPipelineActionsAriaLabel',
                        {
                          defaultMessage: 'Edit pipeline',
                        }
                      )}
                      onClick={() => onEditClick(pipeline.name)}
                    >
                      {i18n.translate(
                        'xpack.ingestPipelines.list.pipelineDetails.editPipelineButtonLabel',
                        {
                          defaultMessage: 'Edit pipeline',
                        }
                      )}
                    </EuiButton>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiPopover
                      isOpen={showPopover}
                      closePopover={() => setShowPopover(false)}
                      button={actionsPopoverButton}
                      panelPaddingSize="none"
                      repositionOnScroll
                      aria-label={i18n.translate(
                        'xpack.ingestPipelines.list.pipelineDetails.actionsPopoverAriaLabel',
                        { defaultMessage: 'Pipeline actions' }
                      )}
                    >
                      <EuiContextMenu
                        initialPanelId={0}
                        panels={[
                          {
                            id: 0,
                            items: popoverActions,
                          },
                        ]}
                        css={styles.contextMenu}
                      />
                    </EuiPopover>
                  </EuiFlexItem>
                </EuiFlexGroup>
              )}
            </EuiFlexGroup>
          </EuiSplitPanel.Inner>
        </EuiSkeletonRectangle>
      </EuiSplitPanel.Outer>
    </EuiSplitPanel.Inner>
  );
};
