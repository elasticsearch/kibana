/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useMemo, useRef } from 'react';
import { isEqual } from 'lodash';
import usePrevious from 'react-use/lib/usePrevious';
import type { EqlOptions } from '../../../../../common/search_strategy';
import { type FormHook, type FieldHook, useFormData } from '../../../../shared_imports';
import type { DefineStepRule } from '../../../common/types';
import {
  isEqlRule,
  isEsqlRule,
  isThreatMatchRule,
} from '../../../../../common/detection_engine/utils';
import {
  DEFAULT_EQL_QUERY_FIELD_VALUE,
  DEFAULT_ESQL_QUERY_FIELD_VALUE,
  DEFAULT_KQL_QUERY_FIELD_VALUE,
  DEFAULT_THREAT_MATCH_KQL_QUERY_FIELD_VALUE,
  type FieldValueQueryBar,
} from '../query_bar_field';

const EQL_QUERY_LANGUAGE = 'eql';
const ESQL_QUERY_LANGUAGE = 'esql';

interface UsePersistentQueryParams {
  form: FormHook<DefineStepRule>;
}

interface UsePersistentQueryResult {
  setPersistentQuery: (value: FieldValueQueryBar) => void;
  setPersistentEqlQuery: (value: FieldValueQueryBar) => void;
  setPersistentEqlOptions: (value: EqlOptions) => void;
  setPersistentEsqlQuery: (value: FieldValueQueryBar) => void;
}

/**
 * Persists query when switching between different rule types using different queries (kuery, EQL and ES|QL).
 *
 * When the user changes rule type to or from "threat_match" this will modify the
 * default "Custom query" string to either:
 *   * from '' to '*:*' if the type is switched to "threat_match"
 *   * from '*:*' back to '' if the type is switched back from "threat_match" to another one
 */
export function usePersistentQuery({ form }: UsePersistentQueryParams): UsePersistentQueryResult {
  /**
   * The main idea of this hook is persisting of the state when user switches between
   * different rule types. It's necessary since we conditionally render different query type
   * fields. Kibana's Form lib doesn't persist field values when corresponding UseField hooks
   * aren't rendered.
   */
  const [{ ruleType, queryBar: currentQuery, eqlOptions: currentEqlOptions }] =
    useFormData<DefineStepRule>({
      form,
      watch: ['ruleType', 'queryBar', 'eqlOptions'],
    });
  const previousRuleType = usePrevious(ruleType);
  const queryRef = useRef<FieldValueQueryBar>(DEFAULT_KQL_QUERY_FIELD_VALUE);
  const eqlQueryRef = useRef<FieldValueQueryBar>(DEFAULT_EQL_QUERY_FIELD_VALUE);
  const eqlOptionsRef = useRef<EqlOptions>({});
  const esqlQueryRef = useRef<FieldValueQueryBar>(DEFAULT_ESQL_QUERY_FIELD_VALUE);

  /**
   * This useEffect is concerned about persisting the current query in a corresponding React
   * reference. There are 3 query types (kuery, EQL, ES|QL). An additional check is required to
   * make sure query type matches rule type. When switching between rule types it takes a few
   * re-renders to update the form data.
   */
  useEffect(() => {
    if (!ruleType) {
      return;
    }

    if (isEqlRule(ruleType)) {
      eqlQueryRef.current =
        currentQuery?.query?.language === EQL_QUERY_LANGUAGE ? currentQuery : eqlQueryRef.current;
      eqlOptionsRef.current =
        currentQuery?.query?.language === EQL_QUERY_LANGUAGE
          ? currentEqlOptions
          : eqlOptionsRef.current;

      return;
    }

    if (isEsqlRule(ruleType)) {
      esqlQueryRef.current =
        currentQuery?.query?.language === ESQL_QUERY_LANGUAGE ? currentQuery : esqlQueryRef.current;
      return;
    }

    if ([EQL_QUERY_LANGUAGE, ESQL_QUERY_LANGUAGE].includes(currentQuery?.query?.language)) {
      return;
    }

    queryRef.current = currentQuery;
  }, [ruleType, currentQuery, currentEqlOptions]);

  /**
   * This useEffect restores a corresponding query (kuery, EQL or ES|QL) in form data
   * after switching rule types. There is an exceptional case with threat_match rules
   * having a special default kuery `*:*` while the other rules using kuery have en empty
   * string kuery by default.
   */
  useEffect(() => {
    // Guard against firing on initial mount (previousRuleType === undefined means no prior type
    // transition has occurred; the form field already holds the correct default value).
    if (ruleType === previousRuleType || !ruleType || !previousRuleType) {
      return;
    }

    const queryField = form.getFields().queryBar as FieldHook<FieldValueQueryBar>;
    const eqlOptionsField = form.getFields().eqlOptions as FieldHook<EqlOptions>;

    if (isEqlRule(ruleType)) {
      queryField.reset({
        defaultValue: eqlQueryRef.current,
      });
      eqlOptionsField.reset({
        defaultValue: eqlOptionsRef.current,
      });
      return;
    }

    if (isEsqlRule(ruleType)) {
      queryField.reset({
        defaultValue: esqlQueryRef.current,
      });

      return;
    }

    if (isThreatMatchRule(ruleType) && isEqual(queryRef.current, DEFAULT_KQL_QUERY_FIELD_VALUE)) {
      queryField.reset({
        defaultValue: DEFAULT_THREAT_MATCH_KQL_QUERY_FIELD_VALUE,
      });

      return;
    }

    if (
      isThreatMatchRule(previousRuleType) &&
      isEqual(queryRef.current, DEFAULT_THREAT_MATCH_KQL_QUERY_FIELD_VALUE)
    ) {
      queryField.reset({
        defaultValue: DEFAULT_KQL_QUERY_FIELD_VALUE,
      });
    }

    if (isEqlRule(previousRuleType) || isEsqlRule(previousRuleType)) {
      queryField.reset({
        defaultValue: queryRef.current,
      });
    }
  }, [ruleType, previousRuleType, form]);

  return useMemo(
    () => ({
      setPersistentQuery: (value: FieldValueQueryBar) => (queryRef.current = value),
      setPersistentEqlQuery: (value: FieldValueQueryBar) => (eqlQueryRef.current = value),
      setPersistentEqlOptions: (value: EqlOptions) => (eqlOptionsRef.current = value),
      setPersistentEsqlQuery: (value: FieldValueQueryBar) => (esqlQueryRef.current = value),
    }),
    []
  );
}
