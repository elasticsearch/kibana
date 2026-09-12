/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Copy for the per-watch settings page.
 *
 * The API carries ids only, so every autonomy level, select option, approval gate, run outcome and
 * per-watch intro resolves to a message here. Keep the id maps in step with the managed watch
 * catalog in `@kbn/alertzero-common`.
 */

import { i18n } from '@kbn/i18n';
import {
  SYSTEM_SECURITY_WATCH_DARK_ID,
  SYSTEM_SECURITY_WATCH_DEEP_ID,
  SYSTEM_SECURITY_WATCH_DETECTION_ID,
  SYSTEM_SECURITY_WATCH_FLOOR_ID,
  SYSTEM_SECURITY_WATCH_OFFICER_ID,
  type WorkerScheduleUnit,
} from '@kbn/alertzero-common';

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

export const ENABLED_SWITCH_LABEL = i18n.translate(
  'xpack.alertzero.watches.settings.enabledSwitch',
  {
    defaultMessage: 'Enabled',
  }
);

/* -------------------------------------------------------------------------- */
/* Section headings                                                           */
/* -------------------------------------------------------------------------- */

export const AUTONOMY_SECTION_TITLE = i18n.translate(
  'xpack.alertzero.watches.settings.autonomy.sectionTitle',
  { defaultMessage: 'Autonomy' }
);

export const AUTONOMY_SECTION_SUBTITLE = i18n.translate(
  'xpack.alertzero.watches.settings.autonomy.sectionSubtitle',
  { defaultMessage: 'applies to this worker only' }
);

export const TRIGGERS_SECTION_TITLE = i18n.translate(
  'xpack.alertzero.watches.settings.triggers.sectionTitle',
  { defaultMessage: 'Triggers' }
);

export const TRIGGERS_SECTION_SUBTITLE = i18n.translate(
  'xpack.alertzero.watches.settings.triggers.sectionSubtitle',
  { defaultMessage: 'owned by the Watch Orchestrator' }
);

export const SCOPE_SECTION_TITLE = i18n.translate(
  'xpack.alertzero.watches.settings.scope.sectionTitle',
  {
    defaultMessage: 'Scope & routing',
  }
);

export const SCOPE_SECTION_SUBTITLE = i18n.translate(
  'xpack.alertzero.watches.settings.scope.sectionSubtitle',
  { defaultMessage: 'what it may read, where work lands' }
);

export const WORKERS_SECTION_TITLE = i18n.translate(
  'xpack.alertzero.watches.settings.workers.sectionTitle',
  { defaultMessage: 'Workers' }
);

export const WORKERS_SECTION_SUBTITLE = i18n.translate(
  'xpack.alertzero.watches.settings.workers.sectionSubtitle',
  { defaultMessage: 'Workers tagged as this Watch' }
);

export const WORKER_SECTION_SUBTITLE = i18n.translate(
  'xpack.alertzero.watches.settings.worker.sectionSubtitle',
  { defaultMessage: 'applies to this worker only' }
);

export const WORKER_SETTINGS_UNAVAILABLE = i18n.translate(
  'xpack.alertzero.watches.settings.worker.unavailable',
  { defaultMessage: 'Settings could not be read; reload and try again' }
);

export const SKILLS_SECTION_TITLE = i18n.translate(
  'xpack.alertzero.watches.settings.skills.sectionTitle',
  { defaultMessage: 'Skills' }
);

export const SKILLS_SECTION_SUBTITLE = i18n.translate(
  'xpack.alertzero.watches.settings.skills.sectionSubtitle',
  { defaultMessage: 'what this Worker can use' }
);

export const SKILLS_VIEW_ALL = i18n.translate('xpack.alertzero.watches.settings.skills.viewAll', {
  defaultMessage: 'View all skills',
});

export const GATES_SECTION_TITLE = i18n.translate(
  'xpack.alertzero.watches.settings.gates.sectionTitle',
  {
    defaultMessage: 'Approval gates',
  }
);

export const GATES_SECTION_SUBTITLE = i18n.translate(
  'xpack.alertzero.watches.settings.gates.sectionSubtitle',
  { defaultMessage: 'humans stay in control of consequential changes' }
);

export const LEDGER_SECTION_TITLE = i18n.translate(
  'xpack.alertzero.watches.settings.ledger.sectionTitle',
  { defaultMessage: 'Recent runs' }
);

export const LEDGER_SECTION_SUBTITLE = i18n.translate(
  'xpack.alertzero.watches.settings.ledger.sectionSubtitle',
  { defaultMessage: 'ledger for this Watch' }
);

/* -------------------------------------------------------------------------- */
/* Autonomy                                                                   */
/* -------------------------------------------------------------------------- */

export const AUTONOMY_LEVEL_NAMES: Record<string, string> = {
  manual: i18n.translate('xpack.alertzero.watches.settings.autonomy.manual.name', {
    defaultMessage: 'Manual',
  }),
  assisted: i18n.translate('xpack.alertzero.watches.settings.autonomy.assisted.name', {
    defaultMessage: 'Assisted',
  }),
  supervised: i18n.translate('xpack.alertzero.watches.settings.autonomy.supervised.name', {
    defaultMessage: 'Supervised',
  }),
};

export const AUTONOMY_LEVEL_DESCRIPTIONS: Record<string, string> = {
  manual: i18n.translate('xpack.alertzero.watches.settings.autonomy.manual.description', {
    defaultMessage:
      'Nothing runs on its own. This Worker drafts proposals and every one of them waits for your review.',
  }),
  assisted: i18n.translate('xpack.alertzero.watches.settings.autonomy.assisted.description', {
    defaultMessage:
      'Routine, reversible steps run on their own. Anything consequential is staged and waits for approval.',
  }),
  supervised: i18n.translate('xpack.alertzero.watches.settings.autonomy.supervised.description', {
    defaultMessage:
      'This Worker acts within its allow-list and tells you afterwards. Consequential actions still gate.',
  }),
};

export const autonomyLevelName = (levelId: string): string =>
  AUTONOMY_LEVEL_NAMES[levelId] ?? levelId;

export const AUTONOMY_RANGE_ARIA_LABEL = i18n.translate(
  'xpack.alertzero.watches.settings.autonomy.rangeAriaLabel',
  { defaultMessage: 'Autonomy level' }
);

/* -------------------------------------------------------------------------- */
/* Schedule interval                                                          */
/* -------------------------------------------------------------------------- */

export const SCHEDULE_INTERVAL_LABEL = i18n.translate(
  'xpack.alertzero.watches.settings.scheduleInterval.label',
  { defaultMessage: 'Run every' }
);

export const SCHEDULE_INTERVAL_HELP_TEXT = i18n.translate(
  'xpack.alertzero.watches.settings.scheduleInterval.helpText',
  { defaultMessage: 'How often this Worker runs. Applies to this Worker only.' }
);

export const SCHEDULE_INTERVAL_NUMBER_ARIA_LABEL = i18n.translate(
  'xpack.alertzero.watches.settings.scheduleInterval.numberAriaLabel',
  { defaultMessage: 'Schedule interval' }
);

export const SCHEDULE_INTERVAL_UNIT_ARIA_LABEL = i18n.translate(
  'xpack.alertzero.watches.settings.scheduleInterval.unitAriaLabel',
  { defaultMessage: 'Schedule interval unit' }
);

const SCHEDULE_UNIT_MINUTE = (intervalValue: string) =>
  i18n.translate('xpack.alertzero.watches.settings.scheduleInterval.unit.minute', {
    defaultMessage: '{intervalValue, plural, one {minute} other {minutes}}',
    values: { intervalValue },
  });

const SCHEDULE_UNIT_HOUR = (intervalValue: string) =>
  i18n.translate('xpack.alertzero.watches.settings.scheduleInterval.unit.hour', {
    defaultMessage: '{intervalValue, plural, one {hour} other {hours}}',
    values: { intervalValue },
  });

const SCHEDULE_UNIT_DAY = (intervalValue: string) =>
  i18n.translate('xpack.alertzero.watches.settings.scheduleInterval.unit.day', {
    defaultMessage: '{intervalValue, plural, one {day} other {days}}',
    values: { intervalValue },
  });

/** Pluralised unit label, matching how the Attack Discovery schedule form reads its unit select. */
export const scheduleUnitLabel = (unit: WorkerScheduleUnit, intervalValue: number): string => {
  const value = String(intervalValue);
  switch (unit) {
    case 'm':
      return SCHEDULE_UNIT_MINUTE(value);
    case 'h':
      return SCHEDULE_UNIT_HOUR(value);
    case 'd':
      return SCHEDULE_UNIT_DAY(value);
  }
};

/* -------------------------------------------------------------------------- */
/* Triggers                                                                   */
/* -------------------------------------------------------------------------- */

export const AD_SHARED_CALLOUT_TITLE = i18n.translate(
  'xpack.alertzero.watches.settings.triggers.adSharedTitle',
  { defaultMessage: 'Shared with Attack Discovery' }
);

export const AD_SHARED_CALLOUT_BODY = i18n.translate(
  'xpack.alertzero.watches.settings.triggers.adSharedBody',
  {
    defaultMessage:
      'The Attack Discovery schedule below is the same configuration as the existing Attack Discovery UI — same flyout, API, and backing data.',
  }
);

export const AD_SCHEDULE_LABEL = i18n.translate(
  'xpack.alertzero.watches.settings.triggers.adScheduleLabel',
  { defaultMessage: 'Attack Discovery schedule' }
);

export const SCHEDULE_LABEL = i18n.translate(
  'xpack.alertzero.watches.settings.triggers.scheduleLabel',
  {
    defaultMessage: 'Schedule',
  }
);

export const SCHEDULE_HELP = i18n.translate(
  'xpack.alertzero.watches.settings.triggers.scheduleHelp',
  {
    defaultMessage: 'How often the Orchestrator looks for new work.',
  }
);

export const MANUAL_RUN_LABEL = i18n.translate(
  'xpack.alertzero.watches.settings.triggers.manualRunLabel',
  { defaultMessage: 'Manual run' }
);

export const MANUAL_RUN_SWITCH_LABEL = i18n.translate(
  'xpack.alertzero.watches.settings.triggers.manualRunSwitchLabel',
  { defaultMessage: 'Allow manual run' }
);

export const MANUAL_RUN_HELP = i18n.translate(
  'xpack.alertzero.watches.settings.triggers.manualRunHelp',
  {
    defaultMessage: 'Lets an analyst start a run outside the schedule.',
  }
);

export const SCHEDULE_OPTION_LABELS: Record<string, string> = {
  'every-5m': i18n.translate('xpack.alertzero.watches.settings.schedule.every5m', {
    defaultMessage: 'Every 5 minutes',
  }),
  'every-15m': i18n.translate('xpack.alertzero.watches.settings.schedule.every15m', {
    defaultMessage: 'Every 15 minutes',
  }),
  'every-30m': i18n.translate('xpack.alertzero.watches.settings.schedule.every30m', {
    defaultMessage: 'Every 30 minutes',
  }),
  hourly: i18n.translate('xpack.alertzero.watches.settings.schedule.hourly', {
    defaultMessage: 'Every hour',
  }),
};

/* -------------------------------------------------------------------------- */
/* Scope & routing                                                            */
/* -------------------------------------------------------------------------- */

export const DATA_SOURCES_LABEL = i18n.translate(
  'xpack.alertzero.watches.settings.scope.dataSources',
  {
    defaultMessage: 'Allowed data sources',
  }
);

export const DATA_SOURCES_HELP = i18n.translate(
  'xpack.alertzero.watches.settings.scope.dataSourcesHelp',
  {
    defaultMessage: 'What this Watch may read while it works.',
  }
);

export const ASSIGNEE_QUEUE_LABEL = i18n.translate(
  'xpack.alertzero.watches.settings.scope.assigneeQueue',
  { defaultMessage: 'Default assignee queue' }
);

export const ASSIGNEE_QUEUE_HELP = i18n.translate(
  'xpack.alertzero.watches.settings.scope.assigneeQueueHelp',
  { defaultMessage: 'Where proposals land for review.' }
);

export const ESCALATION_CONTACT_LABEL = i18n.translate(
  'xpack.alertzero.watches.settings.scope.escalationContact',
  { defaultMessage: 'Escalation contact' }
);

export const ESCALATION_CONTACT_HELP = i18n.translate(
  'xpack.alertzero.watches.settings.scope.escalationContactHelp',
  { defaultMessage: 'Who is paged when something cannot wait for the queue.' }
);

export const DATA_BOUNDARIES_TITLE = i18n.translate(
  'xpack.alertzero.watches.settings.scope.dataBoundaries',
  { defaultMessage: 'Data boundaries' }
);

export const DATA_SOURCE_OPTION_LABELS: Record<string, string> = {
  'alerts-only': i18n.translate('xpack.alertzero.watches.settings.dataSources.alertsOnly', {
    defaultMessage: 'Alerts',
  }),
  'alerts-entities': i18n.translate('xpack.alertzero.watches.settings.dataSources.alertsEntities', {
    defaultMessage: 'Alerts, entities',
  }),
  'alerts-entities-timelines': i18n.translate(
    'xpack.alertzero.watches.settings.dataSources.alertsEntitiesTimelines',
    { defaultMessage: 'Alerts, entities, timelines' }
  ),
  'alerts-entities-timelines-edr': i18n.translate(
    'xpack.alertzero.watches.settings.dataSources.alertsEntitiesTimelinesEdr',
    { defaultMessage: 'Alerts, entities, timelines, EDR telemetry' }
  ),
};

export const ASSIGNEE_QUEUE_OPTION_LABELS: Record<string, string> = {
  unassigned: i18n.translate('xpack.alertzero.watches.settings.assigneeQueue.unassigned', {
    defaultMessage: 'Unassigned',
  }),
  'tier-1-alert-triage': i18n.translate('xpack.alertzero.watches.settings.assigneeQueue.tier1', {
    defaultMessage: 'Tier 1 — Alert triage',
  }),
  'tier-2-escalations': i18n.translate('xpack.alertzero.watches.settings.assigneeQueue.tier2', {
    defaultMessage: 'Tier 2 — Escalations',
  }),
  'detection-engineering': i18n.translate(
    'xpack.alertzero.watches.settings.assigneeQueue.detectionEngineering',
    { defaultMessage: 'Detection engineering' }
  ),
  'threat-hunting': i18n.translate('xpack.alertzero.watches.settings.assigneeQueue.threatHunting', {
    defaultMessage: 'Threat hunting',
  }),
};

export const ESCALATION_CONTACT_OPTION_LABELS: Record<string, string> = {
  none: i18n.translate('xpack.alertzero.watches.settings.escalationContact.none', {
    defaultMessage: 'None',
  }),
  'soc-lead-on-call': i18n.translate('xpack.alertzero.watches.settings.escalationContact.socLead', {
    defaultMessage: 'SOC lead on-call',
  }),
  'ir-on-call': i18n.translate('xpack.alertzero.watches.settings.escalationContact.irOnCall', {
    defaultMessage: 'IR on-call',
  }),
  'detection-lead': i18n.translate(
    'xpack.alertzero.watches.settings.escalationContact.detectionLead',
    {
      defaultMessage: 'Detection lead',
    }
  ),
};

/* -------------------------------------------------------------------------- */
/* Workers & skills sections                                                  */
/* -------------------------------------------------------------------------- */

export const SKILL_DEPENDENCIES_CALLOUT_TITLE = i18n.translate(
  'xpack.alertzero.watches.settings.skills.dependenciesTitle',
  { defaultMessage: 'Skill dependencies' }
);

export const SKILL_DEPENDENCIES_CALLOUT_BODY = i18n.translate(
  'xpack.alertzero.watches.settings.skills.dependenciesBody',
  {
    defaultMessage:
      'Disabling a skill that a Worker depends on will degrade or disable that Worker.',
  }
);

export const COL_WORKER = i18n.translate('xpack.alertzero.watches.settings.col.worker', {
  defaultMessage: 'Worker',
});

export const COL_SKILL = i18n.translate('xpack.alertzero.watches.settings.col.skill', {
  defaultMessage: 'Skill',
});

export const COL_DESCRIPTION = i18n.translate('xpack.alertzero.watches.settings.col.description', {
  defaultMessage: 'Description',
});

export const COL_ENABLED = i18n.translate('xpack.alertzero.watches.settings.col.enabled', {
  defaultMessage: 'Enabled',
});

export const STATUS_ENABLED = i18n.translate('xpack.alertzero.watches.settings.status.enabled', {
  defaultMessage: 'enabled',
});

export const STATUS_DISABLED = i18n.translate('xpack.alertzero.watches.settings.status.disabled', {
  defaultMessage: 'disabled',
});

export const STATUS_PAUSED = i18n.translate('xpack.alertzero.watches.settings.status.paused', {
  defaultMessage: 'paused',
});

export const STATUS_UNAVAILABLE = i18n.translate(
  'xpack.alertzero.watches.settings.status.unavailable',
  {
    defaultMessage: 'unavailable',
  }
);

export const STATUS_DISABLED_GLOBALLY = i18n.translate(
  'xpack.alertzero.watches.settings.status.disabledGlobally',
  { defaultMessage: 'disabled for every Watch' }
);

export const lastRunStatus = (relativeTime: string) =>
  i18n.translate('xpack.alertzero.watches.settings.status.lastRun', {
    defaultMessage: 'last run {relativeTime}',
    values: { relativeTime },
  });

export const degradedStatus = (reason: string) =>
  i18n.translate('xpack.alertzero.watches.settings.status.degraded', {
    defaultMessage: 'degraded — {reason}',
    values: { reason },
  });

export const STATUS_DEGRADED = i18n.translate(
  'xpack.alertzero.watches.settings.status.degradedPlain',
  {
    defaultMessage: 'degraded',
  }
);

/* -------------------------------------------------------------------------- */
/* Workers summary rail (two-column Worker layout)                            */
/* -------------------------------------------------------------------------- */

export const WORKERS_RAIL_HEADING = i18n.translate(
  'xpack.alertzero.watches.settings.rail.heading',
  {
    defaultMessage: 'Workers in this Watch',
  }
);

export const RAIL_STATUS_ENABLED = i18n.translate(
  'xpack.alertzero.watches.settings.rail.status.enabled',
  {
    defaultMessage: 'Enabled',
  }
);

export const RAIL_STATUS_DISABLED = i18n.translate(
  'xpack.alertzero.watches.settings.rail.status.disabled',
  {
    defaultMessage: 'Disabled',
  }
);

export const RAIL_STATUS_PAUSED = i18n.translate(
  'xpack.alertzero.watches.settings.rail.status.paused',
  {
    defaultMessage: 'Paused',
  }
);

export const RAIL_STATUS_UNAVAILABLE = i18n.translate(
  'xpack.alertzero.watches.settings.rail.status.unavailable',
  {
    defaultMessage: 'Unavailable',
  }
);

export const RAIL_STATUS_DEGRADED = i18n.translate(
  'xpack.alertzero.watches.settings.rail.status.degraded',
  {
    defaultMessage: 'Degraded',
  }
);

export const RAIL_LAST_RUN = i18n.translate('xpack.alertzero.watches.settings.rail.lastRun', {
  defaultMessage: 'Last run',
});

export const RAIL_AUTONOMY = i18n.translate('xpack.alertzero.watches.settings.rail.autonomy', {
  defaultMessage: 'Autonomy',
});

export const WORKERS_EMPTY_TITLE = i18n.translate(
  'xpack.alertzero.watches.settings.workers.empty.title',
  {
    defaultMessage: 'No Workers in this Watch',
  }
);

export const WORKERS_EMPTY_BODY = i18n.translate(
  'xpack.alertzero.watches.settings.workers.empty.body',
  {
    defaultMessage: 'This Watch has no Workers yet.',
  }
);

/* -------------------------------------------------------------------------- */
/* Approval gates                                                             */
/* -------------------------------------------------------------------------- */

export const COL_ACTION_TYPE = i18n.translate(
  'xpack.alertzero.watches.settings.gates.col.actionType',
  {
    defaultMessage: 'Action type',
  }
);

export const COL_REQUIRES_APPROVAL = i18n.translate(
  'xpack.alertzero.watches.settings.gates.col.requiresApproval',
  { defaultMessage: 'Requires approval' }
);

export const COL_APPROVER_ROLE = i18n.translate(
  'xpack.alertzero.watches.settings.gates.col.approverRole',
  { defaultMessage: 'Approver role' }
);

export const GATE_NAMES: Record<string, string> = {
  'host-isolation': i18n.translate('xpack.alertzero.watches.settings.gates.hostIsolation.name', {
    defaultMessage: 'Host isolation',
  }),
  'detection-rule-change': i18n.translate(
    'xpack.alertzero.watches.settings.gates.detectionRuleChange.name',
    { defaultMessage: 'Detection rule change' }
  ),
  'new-detection-rule': i18n.translate(
    'xpack.alertzero.watches.settings.gates.newDetectionRule.name',
    {
      defaultMessage: 'New detection rule',
    }
  ),
  'hunt-execution': i18n.translate('xpack.alertzero.watches.settings.gates.huntExecution.name', {
    defaultMessage: 'Hunt execution',
  }),
  'evidence-only-investigation': i18n.translate(
    'xpack.alertzero.watches.settings.gates.evidenceOnly.name',
    { defaultMessage: 'Evidence-only investigation' }
  ),
};

export const GATE_QUALIFIERS: Record<string, string> = {
  'host-isolation': i18n.translate(
    'xpack.alertzero.watches.settings.gates.hostIsolation.qualifier',
    {
      defaultMessage: 'Elastic Defend response',
    }
  ),
  'detection-rule-change': i18n.translate(
    'xpack.alertzero.watches.settings.gates.detectionRuleChange.qualifier',
    { defaultMessage: 'tuning / suppression / exception' }
  ),
  'new-detection-rule': i18n.translate(
    'xpack.alertzero.watches.settings.gates.newDetectionRule.qualifier',
    { defaultMessage: 'ships monitor-only until validated' }
  ),
  'hunt-execution': i18n.translate(
    'xpack.alertzero.watches.settings.gates.huntExecution.qualifier',
    {
      defaultMessage: 'scoped query against telemetry',
    }
  ),
  'evidence-only-investigation': i18n.translate(
    'xpack.alertzero.watches.settings.gates.evidenceOnly.qualifier',
    { defaultMessage: 'no side effects' }
  ),
};

export const APPROVAL_REQUIREMENT_LABELS: Record<string, string> = {
  always: i18n.translate('xpack.alertzero.watches.settings.gates.requirement.always', {
    defaultMessage: 'Always',
  }),
  'high-impact': i18n.translate('xpack.alertzero.watches.settings.gates.requirement.highImpact', {
    defaultMessage: 'High-impact only',
  }),
  'in-scope': i18n.translate('xpack.alertzero.watches.settings.gates.requirement.inScope', {
    defaultMessage: 'Runs in scope',
  }),
};

export const APPROVER_ROLE_LABELS: Record<string, string> = {
  'incident-lead': i18n.translate('xpack.alertzero.watches.settings.gates.role.incidentLead', {
    defaultMessage: 'Incident lead',
  }),
  'detection-engineer': i18n.translate(
    'xpack.alertzero.watches.settings.gates.role.detectionEngineer',
    {
      defaultMessage: 'Detection engineer',
    }
  ),
  'threat-hunter': i18n.translate('xpack.alertzero.watches.settings.gates.role.threatHunter', {
    defaultMessage: 'Threat hunter',
  }),
  'soc-lead': i18n.translate('xpack.alertzero.watches.settings.gates.role.socLead', {
    defaultMessage: 'SOC lead',
  }),
};

export const AUDIT_TRAIL_CALLOUT_TITLE = i18n.translate(
  'xpack.alertzero.watches.settings.gates.auditTrailTitle',
  { defaultMessage: 'Audit trail' }
);

export const AUDIT_TRAIL_CALLOUT_BODY = i18n.translate(
  'xpack.alertzero.watches.settings.gates.auditTrailBody',
  {
    defaultMessage:
      'Every approved action creates an Action Result — target, approver, output, and rollback notes — for the audit trail.',
  }
);

export const requirementSelectAriaLabel = (gateName: string) =>
  i18n.translate('xpack.alertzero.watches.settings.gates.requirementAriaLabel', {
    defaultMessage: 'Approval requirement for {gateName}',
    values: { gateName },
  });

export const approverSelectAriaLabel = (gateName: string) =>
  i18n.translate('xpack.alertzero.watches.settings.gates.approverAriaLabel', {
    defaultMessage: 'Approver role for {gateName}',
    values: { gateName },
  });

/* -------------------------------------------------------------------------- */
/* Run ledger                                                                 */
/* -------------------------------------------------------------------------- */

export const COL_TIME = i18n.translate('xpack.alertzero.watches.settings.ledger.col.time', {
  defaultMessage: 'Time',
});

export const COL_WORKFLOW = i18n.translate('xpack.alertzero.watches.settings.ledger.col.workflow', {
  defaultMessage: 'Workflow',
});

export const COL_ACTION = i18n.translate('xpack.alertzero.watches.settings.ledger.col.action', {
  defaultMessage: 'Action',
});

export const COL_EVENT = i18n.translate('xpack.alertzero.watches.settings.ledger.col.event', {
  defaultMessage: 'Event',
});

export const COL_OUTCOME = i18n.translate('xpack.alertzero.watches.settings.ledger.col.outcome', {
  defaultMessage: 'Outcome',
});

export const NO_LEDGER_ENTRIES = i18n.translate('xpack.alertzero.watches.settings.ledger.empty', {
  defaultMessage: 'No runs recorded for this Watch yet.',
});

export const RUN_ACTION_LABELS: Record<string, string> = {
  read: i18n.translate('xpack.alertzero.watches.settings.ledger.action.read', {
    defaultMessage: 'Read',
  }),
  draft: i18n.translate('xpack.alertzero.watches.settings.ledger.action.draft', {
    defaultMessage: 'Draft',
  }),
  gated: i18n.translate('xpack.alertzero.watches.settings.ledger.action.gated', {
    defaultMessage: 'Gated',
  }),
  auto: i18n.translate('xpack.alertzero.watches.settings.ledger.action.auto', {
    defaultMessage: 'Auto',
  }),
};

export const RUN_OUTCOME_LABELS: Record<string, string> = {
  'awaiting-review': i18n.translate(
    'xpack.alertzero.watches.settings.ledger.outcome.awaitingReview',
    {
      defaultMessage: 'Awaiting review',
    }
  ),
  accepted: i18n.translate('xpack.alertzero.watches.settings.ledger.outcome.accepted', {
    defaultMessage: 'Accepted',
  }),
  dismissed: i18n.translate('xpack.alertzero.watches.settings.ledger.outcome.dismissed', {
    defaultMessage: 'Dismissed',
  }),
  executed: i18n.translate('xpack.alertzero.watches.settings.ledger.outcome.executed', {
    defaultMessage: 'Executed',
  }),
  completed: i18n.translate('xpack.alertzero.watches.settings.ledger.outcome.completed', {
    defaultMessage: 'Completed',
  }),
};

/* -------------------------------------------------------------------------- */
/* Per-watch intro                                                            */
/* -------------------------------------------------------------------------- */

const WATCH_INTROS: Record<string, string> = {
  [SYSTEM_SECURITY_WATCH_FLOOR_ID]: i18n.translate('xpack.alertzero.watches.settings.intro.floor', {
    defaultMessage:
      'Groups the Workers that reduce alert volume and route what still needs a person. Settings below belong to each Worker, not to this Watch.',
  }),
  [SYSTEM_SECURITY_WATCH_OFFICER_ID]: i18n.translate(
    'xpack.alertzero.watches.settings.intro.officer',
    {
      defaultMessage:
        'Watch grouping for investigation hand-off. No Workers are attached yet. Settings, when added, will belong to each Worker, not to this Watch.',
    }
  ),
  [SYSTEM_SECURITY_WATCH_DARK_ID]: i18n.translate('xpack.alertzero.watches.settings.intro.dark', {
    defaultMessage:
      'Groups the Continuous Threat Hunt Worker. Findings arrive as reviewable evidence. Settings below belong to that Worker, not to this Watch.',
  }),
  [SYSTEM_SECURITY_WATCH_DEEP_ID]: i18n.translate('xpack.alertzero.watches.settings.intro.deep', {
    defaultMessage:
      'Watch grouping for specialist analysis. No Workers are attached yet. Settings, when added, will belong to each Worker, not to this Watch.',
  }),
  [SYSTEM_SECURITY_WATCH_DETECTION_ID]: i18n.translate(
    'xpack.alertzero.watches.settings.intro.detection',
    {
      defaultMessage:
        'Groups the Rule Tuning and Rule Creation Workers. Settings below belong to each Worker, not to this Watch.',
    }
  ),
};

export const watchIntro = (watchId: string): string | undefined => WATCH_INTROS[watchId];
