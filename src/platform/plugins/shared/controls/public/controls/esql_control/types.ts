/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  OptionsListESQLControlState,
  OptionsListSearchTechnique,
} from '@kbn/controls-schemas';
import type { PublishesTooltipLabel } from '@kbn/controls-schemas/src/types';
import type { DefaultEmbeddableApi } from '@kbn/embeddable-plugin/public';
import type { PublishesESQLVariable, QueryESQLControl, StaticESQLControl } from '@kbn/esql-types';
import type {
  CanCancelRequests,
  CanIndicateRelatedSiblings,
  HasEditCapabilities,
  HasType,
  HasUniqueId,
  PublishesDataLoading,
  PublishesRelatedPanels,
  PublishesUnsavedChanges,
  PublishingSubject,
  SupportsJsonExport,
} from '@kbn/presentation-publishing';
import type { SettersOf, SubjectsOf } from '@kbn/presentation-publishing/state_manager/types';
import type { initializeLabelManager } from '../control_labels';
import type { TemporaryState } from '../data_controls/options_list_control/temporay_state_manager';
import type { OptionsListPublishesOptions, OptionsListSelectionsApi } from '../types';

export type ESQLControlApi<State> = DefaultEmbeddableApi<
  State extends { control_type: 'STATIC_VALUES' } ? StaticESQLControl : QueryESQLControl
> &
  CanCancelRequests &
  PublishesESQLVariable &
  PublishesUnsavedChanges &
  PublishesRelatedPanels &
  HasEditCapabilities &
  PublishesDataLoading &
  PublishesTooltipLabel &
  CanIndicateRelatedSiblings &
  ReturnType<typeof initializeLabelManager>['api'] &
  SupportsJsonExport;

export type ESQLOptionsListRuntimeState = Omit<OptionsListESQLControlState, 'available_options'> &
  Pick<StaticESQLControl, 'available_options'>; // both types have `available_options` during runtime

export type ESQLOptionsListComponentState = Pick<
  OptionsListESQLControlState,
  'single_select' | 'selected_options'
> & {
  /**
   * For API consistency, we continue to refer to the control's label as `title`; however, to avoid
   * being impacted by default embeddable title handling, we switch to `label` for the implementation
   */
  label: string;
} & Omit<TemporaryState<string>, 'requestSize' | 'isPartial'>;

export type ESQLOptionsListComponentApi = HasType &
  HasUniqueId &
  PublishesTooltipLabel &
  OptionsListPublishesOptions<string> &
  SubjectsOf<ESQLOptionsListComponentState> &
  SettersOf<
    Omit<
      TemporaryState<string>,
      'availableOptions' | 'requestSize' | 'searchStringValid' | 'totalCardinality' | 'isPartial'
    >
  > &
  OptionsListSelectionsApi & {
    searchTechnique$: PublishingSubject<OptionsListSearchTechnique>; // this is currently static and not stored
  };
