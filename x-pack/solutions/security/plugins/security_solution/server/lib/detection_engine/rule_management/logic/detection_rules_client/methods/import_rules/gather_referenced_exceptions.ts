/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { ExceptionListSchema, ListArray } from '@kbn/securitysolution-io-ts-list-types';
import type { SavedObjectsClientContract } from '@kbn/core/server';
import type { ExceptionListQueryInfo } from '@kbn/lists-plugin/server/services/exception_lists/utils/import/find_all_exception_list_types';
import { getAllListTypes } from '@kbn/lists-plugin/server/services/exception_lists/utils/import/find_all_exception_list_types';
import type { RuleToImport } from '../../../../../../../../common/api/detection_engine/rule_management';

/**
 * splitting out the parsing of the lists from the fetching
 * for easier and more compartmentalized testing
 * @param rules Array<RuleToImport | Error>
 * @returns [ExceptionListQueryInfo[], ExceptionListQueryInfo[]]
 */
export const parseReferencedExceptionsLists = (
  rules: Array<RuleToImport | Error>
): [ExceptionListQueryInfo[], ExceptionListQueryInfo[]] => {
  const lists = rules.reduce<ListArray>((acc, rule) => {
    if (
      !(rule instanceof Error) &&
      rule.exceptions_list != null &&
      rule.exceptions_list.length > 0
    ) {
      return [...acc, ...rule.exceptions_list];
    } else {
      return acc;
    }
  }, []);

  if (lists == null || lists.length === 0) {
    return [[], []];
  }

  const [agnosticLists, nonAgnosticLists] = lists.reduce<
    [ExceptionListQueryInfo[], ExceptionListQueryInfo[]]
  >(
    ([agnostic, single], list) => {
      const listInfo = { listId: list.list_id, namespaceType: list.namespace_type };
      if (list.namespace_type === 'agnostic') {
        return [[...agnostic, listInfo], single];
      } else {
        return [agnostic, [...single, listInfo]];
      }
    },
    [[], []]
  );
  return [agnosticLists, nonAgnosticLists];
};

/**
 * Helper that takes rules, goes through their referenced exception lists and
 * searches for them, returning an object with all those found, using list_id as keys
 * @param rules {array}
 * @param savedObjectsClient {object}
 * @returns {Promise} an object with all referenced lists found, using list_id as keys
 */
export const getReferencedExceptionLists = async ({
  rules,
  savedObjectsClient,
}: {
  rules: Array<RuleToImport | Error>;
  savedObjectsClient: SavedObjectsClientContract;
}): Promise<Record<string, ExceptionListSchema>> => {
  const [agnosticLists, nonAgnosticLists] = parseReferencedExceptionsLists(rules);
  return getAllListTypes(agnosticLists, nonAgnosticLists, savedObjectsClient);
};
