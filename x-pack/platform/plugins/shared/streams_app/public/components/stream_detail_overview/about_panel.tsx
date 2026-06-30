/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFocusTrap,
  EuiLink,
  EuiMarkdownFormat,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { AiButtonEmpty } from '@kbn/shared-ux-ai-components';
import { Streams } from '@kbn/streams-schema';
import { STREAMS_UI_PRIVILEGES } from '@kbn/streams-plugin/public';
import { omit } from 'lodash';
import { useKibana } from '../../hooks/use_kibana';
import { useGenerateDescription } from '../../hooks/use_generate_description';
import { useStreamDetail } from '../../hooks/use_stream_detail';
import { useStreamsPrivileges } from '../../hooks/use_streams_privileges';
import { useUpdateStreams } from '../../hooks/use_update_streams';
import { getFormattedError } from '../../util/errors';
import markdownMark from '../asset_image/markdown_mark_light.svg';
import { EditQueryStreamFlyout } from '../query_streams/edit_query_stream_flyout';

export function AboutPanel() {
  const {
    core: { notifications },
  } = useKibana();

  const { definition, refresh } = useStreamDetail();
  const { description } = definition.stream;

  const updateStream = useUpdateStreams(definition.stream.name);

  const queryStream = Streams.QueryStream.GetResponse.is(definition) ? definition : null;
  const streamsPrivileges = useStreamsPrivileges();
  const canManageQueryStream = queryStream
    ? streamsPrivileges.ui[STREAMS_UI_PRIVILEGES.manage]
    : false;
  const canManageIngestStream =
    Streams.ingest.all.GetResponse.is(definition) && definition.privileges.manage;

  const canEditDescription = canManageQueryStream || canManageIngestStream;

  const {
    generate: generateDescription,
    isLoading: isGenerating,
    isAvailable: isAIAvailable,
    hasConnector,
  } = useGenerateDescription(definition.stream.name);

  const [isEditing, setIsEditing] = useState(false);
  const [isEditQueryFlyoutOpen, setIsEditQueryFlyoutOpen] = useState(false);
  const [isExpanded, setExpanded] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState(description ?? '');

  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleClick = () => {
    if (!isEditing) {
      setIsEditing(true);
    }
  };

  const saveDescription = useCallback(
    async (newDescription: string) => {
      const stream = Streams.ingest.all.Definition.is(definition.stream)
        ? {
            ...omit(definition.stream, ['name', 'updated_at']),
            ingest: {
              ...definition.stream.ingest,
              processing: omit(definition.stream.ingest.processing, ['updated_at']),
            },
          }
        : omit(definition.stream, ['name', 'updated_at']);
      try {
        await updateStream(
          Streams.all.UpsertRequest.parse({
            dashboards: definition.dashboards,
            rules: definition.rules,
            stream: { ...stream, description: newDescription },
          })
        );
        notifications.toasts.addSuccess({
          title: i18n.translate('xpack.streams.streamOverview.aboutPanel.saveDescriptionSuccess', {
            defaultMessage: 'Description saved',
          }),
        });
        refresh();
      } catch (error) {
        notifications.toasts.addError(getFormattedError(error), {
          title: i18n.translate('xpack.streams.streamOverview.aboutPanel.saveDescriptionError', {
            defaultMessage: 'Failed to save description',
          }),
        });
      } finally {
        setIsEditing(false);
      }
    },
    [definition, updateStream, notifications, refresh]
  );

  useEffect(() => {
    if (!isEditing) {
      setDescriptionValue(description ?? '');
    }
  }, [description, isEditing]);

  useEffect(() => {
    if (isEditing && textAreaRef.current) {
      const node = textAreaRef.current;
      node.focus();
      node.setSelectionRange(node.value.length, node.value.length);
    }
  }, [isEditing]);

  useEffect(() => {
    const handleKeyup = (e: KeyboardEvent) => {
      if (!isEditing) return;
      if (e.key === 'Escape') {
        setIsEditing(false);
      }
    };
    window.addEventListener('keyup', handleKeyup);
    return () => window.removeEventListener('keyup', handleKeyup);
  }, [isEditing]);

  return (
    <>
      <EuiFocusTrap disabled={!isEditing} onClickOutside={() => setIsEditing(false)}>
        <EuiPanel
          hasBorder
          hasShadow={false}
          paddingSize="m"
          css={css`
            overflow: hidden;
            &:hover,
            &:active,
            &:focus {
              box-shadow: none;
              transform: translateY(0);
            }
            &:is(:hover, :active, :focus, :focus-within) .aboutPanel__editButton {
              opacity: 1;
            }
          `}
        >
          <EuiFlexGroup gutterSize="none" responsive={false}>
            <EuiFlexItem grow>
              <EuiTitle size="xs">
                <h2>
                  {i18n.translate('xpack.streams.streamOverview.aboutPanel.title', {
                    defaultMessage: 'About this stream',
                  })}
                </h2>
              </EuiTitle>
            </EuiFlexItem>

            {canEditDescription && !isEditing && (
              <EuiFlexItem
                grow={false}
                className="aboutPanel__editButton"
                css={css`
                  opacity: 0;
                  transition: opacity 150ms;
                `}
              >
                <EuiToolTip
                  content={i18n.translate(
                    'xpack.streams.streamOverview.aboutPanel.editDescriptionAriaLabel',
                    { defaultMessage: 'Edit description' }
                  )}
                  disableScreenReaderOutput
                >
                  <EuiButtonIcon
                    iconType="pencil"
                    aria-label={i18n.translate(
                      'xpack.streams.streamOverview.aboutPanel.editDescriptionAriaLabel',
                      { defaultMessage: 'Edit description' }
                    )}
                    onClick={handleClick}
                  />
                </EuiToolTip>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>

          <EuiSpacer size="s" />

          {/* Edit mode: textarea + save/cancel */}
          {isEditing && canEditDescription && (
            <EuiPanel hasBorder hasShadow={false} paddingSize="none">
              <EuiTextArea
                css={css`
                  border: none;
                  border-bottom-left-radius: 0;
                  border-bottom-right-radius: 0;
                  height: ${descriptionValue.length > 200 ? '280px' : '100px'};
                `}
                fullWidth
                placeholder={i18n.translate(
                  'xpack.streams.streamOverview.aboutPanel.descriptionPlaceholder',
                  { defaultMessage: 'Enter a description for this stream' }
                )}
                aria-label={i18n.translate(
                  'xpack.streams.streamOverview.aboutPanel.descriptionInputAriaLabel',
                  { defaultMessage: 'Edit stream description' }
                )}
                disabled={isGenerating}
                value={descriptionValue}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void saveDescription(descriptionValue.trim());
                  }
                }}
                onChange={(e) => setDescriptionValue(e.target.value)}
                inputRef={textAreaRef}
              />
              <EuiPanel hasBorder={false} hasShadow={false} paddingSize="xs" color="subdued">
                <EuiFlexGroup
                  alignItems="center"
                  justifyContent="flexStart"
                  gutterSize="s"
                  responsive={false}
                >
                  <EuiFlexItem grow={false}>
                    <EuiToolTip
                      content={
                        !hasConnector
                          ? i18n.translate(
                              'xpack.streams.aboutPanel.generateDescription.noConnectorTooltip',
                              {
                                defaultMessage:
                                  'Configure an AI connector to generate a description automatically.',
                              }
                            )
                          : undefined
                      }
                    >
                      <AiButtonEmpty
                        size="xs"
                        iconSide="left"
                        iconType="sparkles"
                        isDisabled={!isAIAvailable || !hasConnector || isGenerating}
                        isLoading={isGenerating}
                        onClick={() => {
                          void generateDescription()
                            .then((generated) => {
                              if (generated) {
                                setDescriptionValue(generated);
                              }
                            })
                            .catch((error) => {
                              notifications.toasts.addError(getFormattedError(error), {
                                title: i18n.translate(
                                  'xpack.streams.streamOverview.aboutPanel.generateDescriptionError',
                                  { defaultMessage: 'Failed to generate description' }
                                ),
                              });
                            });
                        }}
                      >
                        {i18n.translate('xpack.streams.aboutPanel.p.helpMeGenerateALabel', {
                          defaultMessage: 'Help me generate a description',
                        })}
                      </AiButtonEmpty>
                    </EuiToolTip>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <img
                      css={css`
                        max-width: min-content;
                      `}
                      src={markdownMark}
                      alt="Markdown"
                      height={16}
                    />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty
                      size="xs"
                      onClick={() => void saveDescription(descriptionValue.trim())}
                    >
                      {i18n.translate('xpack.streams.aboutPanel.saveButtonLabel', {
                        defaultMessage: 'Save',
                      })}
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiPanel>
            </EuiPanel>
          )}

          {/* Read mode: render saved description with an edit button */}
          {!isEditing && description && (
            <>
              <EuiMarkdownFormat
                textSize="s"
                color="subdued"
                css={css`
                  height: ${isExpanded ? 'auto' : '40px'};
                  overflow: hidden;
                `}
              >
                {description}
              </EuiMarkdownFormat>
              {description.length > 120 ? (
                <EuiButtonEmpty
                  flush="both"
                  css={css`
                    block-size: 28px;
                  `}
                  onClick={(e: React.MouseEvent) => {
                    setExpanded(!isExpanded);
                    e.stopPropagation();
                  }}
                >
                  <>
                    {!isExpanded &&
                      i18n.translate('xpack.streams.aboutPanel.readMoreButtonEmptyLabel', {
                        defaultMessage: 'Read more',
                      })}

                    {isExpanded &&
                      i18n.translate('xpack.streams.aboutPanel.readLessButtonEmptyLabel', {
                        defaultMessage: 'Read less',
                      })}
                  </>
                </EuiButtonEmpty>
              ) : null}
            </>
          )}

          {/* Empty state: invite the user to add a description */}
          {!isEditing && !description && canEditDescription && (
            <EuiText size="s" color="subdued">
              <FormattedMessage
                id="xpack.streams.streamOverview.aboutPanel.contentLabel"
                defaultMessage="{button} to help identify this stream."
                values={{
                  button: (
                    <EuiLink type="button" onClick={() => setIsEditing(true)}>
                      {i18n.translate('xpack.streams.streamOverview.aboutPanel.enterDescription', {
                        defaultMessage: 'Enter description',
                      })}
                    </EuiLink>
                  ),
                }}
              />
            </EuiText>
          )}

          {/* Always show the ES|QL source for query streams */}
          {queryStream && (
            <>
              {(isEditing || description || canEditDescription) && <EuiSpacer size="m" />}
              <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" gutterSize="s">
                <EuiFlexItem>
                  <EuiText size="xs" color="subdued">
                    <strong>
                      {i18n.translate('xpack.streams.streamOverview.aboutPanel.queryTitle', {
                        defaultMessage: 'Query',
                      })}
                    </strong>
                  </EuiText>
                </EuiFlexItem>
                {canManageQueryStream && (
                  <EuiFlexItem
                    grow={false}
                    className="aboutPanel__editButton"
                    css={css`
                      opacity: 0;
                      transition: opacity 150ms;
                    `}
                  >
                    <EuiToolTip
                      content={i18n.translate(
                        'xpack.streams.streamOverview.aboutPanel.editQueryButtonLabel',
                        {
                          defaultMessage: 'Edit query',
                        }
                      )}
                      disableScreenReaderOutput
                    >
                      <EuiButtonIcon
                        iconType="pencil"
                        aria-label={i18n.translate(
                          'xpack.streams.streamOverview.aboutPanel.editQueryButtonLabel',
                          {
                            defaultMessage: 'Edit query',
                          }
                        )}
                        onClick={() => setIsEditQueryFlyoutOpen(true)}
                        data-test-subj="queryStreamDetailsEditQueryButton"
                      />
                    </EuiToolTip>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
              <EuiSpacer size="s" />
              <EuiCodeBlock
                language="esql"
                isCopyable
                paddingSize="m"
                overflowHeight={200}
                data-test-subj="queryStreamDetailsQueryViewerCodeBlock"
              >
                {queryStream.stream.query.esql}
              </EuiCodeBlock>
            </>
          )}
        </EuiPanel>
      </EuiFocusTrap>

      {queryStream && isEditQueryFlyoutOpen && (
        <EditQueryStreamFlyout
          definition={queryStream}
          onClose={() => setIsEditQueryFlyoutOpen(false)}
          onSave={() => {
            setIsEditQueryFlyoutOpen(false);
            refresh();
          }}
        />
      )}
    </>
  );
}
