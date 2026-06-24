/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import moment from 'moment';
import { i18n } from '@kbn/i18n';
import type { Criteria, EuiBasicTableColumn } from '@elastic/eui';
import {
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonIcon,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiLoadingSpinner,
  EuiPanel,
  EuiPopover,
  EuiScreenReaderOnly,
  EuiSpacer,
  EuiText,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/css';
import type { KnowledgeBaseEntry } from '@kbn/observability-ai-assistant-plugin/public';
import { InferenceModelState } from '@kbn/observability-ai-assistant-plugin/public';
import { useKnowledgeBase } from '@kbn/ai-assistant/src/hooks';
import { KnowledgeBaseInstallationStatusPanel } from '@kbn/ai-assistant/src/knowledge_base/knowledge_base_installation_status_panel';
import { SettingUpKnowledgeBase } from '@kbn/ai-assistant/src/knowledge_base/setting_up_knowledge_base';
import { InspectKnowledgeBasePopover } from '@kbn/ai-assistant/src/knowledge_base/inspect_knowlegde_base_popover';
import { KnowledgeBaseReindexingCallout } from '@kbn/ai-assistant/src/knowledge_base/knowledge_base_reindexing_callout';
import { useGetKnowledgeBaseEntries } from '../../hooks/use_get_knowledge_base_entries';
import type { KnowledgeBaseEntryCategory } from '../../helpers/categorize_entries';
import { categorizeEntries } from '../../helpers/categorize_entries';
import { KnowledgeBaseEditManualEntryFlyout } from './knowledge_base_edit_manual_entry_flyout';
import { KnowledgeBaseCategoryFlyout } from './knowledge_base_category_flyout';
import { KnowledgeBaseBulkImportFlyout } from './knowledge_base_bulk_import_flyout';
import { useKibana } from '../../hooks/use_kibana';
import { KnowledgeBaseEditUserInstructionFlyout } from './knowledge_base_edit_user_instruction_flyout';

const fullHeightClassName = css`
  height: 100%;
`;

const centerMaxWidthClassName = css`
  text-align: center;
`;

const panelClassname = css`
  width: 100%;
`;

export function KnowledgeBaseTab() {
  const { uiSettings } = useKibana().services;
  const dateFormat = uiSettings.get('dateFormat');

  const knowledgeBase = useKnowledgeBase();
  const { euiTheme } = useEuiTheme();

  const columns: Array<EuiBasicTableColumn<KnowledgeBaseEntryCategory>> = [
    {
      align: 'right',
      width: '40px',
      isExpander: true,
      name: (
        <EuiScreenReaderOnly>
          <span>
            {i18n.translate('xpack.observabilityAiAssistantManagement.span.expandRowLabel', {
              defaultMessage: 'Expand row',
            })}
          </span>
        </EuiScreenReaderOnly>
      ),
      render: (category: KnowledgeBaseEntryCategory) => {
        const isSelected = category.categoryKey === selectedCategory?.categoryKey;
        const label = isSelected
          ? i18n.translate(
              'xpack.observabilityAiAssistantManagement.knowledgeBaseTab.collapseRowButtonLabel',
              { defaultMessage: 'Collapse' }
            )
          : i18n.translate(
              'xpack.observabilityAiAssistantManagement.knowledgeBaseTab.expandRowButtonLabel',
              { defaultMessage: 'Expand' }
            );
        return (
          <EuiToolTip content={label} disableScreenReaderOutput>
            <EuiButtonIcon
              data-test-subj="pluginsColumnsButton"
              onClick={() => setSelectedCategory(category)}
              aria-label={label}
              iconType={isSelected ? 'minimize' : 'expand'}
            />
          </EuiToolTip>
        );
      },
    },
    {
      field: '',
      name: '',
      render: (category: KnowledgeBaseEntryCategory) => {
        if (category.entries.length === 1 && category.entries[0].role === 'user_entry') {
          return <EuiIcon type="documentation" color="primary" aria-hidden={true} />;
        }
        if (
          category.entries.length === 1 &&
          category.entries[0].role === 'assistant_summarization'
        ) {
          return <EuiIcon type="sparkles" color="primary" aria-hidden={true} />;
        }

        return <EuiIcon type="logoElastic" aria-hidden={true} />;
      },
      width: '40px',
    },
    {
      'data-test-subj': 'knowledgeBaseTableTitleCell',
      field: 'title',
      name: i18n.translate('xpack.observabilityAiAssistantManagement.kbTab.columns.name', {
        defaultMessage: 'Name',
      }),
      sortable: true,
    },
    {
      name: i18n.translate(
        'xpack.observabilityAiAssistantManagement.kbTab.columns.numberOfEntries',
        {
          defaultMessage: 'Number of entries',
        }
      ),
      width: '140px',
      render: (category: KnowledgeBaseEntryCategory) => {
        if (category.entries.length > 1 && category.entries[0].role === 'elastic') {
          return <EuiBadge>{category.entries.length}</EuiBadge>;
        }
        return null;
      },
    },
    {
      'data-test-subj': 'knowledgeBaseTableAuthorCell',
      name: i18n.translate('xpack.observabilityAiAssistantManagement.kbTab.columns.author', {
        defaultMessage: 'Author',
      }),
      width: '140px',
      render: (category: KnowledgeBaseEntryCategory) => {
        return category.entries[0]?.user?.name;
      },
    },
    {
      field: '@timestamp',
      name: i18n.translate('xpack.observabilityAiAssistantManagement.kbTab.columns.dateCreated', {
        defaultMessage: 'Date created',
      }),
      width: '140px',
      sortable: true,
      render: (timestamp: KnowledgeBaseEntry['@timestamp']) => (
        <EuiBadge color="hollow">{moment(timestamp).format(dateFormat)}</EuiBadge>
      ),
    },
    {
      name: i18n.translate('xpack.observabilityAiAssistantManagement.kbTab.columns.type', {
        defaultMessage: 'Type',
      }),
      width: '140px',
      render: (category: KnowledgeBaseEntryCategory) => {
        if (category.entries.length === 1 && category.entries[0].role === 'user_entry') {
          return (
            <EuiBadge color="hollow">
              {i18n.translate(
                'xpack.observabilityAiAssistantManagement.kbTab.columns.manualBadgeLabel',
                {
                  defaultMessage: 'Manual',
                }
              )}
            </EuiBadge>
          );
        }

        if (
          category.entries.length === 1 &&
          category.entries[0].role === 'assistant_summarization'
        ) {
          return (
            <EuiBadge color="hollow">
              {i18n.translate(
                'xpack.observabilityAiAssistantManagement.kbTab.columns.assistantSummarization',
                {
                  defaultMessage: 'Assistant',
                }
              )}
            </EuiBadge>
          );
        }

        return (
          <EuiBadge>
            {i18n.translate('xpack.observabilityAiAssistantManagement.columns.systemBadgeLabel', {
              defaultMessage: 'System',
            })}
          </EuiBadge>
        );
      },
    },
  ];

  const [selectedCategory, setSelectedCategory] = useState<
    KnowledgeBaseEntryCategory | undefined
  >();

  const [newEntryFlyoutType, setNewEntryFlyoutType] = useState<
    'singleEntry' | 'bulkImport' | undefined
  >();

  const [isNewEntryPopoverOpen, setIsNewEntryPopoverOpen] = useState(false);
  const [isEditUserInstructionFlyoutOpen, setIsEditUserInstructionFlyoutOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<keyof KnowledgeBaseEntryCategory>('title');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const {
    entries = [],
    isLoading,
    refetch,
  } = useGetKnowledgeBaseEntries({
    query,
    sortBy,
    sortDirection,
    inferenceModelState: knowledgeBase.status.value?.inferenceModelState,
  });

  const categorizedEntries = categorizeEntries({ entries });

  const handleChangeSort = ({ sort }: Criteria<KnowledgeBaseEntryCategory>) => {
    if (sort) {
      const { field, direction } = sort;
      setSortBy(field);
      setSortDirection(direction);
    }
  };

  const handleChangeQuery = (e: React.ChangeEvent<HTMLInputElement> | undefined) => {
    setQuery(e?.currentTarget.value || '');
  };

  if (knowledgeBase.status.loading && !knowledgeBase.isPolling) {
    return (
      <EuiFlexGroup alignItems="center" direction="column">
        <EuiFlexItem grow>
          <EuiLoadingSpinner size="xl" data-test-subj="knowledgeBaseTabLoader" />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  if (knowledgeBase.status.value?.inferenceModelState === InferenceModelState.READY) {
    return (
      <>
        <EuiFlexGroup direction="column">
          {knowledgeBase.status.value?.isReIndexing && <KnowledgeBaseReindexingCallout />}

          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s">
              <EuiFlexItem grow>
                <EuiFieldSearch
                  data-test-subj="knowledgeBaseTabFieldSearch"
                  fullWidth
                  placeholder={i18n.translate(
                    'xpack.observabilityAiAssistantManagement.knowledgeBaseTab.euiFieldSearch.searchThisLabel',
                    { defaultMessage: 'Search for an entry' }
                  )}
                  value={query}
                  onChange={handleChangeQuery}
                  isClearable
                  aria-label={i18n.translate(
                    'xpack.observabilityAiAssistantManagement.knowledgeBaseTab.euiFieldSearch.searchEntriesLabel',
                    { defaultMessage: 'Search entries' }
                  )}
                />
              </EuiFlexItem>

              <EuiFlexItem grow={false}>
                <EuiButton
                  data-test-subj="knowledgeBaseTabReloadButton"
                  color="success"
                  iconType="refresh"
                  onClick={() => refetch()}
                >
                  {i18n.translate(
                    'xpack.observabilityAiAssistantManagement.knowledgeBaseTab.reloadButtonLabel',
                    { defaultMessage: 'Reload' }
                  )}
                </EuiButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  data-test-subj="observabilityAiAssistantManagementKnowledgeBaseTabEditInstructionsButton"
                  color="text"
                  onClick={() => setIsEditUserInstructionFlyoutOpen(true)}
                >
                  {i18n.translate(
                    'xpack.observabilityAiAssistantManagement.knowledgeBaseTab.editInstructionsButtonLabel',
                    { defaultMessage: 'Edit User-specific Prompt' }
                  )}
                </EuiButton>
              </EuiFlexItem>

              <EuiFlexItem grow={false}>
                <EuiPopover
                  aria-label={i18n.translate(
                    'xpack.observabilityAiAssistantManagement.knowledgeBaseTab.newEntryButtonLabel',
                    { defaultMessage: 'New entry' }
                  )}
                  isOpen={isNewEntryPopoverOpen}
                  closePopover={() => setIsNewEntryPopoverOpen(false)}
                  button={
                    <EuiButton
                      fill
                      data-test-subj="knowledgeBaseNewEntryButton"
                      iconSide="right"
                      iconType="chevronSingleDown"
                      onClick={() => setIsNewEntryPopoverOpen((prevValue) => !prevValue)}
                    >
                      {i18n.translate(
                        'xpack.observabilityAiAssistantManagement.knowledgeBaseTab.newEntryButtonLabel',
                        {
                          defaultMessage: 'New entry',
                        }
                      )}
                    </EuiButton>
                  }
                >
                  <EuiContextMenuPanel
                    items={[
                      <EuiContextMenuItem
                        key="singleEntry"
                        icon="document"
                        data-test-subj="knowledgeBaseSingleEntryContextMenuItem"
                        onClick={() => {
                          setIsNewEntryPopoverOpen(false);
                          setNewEntryFlyoutType('singleEntry');
                        }}
                      >
                        {i18n.translate(
                          'xpack.observabilityAiAssistantManagement.knowledgeBaseTab.singleEntryContextMenuItemLabel',
                          { defaultMessage: 'Single entry' }
                        )}
                      </EuiContextMenuItem>,
                      <EuiContextMenuItem
                        key="bulkImport"
                        icon="documents"
                        data-test-subj="knowledgeBaseBulkImportContextMenuItem"
                        onClick={() => {
                          setIsNewEntryPopoverOpen(false);
                          setNewEntryFlyoutType('bulkImport');
                        }}
                      >
                        {i18n.translate(
                          'xpack.observabilityAiAssistantManagement.knowledgeBaseTab.bulkImportContextMenuItemLabel',
                          { defaultMessage: 'Bulk import' }
                        )}
                      </EuiContextMenuItem>,
                    ]}
                  />
                </EuiPopover>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiBasicTable<KnowledgeBaseEntryCategory>
              data-test-subj="knowledgeBaseTable"
              columns={columns}
              items={categorizedEntries}
              loading={isLoading}
              sorting={{
                sort: {
                  field: sortBy,
                  direction: sortDirection,
                },
              }}
              rowProps={(row) => ({
                onClick: () => setSelectedCategory(row),
              })}
              onChange={handleChangeSort}
              tableCaption={i18n.translate(
                'xpack.observabilityAiAssistantManagement.knowledgeBaseTab.tableCaption',
                { defaultMessage: 'Knowledge base entries table' }
              )}
            />
          </EuiFlexItem>
        </EuiFlexGroup>

        {isEditUserInstructionFlyoutOpen ? (
          <KnowledgeBaseEditUserInstructionFlyout
            onClose={() => setIsEditUserInstructionFlyoutOpen(false)}
          />
        ) : null}

        {newEntryFlyoutType === 'singleEntry' ? (
          <KnowledgeBaseEditManualEntryFlyout onClose={() => setNewEntryFlyoutType(undefined)} />
        ) : null}

        {newEntryFlyoutType === 'bulkImport' ? (
          <KnowledgeBaseBulkImportFlyout onClose={() => setNewEntryFlyoutType(undefined)} />
        ) : null}

        {selectedCategory ? (
          selectedCategory.entries.length === 1 &&
          (selectedCategory.entries[0].role === 'user_entry' ||
            selectedCategory.entries[0].role === 'assistant_summarization') ? (
            <KnowledgeBaseEditManualEntryFlyout
              entry={selectedCategory.entries[0]}
              onClose={() => {
                setSelectedCategory(undefined);
                refetch();
              }}
            />
          ) : (
            <KnowledgeBaseCategoryFlyout
              category={selectedCategory}
              onClose={() => setSelectedCategory(undefined)}
            />
          )
        ) : null}
      </>
    );
  }

  return (
    <EuiFlexGroup
      alignItems="center"
      direction="column"
      gutterSize="none"
      className={fullHeightClassName}
    >
      <EuiText
        color="subdued"
        css={css`
          line-height: ${euiTheme.size.l};
        `}
      >
        {i18n.translate('xpack.observabilityAiAssistantManagement.knowledgeBaseTab.description', {
          defaultMessage:
            'Knowledge Base is a feature that enables the AI Assistant to recall multiple knowledge sources: documents, organizational resources like runbooks, GitHub issues, and internal documentation. It improves response quality with added context for more tailored assistance. ',
        })}
        <EuiLink
          href="https://www.elastic.co/docs/solutions/observability/observability-ai-assistant#obs-ai-add-data"
          target="_blank"
        >
          {i18n.translate(
            'xpack.observabilityAiAssistantManagement.knowledgeBaseTab.learnMoreLink',
            {
              defaultMessage: 'Learn More',
            }
          )}
        </EuiLink>
      </EuiText>
      <EuiSpacer size="l" />
      <EuiPanel hasBorder paddingSize="xl" grow={false} className={panelClassname}>
        <EuiFlexItem grow className={centerMaxWidthClassName}>
          {knowledgeBase.isInstalling ? (
            <>
              <SettingUpKnowledgeBase />
              <InspectKnowledgeBasePopover knowledgeBase={knowledgeBase} />
            </>
          ) : (
            <KnowledgeBaseInstallationStatusPanel
              knowledgeBase={knowledgeBase}
              eisCalloutZIndex={0}
            />
          )}
        </EuiFlexItem>
      </EuiPanel>
    </EuiFlexGroup>
  );
}
