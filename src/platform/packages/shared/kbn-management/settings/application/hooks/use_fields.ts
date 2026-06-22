/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useMemo } from 'react';
import { Ast, Query } from '@elastic/eui';
import { getFieldDefinitions } from '@kbn/management-settings-field-definition';
import type { FieldDefinition } from '@kbn/management-settings-types';
import type { UiSettingsScope } from '@kbn/core-ui-settings-common';
import type { Clause } from '@elastic/eui/src/components/search_bar/query/ast';
import { useServices } from '../services';
import { CATEGORY_FIELD } from '../query_input';
import { useSettings } from './use_settings';

/**
 * React hook which retrieves settings and returns an observed collection of
 * {@link FieldDefinition} objects derived from those settings.
 * @param scope The {@link UiSettingsScope} of the settings to be retrieved.
 * @param query The {@link Query} to execute for filtering the fields.
 * @returns An object with an array of {@link FieldDefinition} objects and a loading flag.
 */
export const useFields = (
  scope: UiSettingsScope,
  query?: Query
): { fields: FieldDefinition[]; isLoading: boolean } => {
  const { isCustomSetting, isOverriddenSetting } = useServices();
  const { settings, isLoading } = useSettings(scope);

  const fields = useMemo(() => {
    const allFields = getFieldDefinitions(settings, {
      isCustom: (key) => isCustomSetting(key, scope),
      isOverridden: (key) => isOverriddenSetting(key, scope),
    });

    if (query) {
      const clauses: Clause[] = query.ast.clauses.map((clause) =>
        clause.type === 'field' && clause.field !== CATEGORY_FIELD
          ? {
              type: 'term',
              match: 'must',
              value: `${clause.field}:${clause.value}`,
            }
          : clause
      );

      return Query.execute(new Query(Ast.create(clauses), undefined, query.text), allFields);
    }
    return allFields;
  }, [settings, query, isCustomSetting, isOverriddenSetting, scope]);

  return { fields, isLoading };
};
