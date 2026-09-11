/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { InferenceTaskType } from '@elastic/elasticsearch/lib/api/types';

export const getRequiredMessage = (field: string) => {
  return i18n.translate('xpack.inferenceEndpointUICommon.components.requiredGenericTextField', {
    defaultMessage: '{field} is required.',
    values: { field },
  });
};

export const INPUT_INVALID = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.params.error.invalidInputText',
  {
    defaultMessage: 'Input does not have a valid Array format.',
  }
);

export const INVALID_ACTION = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.invalidActionText',
  {
    defaultMessage: 'Invalid action name.',
  }
);

export const BODY = i18n.translate('xpack.inferenceEndpointUICommon.components.bodyFieldLabel', {
  defaultMessage: 'Body',
});

export const INPUT = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.completionInputLabel',
  {
    defaultMessage: 'Input',
  }
);

export const INPUT_TYPE = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.completionInputTypeLabel',
  {
    defaultMessage: 'Input type',
  }
);

export const QUERY = i18n.translate('xpack.inferenceEndpointUICommon.components.rerankQueryLabel', {
  defaultMessage: 'Query',
});

export const BODY_DESCRIPTION = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.bodyCodeEditorAriaLabel',
  {
    defaultMessage: 'Code editor',
  }
);

export const TASK_TYPE = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.taskTypeFieldLabel',
  {
    defaultMessage: 'Task type',
  }
);

export const PROVIDER = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.providerFieldLabel',
  {
    defaultMessage: 'Provider',
  }
);

export const PROVIDER_REQUIRED = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.error.requiredProviderText',
  {
    defaultMessage: 'Provider is required.',
  }
);

export const DOCUMENTATION = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.inferenceDocumentation',
  {
    defaultMessage: 'Inference API documentation',
  }
);

export const SELECT_PROVIDER = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.selectProvider',
  {
    defaultMessage: 'Select a service',
  }
);

export const COPY_TOOLTIP = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.copy.tooltip',
  {
    defaultMessage: 'Copy to clipboard',
  }
);

export const COPIED_TOOLTIP = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.copied.tooltip',
  {
    defaultMessage: 'Copied!',
  }
);

export const SEARCHLABEL = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.searchLabel',
  {
    defaultMessage: 'Search',
  }
);

export const OPTIONALTEXT = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.optionalText',
  {
    defaultMessage: 'Optional',
  }
);

export const LEARN_MORE = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.learnMoreText',
  {
    defaultMessage: 'Learn more.',
  }
);

export const RE_ENTER_SECRETS = (label: string) => {
  return i18n.translate('xpack.inferenceEndpointUICommon.components.requiredGenericTextField', {
    defaultMessage:
      'You will need to re-enter your {label} each time you edit the inference endpoint',
    values: { label },
  });
};

export const GET_PROVIDERS_FAILED = i18n.translate(
  'xpack.inferenceEndpointUICommon.hooks.unableToFindProvidersQueryMessage',
  {
    defaultMessage: 'Unable to find providers',
  }
);

export const ADD_ENDPOINT_TITLE = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.addEndpointTitle',
  {
    defaultMessage: 'Add inference endpoint',
  }
);

export const EDIT_ENDPOINT_TITLE = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.editEndpointTitle',
  {
    defaultMessage: 'Edit inference endpoint',
  }
);

export const TASK_TYPE_DESCRIPTIONS: Partial<Record<InferenceTaskType, string>> = {
  text_embedding: i18n.translate(
    'xpack.inferenceEndpointUICommon.components.taskType.textEmbeddingDescription',
    {
      defaultMessage: 'Converts text into dense vector representations for semantic search',
    }
  ),
  sparse_embedding: i18n.translate(
    'xpack.inferenceEndpointUICommon.components.taskType.sparseEmbeddingDescription',
    {
      defaultMessage: 'Converts text into sparse vector representations for semantic search',
    }
  ),
  rerank: i18n.translate('xpack.inferenceEndpointUICommon.components.taskType.rerankDescription', {
    defaultMessage: 'Re-ranks search results by relevance',
  }),
  completion: i18n.translate(
    'xpack.inferenceEndpointUICommon.components.taskType.completionDescription',
    {
      defaultMessage: 'Generates text completions from a given input',
    }
  ),
  chat_completion: i18n.translate(
    'xpack.inferenceEndpointUICommon.components.taskType.chatCompletionDescription',
    {
      defaultMessage: 'Generates conversational responses from a chat input',
    }
  ),
};

export const CANCEL = i18n.translate('xpack.inferenceEndpointUICommon.components.cancelBtnLabel', {
  defaultMessage: 'Cancel',
});

export const SAVE = i18n.translate('xpack.inferenceEndpointUICommon.components.saveBtnLabel', {
  defaultMessage: 'Save',
});

export const ENDPOINT_ADDED_SUCCESS = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.endpointAddedSuccess',
  {
    defaultMessage: 'Inference endpoint added',
  }
);

export const ENDPOINT_CREATION_FAILED = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.endpointAddedFailure',
  {
    defaultMessage: 'Inference endpoint creation failed',
  }
);

export const ENDPOINT_UPDATE_SUCCESS = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.endpointUpdateSuccess',
  {
    defaultMessage: 'Inference endpoint updated successfully',
  }
);

export const ENDPOINT_UPDATE_FAILED = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.endpointUpdateFailure',
  {
    defaultMessage: 'Inference endpoint update failed',
  }
);

export const SOLUTION_FILTER = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.solutionFilterText',
  {
    defaultMessage: 'Solution filter.',
  }
);

export const GEMINI = i18n.translate('xpack.inferenceEndpointUICommon.components.gemini.title', {
  defaultMessage: 'Google Gemini',
});

export const DOCUMENTATION_BASE = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.documentation',
  {
    defaultMessage: 'documentation',
  }
);

export const CONTEXT_WINDOW_LABEL = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.contextWindowLengthTextFieldLabel',
  {
    defaultMessage: 'Context window length',
  }
);

export const CONTEXT_WINDOW_VALIDATION_MESSAGE = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.contextWindowLengthValidationMessage',
  {
    defaultMessage: 'Context window length must be an integer.',
  }
);

export const CONTEXT_WINDOW_TASK_TYPE_VALIDATION_MESSAGE = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.contextWindowLengthTaskTypeValidationMessage',
  {
    defaultMessage: 'Context window length is only applicable for chat completion tasks.',
  }
);

export const ADD_HEADERS_SWITCH_LABEL = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.addHeadersLabel',
  {
    defaultMessage: 'Add HTTP headers',
  }
);

export const VIEW_HEADERS_SWITCH_LABEL = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.viewHeadersLabel',
  {
    defaultMessage: 'View HTTP headers',
  }
);

export const HIDE_HEADERS_SWITCH_LABEL = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.hideHeadersLabel',
  {
    defaultMessage: 'Hide HTTP headers',
  }
);

export const ADD_LABEL = i18n.translate('xpack.inferenceEndpointUICommon.components.addLabel', {
  defaultMessage: 'Add',
});

export const DELETE_LABEL = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.deleteLabel',
  {
    defaultMessage: 'Delete',
  }
);

export const HEADERS_KEY_LABEL = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.headersKeyLabel',
  {
    defaultMessage: 'Key',
  }
);

export const HEADERS_VALUE_LABEL = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.headersValueLabel',
  {
    defaultMessage: 'Value',
  }
);

export const HEADERS_DUPLICATE_KEY_MESSAGE = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.headersDuplicateKeyMessage',
  {
    defaultMessage: 'Header keys must be unique.',
  }
);

export const LIST_FIELD_PLACEHOLDER = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.listFieldPlaceholder',
  {
    defaultMessage: 'To add an item, type and then hit ENTER.',
  }
);

export const TEMPERATURE_LABEL = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.temperatureTextFieldLabel',
  {
    defaultMessage: 'Temperature',
  }
);

export const TEMPERATURE_VALIDATION_MESSAGE = i18n.translate(
  'xpack.inferenceEndpointUICommon.components.temperatureValidationMessage',
  {
    defaultMessage: 'Temperature must be a number between 0 and 1.',
  }
);
