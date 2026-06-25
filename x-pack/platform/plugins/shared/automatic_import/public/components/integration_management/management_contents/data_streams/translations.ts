/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const ADD_DATA_STREAM_BUTTON = i18n.translate(
  'xpack.automaticImport.dataStreams.addDataStreamButton',
  {
    defaultMessage: 'Add Data Stream',
  }
);

export const ADD_DATA_STREAM_DISABLED_TOOLTIP = i18n.translate(
  'xpack.automaticImport.dataStreams.addDataStreamDisabledTooltip',
  {
    defaultMessage:
      'Enter a unique integration name (at least 2 characters) and description before adding a data stream.',
  }
);

export const DATA_STREAMS_TITLE = i18n.translate(
  'xpack.automaticImport.dataStreams.dataStreamsTitle',
  {
    defaultMessage: 'Data Streams',
  }
);

export const DATA_STREAMS_DESCRIPTION = i18n.translate(
  'xpack.automaticImport.dataStreams.dataStreamsDescription',
  {
    defaultMessage:
      'You can add multiple data streams. When the ECS fields are mapped, you can review the mapping and ingest pipeline for each data field.',
  }
);

export const CREATE_DATA_STREAM_TITLE = i18n.translate(
  'xpack.automaticImport.dataStreams.createDataStreamTitle',
  {
    defaultMessage: 'Data Stream',
  }
);

export const CREATE_DATA_STREAM_DESCRIPTION = i18n.translate(
  'xpack.automaticImport.dataStreams.createDataStreamDescription',
  {
    defaultMessage: 'Set up a custom ingestion pipeline based on sample data',
  }
);

export const DATA_STREAM_TITLE_LABEL = i18n.translate(
  'xpack.automaticImport.dataStreams.dataStreamTitleLabel',
  {
    defaultMessage: 'Data stream title',
  }
);

export const DATA_STREAM_DESCRIPTION_LABEL = i18n.translate(
  'xpack.automaticImport.dataStreams.dataStreamDescriptionLabel',
  {
    defaultMessage: 'Data stream description',
  }
);

export const DATA_COLLECTION_METHOD_LABEL = i18n.translate(
  'xpack.automaticImport.dataStreams.dataCollectionMethodLabel',
  {
    defaultMessage: 'Data collection method',
  }
);

export const LOGS_SECTION_TITLE = i18n.translate(
  'xpack.automaticImport.dataStreams.logsSectionTitle',
  {
    defaultMessage: 'Logs',
  }
);

export const LOGS_SECTION_DESCRIPTION = i18n.translate(
  'xpack.automaticImport.dataStreams.logsSectionDescription',
  {
    defaultMessage: 'Upload a sample log file, or select an index with sample data',
  }
);

export const LOG_SAMPLE_REQUIRED_FOR_ANALYSIS = i18n.translate(
  'xpack.automaticImport.dataStreams.logSampleRequiredForAnalysis',
  {
    defaultMessage: 'Log sample is required for analysis',
  }
);

export const AI_ANALYSIS_CALLOUT = i18n.translate(
  'xpack.automaticImport.dataStreams.aiAnalysisCallout',
  {
    defaultMessage:
      'Please note that this data will be analyzed by a third-party AI tool. Ensure that you comply with privacy and security guidelines when selecting data',
  }
);

export const UPLOAD_LOG_FILE_LABEL = i18n.translate(
  'xpack.automaticImport.dataStreams.uploadLogFileLabel',
  {
    defaultMessage: 'Upload a log file',
  }
);

export const SELECT_INDEX_LABEL = i18n.translate(
  'xpack.automaticImport.dataStreams.selectIndexLabel',
  {
    defaultMessage: 'Select an index',
  }
);

export const FILE_PICKER_PROMPT = i18n.translate(
  'xpack.automaticImport.dataStreams.filePickerPrompt',
  {
    defaultMessage: 'Select or drag and drop a file',
  }
);

export const CANCEL_BUTTON = i18n.translate('xpack.automaticImport.dataStreams.cancelButton', {
  defaultMessage: 'Cancel',
});

export const ANALYZE_LOGS_BUTTON = i18n.translate(
  'xpack.automaticImport.dataStreams.analyzeLogsButton',
  {
    defaultMessage: 'Analyze logs',
  }
);

export const ANALYZE_LOGS_DISABLED_LOADING = i18n.translate(
  'xpack.automaticImport.dataStreams.analyzeLogsDisabledLoading',
  {
    defaultMessage: 'Please wait for the current operation to finish.',
  }
);

export const CREATE_DATA_STREAM_ERROR = i18n.translate(
  'xpack.automaticImport.dataStreams.createDataStreamError',
  {
    defaultMessage: 'Failed to create data stream',
  }
);

export const SAMPLES_NORMALIZED_WARNING_TITLE = i18n.translate(
  'xpack.automaticImport.dataStreams.samplesNormalizedWarningTitle',
  {
    defaultMessage: 'Sample log limits applied',
  }
);

export const SAMPLES_NORMALIZED_WARNING_LINES_OMITTED = (omittedCount: number, maxLines: number) =>
  i18n.translate('xpack.automaticImport.dataStreams.samplesNormalizedWarningLinesOmitted', {
    defaultMessage:
      'Only the first {maxLines} non-empty lines are sent. {omittedCount, plural, one {# additional line was not sent.} other {# additional lines were not sent.}}',
    values: { omittedCount, maxLines },
  });

export const LOG_FILE_ERROR = {
  CAN_NOT_READ: i18n.translate('xpack.automaticImport.dataStreams.logFileError.canNotRead', {
    defaultMessage: 'Failed to read the log file',
  }),
  CAN_NOT_READ_WITH_REASON: (reason: string) =>
    i18n.translate('xpack.automaticImport.dataStreams.logFileError.canNotReadWithReason', {
      defaultMessage: 'Failed to read the log file: {reason}',
      values: { reason },
    }),
  TOO_LARGE_TO_PARSE: i18n.translate(
    'xpack.automaticImport.dataStreams.logFileError.tooLargeToParse',
    {
      defaultMessage: 'This log file is too large to parse',
    }
  ),
};

export const SELECT_PLACEHOLDER = i18n.translate(
  'xpack.automaticImport.dataStreams.selectPlaceholder',
  {
    defaultMessage: 'Select...',
  }
);

export const ZERO_STATE_DESCRIPTION = i18n.translate(
  'xpack.automaticImport.dataStreams.zeroStateDescription',
  {
    defaultMessage: 'You have no data streams yet',
  }
);

export const TABLE_COLUMN_HEADERS = Object.freeze({
  title: i18n.translate('xpack.automaticImport.dataStreams.table.titleColumnHeader', {
    defaultMessage: 'Title',
  }),
  dataCollectionMethods: i18n.translate(
    'xpack.automaticImport.dataStreams.table.dataCollectionMethodsColumnHeader',
    {
      defaultMessage: 'Data Collection Methods',
    }
  ),
  status: i18n.translate('xpack.automaticImport.dataStreams.table.statusColumnHeader', {
    defaultMessage: 'Status',
  }),
  actions: i18n.translate('xpack.automaticImport.dataStreams.table.actionsColumnHeader', {
    defaultMessage: 'Actions',
  }),
  field: i18n.translate('xpack.automaticImport.dataStreams.table.fieldColumnHeader', {
    defaultMessage: 'Field',
  }),
  value: i18n.translate('xpack.automaticImport.dataStreams.table.valueColumnHeader', {
    defaultMessage: 'Value',
  }),
});

export const TABLE_ACTIONS = Object.freeze({
  expand: i18n.translate('xpack.automaticImport.dataStreams.table.expandAction', {
    defaultMessage: 'Expand',
  }),
  expandDescription: i18n.translate(
    'xpack.automaticImport.dataStreams.table.expandActionDescription',
    {
      defaultMessage: 'Expand for details about this data stream',
    }
  ),
  refresh: i18n.translate('xpack.automaticImport.dataStreams.table.refreshAction', {
    defaultMessage: 'Refresh',
  }),
  refreshDescription: i18n.translate(
    'xpack.automaticImport.dataStreams.table.refreshActionDescription',
    {
      defaultMessage: 'Refresh this data stream',
    }
  ),
  delete: i18n.translate('xpack.automaticImport.dataStreams.table.deleteAction', {
    defaultMessage: 'Delete',
  }),
  deleteDescription: i18n.translate(
    'xpack.automaticImport.dataStreams.table.deleteActionDescription',
    {
      defaultMessage: 'Delete this data stream',
    }
  ),
});

export const DELETE_MODAL = Object.freeze({
  title: (dataStreamTitle: string) =>
    i18n.translate('xpack.automaticImport.dataStreams.deleteModal.title', {
      defaultMessage: 'Are you sure you want to delete "{dataStreamTitle}"?',
      values: { dataStreamTitle },
    }),
  cancelButton: i18n.translate('xpack.automaticImport.dataStreams.deleteModal.cancelButton', {
    defaultMessage: 'Cancel',
  }),
  confirmButton: i18n.translate('xpack.automaticImport.dataStreams.deleteModal.confirmButton', {
    defaultMessage: 'Delete',
  }),
});

export const REANALYZE_MODAL = Object.freeze({
  title: (dataStreamTitle: string) =>
    i18n.translate('xpack.automaticImport.dataStreams.reanalyzeModal.title', {
      defaultMessage: 'Re-analyze data stream "{dataStreamTitle}"?',
      values: { dataStreamTitle },
    }),
  body: i18n.translate('xpack.automaticImport.dataStreams.reanalyzeModal.body', {
    defaultMessage:
      'This will re-run the AI analysis on this data stream. The existing data stream will be overwritten.',
  }),
  cancelButton: i18n.translate('xpack.automaticImport.dataStreams.reanalyzeModal.cancelButton', {
    defaultMessage: 'Cancel',
  }),
  confirmButton: i18n.translate('xpack.automaticImport.dataStreams.reanalyzeModal.confirmButton', {
    defaultMessage: 'Re-Analyze',
  }),
});

export const EDIT_PIPELINE_FLYOUT = Object.freeze({
  tableCaption: i18n.translate(
    'xpack.automaticImport.dataStreams.editPipelineFlyout.tableCaption',
    {
      defaultMessage: 'Pipeline fields',
    }
  ),
  documents: i18n.translate('xpack.automaticImport.dataStreams.editPipelineFlyout.documents', {
    defaultMessage: 'Documents',
  }),
  paginationAriaLabel: i18n.translate(
    'xpack.automaticImport.dataStreams.editPipelineFlyout.paginationAriaLabel',
    {
      defaultMessage: 'Edit pipeline pagination',
    }
  ),
  tableTab: i18n.translate('xpack.automaticImport.dataStreams.editPipelineFlyout.tableTab', {
    defaultMessage: 'Table',
  }),
  pipelineTab: i18n.translate('xpack.automaticImport.dataStreams.editPipelineFlyout.pipelineTab', {
    defaultMessage: 'Ingest pipeline',
  }),
  filterPlaceholder: i18n.translate(
    'xpack.automaticImport.dataStreams.editPipelineFlyout.filterPlaceholder',
    {
      defaultMessage: 'Filter by field, value',
    }
  ),
  errorTitle: i18n.translate('xpack.automaticImport.dataStreams.editPipelineFlyout.errorTitle', {
    defaultMessage: 'Error loading data',
  }),
  errorMessage: i18n.translate(
    'xpack.automaticImport.dataStreams.editPipelineFlyout.errorMessage',
    {
      defaultMessage: 'Failed to load pipeline results. Please try again.',
    }
  ),
  saveButton: i18n.translate('xpack.automaticImport.dataStreams.editPipelineFlyout.saveButton', {
    defaultMessage: 'Save',
  }),
  saveErrorTitle: i18n.translate(
    'xpack.automaticImport.dataStreams.editPipelineFlyout.saveErrorTitle',
    {
      defaultMessage: 'Unable to save ingest pipeline',
    }
  ),
  saveErrorMessage: i18n.translate(
    'xpack.automaticImport.dataStreams.editPipelineFlyout.saveErrorMessage',
    {
      defaultMessage: 'Failed to save ingest pipeline. Please fix errors and try again.',
    }
  ),
  closeConfirmTitle: i18n.translate(
    'xpack.automaticImport.dataStreams.editPipelineFlyout.closeConfirmTitle',
    {
      defaultMessage: 'Discard unsaved changes?',
    }
  ),
  closeConfirmBody: i18n.translate(
    'xpack.automaticImport.dataStreams.editPipelineFlyout.closeConfirmBody',
    {
      defaultMessage: 'You have unsaved changes in the ingest pipeline editor.',
    }
  ),
  closeConfirmCancel: i18n.translate(
    'xpack.automaticImport.dataStreams.editPipelineFlyout.closeConfirmCancel',
    {
      defaultMessage: 'Keep editing',
    }
  ),
  closeConfirmDiscard: i18n.translate(
    'xpack.automaticImport.dataStreams.editPipelineFlyout.closeConfirmDiscard',
    {
      defaultMessage: 'Discard changes',
    }
  ),
  invalidJsonError: (reason: string) =>
    i18n.translate('xpack.automaticImport.dataStreams.editPipelineFlyout.invalidJsonError', {
      defaultMessage: 'Invalid ingest pipeline JSON: {reason}',
      values: { reason },
    }),
});

export const STATUS_LABELS = Object.freeze({
  analyzing: i18n.translate('xpack.automaticImport.dataStreams.status.analyzing', {
    defaultMessage: 'Analyzing',
  }),
  success: i18n.translate('xpack.automaticImport.dataStreams.status.success', {
    defaultMessage: 'Success',
  }),
  failed: i18n.translate('xpack.automaticImport.dataStreams.status.failed', {
    defaultMessage: 'Failed',
  }),
  cancelled: i18n.translate('xpack.automaticImport.dataStreams.status.cancelled', {
    defaultMessage: 'Cancelled',
  }),
  approved: i18n.translate('xpack.automaticImport.dataStreams.status.approved', {
    defaultMessage: 'Approved',
  }),
  deleting: i18n.translate('xpack.automaticImport.dataStreams.status.deleting', {
    defaultMessage: 'Deleting...',
  }),
});

export const PHASE_LABELS = Object.freeze({
  analyzing_logs: i18n.translate('xpack.automaticImport.dataStreams.phase.analyzingLogs', {
    defaultMessage: 'Analyzing logs',
  }),
  mapping_to_ecs: i18n.translate('xpack.automaticImport.dataStreams.phase.mappingToEcs', {
    defaultMessage: 'Mapping to ECS',
  }),
  building_pipeline: i18n.translate('xpack.automaticImport.dataStreams.phase.buildingPipeline', {
    defaultMessage: 'Building ingest pipeline',
  }),
  fixing_pipeline: i18n.translate('xpack.automaticImport.dataStreams.phase.fixingPipeline', {
    defaultMessage: 'Fixing ingest pipeline',
  }),
  mapping_event_fields: i18n.translate(
    'xpack.automaticImport.dataStreams.phase.mappingEventFields',
    {
      defaultMessage: 'Mapping event fields',
    }
  ),
  mapping_related_fields: i18n.translate(
    'xpack.automaticImport.dataStreams.phase.mappingRelatedFields',
    {
      defaultMessage: 'Mapping related fields',
    }
  ),
  reviewing: i18n.translate('xpack.automaticImport.dataStreams.phase.reviewing', {
    defaultMessage: 'Reviewing',
  }),
  finalizing: i18n.translate('xpack.automaticImport.dataStreams.phase.finalizing', {
    defaultMessage: 'Finalizing',
  }),
});

// Aria Labels
export const ARIA_LABELS = Object.freeze({
  uploadLogFile: i18n.translate('xpack.automaticImport.dataStreams.ariaLabels.uploadLogFile', {
    defaultMessage: 'Upload log file',
  }),
  selectIndex: i18n.translate('xpack.automaticImport.dataStreams.ariaLabels.selectIndex', {
    defaultMessage: 'Select an index',
  }),
});
