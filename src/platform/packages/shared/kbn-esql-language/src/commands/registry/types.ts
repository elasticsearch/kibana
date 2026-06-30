/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type {
  ESQLVariableType,
  IndexAutocompleteItem,
  InferenceEndpointAutocompleteItem,
  ESQLControlVariable,
  ESQLSourceResult,
  ESQLFieldWithMetadata,
  ESQLCallbacks,
  EsqlView,
  EsqlDataset,
} from '@kbn/esql-types';
import type { LicenseType } from '@kbn/licensing-types';
import type { PricingProduct } from '@kbn/core-pricing-common/src/types';
import type { ESQLLocation, ESQLProperNode } from '@elastic/esql/types';
import type { SupportedDataType } from '../definitions/types';
import type { EditorExtensions } from './options/recommended_queries';
import type { SuggestionCategory } from '../../language/autocomplete/utils/sorting/types';
import type { ReplacementRangeStrategy } from '../../language/autocomplete/utils/prefix_range';
import type { CommandSegment } from '../../language/shared/resolve_command_segment';

// This is a subset of the Monaco's editor CompletitionItemKind type
export type ItemKind =
  | 'Method'
  | 'Function'
  | 'Field'
  | 'Variable'
  | 'Class'
  | 'Operator'
  | 'Value'
  | 'Constant'
  | 'Keyword'
  | 'Text'
  | 'Reference'
  | 'Snippet'
  | 'Issue'
  | 'Folder';

export interface ISuggestionItem {
  /* The label to show on the suggestion UI for the entry */
  label: string;
  /* The actual text to insert into the editor */
  text: string;
  /* Text to use for filtering the suggestions */
  filterText?: string;
  /**
   * Should the text be inserted as a snippet?
   * That is usually used for special behaviour like moving the cursor in a specific position
   * after inserting the text.
   * i.e. 'fnName( $0 )' will insert fnName( ) and move the cursor where $0 is.
   * */
  asSnippet?: boolean;
  /**
   * This is useful to identify the suggestion type and apply different styles to it.
   */
  kind: ItemKind;
  /**
   * A very short description for the suggestion entry that can be shown on the UI next to the label
   */
  detail?: string;
  /**
   * A longer description for the suggestion entry that can be shown on demand on the UI.
   */
  documentation?: { value: string };
  /**
   * A string to use for sorting the suggestion within the suggestions list
   */
  sortText?: string;
  /**
   * The category of the suggestion, used for sorting and prioritization
   */
  category?: SuggestionCategory;
  /**
   * Suggestions can trigger a command by id. This is useful to trigger specific actions in some contexts
   */
  command?: {
    title: string;
    id: string;
    arguments?: { [key: string]: string }[];
  };
  /**
   * The range that should be replaced when the suggestion is applied
   * Prefer `replacementRangeStrategy`; use this only as an escape hatch.
   *
   * IMPORTANT NOTE!!!
   *
   * This range is ZERO-based and NOT end-inclusive — [start, end)
   * Also, do NOT try to account for newline characters. This is taken care of later.
   */
  rangeToReplace?: {
    start: number;
    end: number;
  };
  /**
   * Centralized replacement-range strategy.
   */
  replacementRangeStrategy?: ReplacementRangeStrategy;
  /**
   * If the suggestions list is incomplete and should be re-requested when the user types more characters.
   * If a completion item with incomplete true is shown, the editor will ask for new suggestions in every keystroke
   * until there are no more incomplete suggestions returned.
   */
  incomplete?: boolean;
  /**
   * Instructs the centralized replacement-range resolver to prepend the currently typed prefix
   * to this suggestion's text before insertion.
   */
  preserveTypedPrefix?: boolean;
  /**
   * Instructs the centralized replacement-range resolver to keep this suggestion only when the
   * currently typed prefix resolves to an existing column in the current command context.
   */
  requiresExistingColumnMatch?: boolean;
}

export type GetColumnsByTypeFn = (
  type: Readonly<string> | Readonly<string[]>,
  ignored?: string[],
  options?: {
    advanceCursor?: boolean;
    openSuggestions?: boolean;
    addComma?: boolean;
    variableType?: ESQLVariableType;
    /** When true, prepends a "Browse fields" suggestion with current columns as preloaded fields. */
    isFieldsBrowserEnabled?: boolean;
  }
) => Promise<ISuggestionItem[]>;

// TODO consider not exporting this
export interface ESQLUserDefinedColumn {
  name: string;
  // invalid expressions produce columns of type "unknown"
  // also, there are some cases where we can't yet infer the type of
  // a valid expression as with `CASE` which can return union types
  type: SupportedDataType | 'unknown';
  userDefined: true;
  location: ESQLLocation; // TODO should this be optional?
  isUnmappedField?: boolean;
}

export type ESQLColumnData = ESQLUserDefinedColumn | ESQLFieldWithMetadata;

export interface ESQLCommandSummary {
  /**
   * A list of columns names which were newly created by
   * each command.
   */
  newColumns: Set<string>;
  /**
   * A list of metadata columns created by the FROM and TS commands
   * We are separating them here to be able to treat them differently in some contexts
   */
  metadataColumns?: Set<string>;
  /**
   * A set of renamed columns pairs [newName, oldName]
   */
  renamedColumnsPairs?: Set<[string, string]>;

  /**
   * A set of fields used for grouping results in the query.
   * Note that you don't only get the last grouping applied but all the groupings used in the query.
   * The client must decide how to use this information.
   * Example of grouping fields is foo in "STATS AVG(bar) BY foo".
   */
  grouping?: Set<FieldSummary>;

  /**
   * A set of fields used for aggregating results in the query.
   * Example of aggregate fields is foo in "STATS foo = AVG(bar)".
   */
  aggregates?: Set<FieldSummary>;
}

export interface FieldSummary {
  /**
   * The field name, correctly formatted, extracted from the AST.
   */
  field: string;

  /**
   * AST argument node where the field was found.
   */
  arg: ESQLProperNode;
}

export interface ESQLPolicy {
  name: string;
  sourceIndices: string[];
  matchField: string;
  enrichFields: string[];
}

export interface ICommandCallbacks {
  getByType?: GetColumnsByTypeFn;
  getSuggestedUserDefinedColumnName?: (extraFieldNames?: string[] | undefined) => string;
  getColumnsForQuery?: (query: string) => Promise<ESQLColumnData[]>;
  hasMinimumLicenseRequired?: (minimumLicenseRequired: LicenseType) => boolean;
  getJoinIndices?: () => Promise<{ indices: IndexAutocompleteItem[] }>;
  canCreateLookupIndex?: (indexName: string) => Promise<boolean>;
  isServerless?: boolean;
  getKqlSuggestions?: ESQLCallbacks['getKqlSuggestions'];
  canSuggestResourceBrowser?: () => Promise<boolean>;
}

export interface ICommandContext {
  columns: Map<string, ESQLColumnData>;
  // TODO: Make this required once all autocomplete paths build command context
  // from the shared parse/preparation layer.
  commandSegment?: CommandSegment;
  sources?: ESQLSourceResult[];
  joinSources?: IndexAutocompleteItem[];
  timeSeriesSources?: IndexAutocompleteItem[];
  inferenceEndpoints?: InferenceEndpointAutocompleteItem[];
  policies?: Map<string, ESQLPolicy>;
  views?: EsqlView[];
  datasets?: EsqlDataset[];
  editorExtensions?: EditorExtensions;
  variables?: ESQLControlVariable[];
  supportsControls?: boolean;
  histogramBarTarget?: number;
  activeProduct?: PricingProduct | undefined;
  subquerySupport?: boolean;
  isCursorInSubquery?: boolean;
  isFieldsBrowserEnabled?: boolean;
  unmappedFieldsStrategy?: UnmappedFieldsStrategy;
  isTimeseriesSource?: boolean;
}
/**
 * This is a list of locations within an ES|QL query.
 *
 * It is currently used to suggest appropriate functions and
 * operators given the location of the cursor.
 */
export enum Location {
  /**
   * In the top-level EVAL command
   */
  EVAL = 'eval',

  /**
   * In the top-level WHERE command
   */
  WHERE = 'where',

  /**
   * In the top-level ROW command
   */
  ROW = 'row',

  /**
   * In the top-level SORT command
   */
  SORT = 'sort',

  /**
   * In the top-level STATS command
   */
  STATS = 'stats',

  /**
   * In a grouping clause
   */
  STATS_BY = 'stats_by',

  /**
   * In a LIMIT grouping clause
   */
  LIMIT_BY = 'limit_by',

  /**
   * In a CHANGE_POINT grouping clause
   */
  CHANGE_POINT_BY = 'change_point_by',

  /**
   * In a per-agg filter
   */
  STATS_WHERE = 'stats_where',

  /**
   * WHEN TS is used as a source command, and we are within an aggregation function
   */
  STATS_TIMESERIES = 'stats_timeseries',

  /**
   * Top-level ENRICH command
   */
  ENRICH = 'enrich',

  /**
   * ENRICH...WITH clause
   */
  ENRICH_WITH = 'enrich_with',

  /**
   * In the top-level DISSECT command (used only for
   * assignment in APPEND_SEPARATOR)
   */
  DISSECT = 'dissect',

  /**
   * In RENAME (used only for AS)
   */
  RENAME = 'rename',

  /**
   * In the RERANK command
   */
  RERANK = 'rerank',

  /**
   * In the JOIN command (used only for AS)
   */
  JOIN = 'join',

  /**
   * In the SHOW command
   */
  SHOW = 'show',

  /**
   * In the COMPLETION command
   */
  COMPLETION = 'completion',

  /**
   * In the MMR command
   */
  MMR = 'mmr',

  /**
   * In the PROMQL command (PromQL query expression)
   */
  PROMQL = 'promql',
}

export enum UnmappedFieldsStrategy {
  DEFAULT = 'DEFAULT',
  NULLIFY = 'NULLIFY',
  LOAD = 'LOAD',
}
