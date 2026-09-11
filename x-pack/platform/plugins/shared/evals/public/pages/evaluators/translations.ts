/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const CREATE_BUTTON = i18n.translate('xpack.evals.evaluators.createButtonLabel', {
  defaultMessage: 'Create evaluator',
});
export const SEARCH_PLACEHOLDER = i18n.translate('xpack.evals.evaluators.searchPlaceholder', {
  defaultMessage: 'Search evaluators',
});
export const ALL_KINDS = i18n.translate('xpack.evals.evaluators.allKindsDropDownOptionLabel', {
  defaultMessage: 'All kinds',
});
export const ALL_ORIGINS = i18n.translate('xpack.evals.evaluators.allOriginsDropDownOptionLabel', {
  defaultMessage: 'All origins',
});
export const LLM_KIND = i18n.translate('xpack.evals.evaluators.llmKindLabel', {
  defaultMessage: 'LLM judge',
});
export const CODE_KIND = i18n.translate('xpack.evals.evaluators.codeKindLabel', {
  defaultMessage: 'Code',
});
export const BUILT_IN_ORIGIN = i18n.translate('xpack.evals.evaluators.builtInOriginLabel', {
  defaultMessage: 'Built-in',
});
export const USER_DEFINED_ORIGIN = i18n.translate('xpack.evals.evaluators.userDefinedOriginLabel', {
  defaultMessage: 'User-defined',
});
export const COLUMN_NAME = i18n.translate('xpack.evals.evaluators.nameColumnLabel', {
  defaultMessage: 'Name',
});
export const COLUMN_DESCRIPTION = i18n.translate('xpack.evals.evaluators.descriptionColumnLabel', {
  defaultMessage: 'Description',
});
export const COLUMN_KIND = i18n.translate('xpack.evals.evaluators.kindColumnLabel', {
  defaultMessage: 'Kind',
});
export const COLUMN_ORIGIN = i18n.translate('xpack.evals.evaluators.originColumnLabel', {
  defaultMessage: 'Origin',
});
export const COLUMN_VERSION = i18n.translate('xpack.evals.evaluators.versionColumnLabel', {
  defaultMessage: 'Version',
});
export const COLUMN_INPUTS = i18n.translate('xpack.evals.evaluators.inputsColumnLabel', {
  defaultMessage: 'Required inputs',
});
export const COLUMN_ACTIONS = i18n.translate('xpack.evals.evaluators.actionsColumnLabel', {
  defaultMessage: 'Actions',
});
export const TABLE_CAPTION = i18n.translate('xpack.evals.evaluators.tableCaption', {
  defaultMessage: 'Evaluators available in this space',
});
export const NO_INPUTS = i18n.translate('xpack.evals.evaluators.noInputsLabel', {
  defaultMessage: 'None',
});
export const EVIDENCE_INPUTS = (inputs: string) =>
  i18n.translate('xpack.evals.evaluators.evidenceInputsLabel', {
    defaultMessage: 'Trace: {inputs}',
    values: { inputs },
  });
export const REFERENCE_INPUTS = (inputs: string) =>
  i18n.translate('xpack.evals.evaluators.referenceInputsLabel', {
    defaultMessage: 'Reference: {inputs}',
    values: { inputs },
  });
export const NO_RESULTS_TITLE = i18n.translate('xpack.evals.evaluators.noResultsTitle', {
  defaultMessage: 'No evaluators found',
});
export const NO_RESULTS_DESCRIPTION = i18n.translate(
  'xpack.evals.evaluators.noResultsDescription',
  { defaultMessage: 'Change the search or filters and try again.' }
);
export const NO_USER_DEFINED_TITLE = i18n.translate('xpack.evals.evaluators.noUserDefinedTitle', {
  defaultMessage: 'No custom evaluators yet',
});
export const NO_USER_DEFINED_DESCRIPTION = i18n.translate(
  'xpack.evals.evaluators.noUserDefinedDescription',
  {
    defaultMessage:
      'Create an LLM judge to score traces against criteria you define, then test it before saving.',
  }
);
export const CLEAR_FILTERS_BUTTON = i18n.translate(
  'xpack.evals.evaluators.clearFiltersButtonLabel',
  { defaultMessage: 'Clear filters' }
);
export const CREATE_SUCCESS = (name: string) =>
  i18n.translate('xpack.evals.evaluators.createSuccessMessage', {
    defaultMessage: 'Created evaluator {name}',
    values: { name },
  });
export const UPDATE_SUCCESS = (name: string, version: string) =>
  i18n.translate('xpack.evals.evaluators.updateSuccessMessage', {
    defaultMessage: 'Saved {name} as version {version}',
    values: { name, version },
  });
export const NO_CHANGES_TO_SAVE = i18n.translate('xpack.evals.evaluators.noChangesToSaveMessage', {
  defaultMessage: 'No changes to save',
});
export const DELETE_SUCCESS = (name: string) =>
  i18n.translate('xpack.evals.evaluators.deleteSuccessMessage', {
    defaultMessage: 'Deleted evaluator {name}',
    values: { name },
  });
export const SAVE_ERROR_TITLE = i18n.translate('xpack.evals.evaluators.saveErrorTitle', {
  defaultMessage: 'Could not save this evaluator',
});
export const TEST_ERROR_TITLE = i18n.translate('xpack.evals.evaluators.testErrorTitle', {
  defaultMessage: 'Could not run this test',
});
export const LOAD_ERROR_TITLE = i18n.translate('xpack.evals.evaluators.loadErrorTitle', {
  defaultMessage: 'Unable to load evaluators',
});
export const RETRY_BUTTON = i18n.translate('xpack.evals.evaluators.retryButtonLabel', {
  defaultMessage: 'Retry',
});
export const EDIT_ARIA_LABEL = (name: string) =>
  i18n.translate('xpack.evals.evaluators.editAriaLabel', {
    defaultMessage: 'Edit {name}',
    values: { name },
  });
export const DELETE_ARIA_LABEL = (name: string) =>
  i18n.translate('xpack.evals.evaluators.deleteAriaLabel', {
    defaultMessage: 'Delete {name}',
    values: { name },
  });
export const CREATE_FLYOUT_TITLE = i18n.translate('xpack.evals.evaluators.createFlyoutTitle', {
  defaultMessage: 'Create evaluator',
});
export const EDIT_FLYOUT_TITLE = i18n.translate('xpack.evals.evaluators.editFlyoutTitle', {
  defaultMessage: 'Edit evaluator',
});
export const NAME_LABEL = i18n.translate('xpack.evals.evaluators.nameLabel', {
  defaultMessage: 'Name',
});
export const NAME_HELP = i18n.translate('xpack.evals.evaluators.nameHelpDescription', {
  defaultMessage:
    'At least 2 characters. Use lowercase letters, numbers, hyphens, or underscores, starting and ending with a letter or number.',
});
export const DESCRIPTION_LABEL = i18n.translate('xpack.evals.evaluators.descriptionLabel', {
  defaultMessage: 'Description',
});
export const SYSTEM_PROMPT_LABEL = i18n.translate('xpack.evals.evaluators.systemPromptLabel', {
  defaultMessage: 'System prompt',
});
export const PROMPT_LABEL = i18n.translate('xpack.evals.evaluators.promptLabel', {
  defaultMessage: 'Evaluation prompt',
});
export const PROMPT_HELP = i18n.translate('xpack.evals.evaluators.promptHelpDescription', {
  defaultMessage:
    'Use triple braces for declared inputs, for example {example}, so their contents remain unchanged.',
  values: { example: '{{{agent_response}}}' },
});
export const EVIDENCE_LABEL = i18n.translate('xpack.evals.evaluators.evidenceLabel', {
  defaultMessage: 'Trace evidence',
});
export const INPUT_EVIDENCE = i18n.translate('xpack.evals.evaluators.inputEvidenceLabel', {
  defaultMessage: 'Input',
});
export const RESPONSE_EVIDENCE = i18n.translate('xpack.evals.evaluators.responseEvidenceLabel', {
  defaultMessage: 'Response',
});
export const STEPS_EVIDENCE = i18n.translate('xpack.evals.evaluators.stepsEvidenceLabel', {
  defaultMessage: 'Tool calls',
});
export const REFERENCE_DATA_LABEL = i18n.translate(
  'xpack.evals.evaluators.referenceDataKeysLabel',
  { defaultMessage: 'Reference data keys' }
);
export const REFERENCE_DATA_HELP = i18n.translate(
  'xpack.evals.evaluators.referenceDataKeysHelpDescription',
  { defaultMessage: 'Optional comma-separated keys that examples must provide.' }
);
export const SCORES_TITLE = i18n.translate('xpack.evals.evaluators.scoresTitle', {
  defaultMessage: 'Output scores',
});
export const ADD_SCORE_BUTTON = i18n.translate('xpack.evals.evaluators.addScoreButtonLabel', {
  defaultMessage: 'Add score',
});
export const SCORE_NAME_LABEL = i18n.translate('xpack.evals.evaluators.scoreNameLabel', {
  defaultMessage: 'Score name',
});
export const SCORE_TYPE_LABEL = i18n.translate('xpack.evals.evaluators.scoreTypeLabel', {
  defaultMessage: 'Score type',
});
export const NUMERIC_SCORE = i18n.translate(
  'xpack.evals.evaluators.numericScoreDropDownOptionLabel',
  {
    defaultMessage: 'Number from 0 to 1',
  }
);
export const CATEGORICAL_SCORE = i18n.translate(
  'xpack.evals.evaluators.categoricalScoreDropDownOptionLabel',
  { defaultMessage: 'Categorical' }
);
export const SCORE_DESCRIPTION_LABEL = i18n.translate(
  'xpack.evals.evaluators.scoreDescriptionLabel',
  { defaultMessage: 'Scoring criteria' }
);
export const LABELS_LABEL = i18n.translate('xpack.evals.evaluators.labelsLabel', {
  defaultMessage: 'Labels',
});
export const LABELS_HELP = i18n.translate('xpack.evals.evaluators.labelsHelpDescription', {
  defaultMessage:
    'Enter one label and score per line, for example pass=1 and fail=0. The score is read after the last equals sign, so a label can contain one.',
});
export const REMOVE_SCORE_ARIA_LABEL = i18n.translate(
  'xpack.evals.evaluators.removeScoreAriaLabel',
  { defaultMessage: 'Remove score' }
);
export const TEST_TITLE = i18n.translate('xpack.evals.evaluators.testTitle', {
  defaultMessage: 'Test before saving',
});
export const TEST_DESCRIPTION = i18n.translate('xpack.evals.evaluators.testDescription', {
  defaultMessage: 'Optionally run this draft against an indexed trace. The connector is not saved.',
});
export const CONNECTOR_LABEL = i18n.translate('xpack.evals.evaluators.connectorLabel', {
  defaultMessage: 'Model connector',
});
export const TRACE_ID_LABEL = i18n.translate('xpack.evals.evaluators.traceIdLabel', {
  defaultMessage: 'Trace ID',
});
export const REFERENCE_DATA_JSON_LABEL = i18n.translate(
  'xpack.evals.evaluators.referenceDataJsonLabel',
  { defaultMessage: 'Reference data' }
);
export const REFERENCE_DATA_JSON_HELP = i18n.translate(
  'xpack.evals.evaluators.referenceDataJsonHelpDescription',
  { defaultMessage: 'Optional JSON object supplied only to this test.' }
);
export const RUN_TEST_BUTTON = i18n.translate('xpack.evals.evaluators.runTestButtonLabel', {
  defaultMessage: 'Run test',
});
export const TEST_SUCCEEDED_TITLE = i18n.translate('xpack.evals.evaluators.testSucceededTitle', {
  defaultMessage: 'Test completed',
});
export const TEST_FAILED_TITLE = i18n.translate('xpack.evals.evaluators.testFailedTitle', {
  defaultMessage: 'Test failed',
});
export const SAVE_BUTTON = i18n.translate('xpack.evals.evaluators.saveButtonLabel', {
  defaultMessage: 'Save evaluator',
});
export const CANCEL_BUTTON = i18n.translate('xpack.evals.evaluators.cancelButtonLabel', {
  defaultMessage: 'Cancel',
});
export const REQUIRED_FIELDS_ERROR = i18n.translate(
  'xpack.evals.evaluators.requiredFieldsErrorMessage',
  { defaultMessage: 'Complete all required fields and provide at least one valid score.' }
);
export const HIGHLIGHTED_FIELDS_ERROR = i18n.translate(
  'xpack.evals.evaluators.highlightedFieldsErrorMessage',
  { defaultMessage: 'Fix the highlighted fields and try again.' }
);
export const LOAD_EVALUATOR_ERROR_TITLE = i18n.translate(
  'xpack.evals.evaluators.loadEvaluatorErrorTitle',
  { defaultMessage: 'Unable to load this evaluator' }
);
export const NAME_INVALID_ERROR = i18n.translate('xpack.evals.evaluators.nameInvalidErrorMessage', {
  defaultMessage:
    'Enter at least 2 characters using lowercase letters, numbers, hyphens, or underscores, starting and ending with a letter or number.',
});
export const DESCRIPTION_INVALID_ERROR = i18n.translate(
  'xpack.evals.evaluators.descriptionInvalidErrorMessage',
  { defaultMessage: 'Enter a description of up to 2048 characters.' }
);
export const SYSTEM_PROMPT_INVALID_ERROR = i18n.translate(
  'xpack.evals.evaluators.systemPromptInvalidErrorMessage',
  { defaultMessage: 'Enter a system prompt of up to 32768 characters.' }
);
export const PROMPT_INVALID_ERROR = i18n.translate(
  'xpack.evals.evaluators.promptInvalidErrorMessage',
  { defaultMessage: 'Enter an evaluation prompt of up to 32768 characters.' }
);
export const EVIDENCE_INVALID_ERROR = i18n.translate(
  'xpack.evals.evaluators.evidenceInvalidErrorMessage',
  { defaultMessage: 'Select at least one trace evidence field.' }
);
export const REFERENCE_KEYS_INVALID_ERROR = i18n.translate(
  'xpack.evals.evaluators.referenceKeysInvalidErrorMessage',
  { defaultMessage: 'Enter up to 20 comma-separated keys of 256 characters each.' }
);
export const SCORES_INVALID_ERROR = i18n.translate(
  'xpack.evals.evaluators.scoresInvalidErrorMessage',
  { defaultMessage: 'Name every score, and add between 1 and 10 of them.' }
);
export const INVALID_LABELS_ERROR = i18n.translate(
  'xpack.evals.evaluators.invalidLabelsErrorMessage',
  { defaultMessage: 'Categorical labels must use label=score with a score from 0 to 1.' }
);
export const INVALID_REFERENCE_DATA_ERROR = i18n.translate(
  'xpack.evals.evaluators.invalidReferenceDataErrorMessage',
  { defaultMessage: 'Reference data must be a JSON object.' }
);
export const TEST_FIELDS_ERROR = i18n.translate('xpack.evals.evaluators.testFieldsErrorMessage', {
  defaultMessage: 'Select a connector and enter a valid 32-character hexadecimal trace ID.',
});
export const NO_INSTRUMENTATION_ERROR = i18n.translate(
  'xpack.evals.evaluators.noInstrumentationErrorMessage',
  { defaultMessage: 'No supported instrumentation profile could resolve this trace.' }
);
export const DELETE_TITLE = i18n.translate('xpack.evals.evaluators.deleteTitle', {
  defaultMessage: 'Delete evaluator',
});
export const DELETE_DESCRIPTION = (name: string) =>
  i18n.translate('xpack.evals.evaluators.deleteDescription', {
    defaultMessage: 'Delete every stored version of {name}? This action cannot be undone.',
    values: { name },
  });
export const DELETE_BUTTON = i18n.translate('xpack.evals.evaluators.deleteButtonLabel', {
  defaultMessage: 'Delete',
});
export const SCORE_RESULT = (name: string, value: string) =>
  i18n.translate('xpack.evals.evaluators.scoreResultLabel', {
    defaultMessage: '{name}: {value}',
    values: { name, value },
  });
export const SCORE_EXPLANATION = (explanation: string) =>
  i18n.translate('xpack.evals.evaluators.scoreExplanationDescription', {
    defaultMessage: 'Explanation: {explanation}',
    values: { explanation },
  });
