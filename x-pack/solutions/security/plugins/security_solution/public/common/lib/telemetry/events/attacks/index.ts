/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttacksTelemetryEvent } from './types';
import { AttacksEventTypes } from './types';

export const attacksTableSortChangedEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.TableSortChanged,
  schema: {
    field: {
      type: 'keyword',
      _meta: { description: 'The field used for sorting', optional: false },
    },
    direction: {
      type: 'keyword',
      _meta: { description: 'The sort direction (asc/desc)', optional: false },
    },
  },
};

export const attacksViewOptionChangedEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.ViewOptionChanged,
  schema: {
    option: {
      type: 'keyword',
      _meta: { description: 'The view option toggled', optional: false },
    },
    enabled: {
      type: 'boolean',
      _meta: { description: 'Whether the option was enabled', optional: false },
    },
  },
};

export const attacksKPIViewChangedEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.KPIViewChanged,
  schema: {
    view: {
      type: 'keyword',
      _meta: { description: 'The selected KPI view', optional: false },
    },
  },
};

const actionSourceSchema = {
  source: {
    type: 'keyword',
    _meta: {
      description: 'The source of the action',
      optional: false,
    },
  },
} as const;

const scopeSchema = {
  scope: {
    type: 'keyword',
    _meta: {
      description: 'Whether the update was applied to attack only or attack and related alerts',
      optional: true,
    },
  },
} as const;

export const attacksActionStatusUpdatedEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.ActionStatusUpdated,
  schema: {
    ...actionSourceSchema,
    ...scopeSchema,
    status: {
      type: 'keyword',
      _meta: { description: 'The new status applied', optional: false },
    },
  },
};

export const attacksActionAssigneeUpdatedEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.ActionAssigneeUpdated,
  schema: {
    ...actionSourceSchema,
    ...scopeSchema,
  },
};

export const attacksActionTagsUpdatedEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.ActionTagsUpdated,
  schema: {
    ...actionSourceSchema,
    ...scopeSchema,
  },
};

export const attacksActionAddedToCaseEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.ActionAddedToCase,
  schema: {
    ...actionSourceSchema,
    action: {
      type: 'keyword',
      _meta: {
        description: 'The type of case action (add_to_new_case/add_to_existing_case)',
        optional: false,
      },
    },
  },
};

export const attacksTimelineInvestigationOpenedEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.TimelineInvestigationOpened,
  schema: actionSourceSchema,
};

export const attacksAIAssistantOpenedEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.AIAssistantOpened,
  schema: actionSourceSchema,
};

export const attacksDetailsFlyoutOpenedEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.DetailsFlyoutOpened,
  schema: {
    id: {
      type: 'keyword',
      _meta: { description: 'The ID of the attack opened', optional: false },
    },
    source: {
      type: 'keyword',
      _meta: { description: 'The source where the details flyout was opened', optional: false },
    },
  },
};

export const attacksExpandedViewTabClickedEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.ExpandedViewTabClicked,
  schema: {
    tab: {
      type: 'keyword',
      _meta: { description: 'The tab clicked in expanded view (summary/alerts)', optional: false },
    },
  },
};

export const attacksScheduleFlyoutOpenedEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.ScheduleFlyoutOpened,
  schema: {
    source: {
      type: 'keyword',
      _meta: { description: 'The source of the schedule flyout open', optional: false },
    },
  },
};

export const attacksScheduleDetailsFlyoutOpenedEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.ScheduleDetailsFlyoutOpened,
  schema: {
    source: {
      type: 'keyword',
      _meta: { description: 'The source of the schedule details flyout open', optional: false },
    },
  },
};

export const attacksSettingsFlyoutOpenedEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.SettingsFlyoutOpened,
  schema: {
    source: {
      type: 'keyword',
      _meta: { description: 'The source of the settings flyout open', optional: false },
    },
  },
};

export const attacksGenerateClickedEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.GenerateClicked,
  schema: {
    source: {
      type: 'keyword',
      _meta: { description: 'The source of the generate button click', optional: false },
    },
  },
};

export const attacksFeaturePromotionCalloutActionEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.FeaturePromotionCalloutAction,
  schema: {
    action: {
      type: 'keyword',
      _meta: {
        description: 'The action taken on the promotion callout (view_attacks/hide)',
        optional: false,
      },
    },
  },
};

export const attacksWorkflowRunTriggeredEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.WorkflowRunTriggered,
  schema: actionSourceSchema,
};

export const attacksTypeFilterChangedEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.TypeFilterChanged,
  schema: {
    types: {
      type: 'array',
      items: {
        type: 'keyword',
        _meta: { description: 'A selected type', optional: false },
      },
      _meta: { description: 'The selected types in the type filter', optional: false },
    },
  },
};

export const attacksTourCalloutActionEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.TourCalloutAction,
  schema: {
    action: {
      type: 'keyword',
      _meta: {
        description: 'The action taken on the tour callout (view/start_tour/view_docs/dismiss)',
        optional: false,
      },
    },
  },
};

export const attacksTourStepActionEvent: AttacksTelemetryEvent = {
  eventType: AttacksEventTypes.TourStepAction,
  schema: {
    action: {
      type: 'keyword',
      _meta: {
        description: 'The action taken on a tour step (advance/dismiss/finish)',
        optional: false,
      },
    },
    step: {
      type: 'integer',
      _meta: { description: 'The tour step the action was taken on', optional: false },
    },
  },
};

export const attacksTelemetryEvents = [
  attacksTableSortChangedEvent,
  attacksViewOptionChangedEvent,
  attacksKPIViewChangedEvent,
  attacksActionStatusUpdatedEvent,
  attacksActionAssigneeUpdatedEvent,
  attacksActionTagsUpdatedEvent,
  attacksActionAddedToCaseEvent,
  attacksTimelineInvestigationOpenedEvent,
  attacksAIAssistantOpenedEvent,
  attacksDetailsFlyoutOpenedEvent,
  attacksExpandedViewTabClickedEvent,
  attacksScheduleFlyoutOpenedEvent,
  attacksSettingsFlyoutOpenedEvent,
  attacksGenerateClickedEvent,
  attacksScheduleDetailsFlyoutOpenedEvent,
  attacksFeaturePromotionCalloutActionEvent,
  attacksWorkflowRunTriggeredEvent,
  attacksTypeFilterChangedEvent,
  attacksTourCalloutActionEvent,
  attacksTourStepActionEvent,
];
