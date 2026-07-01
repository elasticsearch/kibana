/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const mainTranslations = {
  pageTitle: i18n.translate('xpack.dataFederation.pageTitle', {
    defaultMessage: 'ES|QL Data Federation',
  }),

  pageDescription: i18n.translate('xpack.dataFederation.pageDescription', {
    defaultMessage:
      'Connect to external data sources and add specific datasets to query with ES|QL, just like your indexed data. No ingestion required.',
  }),

  technicalPreview: i18n.translate('xpack.dataFederation.technicalPreview', {
    defaultMessage: 'Technical Preview',
  }),

  docsLink: i18n.translate('xpack.dataFederation.docsLink', {
    defaultMessage: 'Learn more',
  }),

  columns: {
    dataSources: {
      name: i18n.translate('xpack.dataFederation.table.columnName', {
        defaultMessage: 'Name',
      }),
      type: i18n.translate('xpack.dataFederation.table.columnType', {
        defaultMessage: 'Type',
      }),
      dataSetsCount: i18n.translate('xpack.dataFederation.table.columnDataSetsCount', {
        defaultMessage: 'Datasets',
      }),
      description: i18n.translate('xpack.dataFederation.table.columnDescription', {
        defaultMessage: 'Description',
      }),
      actions: i18n.translate('xpack.dataFederation.table.columnActions', {
        defaultMessage: 'Actions',
      }),
      editAction: i18n.translate('xpack.dataFederation.table.editAction', {
        defaultMessage: 'Edit',
      }),
      editActionDescription: i18n.translate('xpack.dataFederation.table.editActionDescription', {
        defaultMessage: 'Edit data source',
      }),
      deleteAction: i18n.translate('xpack.dataFederation.table.deleteAction', {
        defaultMessage: 'Delete',
      }),
      deleteActionDescription: i18n.translate(
        'xpack.dataFederation.table.deleteActionDescription',
        {
          defaultMessage: 'Delete data source',
        }
      ),
      caption: i18n.translate('xpack.dataFederation.table.caption', {
        defaultMessage: 'Data sources',
      }),
      noItems: i18n.translate('xpack.dataFederation.table.noItems', {
        defaultMessage:
          "You don't have any data sources yet. Connect to a data source to get started.",
      }),
      searchPlaceholder: i18n.translate('xpack.dataFederation.search.placeholder', {
        defaultMessage: 'Search data sources…',
      }),
    },
    dataSets: {
      name: i18n.translate('xpack.dataFederation.setsTable.columnName', {
        defaultMessage: 'Name',
      }),
      dataSourceId: i18n.translate('xpack.dataFederation.setsTable.columnDataSourceId', {
        defaultMessage: 'Data source',
      }),
      dataSourceType: i18n.translate('xpack.dataFederation.setsTable.columnDataSourceType', {
        defaultMessage: 'Data source type',
      }),
      dataSourceTypeMissing: i18n.translate(
        'xpack.dataFederation.setsTable.dataSourceTypeMissing',
        {
          defaultMessage: 'Unknown',
        }
      ),
      resource: i18n.translate('xpack.dataFederation.setsTable.columnResource', {
        defaultMessage: 'Resource',
      }),
      description: i18n.translate('xpack.dataFederation.setsTable.columnDescription', {
        defaultMessage: 'Description',
      }),
      actions: i18n.translate('xpack.dataFederation.setsTable.columnActions', {
        defaultMessage: 'Actions',
      }),
      editAction: i18n.translate('xpack.dataFederation.setsTable.editAction', {
        defaultMessage: 'Edit',
      }),
      editActionDescription: i18n.translate(
        'xpack.dataFederation.setsTable.editActionDescription',
        {
          defaultMessage: 'Edit dataset',
        }
      ),
      deleteAction: i18n.translate('xpack.dataFederation.setsTable.deleteAction', {
        defaultMessage: 'Delete',
      }),
      deleteActionDescription: i18n.translate(
        'xpack.dataFederation.setsTable.deleteActionDescription',
        {
          defaultMessage: 'Delete dataset',
        }
      ),
      caption: i18n.translate('xpack.dataFederation.setsTable.caption', {
        defaultMessage: 'Datasets',
      }),
      noItems: i18n.translate('xpack.dataFederation.setsTable.noItems', {
        defaultMessage: 'Add a dataset to start querying your data sources.',
      }),
      searchPlaceholder: i18n.translate('xpack.dataFederation.setsSearch.placeholder', {
        defaultMessage: 'Search datasets…',
      }),
      addButtonLabel: i18n.translate('xpack.dataFederation.setsAddButtonLabel', {
        defaultMessage: 'Add dataset',
      }),
    },
  },

  tabs: {
    sets: i18n.translate('xpack.dataFederation.tabs.sets', {
      defaultMessage: 'Datasets',
    }),
    sources: i18n.translate('xpack.dataFederation.tabs.sources', {
      defaultMessage: 'Data sources',
    }),
  },

  actions: {
    deleteButtonLabel: i18n.translate('xpack.dataFederation.deleteButtonLabel', {
      defaultMessage: 'Delete',
    }),
    addButtonLabel: i18n.translate('xpack.dataFederation.addButtonLabel', {
      defaultMessage: 'Connect data source',
    }),
  },

  filters: {
    dataSource: i18n.translate('xpack.dataFederation.filters.dataSource', {
      defaultMessage: 'Data source',
    }),
    allDataSources: i18n.translate('xpack.dataFederation.filters.allDataSources', {
      defaultMessage: 'Data sources',
    }),
  },

  confirmDeleteDataSource: {
    title: i18n.translate('xpack.dataFederation.confirmDeleteDataSource.title', {
      defaultMessage: 'Delete data source',
    }),
    prompt: i18n.translate('xpack.dataFederation.confirmDeleteDataSource.prompt', {
      defaultMessage: 'Are you sure you want to delete this data source?',
    }),
    warning: i18n.translate('xpack.dataFederation.confirmDeleteDataSource.warning', {
      defaultMessage: 'This action cannot be undone.',
    }),
    cancelButton: i18n.translate('xpack.dataFederation.confirmDeleteDataSource.cancelButton', {
      defaultMessage: 'Cancel',
    }),
    confirmButton: i18n.translate('xpack.dataFederation.confirmDeleteDataSource.confirmButton', {
      defaultMessage: 'Delete',
    }),
    errorTitle: i18n.translate('xpack.dataFederation.confirmDeleteDataSource.errorTitle', {
      defaultMessage: 'Delete failed',
    }),
  },

  confirmDeleteDataSources: {
    title: i18n.translate('xpack.dataFederation.confirmDeleteDataSources.title', {
      defaultMessage: 'Delete data sources',
    }),
    prompt: (count: number) =>
      i18n.translate('xpack.dataFederation.confirmDeleteDataSources.prompt', {
        defaultMessage: 'Are you sure you want to delete {count} data sources?',
        values: { count },
      }),
    countLabel: (count: number) =>
      i18n.translate('xpack.dataFederation.confirmDeleteDataSources.countLabel', {
        defaultMessage: '{count} data sources selected',
        values: { count },
      }),
    warning: i18n.translate('xpack.dataFederation.confirmDeleteDataSources.warning', {
      defaultMessage: 'This action cannot be undone.',
    }),
    cancelButton: i18n.translate('xpack.dataFederation.confirmDeleteDataSources.cancelButton', {
      defaultMessage: 'Cancel',
    }),
    confirmButton: i18n.translate('xpack.dataFederation.confirmDeleteDataSources.confirmButton', {
      defaultMessage: 'Delete',
    }),
    errorTitle: i18n.translate('xpack.dataFederation.confirmDeleteDataSources.errorTitle', {
      defaultMessage: 'Delete failed',
    }),
    hasRelatedDataSetsError: i18n.translate(
      'xpack.dataFederation.confirmDeleteDataSources.hasRelatedDataSetsError',
      {
        defaultMessage:
          'Unable to delete one or more data sources because datasets read from them. Delete those datasets first.',
      }
    ),
  },

  confirmDeleteDataSet: {
    title: i18n.translate('xpack.dataFederation.confirmDeleteDataSet.title', {
      defaultMessage: 'Delete dataset',
    }),
    prompt: i18n.translate('xpack.dataFederation.confirmDeleteDataSet.prompt', {
      defaultMessage: 'Are you sure you want to delete this dataset?',
    }),
    warning: i18n.translate('xpack.dataFederation.confirmDeleteDataSet.warning', {
      defaultMessage: 'This action cannot be undone.',
    }),
    cancelButton: i18n.translate('xpack.dataFederation.confirmDeleteDataSet.cancelButton', {
      defaultMessage: 'Cancel',
    }),
    confirmButton: i18n.translate('xpack.dataFederation.confirmDeleteDataSet.confirmButton', {
      defaultMessage: 'Delete',
    }),
    errorTitle: i18n.translate('xpack.dataFederation.confirmDeleteDataSet.errorTitle', {
      defaultMessage: 'Delete failed',
    }),
  },

  confirmDeleteDataSets: {
    title: i18n.translate('xpack.dataFederation.confirmDeleteDataSets.title', {
      defaultMessage: 'Delete datasets',
    }),
    prompt: (count: number) =>
      i18n.translate('xpack.dataFederation.confirmDeleteDataSets.prompt', {
        defaultMessage: 'Are you sure you want to delete {count} datasets?',
        values: { count },
      }),
    warning: i18n.translate('xpack.dataFederation.confirmDeleteDataSets.warning', {
      defaultMessage: 'This action cannot be undone.',
    }),
    cancelButton: i18n.translate('xpack.dataFederation.confirmDeleteDataSets.cancelButton', {
      defaultMessage: 'Cancel',
    }),
    confirmButton: i18n.translate('xpack.dataFederation.confirmDeleteDataSets.confirmButton', {
      defaultMessage: 'Delete',
    }),
    errorTitle: i18n.translate('xpack.dataFederation.confirmDeleteDataSets.errorTitle', {
      defaultMessage: 'Delete failed',
    }),
  },
} as const;
