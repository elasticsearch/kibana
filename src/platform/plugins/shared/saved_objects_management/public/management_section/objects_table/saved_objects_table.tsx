/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { Component } from 'react';
import { debounce, matches } from 'lodash';
// @ts-expect-error
import { saveAs } from '@elastic/filesaver';
import type { CriteriaWithPagination } from '@elastic/eui';
import { EuiSpacer, Query } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type {
  HttpStart,
  OverlayStart,
  NotificationsStart,
  ApplicationStart,
} from '@kbn/core/public';
import { RedirectAppLinks } from '@kbn/shared-ux-link-redirect-app';
import type { SavedObjectsTaggingApi } from '@kbn/saved-objects-tagging-oss-plugin/public';
import type { DataViewsContract } from '@kbn/data-views-plugin/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { CustomBrandingStart } from '@kbn/core-custom-branding-browser';
import type { Subscription } from 'rxjs';
import type { SavedObjectManagementTypeInfo, FindQueryHTTP } from '../../../common/types/latest';
import type { SavedObjectsExportResultDetails } from '../../lib';
import {
  parseQuery,
  getSavedObjectCounts,
  getRelationships,
  fetchExportObjects,
  fetchExportByTypeAndSearch,
  findObjects,
  bulkDeleteObjects,
  bulkGetObjects,
  extractExportDetails,
  getTagFindReferences,
} from '../../lib';

import type { SavedObjectWithMetadata } from '../../types';
import type {
  SavedObjectsManagementActionServiceStart,
  SavedObjectsManagementColumnServiceStart,
} from '../../services';
import {
  Header,
  Table,
  Flyout,
  Relationships,
  DeleteConfirmModal,
  ExportModal,
} from './components';

interface ExportAllOption {
  id: string;
  label: string;
}

export interface SavedObjectsTableProps {
  allowedTypes: SavedObjectManagementTypeInfo[];
  actionRegistry: SavedObjectsManagementActionServiceStart;
  columnRegistry: SavedObjectsManagementColumnServiceStart;
  dataViews: DataViewsContract;
  taggingApi?: SavedObjectsTaggingApi;
  http: HttpStart;
  search: DataPublicPluginStart['search'];
  overlays: OverlayStart;
  notifications: NotificationsStart;
  applications: ApplicationStart;
  perPageConfig: number;
  goInspectObject: (obj: SavedObjectWithMetadata) => void;
  canGoInApp: (obj: SavedObjectWithMetadata) => boolean;
  initialQuery?: Query;
  customBranding: CustomBrandingStart;
}

export interface SavedObjectsTableState {
  totalCount: number;
  page: number;
  perPage: number;
  sort: CriteriaWithPagination<SavedObjectWithMetadata>['sort'];
  savedObjects: SavedObjectWithMetadata[];
  savedObjectCounts: Record<string, number>;
  activeQuery: Query;
  selectedSavedObjects: SavedObjectWithMetadata[];
  isShowingImportFlyout: boolean;
  isSearching: boolean;
  filteredItemCount: number;
  isShowingRelationships: boolean;
  relationshipObject?: SavedObjectWithMetadata;
  isShowingDeleteConfirmModal: boolean;
  isShowingExportAllOptionsModal: boolean;
  isDeleting: boolean;
  exportAllOptions: ExportAllOption[];
  exportAllSelectedOptions: Record<string, boolean>;
  isIncludeReferencesDeepChecked: boolean;
  hasCustomBranding: boolean;
}

const unableFindSavedObjectsNotificationMessage = i18n.translate(
  'savedObjectsManagement.objectsTable.unableFindSavedObjectsNotificationMessage',
  { defaultMessage: 'Unable find saved objects' }
);
const unableFindSavedObjectNotificationMessage = i18n.translate(
  'savedObjectsManagement.objectsTable.unableFindSavedObjectNotificationMessage',
  { defaultMessage: 'Unable to find saved object' }
);

export class SavedObjectsTable extends Component<SavedObjectsTableProps, SavedObjectsTableState> {
  private _isMounted = false;
  private hasCustomBrandingSubscription?: Subscription;

  // Ref for delete button for accessibility/focus
  deleteButtonRef = React.createRef<HTMLButtonElement>();

  constructor(props: SavedObjectsTableProps) {
    super(props);

    this.state = {
      totalCount: 0,
      page: 0,
      perPage: props.perPageConfig || 50,
      sort: {
        field: 'updated_at',
        direction: 'desc',
      },
      savedObjects: [],
      savedObjectCounts: props.allowedTypes.reduce((typeToCountMap, type) => {
        typeToCountMap[type.name] = 0;
        return typeToCountMap;
      }, {} as Record<string, number>),
      activeQuery: props.initialQuery ?? Query.parse(''),
      selectedSavedObjects: [],
      isShowingImportFlyout: false,
      isSearching: true,
      filteredItemCount: 0,
      isShowingRelationships: false,
      relationshipObject: undefined,
      isShowingDeleteConfirmModal: false,
      isShowingExportAllOptionsModal: false,
      isDeleting: false,
      exportAllOptions: [],
      exportAllSelectedOptions: {},
      isIncludeReferencesDeepChecked: true,
      hasCustomBranding: false,
    };
  }

  componentDidMount() {
    this._isMounted = true;
    this.fetchAllSavedObjects();
    this.fetchCounts();
    this.hasCustomBrandingSubscription = this.props.customBranding.hasCustomBranding$.subscribe(
      (next) => {
        this.setState({ ...this.state, hasCustomBranding: next });
      }
    );
  }

  componentWillUnmount() {
    this._isMounted = false;
    this.debouncedFindObjects.cancel();
    this.debouncedBulkGetObjects.cancel();
    this.hasCustomBrandingSubscription?.unsubscribe();
  }

  fetchCounts = async () => {
    const { taggingApi } = this.props;
    const { queryText, visibleTypes, selectedTags } = parseQuery(
      this.state.activeQuery,
      this.props.allowedTypes
    );

    const allowedTypes = this.props.allowedTypes.map((type) => type.name);

    const selectedTypes = allowedTypes.filter(
      (type) => !visibleTypes || visibleTypes.includes(type)
    );

    const references = getTagFindReferences({ selectedTags, taggingApi });

    // These are the saved objects visible in the table.
    const filteredSavedObjectCounts = await getSavedObjectCounts({
      http: this.props.http,
      typesToInclude: selectedTypes,
      searchString: queryText,
      references,
    });

    const exportAllOptions: ExportAllOption[] = Object.entries(filteredSavedObjectCounts).map(
      ([id, count]) => ({
        id,
        label: `${id} (${count || 0})`,
      })
    );
    const exportAllSelectedOptions: Record<string, boolean> = exportAllOptions.reduce(
      (record, { id }) => {
        return {
          ...record,
          [id]: true,
        };
      },
      {}
    );

    // Fetch all the saved objects that exist so we can accurately populate the counts within
    // the table filter dropdown.
    const savedObjectCounts = await getSavedObjectCounts({
      http: this.props.http,
      typesToInclude: allowedTypes,
      searchString: queryText,
    });

    this.setState((state) => ({
      ...state,
      savedObjectCounts,
      exportAllOptions,
      exportAllSelectedOptions,
    }));
  };

  fetchAllSavedObjects = () => {
    this.setState({ isSearching: true }, this.debouncedFindObjects);
  };

  fetchSavedObjects = (objects: Array<{ type: string; id: string }>) => {
    this.setState({ isSearching: true }, () => this.debouncedBulkGetObjects(objects));
  };

  debouncedFindObjects = debounce(async () => {
    const { activeQuery: query, page, perPage, sort } = this.state;
    const { notifications, http, allowedTypes, taggingApi } = this.props;
    const { queryText, visibleTypes, selectedTags } = parseQuery(query, allowedTypes);

    const searchTypes = allowedTypes
      .map((type) => type.name)
      .filter((type) => !visibleTypes || visibleTypes.includes(type));

    // "searchFields" is missing from the "findOptions" but gets injected via the API.
    // The API extracts the fields from each uiExports.savedObjectsManagement "defaultSearchField" attribute
    const findOptions: FindQueryHTTP = {
      search: queryText ? `${queryText}*` : undefined,
      perPage,
      page: page + 1,
      type: searchTypes,
      sortField: sort?.field,
      sortOrder: sort?.direction,
      hasReference: getTagFindReferences({ selectedTags, taggingApi }),
    };

    try {
      const resp = await findObjects(http, findOptions);
      if (!this._isMounted) {
        return;
      }

      this.setState(({ activeQuery }) => {
        // ignore results for old requests
        if (activeQuery.text !== query.text) {
          return null;
        }

        return {
          savedObjects: resp.saved_objects,
          filteredItemCount: resp.total,
          isSearching: false,
        };
      });
    } catch (error) {
      if (this._isMounted) {
        this.setState({
          isSearching: false,
        });
      }
      notifications.toasts.addDanger({
        title: unableFindSavedObjectsNotificationMessage,
        text: `${error}`,
      });
    }
  }, 300);

  debouncedBulkGetObjects = debounce(async (objects: Array<{ type: string; id: string }>) => {
    const { notifications, http } = this.props;
    try {
      const resp = await bulkGetObjects(http, objects);
      if (!this._isMounted) {
        return;
      }

      const { map: fetchedObjectsMap, errors: objectErrors } = resp.reduce(
        ({ map, errors }, obj) => {
          if (obj.error) {
            errors.push(obj.error.message);
          } else {
            map.set(getObjectKey(obj), obj);
          }
          return { map, errors };
        },
        { map: new Map<string, SavedObjectWithMetadata>(), errors: [] as string[] }
      );

      if (objectErrors.length) {
        notifications.toasts.addDanger({
          title: unableFindSavedObjectNotificationMessage,
          text: objectErrors.join(', '),
        });
      }

      this.setState(({ savedObjects, filteredItemCount }) => {
        // modify the existing objects array, replacing any existing objects with the newly fetched ones
        const refreshedSavedObjects = savedObjects.map((obj) => {
          const fetchedObject = fetchedObjectsMap.get(getObjectKey(obj));
          return fetchedObject ?? obj;
        });
        return {
          savedObjects: refreshedSavedObjects,
          filteredItemCount,
          isSearching: false,
        };
      });
    } catch (error) {
      if (this._isMounted) {
        this.setState({
          isSearching: false,
        });
      }
      notifications.toasts.addDanger({
        title: unableFindSavedObjectsNotificationMessage,
        text: `${error}`,
      });
    }
  }, 300);

  refreshAllObjects = async () => {
    await Promise.all([this.fetchAllSavedObjects(), this.fetchCounts()]);
  };

  refreshObjects = async (objects: Array<{ type: string; id: string }>) => {
    const currentObjectsSet = this.state.savedObjects.reduce(
      (acc, obj) => acc.add(getObjectKey(obj)),
      new Set<string>()
    );
    const objectsToFetch = objects.filter((obj) => currentObjectsSet.has(getObjectKey(obj)));
    if (objectsToFetch.length) {
      this.fetchSavedObjects(objectsToFetch);
    }
  };

  onSelectionChanged = (selection: SavedObjectWithMetadata[]) => {
    this.setState({ selectedSavedObjects: selection }, () => {
      if (selection.length > 0 && this.deleteButtonRef.current) {
        if (this.deleteButtonRef.current && !this.deleteButtonRef.current.disabled) {
          this.deleteButtonRef.current.focus();
        }
      }
    });
  };

  onQueryChange = ({ query }: { query: Query }) => {
    // TODO: Use isSameQuery to compare new query with state.activeQuery to avoid re-fetching the
    // same data we already have.
    this.setState(
      {
        activeQuery: query,
        page: 0, // Reset this on each query change
        selectedSavedObjects: [],
      },
      () => {
        this.fetchAllSavedObjects();
        this.fetchCounts();
      }
    );
  };

  onTableChange = async (table: CriteriaWithPagination<SavedObjectWithMetadata>) => {
    const { index: page, size: perPage } = table.page || {};

    this.setState(
      {
        page,
        perPage,
        selectedSavedObjects: [],
        sort: table.sort,
      },
      this.fetchAllSavedObjects
    );
  };

  onShowRelationships = (object: SavedObjectWithMetadata) => {
    this.setState({
      isShowingRelationships: true,
      relationshipObject: object,
    });
  };

  onHideRelationships = () => {
    this.setState({
      isShowingRelationships: false,
      relationshipObject: undefined,
    });
  };

  onExport = async (includeReferencesDeep: boolean) => {
    const { selectedSavedObjects } = this.state;
    const { notifications, http } = this.props;
    const objectsToExport = selectedSavedObjects.map((obj) => ({ id: obj.id, type: obj.type }));

    let blob;
    try {
      blob = await fetchExportObjects(http, objectsToExport, includeReferencesDeep);
    } catch (e) {
      notifications.toasts.addDanger({
        title: i18n.translate('savedObjectsManagement.objectsTable.export.toastErrorMessage', {
          defaultMessage: 'Unable to generate export: {error}',
          values: {
            error: e.body?.message ?? e,
          },
        }),
      });
      throw e;
    }

    saveAs(blob, 'export.ndjson');

    const exportDetails = await extractExportDetails(blob);
    this.showExportCompleteMessage(exportDetails);
  };

  onExportAll = async () => {
    const { exportAllSelectedOptions, isIncludeReferencesDeepChecked, activeQuery } = this.state;
    const { notifications, http, taggingApi, allowedTypes } = this.props;
    const { queryText, selectedTags } = parseQuery(activeQuery, allowedTypes);
    const exportTypes = Object.entries(exportAllSelectedOptions).reduce((accum, [id, selected]) => {
      if (selected) {
        accum.push(id);
      }
      return accum;
    }, [] as string[]);

    const references = getTagFindReferences({ selectedTags, taggingApi });

    let blob;
    try {
      blob = await fetchExportByTypeAndSearch({
        http,
        search: queryText ? `${queryText}*` : undefined,
        types: exportTypes,
        references,
        includeReferencesDeep: isIncludeReferencesDeepChecked,
      });
    } catch (e) {
      notifications.toasts.addDanger({
        title: i18n.translate('savedObjectsManagement.objectsTable.export.toastErrorMessage', {
          defaultMessage: 'Unable to generate export: {error}',
          values: {
            error: e.body?.message ?? e,
          },
        }),
      });
      throw e;
    }

    saveAs(blob, 'export.ndjson');

    const exportDetails = await extractExportDetails(blob);
    this.showExportCompleteMessage(exportDetails);
    this.setState({ isShowingExportAllOptionsModal: false });
  };

  showExportCompleteMessage = (exportDetails: SavedObjectsExportResultDetails | undefined) => {
    const { notifications } = this.props;
    if (exportDetails) {
      if (exportDetails.missingReferences.length > 0) {
        return notifications.toasts.addWarning({
          title: i18n.translate(
            'savedObjectsManagement.objectsTable.export.successWithMissingRefsNotification',
            {
              defaultMessage:
                'Your file is downloading in the background. ' +
                'Some related objects could not be found. ' +
                'Please see the last line in the exported file for a list of missing objects.',
            }
          ),
        });
      }
      if (exportDetails.excludedObjects.length > 0) {
        return notifications.toasts.addSuccess({
          title: i18n.translate(
            'savedObjectsManagement.objectsTable.export.successWithExcludedObjectsNotification',
            {
              defaultMessage:
                'Your file is downloading in the background. ' +
                'Some objects were excluded from the export. ' +
                'Please see the last line in the exported file for a list of excluded objects.',
            }
          ),
        });
      }
    }
    return notifications.toasts.addSuccess({
      title: i18n.translate('savedObjectsManagement.objectsTable.export.successNotification', {
        defaultMessage: 'Your file is downloading in the background',
      }),
    });
  };

  finishImport = () => {
    this.hideImportFlyout();
    this.fetchAllSavedObjects();
    this.fetchCounts();
  };

  showImportFlyout = () => {
    this.setState({ isShowingImportFlyout: true });
  };

  hideImportFlyout = () => {
    this.setState({ isShowingImportFlyout: false });
  };

  onDelete = () => {
    this.setState({ isShowingDeleteConfirmModal: true });
  };

  delete = async () => {
    const { http, notifications } = this.props;
    const { selectedSavedObjects, isDeleting } = this.state;

    if (isDeleting) {
      return;
    }

    this.setState({ isDeleting: true });

    const indexPatterns = selectedSavedObjects.filter((object) => object.type === 'index-pattern');
    if (indexPatterns.length) {
      await this.props.dataViews.clearCache();
    }

    const deleteStatus = await bulkDeleteObjects(
      http,
      selectedSavedObjects
        .filter((object) => !object.meta.hiddenType)
        .map(({ id, type }) => ({ id, type }))
    );

    notifications.toasts.addInfo({
      title: i18n.translate('savedObjectsManagement.objectsTable.delete.successNotification', {
        defaultMessage: `Successfully deleted {count, plural, one {# object} other {# objects}}.`,
        values: {
          count: deleteStatus.filter(({ success }) => !!success).length,
        },
      }),
    });

    // Unset this
    this.setState({
      selectedSavedObjects: selectedSavedObjects.filter(({ id, type }) =>
        deleteStatus.some(matches({ id, type, success: false }))
      ),
    });

    // Fetching all data
    this.fetchAllSavedObjects();
    await this.fetchCounts();

    // Allow the user to interact with the table once the saved objects have been re-fetched.
    this.setState({
      isShowingDeleteConfirmModal: false,
      isDeleting: false,
    });
  };

  getRelationships = async (type: string, id: string) => {
    const { http } = this.props;
    const allowedTypeNames = this.props.allowedTypes.map((t) => t.name);
    return await getRelationships(http, type, id, allowedTypeNames);
  };

  renderFlyout() {
    if (!this.state.isShowingImportFlyout) {
      return null;
    }
    const { applications } = this.props;
    const newIndexPatternUrl = applications.getUrlForApp('management', {
      path: 'kibana/indexPatterns',
    });

    return (
      <Flyout
        close={this.hideImportFlyout}
        done={this.finishImport}
        http={this.props.http}
        dataViews={this.props.dataViews}
        newIndexPatternUrl={newIndexPatternUrl}
        basePath={this.props.http.basePath}
        search={this.props.search}
        allowedTypes={this.props.allowedTypes}
        showPlainSpinner={this.state.hasCustomBranding}
      />
    );
  }

  renderRelationships() {
    if (!this.state.isShowingRelationships) {
      return null;
    }

    return (
      <Relationships
        basePath={this.props.http.basePath}
        savedObject={this.state.relationshipObject!}
        getRelationships={this.getRelationships}
        close={this.onHideRelationships}
        goInspectObject={this.props.goInspectObject}
        canGoInApp={this.props.canGoInApp}
        allowedTypes={this.props.allowedTypes}
        showPlainSpinner={this.state.hasCustomBranding}
      />
    );
  }

  renderDeleteConfirmModal() {
    const { isShowingDeleteConfirmModal, isDeleting, selectedSavedObjects, hasCustomBranding } =
      this.state;
    const { allowedTypes } = this.props;

    if (!isShowingDeleteConfirmModal) {
      return null;
    }

    return (
      <DeleteConfirmModal
        isDeleting={isDeleting}
        onConfirm={() => {
          this.delete();
        }}
        onCancel={() => {
          this.setState({ isShowingDeleteConfirmModal: false });
        }}
        selectedObjects={selectedSavedObjects}
        allowedTypes={allowedTypes}
        showPlainSpinner={hasCustomBranding}
      />
    );
  }

  renderExportAllOptionsModal() {
    const {
      isShowingExportAllOptionsModal,
      filteredItemCount,
      exportAllOptions,
      exportAllSelectedOptions,
      isIncludeReferencesDeepChecked,
    } = this.state;

    if (!isShowingExportAllOptionsModal) {
      return null;
    }

    return (
      <ExportModal
        onExport={this.onExportAll}
        onCancel={() => {
          this.setState({ isShowingExportAllOptionsModal: false });
        }}
        onSelectedOptionsChange={(newOptions) => {
          this.setState({
            exportAllSelectedOptions: newOptions,
          });
        }}
        filteredItemCount={filteredItemCount}
        options={exportAllOptions}
        selectedOptions={exportAllSelectedOptions}
        includeReferences={isIncludeReferencesDeepChecked}
        onIncludeReferenceChange={(newIncludeReferences) => {
          this.setState({
            isIncludeReferencesDeepChecked: newIncludeReferences,
          });
        }}
      />
    );
  }

  render() {
    const {
      selectedSavedObjects,
      page,
      perPage,
      savedObjects,
      filteredItemCount,
      isSearching,
      savedObjectCounts,
      sort,
    } = this.state;
    const { http, taggingApi, allowedTypes, applications } = this.props;

    const selectionConfig = {
      onSelectionChange: this.onSelectionChanged,
    };

    const filtersWithoutTags = allowedTypes.filter((t) => t.name !== 'tag');
    const itemsWithoutTags = savedObjects.filter((t) => t.type !== 'tag');

    const filterOptions = filtersWithoutTags.map((type) => ({
      value: type.displayName,
      name: type.displayName,
      view: `${type.displayName} (${savedObjectCounts[type.name] || 0})`,
    }));

    return (
      <div>
        {/* ARIA live region for selection changes (optional but a11y best practice) */}
        <div aria-live="polite" style={{ position: 'absolute', left: '-9999px' }}>
          {selectedSavedObjects.length > 0
            ? i18n.translate(
                'savedObjectsManagement.objectsTable.selected.selectedSavedObjectsLabel',
                {
                  defaultMessage: '{count, plural, one {# item} other {# items}} selected.',
                  values: {
                    count: selectedSavedObjects.length,
                  },
                }
              )
            : ''}
        </div>
        {this.renderFlyout()}
        {this.renderRelationships()}
        {this.renderDeleteConfirmModal()}
        {this.renderExportAllOptionsModal()}
        <Header
          onExportAll={() => this.setState({ isShowingExportAllOptionsModal: true })}
          onImport={this.showImportFlyout}
          onRefresh={this.refreshAllObjects}
          filteredCount={filteredItemCount}
        />
        <EuiSpacer size="l" />
        <RedirectAppLinks
          coreStart={{
            application: applications,
          }}
        >
          <Table
            basePath={http.basePath}
            taggingApi={taggingApi}
            initialQuery={this.props.initialQuery}
            allowedTypes={allowedTypes}
            itemId={(item: SavedObjectWithMetadata) => `${item.type}:${item.id}`}
            actionRegistry={this.props.actionRegistry}
            columnRegistry={this.props.columnRegistry}
            selectionConfig={selectionConfig}
            selectedSavedObjects={selectedSavedObjects}
            onQueryChange={this.onQueryChange}
            onTableChange={this.onTableChange}
            filterOptions={filterOptions}
            onExport={this.onExport}
            capabilities={applications.capabilities}
            onDelete={this.onDelete}
            onActionRefresh={this.refreshObjects}
            goInspectObject={this.props.goInspectObject}
            pageIndex={page}
            pageSize={perPage}
            sort={sort}
            items={itemsWithoutTags}
            totalItemCount={filteredItemCount}
            isSearching={isSearching}
            onShowRelationships={this.onShowRelationships}
            canGoInApp={this.props.canGoInApp}
            deleteButtonRef={this.deleteButtonRef}
          />
        </RedirectAppLinks>
      </div>
    );
  }
}

function getObjectKey(obj: { type: string; id: string }) {
  return `${obj.type}:${obj.id}`;
}
