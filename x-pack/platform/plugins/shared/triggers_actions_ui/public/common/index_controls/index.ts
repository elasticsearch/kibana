/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { uniq } from 'lodash';
import type { HttpSetup } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import type { FieldSpec } from '@kbn/data-views-plugin/common';
import { loadIndexPatterns, getMatchingIndices, getESIndexFields } from '../lib/data_apis';
import type { FieldOption } from '../types';

export interface IOption {
  label: string;
  options: Array<{ value: string; label: string; 'data-test-subj'?: string }>;
}

export const getIndexOptions = async (
  http: HttpSetup,
  pattern: string,
  projectRouting?: string
) => {
  const options: IOption[] = [];

  if (!pattern) {
    return options;
  }

  const [matchingIndices, matchingIndexPatterns] = await Promise.all([
    getMatchingIndices({
      pattern,
      http,
      projectRouting,
    }),
    loadIndexPatterns(pattern),
  ]);

  if (matchingIndices.length || matchingIndexPatterns.length) {
    const matchingOptions = uniq([...(matchingIndices as string[]), ...matchingIndexPatterns]);

    options.push({
      label: i18n.translate(
        'xpack.triggersActionsUI.components.builtinActionTypes.indexAction.indicesAndIndexPatternsLabel',
        {
          defaultMessage: 'Based on your data views',
        }
      ),
      options: matchingOptions.map((match) => {
        return {
          label: match,
          value: match,
          'data-test-subj': `thresholdIndexOption-${match}`,
        };
      }),
    });
  }

  options.push({
    label: i18n.translate(
      'xpack.triggersActionsUI.components.builtinActionTypes.indexAction.chooseLabel',
      {
        defaultMessage: 'Choose…',
      }
    ),
    options: [
      {
        value: pattern,
        label: pattern,
      },
    ],
  });

  return options;
};

export const convertFieldSpecToFieldOption = (
  fieldSpec: FieldSpec[],
  onlyMappedOrRuntime: boolean = true
): FieldOption[] => {
  return (fieldSpec ?? [])
    .filter((spec: FieldSpec) => (onlyMappedOrRuntime ? spec.isMapped || spec.runtimeField : true))
    .map((spec: FieldSpec) => {
      const converted = {
        name: spec.name,
        searchable: spec.searchable,
        aggregatable: spec.aggregatable,
        type: spec.type,
        normalizedType: spec.type,
      };

      if (spec.type === 'string') {
        const esType = spec.esTypes && spec.esTypes.length > 0 ? spec.esTypes[0] : spec.type;
        converted.type = esType;
        converted.normalizedType = esType;
      } else if (spec.type === 'number') {
        const esType = spec.esTypes && spec.esTypes.length > 0 ? spec.esTypes[0] : spec.type;
        converted.type = esType;
      }

      return converted;
    });
};

export const getFields = async (http: HttpSetup, indexes: string[]) => {
  return await getESIndexFields({ indexes, http });
};

export const firstFieldOption = {
  text: i18n.translate(
    'xpack.triggersActionsUI.sections.ruleAdd.indexControls.timeFieldOptionLabel',
    {
      defaultMessage: 'Select a field',
    }
  ),
  value: '',
};
