/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiFormRow,
  EuiIcon,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiTitle,
  useEuiTheme,
  type EuiBasicTableColumn,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { CodeEditor } from '@kbn/code-editor';
import { HANDLEBARS_LANG_ID } from '@kbn/code-editor';
import { ESQLLangEditor } from '@kbn/esql/public';
import { i18n } from '@kbn/i18n';
import React, { useEffect, useState } from 'react';
import { getESQLTimeFieldFromQuery } from '@kbn/esql-utils';
import { getServices } from '../services';
import { fetchEsqlData } from '../utils/fetch_esql_data';

const EXAMPLE_PROMPTS = [
  i18n.translate('xpack.aiPanel.editFlyout.example1', {
    defaultMessage: 'KPI cards: total count, average value, and trend indicator',
  }),
  i18n.translate('xpack.aiPanel.editFlyout.example2', {
    defaultMessage: 'Status board with color-coded thresholds (green / yellow / red)',
  }),
  i18n.translate('xpack.aiPanel.editFlyout.example3', {
    defaultMessage: 'Top 5 items ranked by value with horizontal percentage bars',
  }),
  i18n.translate('xpack.aiPanel.editFlyout.example4', {
    defaultMessage: 'Timeline of events grouped by category with counts',
  }),
];

interface PreviewData {
  columns: Array<{ name: string; type: string }>;
  rows: unknown[][];
}

interface EditAiPanelFlyoutProps {
  prompt: string;
  esqlQuery: string | undefined;
  template: string | undefined;
  timeRange: { from: string; to: string } | undefined;
  onSave: (prompt: string, esqlQuery: string | undefined, template: string | undefined) => void;
  onClose: () => void;
}

export const EditAiPanelFlyout = ({
  prompt,
  esqlQuery,
  template,
  timeRange,
  onSave,
  onClose,
}: EditAiPanelFlyoutProps) => {
  const { euiTheme } = useEuiTheme();
  const [draftPrompt, setDraftPrompt] = useState(prompt);
  const [draftEsqlQuery, setDraftEsqlQuery] = useState(esqlQuery ?? '');
  const [draftTemplate, setDraftTemplate] = useState(template ?? '');
  const [detectedTimeField, setDetectedTimeField] = useState<string | undefined>(undefined);
  const [isAiAvailable, setIsAiAvailable] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    getServices()
      .core.http.get<{ connectors: unknown[] }>('/internal/inference/connectors')
      .then((res) => setIsAiAvailable(res.connectors.length > 0))
      .catch(() => setIsAiAvailable(false));
  }, []);

  useEffect(() => {
    if (!draftEsqlQuery.trim()) {
      setDetectedTimeField(undefined);
      return;
    }
    getESQLTimeFieldFromQuery({ query: draftEsqlQuery, http: getServices().core.http }).then(
      setDetectedTimeField
    );
  }, [draftEsqlQuery]);

  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const handlePreview = async () => {
    if (!draftEsqlQuery.trim()) return;
    setIsPreviewLoading(true);
    setPreviewData(null);
    setPreviewError(null);
    try {
      const controller = new AbortController();
      const result = await fetchEsqlData(
        getServices().search,
        getServices().core.http,
        draftEsqlQuery,
        timeRange,
        controller.signal
      );
      setPreviewData({ columns: result.columns, rows: (result.values ?? []).slice(0, 10) });
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const tableColumns: Array<EuiBasicTableColumn<Record<string, unknown>>> =
    previewData?.columns.map((col) => ({
      field: col.name,
      name: col.name,
      truncateText: true,
      width: '140px',
      render: (val: unknown) => {
        const str = String(val ?? '');
        return str.length > 30 ? `${str.slice(0, 30)}…` : str;
      },
    })) ?? [];

  const tableItems: Array<Record<string, unknown>> =
    previewData?.rows.map((row, i) => {
      const item: Record<string, unknown> = { _id: String(i) };
      previewData.columns.forEach((col, j) => {
        item[col.name] = row[j];
      });
      return item;
    }) ?? [];

  return (
    <EuiFlyout onClose={onClose} size="m" type="push" aria-labelledby="editAiPanelFlyoutTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id="editAiPanelFlyoutTitle">
            {i18n.translate('xpack.aiPanel.editFlyout.title', {
              defaultMessage: 'Edit AI Panel',
            })}
          </h2>
        </EuiTitle>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <EuiFormRow
          label={i18n.translate('xpack.aiPanel.editFlyout.promptLabel', {
            defaultMessage: 'Prompt',
          })}
          helpText={i18n.translate('xpack.aiPanel.editFlyout.promptHelp', {
            defaultMessage: 'Describe what you want the panel to show.',
          })}
          fullWidth
        >
          <EuiTextArea
            value={draftPrompt}
            onChange={(e) => setDraftPrompt(e.target.value)}
            rows={5}
            fullWidth
            disabled={isAiAvailable === false}
            placeholder={i18n.translate('xpack.aiPanel.editFlyout.promptPlaceholder', {
              defaultMessage:
                'e.g. Show a status board of top product categories by revenue with color-coded thresholds...',
            })}
          />
        </EuiFormRow>

        {isAiAvailable === false && (
          <>
            <EuiSpacer size="s" />
            <EuiCallOut
              size="s"
              color="warning"
              iconType="warning"
              title={i18n.translate('xpack.aiPanel.editFlyout.noAiConnector', {
                defaultMessage:
                  'AI features are not available. Configure an AI connector to enable prompt-based generation.',
              })}
              announceOnMount
            />
          </>
        )}

        <EuiSpacer size="s" />

        <EuiText size="xs" color="subdued">
          <p>
            {i18n.translate('xpack.aiPanel.editFlyout.examplesLabel', {
              defaultMessage: 'Examples:',
            })}
          </p>
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiFlexGroup wrap gutterSize="xs">
          {EXAMPLE_PROMPTS.map((example) => (
            <EuiFlexItem grow={false} key={example}>
              <EuiBadge
                color="primary"
                onClick={() => setDraftPrompt(example)}
                onClickAriaLabel={i18n.translate('xpack.aiPanel.editFlyout.useExampleAriaLabel', {
                  defaultMessage: 'Use this example prompt',
                })}
              >
                {example}
              </EuiBadge>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>

        {esqlQuery && (
          <>
            <EuiSpacer size="l" />

            <EuiAccordion
              id="editAiPanelEsqlSection"
              buttonContent={
                <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiIcon type="database" aria-hidden={true} />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiText size="s">
                      <strong>
                        {i18n.translate('xpack.aiPanel.editFlyout.dataSourceLabel', {
                          defaultMessage: 'Data source (ES|QL)',
                        })}
                      </strong>
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              }
              initialIsOpen={Boolean(esqlQuery)}
              paddingSize="s"
            >
              <ESQLLangEditor
                query={{ esql: draftEsqlQuery }}
                onTextLangQueryChange={(q) => {
                  setDraftEsqlQuery(q.esql ?? '');
                  setPreviewData(null);
                  setPreviewError(null);
                }}
                onTextLangQuerySubmit={async () => {}}
                editorIsInline
                hasOutline
                hideRunQueryButton
                hideQueryHistory
                disableAutoFocus
                initialState={{ editorHeight: 120 }}
                errors={[]}
              />

              <EuiSpacer size="s" />

              {draftEsqlQuery.trim() && !detectedTimeField && (
                <EuiCallOut
                  size="s"
                  color="primary"
                  title={i18n.translate('xpack.aiPanel.editFlyout.timeRangeHint', {
                    defaultMessage:
                      'To connect to the dashboard time picker, add a WHERE clause with named time parameters. Example: WHERE dateField >= ?_tstart AND dateField < ?_tend',
                  })}
                  announceOnMount
                />
              )}

              <EuiSpacer size="s" />

              <EuiButton
                size="s"
                fill
                color="primary"
                iconType="play"
                onClick={handlePreview}
                isLoading={isPreviewLoading}
                disabled={!draftEsqlQuery.trim()}
              >
                {i18n.translate('xpack.aiPanel.editFlyout.previewData', {
                  defaultMessage: 'Preview data',
                })}
              </EuiButton>

              {previewError && (
                <>
                  <EuiSpacer size="s" />
                  <EuiCallOut color="danger" size="s" title={previewError} announceOnMount />
                </>
              )}

              {previewData && previewData.rows.length === 0 && (
                <>
                  <EuiSpacer size="s" />
                  <EuiCallOut
                    size="s"
                    color="warning"
                    title={i18n.translate('xpack.aiPanel.editFlyout.noRows', {
                      defaultMessage: 'Query returned no rows for the current time range.',
                    })}
                    announceOnMount
                  />
                </>
              )}

              {previewData && previewData.rows.length > 0 && (
                <>
                  <EuiSpacer size="s" />
                  <EuiBasicTable<Record<string, unknown>>
                    tableCaption={i18n.translate('xpack.aiPanel.editFlyout.previewCaption', {
                      defaultMessage: 'ES|QL query preview',
                    })}
                    items={tableItems}
                    rowHeader="_id"
                    columns={tableColumns}
                    compressed
                  />
                </>
              )}
            </EuiAccordion>
          </>
        )}

        <EuiSpacer size="l" />

        <EuiAccordion
          id="editAiPanelTemplateSection"
          buttonContent={
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiIcon type="editorCodeBlock" aria-hidden={true} />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText size="s">
                  <strong>
                    {i18n.translate('xpack.aiPanel.editFlyout.templateLabel', {
                      defaultMessage: 'Template (HTML)',
                    })}
                  </strong>
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          }
          initialIsOpen={false}
          paddingSize="s"
        >
          <EuiCallOut
            size="s"
            color="warning"
            title={i18n.translate('xpack.aiPanel.editFlyout.templateWarning', {
              defaultMessage:
                'Advanced: editing the template directly may produce unexpected results if placeholder syntax is broken.',
            })}
          />
          <EuiSpacer size="s" />
          <EuiFormRow
            fullWidth
            helpText={i18n.translate('xpack.aiPanel.editFlyout.templateHelp', {
              defaultMessage:
                'The HTML template uses Liquid syntax filled with live query data. Changing the prompt will regenerate this template.',
            })}
          >
            <div
              css={css({
                height: 400,
                border: euiTheme.border.thin,
                borderRadius: euiTheme.border.radius.small,
              })}
            >
              <CodeEditor
                languageId={HANDLEBARS_LANG_ID}
                value={draftTemplate}
                onChange={setDraftTemplate}
                options={{
                  fontSize: 12,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  automaticLayout: true,
                  lineNumbers: 'on',
                  folding: true,
                }}
              />
            </div>
          </EuiFormRow>
        </EuiAccordion>
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose}>
              {i18n.translate('xpack.aiPanel.editFlyout.cancel', {
                defaultMessage: 'Cancel',
              })}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              disabled={!draftPrompt.trim() || (isAiAvailable === false && draftPrompt !== prompt)}
              onClick={() => {
                onSave(
                  draftPrompt,
                  draftEsqlQuery.trim() || undefined,
                  draftTemplate.trim() || undefined
                );
                onClose();
              }}
            >
              {i18n.translate('xpack.aiPanel.editFlyout.save', {
                defaultMessage: 'Apply and close',
              })}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
