/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { PropertySelectionHandler, SelectionOption } from '@kbn/workflows/types/latest';
import { DEFAULT_ALERT_TAGS_KEY } from '../../../../common/constants';
import { KibanaServices } from '../../../common/lib/kibana';

const MAX_BROWSE_RESULTS = 15;

const toOption = (tag: string): SelectionOption<string> => ({ value: tag });

// Non-error sentinel for valid values with nothing to decorate (e.g. an empty array): an empty
// label suppresses the inline "✓" while staying non-null so the validator doesn't flag an error.
const VALID_NO_DECORATION: SelectionOption<string> = { value: '', label: '' };

// The framework passes either a scalar (autocomplete) or the whole array (validation), so coerce
// defensively. Follow-up: elastic/security-team#17985.
const toQueryString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? String(value[value.length - 1] ?? '') : '';
  }
  return value == null ? '' : String(value);
};

// Mirrors the first source the alert bulk-tagging UI unions client-side; there's no list-tags
// endpoint yet (elastic/security-team#17985 will add per-alert tags + a real endpoint).
const getDefaultAlertTags = (): string[] => {
  const tags = KibanaServices.get().uiSettings.get<string[]>(DEFAULT_ALERT_TAGS_KEY);
  return Array.isArray(tags) ? tags : [];
};

export const alertTagsSelection: PropertySelectionHandler<string> = {
  search: async (input) => {
    const query = toQueryString(input).trim().toLowerCase();
    const tags = getDefaultAlertTags();
    const matches =
      query.length === 0 ? tags : tags.filter((tag) => tag.toLowerCase().includes(query));
    return matches.slice(0, MAX_BROWSE_RESULTS).map(toOption);
  },
  resolve: async (value) => {
    const tag = toQueryString(value).trim();
    // Both fields are free-form: empty arrays and unknown tags are valid. The validator treats a
    // null result as an error, so return a non-null sentinel for empties.
    if (tag.length === 0) {
      return VALID_NO_DECORATION;
    }
    const found = getDefaultAlertTags().find((candidate) => candidate === tag);
    return found ? toOption(found) : toOption(tag);
  },
  getDetails: async (value, _context, option) => {
    const tag = option?.value ?? toQueryString(value);
    const isKnown = getDefaultAlertTags().some((candidate) => candidate === tag);
    if (isKnown) {
      return {
        message: i18n.translate(
          'xpack.securitySolution.workflows.steps.setAlertTags.selection.knownTag',
          {
            defaultMessage: '✓ `{tag}` is a configured alert tag.',
            values: { tag },
          }
        ),
      };
    }

    return {
      message: i18n.translate(
        'xpack.securitySolution.workflows.steps.setAlertTags.selection.customTag',
        {
          defaultMessage: '`{tag}` is not in the configured alert tags but can still be applied.',
          values: { tag },
        }
      ),
    };
  },
};

// The input schema is a `z.union`, so `EditorHandlers` can't derive per-field input keys and the
// `input` slot collapses to `{}`. The editor resolves handlers by key at runtime, so attaching
// them by key (via this explicitly-typed object, assigned through a named variable to bypass
// excess-property checks) is safe.
export const alertTagsInputEditorHandlers: {
  input: Record<'tags_to_add' | 'tags_to_remove', { selection: PropertySelectionHandler<string> }>;
} = {
  input: {
    tags_to_add: { selection: alertTagsSelection },
    tags_to_remove: { selection: alertTagsSelection },
  },
};
