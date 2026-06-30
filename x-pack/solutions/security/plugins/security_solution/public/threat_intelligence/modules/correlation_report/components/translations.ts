/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

const ns = 'xpack.securitySolution.threatIntelligence.correlationReport';

export const i18nText = {
  defaultTitle: () =>
    i18n.translate(`${ns}.defaultTitle`, { defaultMessage: 'Correlation Report' }),

  runIdLabel: () => i18n.translate(`${ns}.runIdLabel`, { defaultMessage: 'Run' }),

  blufSectionTitle: () =>
    i18n.translate(`${ns}.blufSectionTitle`, { defaultMessage: 'Bottom Line Up Front' }),

  caseSignalSectionTitle: () =>
    i18n.translate(`${ns}.caseSignalSectionTitle`, { defaultMessage: 'Case Signal' }),

  caseSignalDescription: () =>
    i18n.translate(`${ns}.caseSignalDescription`, {
      defaultMessage: 'Diamond signal of the case under analysis.',
    }),

  leadsSectionTitle: () => i18n.translate(`${ns}.leadsSectionTitle`, { defaultMessage: 'Leads' }),

  noMatchesSectionTitle: () =>
    i18n.translate(`${ns}.noMatchesSectionTitle`, { defaultMessage: 'No Matches' }),

  noMatchesEmpty: () =>
    i18n.translate(`${ns}.noMatchesEmpty`, { defaultMessage: 'None this run.' }),

  synthesisSectionTitle: () =>
    i18n.translate(`${ns}.synthesisSectionTitle`, { defaultMessage: 'Synthesis' }),

  nextStepsSectionTitle: () =>
    i18n.translate(`${ns}.nextStepsSectionTitle`, { defaultMessage: 'Next Steps' }),

  // Vertex labels
  vertexAdversary: () => i18n.translate(`${ns}.vertexAdversary`, { defaultMessage: 'Adversary' }),
  vertexCapability: () =>
    i18n.translate(`${ns}.vertexCapability`, { defaultMessage: 'Capability' }),
  vertexInfrastructure: () =>
    i18n.translate(`${ns}.vertexInfrastructure`, { defaultMessage: 'Infrastructure' }),
  vertexVictim: () => i18n.translate(`${ns}.vertexVictim`, { defaultMessage: 'Victim' }),

  // Signal level labels
  signalHigh: () => i18n.translate(`${ns}.signalHigh`, { defaultMessage: 'high' }),
  signalModerate: () => i18n.translate(`${ns}.signalModerate`, { defaultMessage: 'moderate' }),
  signalPartial: () => i18n.translate(`${ns}.signalPartial`, { defaultMessage: 'partial' }),
  signalLow: () => i18n.translate(`${ns}.signalLow`, { defaultMessage: 'low' }),
  signalNone: () => i18n.translate(`${ns}.signalNone`, { defaultMessage: 'none' }),

  // Relationship labels
  relationshipSameCampaign: () =>
    i18n.translate(`${ns}.relationshipSameCampaign`, { defaultMessage: 'Same Campaign' }),
  relationshipSameActor: () =>
    i18n.translate(`${ns}.relationshipSameActor`, { defaultMessage: 'Same Actor' }),
  relationshipSharedTradecraft: () =>
    i18n.translate(`${ns}.relationshipSharedTradecraft`, { defaultMessage: 'Shared Tradecraft' }),

  // Evidence weight labels
  weightSmokingGun: () =>
    i18n.translate(`${ns}.weightSmokingGun`, { defaultMessage: 'smoking gun' }),
  weightSupporting: () =>
    i18n.translate(`${ns}.weightSupporting`, { defaultMessage: 'supporting' }),
  weightNonDiscriminatory: () =>
    i18n.translate(`${ns}.weightNonDiscriminatory`, { defaultMessage: 'non-discriminatory' }),
  weightCounter: () => i18n.translate(`${ns}.weightCounter`, { defaultMessage: 'counter' }),
  weightDecisiveCounter: () =>
    i18n.translate(`${ns}.weightDecisiveCounter`, { defaultMessage: 'decisive counter' }),

  // Evidence section labels
  supportingEvidenceLabel: () =>
    i18n.translate(`${ns}.supportingEvidenceLabel`, { defaultMessage: 'Supporting' }),
  counterEvidenceLabel: () =>
    i18n.translate(`${ns}.counterEvidenceLabel`, { defaultMessage: 'Counter' }),
  gapsLabel: () => i18n.translate(`${ns}.gapsLabel`, { defaultMessage: 'Gaps' }),

  // Synthesis fields
  reasoningLabel: () => i18n.translate(`${ns}.reasoningLabel`, { defaultMessage: 'Reasoning' }),
  synthesisGapsLabel: () => i18n.translate(`${ns}.synthesisGapsLabel`, { defaultMessage: 'Gaps' }),
  inferentialHopsLabel: () =>
    i18n.translate(`${ns}.inferentialHopsLabel`, { defaultMessage: 'Inferential hops' }),
  atomicIocOverlapLabel: () =>
    i18n.translate(`${ns}.atomicIocOverlapLabel`, { defaultMessage: 'Atomic IOC overlap' }),
  atomicIocAssessed: () =>
    i18n.translate(`${ns}.atomicIocAssessed`, { defaultMessage: 'assessed' }),
  atomicIocNotAssessed: () =>
    i18n.translate(`${ns}.atomicIocNotAssessed`, { defaultMessage: 'not assessed' }),

  // Lead card
  sourceLabel: () => i18n.translate(`${ns}.sourceLabel`, { defaultMessage: 'Source' }),
  sourcesLabel: () => i18n.translate(`${ns}.sourcesLabel`, { defaultMessage: 'Sources' }),
  diamondLabel: () =>
    i18n.translate(`${ns}.diamondLabel`, { defaultMessage: 'Diamond model vertex signals' }),

  // Misc
  notAssessed: () => i18n.translate(`${ns}.notAssessed`, { defaultMessage: 'not assessed' }),
  consolidatedReportsLabel: () =>
    i18n.translate(`${ns}.consolidatedReportsLabel`, {
      defaultMessage: 'Consolidated Reports',
    }),

  // Smart input field
  smartInputLabel: () =>
    i18n.translate(`${ns}.smartInputLabel`, { defaultMessage: 'Report or incident text' }),
  smartInputPlaceholder: () =>
    i18n.translate(`${ns}.smartInputPlaceholder`, {
      defaultMessage:
        'Paste a report ID, a short description of the report to find, or full incident text…',
    }),
  smartInputHelp: () =>
    i18n.translate(`${ns}.smartInputHelp`, {
      defaultMessage:
        'A long ID runs directly; a short phrase searches for matching reports; longer text is correlated as raw incident content.',
    }),

  // Disambiguation panel
  disambigHeader: () =>
    i18n.translate(`${ns}.disambigHeader`, {
      defaultMessage: 'Found these reports — pick one to correlate',
    }),
  disambigNoMatches: () =>
    i18n.translate(`${ns}.disambigNoMatches`, {
      defaultMessage: 'No matching reports found for that phrase.',
    }),
  disambigTreatAsRaw: () =>
    i18n.translate(`${ns}.disambigTreatAsRaw`, {
      defaultMessage: 'None of these — treat as raw text',
    }),
  disambigSearching: () =>
    i18n.translate(`${ns}.disambigSearching`, { defaultMessage: 'Searching reports…' }),

  // Execution options
  executionOptionsTitle: () =>
    i18n.translate(`${ns}.executionOptionsTitle`, { defaultMessage: 'Execution options' }),
  executionOptionsAriaLabel: () =>
    i18n.translate(`${ns}.executionOptionsAriaLabel`, { defaultMessage: 'Open execution options' }),

  // Depth labels
  depthFullLabel: () =>
    i18n.translate(`${ns}.depthFullLabel`, { defaultMessage: 'Full correlation run' }),
  depthFullHint: () =>
    i18n.translate(`${ns}.depthFullHint`, { defaultMessage: '~120s · ~$2.35 est.' }),
  depthTriageLabel: () =>
    i18n.translate(`${ns}.depthTriageLabel`, { defaultMessage: 'Through triage' }),
  depthTriageHint: () =>
    i18n.translate(`${ns}.depthTriageHint`, { defaultMessage: '~30s · ~$0.24 est.' }),
  depthKnnLabel: () => i18n.translate(`${ns}.depthKnnLabel`, { defaultMessage: 'Retrieval (kNN)' }),
  depthKnnHint: () => i18n.translate(`${ns}.depthKnnHint`, { defaultMessage: '~secs' }),
  depthExtractLabel: () =>
    i18n.translate(`${ns}.depthExtractLabel`, { defaultMessage: 'Extract diamond' }),
  depthExtractHint: () => i18n.translate(`${ns}.depthExtractHint`, { defaultMessage: '~secs' }),

  // Run button
  runBtn: () => i18n.translate(`${ns}.runBtn`, { defaultMessage: 'Run' }),

  // Stage progress labels
  stageExtract: () =>
    i18n.translate(`${ns}.stageExtract`, { defaultMessage: 'Extracting diamond…' }),
  stageSearch: () =>
    i18n.translate(`${ns}.stageSearch`, { defaultMessage: 'Retrieving candidates…' }),
  stageGapFill: () => i18n.translate(`${ns}.stageGapFill`, { defaultMessage: 'Gap-filling…' }),
  stageDedup: () =>
    i18n.translate(`${ns}.stageDedup`, { defaultMessage: 'Merging duplicate sources…' }),
  stageTriage: () => i18n.translate(`${ns}.stageTriage`, { defaultMessage: 'Triaging…' }),
  stageSynthesize: () =>
    i18n.translate(`${ns}.stageSynthesize`, { defaultMessage: 'Synthesizing…' }),
  stagePending: () => i18n.translate(`${ns}.stagePending`, { defaultMessage: 'Queued…' }),

  // Progress / error messages
  progressTitle: () =>
    i18n.translate(`${ns}.progressTitle`, { defaultMessage: 'Running correlation…' }),
  progressBody: () =>
    i18n.translate(`${ns}.progressBody`, {
      defaultMessage:
        'The pipeline is running in the background. This page polls for updates every 1.5 seconds.',
    }),
  errorTitle: () => i18n.translate(`${ns}.errorTitle`, { defaultMessage: 'Run failed' }),
  retryBtn: () => i18n.translate(`${ns}.retryBtn`, { defaultMessage: 'Retry' }),

  // Status labels
  statusPending: () => i18n.translate(`${ns}.statusPending`, { defaultMessage: 'Pending' }),
  statusRunning: () => i18n.translate(`${ns}.statusRunning`, { defaultMessage: 'Running' }),
  statusSucceeded: () => i18n.translate(`${ns}.statusSucceeded`, { defaultMessage: 'Succeeded' }),
  statusFailed: () => i18n.translate(`${ns}.statusFailed`, { defaultMessage: 'Failed' }),

  // Recents
  recentsTitle: () => i18n.translate(`${ns}.recentsTitle`, { defaultMessage: 'Recent runs' }),
  recentsEmpty: () => i18n.translate(`${ns}.recentsEmpty`, { defaultMessage: 'No recent runs.' }),

  // Extract result
  extractResultTitle: () =>
    i18n.translate(`${ns}.extractResultTitle`, { defaultMessage: 'Extracted Diamond' }),

  // kNN result
  knnResultTitle: () =>
    i18n.translate(`${ns}.knnResultTitle`, { defaultMessage: 'Retrieval Results' }),
  knnMergedTitle: () =>
    i18n.translate(`${ns}.knnMergedTitle`, { defaultMessage: 'Merged Candidates' }),
  knnAnchorHitsTitle: () =>
    i18n.translate(`${ns}.knnAnchorHitsTitle`, { defaultMessage: 'Anchor Hits' }),
  knnColTitle: () => i18n.translate(`${ns}.knnColTitle`, { defaultMessage: 'Title' }),
  knnColOverlap: () => i18n.translate(`${ns}.knnColOverlap`, { defaultMessage: 'Overlap' }),
  knnColScore: () => i18n.translate(`${ns}.knnColScore`, { defaultMessage: 'Score' }),
  knnColVertexScores: () =>
    i18n.translate(`${ns}.knnColVertexScores`, { defaultMessage: 'Vertex scores' }),
  knnNoMerged: () =>
    i18n.translate(`${ns}.knnNoMerged`, { defaultMessage: 'No merged candidates returned.' }),

  // Triage result
  triageResultTitle: () =>
    i18n.translate(`${ns}.triageResultTitle`, { defaultMessage: 'Triage Results' }),
  triagePicksTitle: () => i18n.translate(`${ns}.triagePicksTitle`, { defaultMessage: 'Picks' }),
  triageGroupsTitle: () => i18n.translate(`${ns}.triageGroupsTitle`, { defaultMessage: 'Groups' }),
  triageColCandidate: () =>
    i18n.translate(`${ns}.triageColCandidate`, { defaultMessage: 'Candidate' }),
  triageColConfidence: () =>
    i18n.translate(`${ns}.triageColConfidence`, { defaultMessage: 'Confidence' }),
  triageColJustification: () =>
    i18n.translate(`${ns}.triageColJustification`, { defaultMessage: 'Justification' }),
  triageCandidatesFed: () =>
    i18n.translate(`${ns}.triageCandidatesFed`, { defaultMessage: 'Candidates fed' }),
  triageFallbackUsed: () =>
    i18n.translate(`${ns}.triageFallbackUsed`, { defaultMessage: 'Fallback used' }),
  triageGroupHypothesis: () =>
    i18n.translate(`${ns}.triageGroupHypothesis`, { defaultMessage: 'Hypothesis' }),
  triageYes: () => i18n.translate(`${ns}.triageYes`, { defaultMessage: 'Yes' }),
  triageNo: () => i18n.translate(`${ns}.triageNo`, { defaultMessage: 'No' }),
  triageNoPicks: () =>
    i18n.translate(`${ns}.triageNoPicks`, { defaultMessage: 'No candidates survived triage.' }),
  triageTriagedOutTitle: () =>
    i18n.translate(`${ns}.triageTriagedOutTitle`, { defaultMessage: 'Triaged out' }),
  triageColScore: () => i18n.translate(`${ns}.triageColScore`, { defaultMessage: 'Score' }),
  triageColConfidenceOut: () =>
    i18n.translate(`${ns}.triageColConfidenceOut`, { defaultMessage: 'Confidence' }),
  triageColJustificationOut: () =>
    i18n.translate(`${ns}.triageColJustificationOut`, { defaultMessage: 'Justification' }),

  // kNN — anchor-only row placeholder
  knnAnchorOnly: () => i18n.translate(`${ns}.knnAnchorOnly`, { defaultMessage: 'anchor-only' }),
  knnKeywordMatch: () =>
    i18n.translate(`${ns}.knnKeywordMatch`, { defaultMessage: 'keyword match' }),

  // Anchor match breakdown signal labels
  anchorSignalHash: () => i18n.translate(`${ns}.anchorSignalHash`, { defaultMessage: 'hash' }),
  anchorSignalActor: () => i18n.translate(`${ns}.anchorSignalActor`, { defaultMessage: 'actor' }),
  anchorSignalIdenticalIocSet: () =>
    i18n.translate(`${ns}.anchorSignalIdenticalIocSet`, { defaultMessage: 'identical IOC set' }),

  // Cost trace
  costTraceSectionTitle: () =>
    i18n.translate(`${ns}.costTraceSectionTitle`, { defaultMessage: 'Cost trace' }),
  costTraceStageCol: () => i18n.translate(`${ns}.costTraceStageCol`, { defaultMessage: 'Stage' }),
  costTraceModelCol: () => i18n.translate(`${ns}.costTraceModelCol`, { defaultMessage: 'Model' }),
  costTraceTokensCol: () =>
    i18n.translate(`${ns}.costTraceTokensCol`, { defaultMessage: 'Tokens (in/out)' }),
  costTraceCostCol: () =>
    i18n.translate(`${ns}.costTraceCostCol`, { defaultMessage: 'Cost (USD)' }),
  costTraceTotal: () => i18n.translate(`${ns}.costTraceTotal`, { defaultMessage: 'Total' }),

  // Editable title
  editTitleAriaLabel: () =>
    i18n.translate(`${ns}.editTitleAriaLabel`, { defaultMessage: 'Edit run title' }),
};
