/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Component, Fragment } from 'react';
import type { ComponentProps } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { Route } from '@kbn/shared-ux-router';
import qs from 'query-string';
import type { HttpSetup } from '@kbn/core-http-browser';
import type { ApplicationStart } from '@kbn/core-application-browser';
import type { History, Location } from 'history';
import type { IndicesListColumn } from '@kbn/index-management-shared-types';

import {
  EuiButton,
  EuiCallOut,
  EuiLink,
  EuiCheckbox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLiveAnnouncer,
  EuiPageSection,
  EuiScreenReaderOnly,
  EuiSpacer,
  EuiSearchBar,
  EuiSwitch,
  EuiTable,
  EuiTableBody,
  EuiTableHeader,
  EuiTableHeaderCell,
  EuiTableHeaderCellCheckbox,
  EuiTableRow,
  EuiTableRowCell,
  EuiTableRowCellCheckbox,
  EuiText,
  RIGHT_ALIGNMENT,
} from '@elastic/eui';
import type { Query, Pager, EuiSearchBarOnChangeArgs, SearchFilterConfig } from '@elastic/eui';
import { get } from 'lodash';

import {
  PageLoading,
  PageError,
  reactRouterNavigate,
  attemptToURIDecode,
  type Error as EsUiError,
} from '../../../../../shared_imports';
import { formatBytes } from '../../../../..';
import { getDataStreamDetailsLink, getIndexDetailsLink } from '../../../../services/routing';
import { documentationService } from '../../../../services/documentation';
import { AppContextConsumer } from '../../../../app_context';
import { renderBadges } from '../../../../lib/render_badges';
import { NoMatch, DataHealth } from '../../../../components';
import { IndexActionsContextMenu } from '../index_actions_context_menu';
import { CreateIndexButton } from '../create_index/create_index_button';
import { IndexTablePagination, PAGE_SIZE_OPTIONS } from './index_table_pagination';
import { DocCountCell } from './doc_count';
import { docCountApi } from './get_doc_count';
import type { DocCountApi } from './get_doc_count';
import type { Index } from '../../../../../../common';
import type { ExtensionsService } from '../../../../../services';

interface GetColumnConfigsParams {
  showIndexStats: boolean;
  showSizeAndDocCount: boolean;
  history: History;
  filterChanged: (filter: string | Query) => void;
  extensionsService: ExtensionsService;
  location: Location;
  application: ApplicationStart;
  http: HttpSetup;
  docCountApi: DocCountApi;
}

interface IndexTableColumnConfig extends IndicesListColumn {
  width?: string;
  minWidth?: string;
  maxWidth?: string;
  className?: string;
  align?: typeof RIGHT_ALIGNMENT;
  readOnly?: boolean;
}

const getColumnConfigs = ({
  showIndexStats,
  showSizeAndDocCount,
  history,
  filterChanged,
  extensionsService,
  location,
  application,
  http,
  docCountApi: docCountApiInstance,
}: GetColumnConfigsParams): IndexTableColumnConfig[] => {
  const columns: IndexTableColumnConfig[] = [
    {
      fieldName: 'name',
      label: i18n.translate('xpack.idxMgmt.indexTable.headers.nameHeader', {
        defaultMessage: 'Name',
      }),
      order: 10,
      width: '15em', // This is just a recommendation and the column will grow if there's extra space
      minWidth: '12em',
      render: (index: Index) => {
        return (
          <>
            <EuiLink
              data-test-subj="indexTableIndexNameLink"
              onClick={() => history.push(getIndexDetailsLink(index.name, location.search || ''))}
            >
              {index.name}
            </EuiLink>
            {renderBadges(index, extensionsService, filterChanged)}
          </>
        );
      },
    },
    {
      fieldName: 'data_stream',
      label: i18n.translate('xpack.idxMgmt.indexTable.headers.dataStreamHeader', {
        defaultMessage: 'Data stream',
      }),
      width: '10em',
      minWidth: '7.5em',
      order: 80,
      render: (index: Index) => {
        if (index.data_stream) {
          return (
            <EuiLink
              data-test-subj="dataStreamLink"
              {...reactRouterNavigate(history, {
                pathname: getDataStreamDetailsLink(index.data_stream),
                search: '?isDeepLink=true',
              })}
            >
              {index.data_stream}
            </EuiLink>
          );
        }
      },
    },
  ];

  // size and docs count enabled by either "enableIndexStats" or "enableSizeAndDocCount" configs
  if (showIndexStats || showSizeAndDocCount) {
    columns.push(
      {
        fieldName: 'documents',
        label: i18n.translate('xpack.idxMgmt.indexTable.headers.documentsHeader', {
          defaultMessage: 'Documents count',
        }),
        order: 60,
        render: (index: Index) => {
          return (
            <DocCountCell
              indexName={index.name}
              docCountApi={docCountApiInstance}
              metadataCount={index.documents}
              status={index.status}
            />
          );
        },
        readOnly: true,
        minWidth: '8em',
        width: '12em',
        className: 'eui-textNoWrap',
        align: RIGHT_ALIGNMENT,
      },
      {
        fieldName: 'size',
        label: i18n.translate('xpack.idxMgmt.indexTable.headers.storageSizeHeader', {
          defaultMessage: 'Storage size',
        }),
        render: (index: Index) => formatBytes(index.size),
        order: 70,
        minWidth: '9em',
        width: '12em',
        className: 'eui-textNoWrap',
        align: RIGHT_ALIGNMENT,
      }
    );
  }
  if (showIndexStats) {
    columns.push(
      {
        fieldName: 'health',
        label: i18n.translate('xpack.idxMgmt.indexTable.headers.healthHeader', {
          defaultMessage: 'Health',
        }),
        order: 20,
        width: '7em',
        minWidth: '7em',
        className: 'eui-textNoWrap',
        render: (index: Index) => (index.health ? <DataHealth health={index.health} /> : undefined),
      },
      {
        fieldName: 'status',
        label: i18n.translate('xpack.idxMgmt.indexTable.headers.statusHeader', {
          defaultMessage: 'Status',
        }),
        order: 30,
        width: '6em',
        minWidth: '6em',
        maxWidth: '6em',
        className: 'eui-textNoWrap',
      },
      {
        fieldName: 'primary',
        label: i18n.translate('xpack.idxMgmt.indexTable.headers.primaryHeader', {
          defaultMessage: 'Primaries',
        }),
        order: 40,
        width: '6.5em',
        minWidth: '6.5em',
        className: 'eui-textNoWrap',
        align: RIGHT_ALIGNMENT,
      },
      {
        fieldName: 'replica',
        label: i18n.translate('xpack.idxMgmt.indexTable.headers.replicaHeader', {
          defaultMessage: 'Replicas',
        }),
        order: 50,
        width: '6.5em',
        minWidth: '6.5em',
        className: 'eui-textNoWrap',
        align: RIGHT_ALIGNMENT,
      }
    );
  }

  columns.push(...extensionsService.columns);

  return columns.sort(({ order: orderA }, { order: orderB }) => orderA - orderB);
};

interface IndexTableProps {
  allIndices: Index[];
  indices: Index[];
  pager: Pager;
  filter: string | Query;
  sortField: string;
  isSortAscending: boolean;
  indicesLoading: boolean;
  indicesError: false | { status?: number; body?: EsUiError };
  indicesEnrichmentErrors: string[];
  toggleNameToVisibleMap: Record<string, boolean>;
  filterChanged: (filter: string | Query) => void;
  pageChanged: (pageNumber: number) => void;
  pageSizeChanged: (pageSize: number) => void;
  sortChanged: (sortField: string, isSortAscending: boolean) => void;
  toggleChanged: (toggleName: string, toggleValue: boolean) => void;
  loadIndices: () => void;
  performExtensionAction: (
    requestMethod: (indexNames: string[], httpSetup: HttpSetup) => Promise<void>,
    successMessage: string,
    indexNames: string[]
  ) => void;
  history: History;
  location: Location;
  http: HttpSetup;
}

interface IndexTableState {
  selectedIndicesMap: Record<string, boolean>;
  selectionAnnouncement: string;
  filterError?: globalThis.Error | null;
}

export class IndexTable extends Component<IndexTableProps, IndexTableState> {
  docCountApi: DocCountApi;

  static getDerivedStateFromProps(
    props: IndexTableProps,
    state: IndexTableState
  ): Pick<IndexTableState, 'selectedIndicesMap'> | null {
    // Deselect any indices which no longer exist, e.g. they've been deleted.
    const { selectedIndicesMap } = state;
    const indexNames = props.indices.map((index) => index.name);
    const selectedIndexNames = Object.keys(selectedIndicesMap);
    const missingIndexNames = selectedIndexNames.filter((selectedIndexName) => {
      return !indexNames.includes(selectedIndexName);
    });

    if (missingIndexNames.length) {
      const newMap = { ...selectedIndicesMap };
      missingIndexNames.forEach((missingIndexName) => delete newMap[missingIndexName]);
      return { selectedIndicesMap: newMap };
    }

    return null;
  }

  constructor(props: IndexTableProps) {
    super(props);

    this.docCountApi = docCountApi(props.http);
    this.state = {
      selectedIndicesMap: {},
      selectionAnnouncement: '',
    };
  }

  componentDidMount() {
    this.props.loadIndices();

    const { filterChanged, pageSizeChanged, pageChanged, toggleNameToVisibleMap, toggleChanged } =
      this.props;
    const { filter, pageSize, pageIndex, rest } = this.readURLParams();

    if (filter) {
      try {
        const parsedFilter = EuiSearchBar.Query.parse(filter);
        filterChanged(parsedFilter);
      } catch (e) {
        this.setState({ filterError: e instanceof Error ? e : new Error(String(e)) });
      }
    }
    if (pageSize && PAGE_SIZE_OPTIONS.includes(pageSize)) {
      pageSizeChanged(pageSize);
    }
    if (pageIndex && pageIndex > -1) {
      pageChanged(pageIndex);
    }
    const toggleParams = Object.keys(rest);
    const toggles = Object.keys(toggleNameToVisibleMap);
    for (const toggleParam of toggleParams) {
      if (toggles.includes(toggleParam)) {
        toggleChanged(toggleParam, rest[toggleParam] === 'true');
      }
    }
  }

  componentDidUpdate(prevProps: IndexTableProps, prevState: IndexTableState) {
    const hadSelectedItems = Object.keys(prevState.selectedIndicesMap).length > 0;
    const hasSelectedItems = Object.keys(this.state.selectedIndicesMap).length > 0;

    if (!hadSelectedItems && hasSelectedItems) {
      const selectionAnnouncement = i18n.translate(
        'xpack.idxMgmt.indexTable.bulkActionsAnnouncementVisible',
        {
          defaultMessage: 'Bulk actions menu is now available.',
        }
      );

      if (this.state.selectionAnnouncement !== selectionAnnouncement) {
        this.setState({ selectionAnnouncement });
      }
    } else if (hadSelectedItems && !hasSelectedItems) {
      const selectionAnnouncement = i18n.translate(
        'xpack.idxMgmt.indexTable.bulkActionsAnnouncementHidden',
        {
          defaultMessage: 'Bulk actions menu is now hidden.',
        }
      );

      if (this.state.selectionAnnouncement !== selectionAnnouncement) {
        this.setState({ selectionAnnouncement });
      }
    }
  }

  componentWillUnmount() {
    // When you deep-link to an index from the data streams tab, the hidden indices are toggled on.
    // However, this state is lost when you navigate away. We need to clear the filter too, or else
    // navigating back to this tab would just show an empty list because the backing indices
    // would be hidden.
    this.props.filterChanged('');
    this.docCountApi.abort();
  }

  readURLParams(): {
    filter?: string;
    pageSize?: number;
    pageIndex?: number;
    rest: ReturnType<typeof qs.parse>;
  } {
    const { location } = this.props;
    const { filter, pageSize, pageIndex, ...rest } = qs.parse((location && location.search) || '');
    return {
      filter: typeof filter === 'string' ? attemptToURIDecode(filter) : undefined,
      pageSize: typeof pageSize === 'string' ? Number(pageSize) : undefined,
      pageIndex: typeof pageIndex === 'string' ? Number(pageIndex) : undefined,
      rest,
    };
  }

  setURLParam(paramName: string, value: string | boolean) {
    const { location, history } = this.props;
    const { pathname, search } = location;
    const params: Record<string, string | string[] | boolean | null | undefined> = qs.parse(search);
    if (value) {
      params[paramName] = value;
    } else {
      delete params[paramName];
    }
    history.push(pathname + '?' + qs.stringify(params));
  }

  onSort = (column: string) => {
    const { sortField, isSortAscending, sortChanged } = this.props;

    const newIsSortAscending = sortField === column ? !isSortAscending : true;
    sortChanged(column, newIsSortAscending);
  };

  renderFilterError() {
    const { filterError } = this.state;

    if (!filterError) {
      return;
    }

    return (
      <>
        <EuiSpacer />
        <EuiCallOut
          iconType="faceSad"
          color="danger"
          title={i18n.translate('xpack.idxMgmt.indexTable.invalidSearchErrorMessage', {
            defaultMessage: 'Invalid search: {errorMessage}',

            values: {
              errorMessage: filterError.message,
            },
          })}
        />
        <EuiSpacer />
      </>
    );
  }

  renderEnrichmentErrors() {
    const { indicesEnrichmentErrors } = this.props;
    if (!indicesEnrichmentErrors || indicesEnrichmentErrors.length === 0) {
      return null;
    }

    return (
      <>
        <EuiCallOut
          iconType="warning"
          color="warning"
          data-test-subj="indicesEnrichmentErrorCallout"
          title={i18n.translate('xpack.idxMgmt.indexTable.enrichmentErrorTitle', {
            defaultMessage: 'Some index details could not be loaded',
          })}
        >
          <FormattedMessage
            id="xpack.idxMgmt.indexTable.enrichmentErrorDescription"
            defaultMessage="The following data sources failed to load: {sources}."
            values={{
              sources: indicesEnrichmentErrors.join(', '),
            }}
          />
        </EuiCallOut>
        <EuiSpacer size="m" />
      </>
    );
  }

  onFilterChanged = ({ query, error }: EuiSearchBarOnChangeArgs) => {
    if (error) {
      this.setState({ filterError: error });
    } else {
      const queryText = typeof query === 'string' ? query : query?.text ?? '';
      this.setURLParam('filter', encodeURIComponent(queryText));
      this.props.filterChanged(query ?? '');
      this.setState({ filterError: null });
    }
  };

  getFilters = (extensionsService: ExtensionsService): SearchFilterConfig[] => {
    const { allIndices } = this.props;
    return extensionsService.filters.reduce<SearchFilterConfig[]>((accum, filterExtension) => {
      const filtersToAdd = filterExtension(allIndices);
      return [...accum, ...filtersToAdd];
    }, []);
  };

  toggleAll = () => {
    const allSelected = this.areAllItemsSelected();
    if (allSelected) {
      return this.setState({ selectedIndicesMap: {} });
    }
    const { indices } = this.props;
    const selectedIndicesMap: Record<string, boolean> = {};
    indices.forEach(({ name }) => {
      selectedIndicesMap[name] = true;
    });
    this.setState({
      selectedIndicesMap,
    });
  };

  toggleItem = (name: string) => {
    this.setState(({ selectedIndicesMap }) => {
      const newMap = { ...selectedIndicesMap };
      if (newMap[name]) {
        delete newMap[name];
      } else {
        newMap[name] = true;
      }
      return {
        selectedIndicesMap: newMap,
      };
    });
  };

  isItemSelected = (name: string) => {
    return !!this.state.selectedIndicesMap[name];
  };

  areAllItemsSelected = () => {
    const { indices } = this.props;
    if (indices.length <= 0) {
      return false;
    }
    const indexOfUnselectedItem = indices.findIndex((index) => !this.isItemSelected(index.name));
    return indexOfUnselectedItem === -1;
  };

  buildHeader(columnConfigs: IndexTableColumnConfig[]) {
    const { sortField, isSortAscending } = this.props;
    return columnConfigs.map(
      ({ fieldName, label, readOnly, width, minWidth, maxWidth, className, align }) => {
        const isSorted = sortField === fieldName;
        return (
          <EuiTableHeaderCell
            key={fieldName}
            onSort={() => this.onSort(fieldName)}
            isSorted={isSorted}
            isSortAscending={isSortAscending}
            data-test-subj={`indexTableHeaderCell-${fieldName}`}
            readOnly={readOnly}
            width={width}
            minWidth={minWidth}
            maxWidth={maxWidth}
            className={className}
            align={align}
          >
            {label}
          </EuiTableHeaderCell>
        );
      }
    );
  }

  buildRowCell(index: Index, columnConfig: IndexTableColumnConfig) {
    if (columnConfig.render) {
      return columnConfig.render(index);
    }
    return get(index, columnConfig.fieldName);
  }

  buildRowCells(index: Index, columnConfigs: IndexTableColumnConfig[]) {
    return columnConfigs.map((columnConfig) => {
      const { name } = index;
      const { fieldName, width, minWidth, maxWidth, className, align } = columnConfig;
      const cellProps: ComponentProps<typeof EuiTableRowCell> = {
        truncateText: false,
        setScopeRow: fieldName === 'name',
        'data-test-subj': `indexTableCell-${fieldName}`,
        width,
        minWidth,
        maxWidth,
        className,
        align,
      };
      return (
        <EuiTableRowCell key={`${fieldName}-${name}`} {...cellProps}>
          {this.buildRowCell(index, columnConfig)}
        </EuiTableRowCell>
      );
    });
  }

  renderBanners(extensionsService: ExtensionsService) {
    const { allIndices = [], filterChanged, performExtensionAction } = this.props;
    return extensionsService.banners.map((bannerExtension, i) => {
      const bannerData = bannerExtension(allIndices);
      if (!bannerData) {
        return null;
      }

      const { type, title, message, filter, filterLabel, action } = bannerData;

      return (
        <Fragment key={`bannerExtension${i}`}>
          <EuiCallOut announceOnMount={false} color={type} size="m" title={title}>
            {message && <p>{message}</p>}
            {action || filter ? (
              <EuiFlexGroup gutterSize="s" alignItems="center">
                {action ? (
                  <EuiFlexItem grow={false}>
                    <EuiButton
                      color="warning"
                      fill
                      onClick={() => {
                        performExtensionAction(
                          action.requestMethod,
                          action.successMessage,
                          action.indexNames
                        );
                      }}
                    >
                      {action.buttonLabel}
                    </EuiButton>
                  </EuiFlexItem>
                ) : null}
                {filter ? (
                  <EuiFlexItem grow={false}>
                    <EuiText>
                      <EuiLink onClick={() => filterChanged(filter)}>{filterLabel}</EuiLink>
                    </EuiText>
                  </EuiFlexItem>
                ) : null}
              </EuiFlexGroup>
            ) : null}
          </EuiCallOut>
          <EuiSpacer size="m" />
        </Fragment>
      );
    });
  }

  buildRows(columnConfigs: IndexTableColumnConfig[]) {
    const { indices = [] } = this.props;
    return indices.map((index) => {
      const { name } = index;
      return (
        <EuiTableRow
          data-test-subj="indexTableRow"
          isSelected={this.isItemSelected(name)}
          isSelectable
          hasSelection
          key={`${name}-row`}
        >
          <EuiTableRowCellCheckbox key={`checkbox-${name}`}>
            <EuiCheckbox
              id={`checkboxSelectIndex-${name}`}
              checked={this.isItemSelected(name)}
              onChange={() => {
                this.toggleItem(name);
              }}
              data-test-subj="indexTableRowCheckbox"
              aria-label={i18n.translate('xpack.idxMgmt.indexTable.selectIndexAriaLabel', {
                defaultMessage: 'Select this row',
              })}
            />
          </EuiTableRowCellCheckbox>
          {this.buildRowCells(index, columnConfigs)}
        </EuiTableRow>
      );
    });
  }

  renderToggleControl({ name, label }: { name: string; label: string }) {
    const { toggleNameToVisibleMap, toggleChanged } = this.props;
    return (
      <EuiFlexItem key={name} grow={false}>
        <EuiSwitch
          id={`checkboxToggles-${name}`}
          data-test-subj={`checkboxToggles-${name}`}
          checked={toggleNameToVisibleMap[name]}
          onChange={(event) => {
            this.setURLParam(name, event.target.checked);
            toggleChanged(name, event.target.checked);
          }}
          label={label}
        />
      </EuiFlexItem>
    );
  }

  render() {
    const {
      filter,
      filterChanged,
      indices,
      loadIndices,
      indicesLoading,
      indicesError,
      allIndices,
      pager,
      pageChanged,
      pageSizeChanged,
      history,
      location,
    } = this.props;

    const hasContent = !indicesLoading && !indicesError;

    if (!hasContent) {
      if (indicesLoading) {
        return (
          <PageLoading>
            <FormattedMessage
              id="xpack.idxMgmt.indexTable.loadingIndicesDescription"
              defaultMessage="Loading indices…"
            />
          </PageLoading>
        );
      }

      if (indicesError) {
        if (indicesError.status === 403) {
          return (
            <PageError
              title={
                <FormattedMessage
                  id="xpack.idxMgmt.pageErrorForbidden.title"
                  defaultMessage="You do not have permissions to use Index Management"
                />
              }
            />
          );
        }

        return (
          <PageError
            title={
              <FormattedMessage
                id="xpack.idxMgmt.indexTable.serverErrorTitle"
                defaultMessage="Error loading indices"
              />
            }
            error={indicesError.body}
          />
        );
      }
    }

    const { selectedIndicesMap, selectionAnnouncement } = this.state;
    const atLeastOneItemSelected = Object.keys(selectedIndicesMap).length > 0;

    return (
      <AppContextConsumer>
        {(context) => {
          if (!context) {
            throw new Error('"useAppContext" can only be called inside of AppContext.Provider!');
          }
          const { services, config, core, plugins } = context;
          const { extensionsService } = services;
          const { application, http } = core;
          const { share } = plugins;
          const columnConfigs = getColumnConfigs({
            showIndexStats: config.enableIndexStats,
            showSizeAndDocCount: config.enableSizeAndDocCount,
            extensionsService,
            filterChanged,
            history,
            location,
            application,
            http,
            docCountApi: this.docCountApi,
          });
          const searchFilters = this.getFilters(extensionsService);
          const columnsCount = columnConfigs.length + 1;
          return (
            <EuiPageSection paddingSize="none">
              <EuiFlexGroup alignItems="center">
                <EuiFlexItem grow={true}>
                  <EuiText color="subdued">
                    <FormattedMessage
                      id="xpack.idxMgmt.home.idxMgmtDescription"
                      defaultMessage="Update your Elasticsearch indices individually or in bulk. {learnMoreLink}"
                      values={{
                        learnMoreLink: (
                          <EuiLink
                            href={documentationService.getIdxMgmtDocumentationLink()}
                            target="_blank"
                            external
                          >
                            {i18n.translate(
                              'xpack.idxMgmt.indexTableDescription.learnMoreLinkText',
                              {
                                defaultMessage: 'Learn more.',
                              }
                            )}
                          </EuiLink>
                        ),
                      }}
                    />
                  </EuiText>
                </EuiFlexItem>

                <EuiFlexItem grow={false}>
                  {(indicesLoading && allIndices.length === 0) || indicesError ? null : (
                    <EuiFlexGroup>
                      {extensionsService.toggles.map((toggle) => {
                        return this.renderToggleControl(toggle);
                      })}
                    </EuiFlexGroup>
                  )}
                </EuiFlexItem>
              </EuiFlexGroup>

              <EuiSpacer size="l" />

              {this.renderBanners(extensionsService)}

              <EuiFlexGroup gutterSize="m" alignItems="center">
                {atLeastOneItemSelected ? (
                  <EuiFlexItem grow={false}>
                    <Route
                      key="menu"
                      render={() => (
                        <IndexActionsContextMenu
                          indexNames={Object.keys(selectedIndicesMap)}
                          isOnListView={true}
                          indicesListURLParams={location.search || ''}
                          docCountApi={this.docCountApi}
                          resetSelection={() => {
                            this.setState({ selectedIndicesMap: {} });
                          }}
                        />
                      )}
                    />
                  </EuiFlexItem>
                ) : null}

                {(indicesLoading && allIndices.length === 0) || indicesError ? null : (
                  <>
                    <EuiFlexItem>
                      <EuiSearchBar
                        filters={searchFilters.length > 0 ? searchFilters : undefined}
                        defaultQuery={filter}
                        query={filter}
                        box={{
                          incremental: true,
                          placeholder: i18n.translate(
                            'xpack.idxMgmt.indexTable.systemIndicesSearchInputPlaceholder',
                            {
                              defaultMessage: 'Search',
                            }
                          ),
                          'data-test-subj': 'indicesSearch',
                        }}
                        aria-label={i18n.translate(
                          'xpack.idxMgmt.indexTable.systemIndicesSearchIndicesAriaLabel',
                          {
                            defaultMessage: 'Search indices',
                          }
                        )}
                        data-test-subj="indexTableFilterInput"
                        onChange={this.onFilterChanged}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiButton
                        isLoading={indicesLoading}
                        color="success"
                        onClick={loadIndices}
                        iconType="refresh"
                        data-test-subj="reloadIndicesButton"
                      >
                        <FormattedMessage
                          id="xpack.idxMgmt.indexTable.reloadIndicesButton"
                          defaultMessage="Reload indices"
                        />
                      </EuiButton>
                    </EuiFlexItem>
                  </>
                )}
                <EuiFlexItem grow={false}>
                  <CreateIndexButton loadIndices={loadIndices} share={share} />
                </EuiFlexItem>
              </EuiFlexGroup>

              {this.renderFilterError()}

              {this.renderEnrichmentErrors()}

              <EuiSpacer size="m" />

              <EuiLiveAnnouncer>{selectionAnnouncement}</EuiLiveAnnouncer>

              <div style={{ maxWidth: '100%', overflow: 'auto' }}>
                <EuiTable
                  data-test-subj="indexTable"
                  scrollableInline
                  responsiveBreakpoint={false}
                  tableLayout="auto"
                >
                  <EuiScreenReaderOnly>
                    <caption role="status" aria-relevant="text" aria-live="polite">
                      <FormattedMessage
                        id="xpack.idxMgmt.indexTable.captionText"
                        defaultMessage="Below is the indices table containing {count, plural, one {# row} other {# rows}} out of {total}."
                        values={{ count: indices.length, total: pager.totalItems }}
                      />
                    </caption>
                  </EuiScreenReaderOnly>

                  <EuiTableHeader>
                    <EuiTableHeaderCellCheckbox>
                      <EuiCheckbox
                        id="selectAllIndexes"
                        checked={this.areAllItemsSelected()}
                        onChange={this.toggleAll}
                        aria-label={i18n.translate(
                          'xpack.idxMgmt.indexTable.selectAllIndicesAriaLabel',
                          {
                            defaultMessage: 'Select all rows',
                          }
                        )}
                      />
                    </EuiTableHeaderCellCheckbox>
                    {this.buildHeader(columnConfigs)}
                  </EuiTableHeader>

                  <EuiTableBody>
                    {indices.length > 0 ? (
                      this.buildRows(columnConfigs)
                    ) : (
                      <EuiTableRow>
                        <EuiTableRowCell align="center" colSpan={columnsCount}>
                          <NoMatch
                            loadIndices={loadIndices}
                            share={share}
                            filter={typeof filter === 'string' ? filter : filter.text}
                            resetFilter={() => filterChanged('')}
                            extensionsService={extensionsService}
                          />
                        </EuiTableRowCell>
                      </EuiTableRow>
                    )}
                  </EuiTableBody>
                </EuiTable>
              </div>

              <EuiSpacer size="m" />

              {indices.length > 0 ? (
                <IndexTablePagination
                  pager={pager}
                  pageChanged={pageChanged}
                  pageSizeChanged={pageSizeChanged}
                  readURLParams={() => this.readURLParams()}
                  setURLParam={(paramName: string, value: string | boolean) =>
                    this.setURLParam(paramName, value)
                  }
                />
              ) : null}
            </EuiPageSection>
          );
        }}
      </AppContextConsumer>
    );
  }
}
