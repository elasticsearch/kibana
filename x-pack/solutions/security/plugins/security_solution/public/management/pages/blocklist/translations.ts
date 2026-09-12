/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { CONTROL_CHARACTER_ERROR } from '@kbn/securitysolution-utils';
import type { BlocklistConditionEntryField } from '@kbn/securitysolution-utils';

export const DETAILS_HEADER = i18n.translate('xpack.securitySolution.blocklist.details.header', {
  defaultMessage: 'Details',
});

export const DETAILS_HEADER_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.blocklist.details.header.description',
  {
    defaultMessage:
      'The blocklist prevents selected applications from running on your hosts by extending the list of processes the Endpoint considers malicious.',
  }
);

export const NAME_LABEL = i18n.translate('xpack.securitySolution.blocklist.name.label', {
  defaultMessage: 'Name',
});

export const DESCRIPTION_LABEL = i18n.translate(
  'xpack.securitySolution.blocklist.description.label',
  {
    defaultMessage: 'Description',
  }
);

export const CONDITIONS_HEADER = i18n.translate(
  'xpack.securitySolution.blocklist.conditions.header',
  {
    defaultMessage: 'Conditions',
  }
);

export const CONDITIONS_HEADER_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.blocklist.conditions.header.description',
  {
    defaultMessage:
      'Select an operating system and add conditions. Availability of conditions may depend on your chosen OS.',
  }
);

export const SELECT_OS_LABEL = i18n.translate('xpack.securitySolution.blocklist.os.label', {
  defaultMessage: 'Select operating system',
});

export const FIELD_LABEL = i18n.translate('xpack.securitySolution.blocklist.field.label', {
  defaultMessage: 'Field',
});

export const OPERATOR_LABEL = i18n.translate('xpack.securitySolution.blocklist.operator.label', {
  defaultMessage: 'Operator',
});

export const VALUE_LABEL = i18n.translate('xpack.securitySolution.blocklist.value.label', {
  defaultMessage: 'Value',
});

export const VALUE_LABEL_HELPER = i18n.translate(
  'xpack.securitySolution.blocklist.value.label.helper',
  {
    defaultMessage: 'Type or copy & paste one or multiple comma delimited values',
  }
);

export const SINGLE_VALUE_LABEL_HELPER = i18n.translate(
  'xpack.securitySolution.blocklist.single_value.label.helper',
  {
    defaultMessage: 'Type or copy & paste a value',
  }
);

export const CONDITION_FIELD_TITLE: { [K in BlocklistConditionEntryField]: string } = {
  'file.hash.*': i18n.translate('xpack.securitySolution.blocklist.entry.field.hash', {
    defaultMessage: 'Hash',
  }),
  'file.path': i18n.translate('xpack.securitySolution.blocklist.entry.field.path', {
    defaultMessage: 'Path',
  }),
  'file.path.caseless': i18n.translate(
    'xpack.securitySolution.blocklist.entry.field.path.caseless',
    {
      defaultMessage: 'Path',
    }
  ),
  'file.Ext.code_signature': i18n.translate(
    'xpack.securitySolution.blocklist.entry.field.signature',
    { defaultMessage: 'Signature' }
  ),
};

export const CONDITION_FIELD_DESCRIPTION: { [K in BlocklistConditionEntryField]: string } = {
  'file.hash.*': i18n.translate('xpack.securitySolution.blocklist.entry.field.description.hash', {
    defaultMessage: 'md5, sha1, or sha256',
  }),
  'file.path': i18n.translate('xpack.securitySolution.blocklist.entry.field.description.path', {
    defaultMessage: 'The full path of the application',
  }),
  'file.path.caseless': i18n.translate(
    'xpack.securitySolution.blocklist.entry.field.description.path.caseless',
    {
      defaultMessage: 'The full path of the application (case insenstive)',
    }
  ),
  'file.Ext.code_signature': i18n.translate(
    'xpack.securitySolution.blocklist.entry.field.description.signature',
    { defaultMessage: 'The signer of the application' }
  ),
};

export const POLICY_SELECT_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.blocklist.policyAssignmentSectionDescription',
  {
    defaultMessage:
      'Assign this blocklist globally across all policies, or assign it to specific policies.',
  }
);

export const ERRORS = {
  NAME_REQUIRED: i18n.translate('xpack.securitySolution.blocklist.errors.name.required', {
    defaultMessage: 'Name is required',
  }),
  VALUE_REQUIRED: i18n.translate('xpack.securitySolution.blocklist.errors.values.required', {
    defaultMessage: 'Field entry must have a value',
  }),
  INVALID_HASH: i18n.translate('xpack.securitySolution.blocklist.errors.values.invalidHash', {
    defaultMessage: 'Invalid hash value',
  }),
  CONTROL_CHARACTER: CONTROL_CHARACTER_ERROR,
  INVALID_PATH: i18n.translate('xpack.securitySolution.blocklist.warnings.values.invalidPath', {
    defaultMessage: 'Path may be formed incorrectly; verify value',
  }),
  WILDCARD_PRESENT: i18n.translate(
    'xpack.securitySolution.blocklist.warnings.values.wildcardPresent',
    {
      defaultMessage: "A wildcard in the filename will affect the endpoint's performance",
    }
  ),
  DUPLICATE_VALUE: i18n.translate(
    'xpack.securitySolution.blocklist.warnings.values.duplicateValue',
    {
      defaultMessage: 'This value already exists',
    }
  ),
  DUPLICATE_VALUES: i18n.translate(
    'xpack.securitySolution.blocklist.warnings.values.duplicateValues',
    {
      defaultMessage: 'One or more duplicate values removed',
    }
  ),
};
