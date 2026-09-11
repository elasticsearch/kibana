/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface PersonaMatrixExampleInput extends Record<string, unknown> {
  question: string;
  /** Inline attachment content sent to the converse API alongside the question. */
  attachment?: string;
}

export interface PersonaMatrixExampleOutput {
  reference: string;
  tool_sequence?: string[];
  primary_skill?: string;
}

export interface PersonaMatrixExample {
  id: string;
  category: string;
  variant: 'A' | 'B' | 'C';
  description: string;
  input: PersonaMatrixExampleInput;
  output: PersonaMatrixExampleOutput;
  metadata: {
    /**
     * Skill whose SKILL.md the agent is expected to load for this prompt.
     *
     * Omit it when the documented contract for the prompt is a direct tool call
     * with no skill load (e.g. `platform.core.generate_workflow`, which
     * `workflow-authoring` explicitly says is not required). Asserting a skill
     * that the product tells the agent NOT to load makes the suite false-fail
     * the happy path.
     *
     * Must be a skill `id` that is actually registered via `defineSkillType`.
     */
    expectedSkill?: string;
    expectedTools?: string[];
    /**
     * Connector id that the authored artifact must actually reference, checked
     * deterministically by the `ConnectorInvoked` evaluator. Calling the
     * workflow-generation tool is not evidence that the produced workflow
     * targets the connector the prompt demanded.
     */
    expectedConnectorId?: string;
    /**
     * Step type (e.g. `http`) that must appear as a YAML key in the authored
     * workflow, so prose describing a step cannot score as a built one.
     */
    expectedStepType?: string;
    /**
     * Whether the declared tool sequence is a rankable contract. "probe" is
     * intentionally open-ended and returns N/A from the trajectory evaluator.
     */
    pathContract?: 'rankable' | 'candidate' | 'probe';
    /**
     * Additional registered skill ids that also satisfy the skill assertion.
     * Scored as a union with `expectedSkill`: loading any one of them passes.
     */
    allowSkills?: string[];
    expectedAttachmentReads?: number;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    tags?: string[];
  };
}

// Tool IDs below are the real registered `security.*` / `platform.core.*` /
// `workflows.*` / `attachments.*` IDs, cross-referenced against:
//   x-pack/solutions/security/plugins/security_solution/server/agent_builder/tools/**
//   x-pack/platform/plugins/shared/agent_builder_platform/server/tools/**
//   x-pack/platform/plugins/shared/agent_builder_workflows/common/constants.ts
//   x-pack/platform/plugins/shared/cases/server/agent_builder/**
//   x-pack/platform/packages/shared/agent-builder/agent-builder-common/tools/constants.ts
// as of PR #280812. Where a skill's own instructions document a hard single-tool
// contract (e.g. alert-triage), expectedTools reflects that contract rather than
// a plausible-sounding multi-tool guess.
export const PERSONA_MATRIX_EXAMPLES: PersonaMatrixExample[] = [
  {
    id: 'alert-analysis-a',
    category: 'alert-analysis',
    variant: 'A',
    description: 'Single alert triage and disposition',
    input: {
      question:
        "Take a look at this alert and tell me what's going on. " +
        "Is it something I should worry about, and what's your recommended disposition?",
      attachment:
        'Alert Details:\n' +
        '  Rule: Suspicious BluetoothService Side-Load\n' +
        '  Host: srv-win-defend-01\n' +
        '  User: SYSTEM\n' +
        '  Severity: High (risk: 73)\n' +
        '  Process: BluetoothService.exe\n' +
        '  File loaded: log.dll (sha256: 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f)\n' +
        '  MITRE: T1574.002 (DLL Side-Loading)\n' +
        '  Timestamp: 2026-07-21T08:00:00Z\n' +
        '  Status: Open',
    },
    output: {
      reference:
        'Explains that BluetoothService.exe loading log.dll from a non-standard location matches ' +
        'T1574.002 DLL side-loading, a known defense-evasion technique; treats the alert as a likely ' +
        'true positive given the high severity/risk score and recommends escalation/containment rather ' +
        'than dismissal, citing entity risk context and any Security Labs research on the technique.',
    },
    metadata: {
      pathContract: 'probe',
      expectedSkill: 'alert-analysis',
      // security.entity_risk_score is force-disabled under
      // agentBuilder:experimentalFeatures (skills), which this suite always
      // enables; the entity-risk context for point-in-time triage comes from
      // security.get_entity's profile instead.
      expectedTools: [
        'attachments.read',
        'security.alerts',
        'security.get_entity',
        'security.security_labs_search',
      ],
      severity: 'high',
      tags: ['triage', 'single-alert'],
    },
  },
  {
    id: 'alert-analysis-b',
    category: 'alert-analysis',
    variant: 'B',
    description: 'Host queue triage and entity correlation',
    input: {
      question:
        "We've got alerts firing on srv-win-defend-01. Triage what's in the alert queue " +
        'for that host — are these related to the same incident, and which entities do they share? ' +
        'Give me a disposition.',
    },
    output: {
      reference:
        'Pulls the open alert queue for srv-win-defend-01 via the alerts tool, groups alerts that ' +
        'share entities (host/user/process), and correlates them into a single candidate incident, ' +
        'using entity risk scoring to justify the disposition rather than treating each alert in isolation.',
    },
    metadata: {
      pathContract: 'probe',
      expectedSkill: 'alert-analysis',
      // entity_risk_score is unavailable under the skills flag (see above);
      // disposition risk context comes from the get_entity profile.
      expectedTools: ['security.alerts', 'security.get_entity'],
      severity: 'high',
      tags: ['triage', 'host-queue'],
    },
  },
  {
    id: 'alert-analysis-c',
    category: 'alert-analysis',
    variant: 'C',
    description: 'Noise evaluation with threat intel',
    input: {
      question:
        "I'm seeing noise on srv-win-defend-01. Is this a real threat or a false positive? " +
        'Pull in any threat intel that would help me decide.',
    },
    output: {
      reference:
        'Retrieves the alert(s) for the host, checks entity risk to gauge whether the pattern is ' +
        "consistent with the host's baseline, and searches Security Labs research for the relevant " +
        'technique/malware family to ground the false-positive-vs-true-positive call in external evidence.',
    },
    metadata: {
      pathContract: 'probe',
      expectedSkill: 'alert-analysis',
      // entity_risk_score is unavailable under the skills flag (see above);
      // the baseline-vs-pattern risk check comes from the get_entity profile.
      expectedTools: ['security.alerts', 'security.security_labs_search', 'security.get_entity'],
      severity: 'medium',
      tags: ['triage', 'noise'],
    },
  },
  {
    id: 'detection-rule-edit-a',
    category: 'detection-rule-edit',
    variant: 'A',
    description: 'Construct rule for DLL side-loading',
    input: {
      question:
        'Build me a detection rule that catches BluetoothService.exe loading log.dll from ' +
        'a non-standard path. Map it to the relevant MITRE ATT&CK technique and set severity to high.',
    },
    output: {
      reference:
        'Calls the create-detection-rule tool with a natural-language description of the side-loading ' +
        'condition (process name + non-standard load path), high severity, and T1574.002 MITRE mapping; ' +
        'renders the created rule attachment inline rather than describing the rule in prose only.',
    },
    metadata: {
      expectedSkill: 'detection-rule-edit',
      expectedTools: ['security.create_detection_rule'],
      severity: 'high',
      tags: ['rule-creation', 'mitre'],
    },
  },
  {
    id: 'detection-rule-edit-b',
    category: 'detection-rule-edit',
    variant: 'B',
    description: 'ES|QL rule for known IOA pattern',
    input: {
      question:
        'I want a new rule to detect the Chrysalis side-loading pattern we just hunted down. ' +
        'Draft it as an ES|QL rule with appropriate tags and threat mappings.',
    },
    output: {
      reference:
        'Calls create-detection-rule with an ES|QL-flavored natural-language query describing the ' +
        'Chrysalis side-loading indicators, appropriate tags, and MITRE mapping; the tool itself ' +
        'generates the underlying ES|QL rather than the agent hand-writing it separately.',
    },
    metadata: {
      expectedSkill: 'detection-rule-edit',
      expectedTools: ['security.create_detection_rule'],
      severity: 'high',
      tags: ['rule-creation', 'esql'],
    },
  },
  {
    id: 'detection-rule-edit-c',
    category: 'detection-rule-edit',
    variant: 'C',
    description: 'Gap closure with research grounding',
    input: {
      question:
        "We've confirmed a threat where BluetoothService.exe on srv-win-defend-01 " +
        'side-loads log.dll (sha256: 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f) ' +
        'from C:\\Users\\Public\\. Help me close the detection gap — create a rule ' +
        'so we catch this automatically next time, and ground it in the relevant Security Labs research.',
    },
    output: {
      reference:
        'Searches Security Labs for prior research on this side-loading pattern/technique first, then ' +
        'calls create-detection-rule with a description informed by that research (specific path, hash, ' +
        'and technique), rather than creating a generic rule without grounding.',
    },
    metadata: {
      expectedSkill: 'detection-rule-edit',
      expectedTools: ['security.security_labs_search', 'security.create_detection_rule'],
      severity: 'high',
      tags: ['rule-creation', 'research'],
    },
  },
  {
    id: 'entity-analytics-a',
    category: 'entity-analytics',
    variant: 'A',
    description: 'Host risk and behavior profile',
    input: {
      question:
        'Show me what we know about the host srv-win-defend-01 — its risk score, ' +
        'asset criticality, and any unusual behavior tied to it.',
    },
    output: {
      reference:
        "Looks up the host entity's risk score and details (including asset criticality if set) and " +
        'summarizes recent risk-contributing activity for srv-win-defend-01.',
    },
    metadata: {
      pathContract: 'probe',
      expectedSkill: 'entity-analytics',
      // security.entity_risk_score is force-disabled whenever
      // agentBuilder:experimentalFeatures (skills) is on — which the persona
      // matrix always runs with — so it can never be invoked here. Risk data
      // comes from get_entity plus, for the "unusual behavior tied to it"
      // phrasing, the risk score history tool.
      expectedTools: ['security.get_entity', 'security.get_entity_risk_score_history'],
      severity: 'medium',
      tags: ['entity', 'host-profile'],
    },
  },
  {
    id: 'entity-analytics-b',
    category: 'entity-analytics',
    variant: 'B',
    description: 'Top riskiest entities in environment',
    input: {
      question:
        'Which hosts and users in my environment are the riskiest right now? Profile the top one.',
    },
    output: {
      reference:
        'Searches/ranks entities by risk score across the environment, identifies the top-ranked ' +
        'entity, then looks up that entity in detail to produce a profile.',
    },
    metadata: {
      pathContract: 'probe',
      expectedSkill: 'entity-analytics',
      expectedTools: ['security.search_entities', 'security.get_entity'],
      severity: 'medium',
      tags: ['entity', 'risk-ranking'],
    },
  },
  {
    id: 'entity-analytics-c',
    category: 'entity-analytics',
    variant: 'C',
    description: 'Entity history and escalation signal',
    input: {
      question:
        "The SYSTEM user on srv-win-defend-01 keeps coming up. What's this entity's history " +
        'and risk profile — should I be escalating based on the entity itself?',
    },
    output: {
      reference:
        "Looks up the SYSTEM-on-srv-win-defend-01 user entity's risk score and recent history, and " +
        'gives an explicit escalate-or-not recommendation grounded in that risk data rather than a ' +
        'generic answer.',
    },
    metadata: {
      pathContract: 'probe',
      expectedSkill: 'entity-analytics',
      // Same skills-precedence constraint as entity-analytics-a: risk history
      // comes from get_entity_risk_score_history, which stays available under
      // the experimental-features flag that the suite needs for skills.
      expectedTools: ['security.get_entity', 'security.get_entity_risk_score_history'],
      severity: 'medium',
      tags: ['entity', 'history'],
    },
  },
  {
    id: 'multi-step-a',
    category: 'multi-step',
    variant: 'A',
    description: 'Triaged alert → threat-intel grounding → escalation summary',
    input: {
      question:
        'Analyze this alert. If it involves a file hash, look into whether it is a known-bad indicator. ' +
        'Then tell me whether this warrants escalation, and summarize your findings ' +
        '(verdict, IOCs, and recommended next step).',
      attachment:
        'Alert Details:\n' +
        '  Rule: Suspicious BluetoothService Side-Load\n' +
        '  Host: srv-win-defend-01\n' +
        '  User: SYSTEM\n' +
        '  Severity: High (risk: 73)\n' +
        '  File hash (sha256): 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f\n' +
        '  Process: BluetoothService.exe loaded log.dll from C:\\Users\\Public\\\n' +
        '  MITRE: T1574.002 (DLL Side-Loading)\n' +
        '  Timestamp: 2026-07-21T08:00:00Z',
    },
    output: {
      reference:
        'Reads the attached alert, checks the file hash against Security Labs research / entity risk ' +
        'signal for a verdict, and produces a step-by-step summary ending in an explicit escalate-or-not ' +
        'recommendation with the IOCs called out.',
    },
    metadata: {
      pathContract: 'probe',
      expectedSkill: 'alert-analysis',
      expectedTools: [
        'attachments.read',
        'security.security_labs_search',
        // entity_risk_score is unavailable under the skills flag (see
        // alert-analysis-a); the risk signal comes from the get_entity profile.
        'security.get_entity',
      ],
      severity: 'critical',
      tags: ['multi-step', 'orchestration'],
    },
  },
  {
    id: 'multi-step-b',
    category: 'multi-step',
    variant: 'B',
    description: 'Full incident response: case creation with grounded findings',
    input: {
      question:
        "There's a confirmed Chrysalis incident on srv-win-defend-01 — BluetoothService.exe " +
        'is side-loading log.dll (sha256: 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f). ' +
        'Run the full response: ' +
        'ground this in any known research on the technique, open a critical Security case documenting ' +
        'the incident, and report what you did at each step.',
    },
    output: {
      reference:
        'Searches Security Labs for research on the side-loading pattern, then calls the cases-management ' +
        'skill/tool to open a critical-severity case with a summary of the confirmed findings, reporting ' +
        'each step taken.',
    },
    metadata: {
      pathContract: 'probe',
      expectedSkill: 'alert-analysis',
      allowSkills: ['cases-management'],
      expectedTools: ['security.security_labs_search', 'platform.core.cases'],
      severity: 'critical',
      tags: ['multi-step', 'incident-response'],
    },
  },
  {
    id: 'multi-step-c',
    category: 'multi-step',
    variant: 'C',
    description: 'End-to-end triage with conditional escalation',
    input: {
      question:
        'Triage srv-win-defend-01 end-to-end: pull the alerts for that host, hunt for the ' +
        'Chrysalis IOCs (BluetoothService.exe, log.dll, C2 domains) to confirm, and ' +
        "if it's a true positive, tell me who/what to escalate to and summarize the confirmed findings " +
        "and recommended actions. Don't escalate if it's benign.",
    },
    output: {
      reference:
        "Pulls the host's alert queue, hunts for the named IOCs via ES|QL over process/network telemetry " +
        'to confirm or refute the hypothesis, and conditionally produces an escalation summary only if ' +
        'the hunt confirms a true positive — explicitly stating when it does not escalate.',
    },
    metadata: {
      pathContract: 'probe',
      expectedSkill: 'alert-analysis',
      allowSkills: ['threat-hunting'],
      expectedTools: [
        'security.alerts',
        'platform.core.generate_esql',
        'platform.core.execute_esql',
        // entity_risk_score is unavailable under the skills flag (see
        // alert-analysis-a); the risk signal comes from the get_entity profile.
        'security.get_entity',
      ],
      severity: 'critical',
      tags: ['multi-step', 'conditional-escalation'],
    },
  },
  {
    id: 'threat-hunting-a',
    category: 'threat-hunting',
    variant: 'A',
    description: 'Hypothesis-driven DLL side-loading hunt',
    input: {
      question:
        "I have a hypothesis that there's a malicious DLL being side-loaded on our Windows fleet. " +
        'Hunt for evidence of log.dll across process and file telemetry and tell me what you find.',
    },
    output: {
      reference:
        'Generates and runs an ES|QL query against process/file event telemetry filtering for log.dll ' +
        'load events across hosts, then reports which hosts/processes show the pattern (or that none do).',
    },
    metadata: {
      pathContract: 'probe',
      expectedSkill: 'threat-hunting',
      expectedTools: ['platform.core.generate_esql', 'platform.core.execute_esql'],
      severity: 'high',
      tags: ['hunt', 'hypothesis-driven'],
    },
  },
  {
    id: 'threat-hunting-b',
    category: 'threat-hunting',
    variant: 'B',
    description: 'IOA-based Chrysalis hunt on specific host',
    input: {
      question:
        'Hunt for signs of the Chrysalis backdoor on srv-win-defend-01 — look for BluetoothService.exe ' +
        'execution, suspicious DLL loads, and any C2 network or DNS activity. Walk me through what you discover.',
    },
    output: {
      reference:
        'Runs ES|QL queries scoped to srv-win-defend-01 across process-start, file-load, and network/DNS ' +
        'telemetry for the named IOAs, and narrates each query and its result as it builds the picture.',
    },
    metadata: {
      pathContract: 'probe',
      expectedSkill: 'threat-hunting',
      expectedTools: ['platform.core.generate_esql', 'platform.core.execute_esql'],
      severity: 'high',
      tags: ['hunt', 'ioc-driven'],
    },
  },
  {
    id: 'threat-hunting-c',
    category: 'threat-hunting',
    variant: 'C',
    description: 'Baseline-driven anomaly detection',
    input: {
      question:
        "Something feels off on srv-win-defend-01 but I don't have a specific IOC. " +
        'Establish a baseline of normal process activity for that host and surface anything anomalous.',
    },
    output: {
      reference:
        "Queries the host's historical process-execution telemetry via ES|QL to establish a normal-activity " +
        'baseline, then compares recent activity against it and surfaces outliers rather than assuming ' +
        'a specific IOC upfront.',
    },
    metadata: {
      pathContract: 'probe',
      expectedSkill: 'threat-hunting',
      expectedTools: ['platform.core.generate_esql', 'platform.core.execute_esql'],
      severity: 'medium',
      tags: ['hunt', 'baseline'],
    },
  },
  {
    id: 'workflow-authoring-a',
    category: 'workflow-authoring',
    variant: 'A',
    description: 'Slack triage summary workflow (parameterized)',
    input: {
      question:
        'Use the workflow authoring skill to author a runnable Elastic workflow (YAML) that posts ' +
        "a Chrysalis triage summary to Slack. Give it a manual trigger and a 'message' input, " +
        'and use an http step against the existing Slack connector with id d7306385-cbe6-4541-9726-49afdff59ba5.',
    },
    output: {
      reference:
        'Calls the generate-workflow tool with a natural-language description of the manual trigger, ' +
        "'message' input, and http step targeting the given Slack connector ID, then validates and renders " +
        'the resulting workflow attachment — it does not hand-write the YAML directly.',
    },
    metadata: {
      expectedSkill: 'workflow-authoring',
      expectedTools: ['platform.core.generate_workflow', 'platform.workflows.validate_workflow'],
      // Verified deterministically by ConnectorInvoked: calling
      // generate_workflow is not evidence that the authored workflow actually
      // targets Slack. The prompt names this connector id explicitly.
      expectedConnectorId: 'd7306385-cbe6-4541-9726-49afdff59ba5',
      expectedStepType: 'http',
      severity: 'medium',
      tags: ['workflow', 'authoring'],
    },
  },
  {
    id: 'workflow-authoring-b',
    category: 'workflow-authoring',
    variant: 'B',
    description: 'Fixed-message Slack workflow',
    input: {
      question:
        'Author an Elastic workflow in YAML that, on a manual trigger, posts a fixed one-line message ' +
        "'Chrysalis hunt complete — see case for details' to Slack channel #general. " +
        'Use an http step targeting the Slack connector.',
    },
    output: {
      reference:
        'Calls generate-workflow with the fixed message text and target Slack channel described in natural ' +
        'language, and validates the resulting workflow before rendering it inline.',
    },
    metadata: {
      // No expectedSkill: the prompt does not ask for the skill, and
      // `workflow-authoring` documents that it is NOT required for creating or
      // editing a workflow — call `platform.core.generate_workflow` directly.
      expectedTools: ['platform.core.generate_workflow', 'platform.workflows.validate_workflow'],
      // This prompt names no connector id, so only the http step is a fair
      // deterministic assertion. Asserting an id the prompt never gave would
      // false-fail a correct answer.
      expectedStepType: 'http',
      severity: 'low',
      tags: ['workflow', 'authoring-fixed'],
    },
  },
  {
    id: 'workflow-authoring-c',
    category: 'workflow-authoring',
    variant: 'C',
    description: 'Parameterized summary notification workflow',
    input: {
      question:
        'I want to automate Chrysalis incident notifications. Author a workflow (YAML) with a manual trigger ' +
        "that takes a 'summary' string input and posts it to Slack #general via an http step on connector " +
        'd7306385-cbe6-4541-9726-49afdff59ba5.',
    },
    output: {
      reference:
        "Calls generate-workflow with the manual trigger, 'summary' string input, and http step against the " +
        'given connector ID described in natural language, then validates and renders the workflow.',
    },
    metadata: {
      // No expectedSkill: see `workflow-authoring-b` — the prompt does not ask
      // for the skill and generate_workflow is the documented direct path.
      expectedTools: ['platform.core.generate_workflow', 'platform.workflows.validate_workflow'],
      // Prompt names the connector id explicitly, so both are assertable.
      expectedConnectorId: 'd7306385-cbe6-4541-9726-49afdff59ba5',
      expectedStepType: 'http',
      severity: 'medium',
      tags: ['workflow', 'authoring-parameterized'],
    },
  },
  {
    id: 'workflow-execution-a',
    category: 'workflow-execution',
    variant: 'A',
    description: 'VirusTotal hash verification',
    input: {
      question:
        'The Chrysalis loader hash is 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f. ' +
        'Check this hash against VirusTotal and tell me the verdict.',
    },
    output: {
      reference:
        'Calls the virustotal_lookup tool with the given hash and reports the verdict from its response, ' +
        'rather than reasoning about the hash without checking it or fabricating a verdict.',
    },
    metadata: {
      // No expectedSkill: `workflow-authoring` documents that it is NOT required
      // for running workflows — the contract is a direct custom-tool call.
      expectedTools: ['virustotal_lookup'],
      severity: 'high',
      tags: ['workflow', 'vt-check'],
    },
  },
  {
    id: 'workflow-execution-b',
    category: 'workflow-execution',
    variant: 'B',
    description: 'On-call schedule lookup',
    input: {
      question:
        'Who is currently on call to own a Chrysalis incident response? Look up the on-call schedule and ' +
        'tell me the primary responder.',
    },
    output: {
      reference:
        'Calls the on_call_lookup tool and reports the current on-call assignee from its response, rather ' +
        'than guessing or asking the user who is on call.',
    },
    metadata: {
      // No expectedSkill: see `workflow-execution-a` — direct custom-tool call.
      expectedTools: ['on_call_lookup'],
      severity: 'medium',
      tags: ['workflow', 'on-call'],
    },
  },
  {
    id: 'workflow-execution-c',
    category: 'workflow-execution',
    variant: 'C',
    description: 'Security case creation',
    input: {
      question:
        'Open a Security case for the confirmed Chrysalis incident on srv-win-defend-01. ' +
        "Title it 'Chrysalis backdoor — srv-win-defend-01', set severity to critical, " +
        'and put a short summary of the side-loading activity in the description.',
    },
    output: {
      reference:
        'Calls the cases-management manage tool to create a case with the given title, critical severity, ' +
        'and a description summarizing the side-loading activity, and confirms the case was created.',
    },
    metadata: {
      expectedSkill: 'cases-management',
      expectedTools: ['platform.core.cases.manage'],
      severity: 'critical',
      tags: ['workflow', 'case-creation'],
    },
  },
];
