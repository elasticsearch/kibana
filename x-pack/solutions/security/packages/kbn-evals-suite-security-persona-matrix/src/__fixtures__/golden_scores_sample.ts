/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Real golden score documents captured 2026-09-06 from the persona-matrix
 * re-judge waves (executions sweep-1788685888-rj3 and siblings), trimmed to the
 * fields a replay reads. Used to pin the replay planner against the schema the
 * sweep actually writes -- synthetic fixtures cannot catch that drift.
 */
import type { EvaluationScoreDocument } from '@kbn/evals-common/impl/schemas/common_attributes.gen';

export const GOLDEN_SCORES_SAMPLE = [
  {
    '@timestamp': '2026-09-06T10:05:46.442Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-authoring-a',
      input: {
        question:
          "Use the workflow authoring skill to author a runnable Elastic workflow (YAML) that posts a Chrysalis triage summary to Slack. Give it a manual trigger and a 'me",
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-2.5-pro',
      },
      output: {
        messages: [
          {
            message:
              "I've created a workflow that will post a triage summary to Slack. When you run it, you'll be prompted to provide the summary message.\n<render_attachment id=\"099",
          },
        ],
      },
    },
    evaluator: {
      name: 'Latency',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s1of3::security-persona-matrix::google-gemini-2.5-pro',
    },
  },
  {
    '@timestamp': '2026-09-06T10:05:41.436Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-authoring-a',
      input: {
        question:
          "Use the workflow authoring skill to author a runnable Elastic workflow (YAML) that posts a Chrysalis triage summary to Slack. Give it a manual trigger and a 'me",
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-2.5-pro',
      },
      output: {
        messages: [
          {
            message:
              "I've created a workflow that will post a triage summary to Slack. When you run it, you'll be prompted to provide the summary message.\n<render_attachment id=\"099",
          },
        ],
      },
    },
    evaluator: {
      name: 'Tool Calls',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s1of3::security-persona-matrix::google-gemini-2.5-pro',
    },
  },
  {
    '@timestamp': '2026-09-06T10:05:36.432Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-authoring-a',
      input: {
        question:
          "Use the workflow authoring skill to author a runnable Elastic workflow (YAML) that posts a Chrysalis triage summary to Slack. Give it a manual trigger and a 'me",
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-2.5-pro',
      },
      output: {
        messages: [
          {
            message:
              "I've created a workflow that will post a triage summary to Slack. When you run it, you'll be prompted to provide the summary message.\n<render_attachment id=\"099",
          },
        ],
      },
    },
    evaluator: {
      name: 'Output Tokens',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s1of3::security-persona-matrix::google-gemini-2.5-pro',
    },
  },
  {
    '@timestamp': '2026-09-06T10:05:31.432Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-a',
      input: {
        question:
          'The Chrysalis loader hash is 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f. Check this hash against VirusTotal and tell me the verdict.',
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-2.5-pro',
      },
      output: {
        messages: [
          {
            message:
              'The VirusTotal verdict for the hash `275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f` is **malicious**.\n\nHere are the details:\n*   **Detection ',
          },
        ],
      },
    },
    evaluator: {
      name: 'Latency',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s1of3::security-persona-matrix::google-gemini-2.5-pro',
    },
  },
  {
    '@timestamp': '2026-09-06T10:05:26.426Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-a',
      input: {
        question:
          'The Chrysalis loader hash is 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f. Check this hash against VirusTotal and tell me the verdict.',
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-2.5-pro',
      },
      output: {
        messages: [
          {
            message:
              'The VirusTotal verdict for the hash `275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f` is **malicious**.\n\nHere are the details:\n*   **Detection ',
          },
        ],
      },
    },
    evaluator: {
      name: 'Tool Calls',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s1of3::security-persona-matrix::google-gemini-2.5-pro',
    },
  },
  {
    '@timestamp': '2026-09-06T10:05:21.421Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-a',
      input: {
        question:
          'The Chrysalis loader hash is 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f. Check this hash against VirusTotal and tell me the verdict.',
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-2.5-pro',
      },
      output: {
        messages: [
          {
            message:
              'The VirusTotal verdict for the hash `275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f` is **malicious**.\n\nHere are the details:\n*   **Detection ',
          },
        ],
      },
    },
    evaluator: {
      name: 'Output Tokens',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s1of3::security-persona-matrix::google-gemini-2.5-pro',
    },
  },
  {
    '@timestamp': '2026-09-06T10:05:25.910Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-authoring-a',
      input: {
        question:
          "Use the workflow authoring skill to author a runnable Elastic workflow (YAML) that posts a Chrysalis triage summary to Slack. Give it a manual trigger and a 'me",
      },
      output: {},
    },
    task: {
      model: {
        id: 'openai-gpt-5.5',
      },
      output: {
        messages: [
          {
            message:
              'Created and validated the runnable Elastic workflow YAML.\n\n<render_attachment id="dc234b2f-21b4-4cd9-92e9-4aaf041626c3" version="1"/>\n\nKey details:\n- Manual tri',
          },
        ],
      },
    },
    evaluator: {
      name: 'Latency',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s1of3::security-persona-matrix::openai-gpt-5.5',
    },
  },
  {
    '@timestamp': '2026-09-06T10:05:20.908Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-authoring-a',
      input: {
        question:
          "Use the workflow authoring skill to author a runnable Elastic workflow (YAML) that posts a Chrysalis triage summary to Slack. Give it a manual trigger and a 'me",
      },
      output: {},
    },
    task: {
      model: {
        id: 'openai-gpt-5.5',
      },
      output: {
        messages: [
          {
            message:
              'Created and validated the runnable Elastic workflow YAML.\n\n<render_attachment id="dc234b2f-21b4-4cd9-92e9-4aaf041626c3" version="1"/>\n\nKey details:\n- Manual tri',
          },
        ],
      },
    },
    evaluator: {
      name: 'Tool Calls',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s1of3::security-persona-matrix::openai-gpt-5.5',
    },
  },
  {
    '@timestamp': '2026-09-06T10:05:15.906Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-authoring-a',
      input: {
        question:
          "Use the workflow authoring skill to author a runnable Elastic workflow (YAML) that posts a Chrysalis triage summary to Slack. Give it a manual trigger and a 'me",
      },
      output: {},
    },
    task: {
      model: {
        id: 'openai-gpt-5.5',
      },
      output: {
        messages: [
          {
            message:
              'Created and validated the runnable Elastic workflow YAML.\n\n<render_attachment id="dc234b2f-21b4-4cd9-92e9-4aaf041626c3" version="1"/>\n\nKey details:\n- Manual tri',
          },
        ],
      },
    },
    evaluator: {
      name: 'Output Tokens',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s1of3::security-persona-matrix::openai-gpt-5.5',
    },
  },
  {
    '@timestamp': '2026-09-06T10:05:15.904Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-a',
      input: {
        question:
          'The Chrysalis loader hash is 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f. Check this hash against VirusTotal and tell me the verdict.',
      },
      output: {},
    },
    task: {
      model: {
        id: 'openai-gpt-5.5',
      },
      output: {
        messages: [
          {
            message:
              'VirusTotal returned **no matching verdict** for the hash:\n\n`275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f`\n\nSo I don\u2019t have a malicious/benig',
          },
        ],
      },
    },
    evaluator: {
      name: 'Latency',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s1of3::security-persona-matrix::openai-gpt-5.5',
    },
  },
  {
    '@timestamp': '2026-09-06T10:05:10.905Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-a',
      input: {
        question:
          'The Chrysalis loader hash is 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f. Check this hash against VirusTotal and tell me the verdict.',
      },
      output: {},
    },
    task: {
      model: {
        id: 'openai-gpt-5.5',
      },
      output: {
        messages: [
          {
            message:
              'VirusTotal returned **no matching verdict** for the hash:\n\n`275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f`\n\nSo I don\u2019t have a malicious/benig',
          },
        ],
      },
    },
    evaluator: {
      name: 'Tool Calls',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s1of3::security-persona-matrix::openai-gpt-5.5',
    },
  },
  {
    '@timestamp': '2026-09-06T10:05:05.897Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-a',
      input: {
        question:
          'The Chrysalis loader hash is 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f. Check this hash against VirusTotal and tell me the verdict.',
      },
      output: {},
    },
    task: {
      model: {
        id: 'openai-gpt-5.5',
      },
      output: {
        messages: [
          {
            message:
              'VirusTotal returned **no matching verdict** for the hash:\n\n`275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f`\n\nSo I don\u2019t have a malicious/benig',
          },
        ],
      },
    },
    evaluator: {
      name: 'Output Tokens',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s1of3::security-persona-matrix::openai-gpt-5.5',
    },
  },
  {
    '@timestamp': '2026-09-06T10:03:29.487Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-authoring-b',
      input: {
        question:
          "Author an Elastic workflow in YAML that, on a manual trigger, posts a fixed one-line message 'Chrysalis hunt complete \u2014 see case for details' to Slack channel #",
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.1-flash-lite',
      },
      output: {
        messages: [
          {
            message:
              'I have authored the requested workflow for you. \n\nIt uses a manual trigger and the `slack2.sendMessage` step to post "Chrysalis hunt complete \u2014 see case for det',
          },
        ],
      },
    },
    evaluator: {
      name: 'Latency',
    },
    metadata: {
      execution_id:
        'sweep-1788685888-rj3-s2of3::security-persona-matrix::google-gemini-3.1-flash-lite',
    },
  },
  {
    '@timestamp': '2026-09-06T10:03:24.482Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-authoring-b',
      input: {
        question:
          "Author an Elastic workflow in YAML that, on a manual trigger, posts a fixed one-line message 'Chrysalis hunt complete \u2014 see case for details' to Slack channel #",
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.1-flash-lite',
      },
      output: {
        messages: [
          {
            message:
              'I have authored the requested workflow for you. \n\nIt uses a manual trigger and the `slack2.sendMessage` step to post "Chrysalis hunt complete \u2014 see case for det',
          },
        ],
      },
    },
    evaluator: {
      name: 'Tool Calls',
    },
    metadata: {
      execution_id:
        'sweep-1788685888-rj3-s2of3::security-persona-matrix::google-gemini-3.1-flash-lite',
    },
  },
  {
    '@timestamp': '2026-09-06T10:03:19.475Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-authoring-b',
      input: {
        question:
          "Author an Elastic workflow in YAML that, on a manual trigger, posts a fixed one-line message 'Chrysalis hunt complete \u2014 see case for details' to Slack channel #",
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.1-flash-lite',
      },
      output: {
        messages: [
          {
            message:
              'I have authored the requested workflow for you. \n\nIt uses a manual trigger and the `slack2.sendMessage` step to post "Chrysalis hunt complete \u2014 see case for det',
          },
        ],
      },
    },
    evaluator: {
      name: 'Output Tokens',
    },
    metadata: {
      execution_id:
        'sweep-1788685888-rj3-s2of3::security-persona-matrix::google-gemini-3.1-flash-lite',
    },
  },
  {
    '@timestamp': '2026-09-06T10:03:29.485Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-b',
      input: {
        question:
          'Who is currently on call to own a Chrysalis incident response? Look up the on-call schedule and tell me the primary responder.',
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.1-flash-lite',
      },
      output: {
        messages: [
          {
            message:
              'The on-call schedule appears to be outdated, as the most recent entry for the primary responder, Dana Whitfield, ended on July 27, 2026.\n\nI am unable to identif',
          },
        ],
      },
    },
    evaluator: {
      name: 'Latency',
    },
    metadata: {
      execution_id:
        'sweep-1788685888-rj3-s2of3::security-persona-matrix::google-gemini-3.1-flash-lite',
    },
  },
  {
    '@timestamp': '2026-09-06T10:03:24.480Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-b',
      input: {
        question:
          'Who is currently on call to own a Chrysalis incident response? Look up the on-call schedule and tell me the primary responder.',
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.1-flash-lite',
      },
      output: {
        messages: [
          {
            message:
              'The on-call schedule appears to be outdated, as the most recent entry for the primary responder, Dana Whitfield, ended on July 27, 2026.\n\nI am unable to identif',
          },
        ],
      },
    },
    evaluator: {
      name: 'Tool Calls',
    },
    metadata: {
      execution_id:
        'sweep-1788685888-rj3-s2of3::security-persona-matrix::google-gemini-3.1-flash-lite',
    },
  },
  {
    '@timestamp': '2026-09-06T10:03:19.474Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-b',
      input: {
        question:
          'Who is currently on call to own a Chrysalis incident response? Look up the on-call schedule and tell me the primary responder.',
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.1-flash-lite',
      },
      output: {
        messages: [
          {
            message:
              'The on-call schedule appears to be outdated, as the most recent entry for the primary responder, Dana Whitfield, ended on July 27, 2026.\n\nI am unable to identif',
          },
        ],
      },
    },
    evaluator: {
      name: 'Output Tokens',
    },
    metadata: {
      execution_id:
        'sweep-1788685888-rj3-s2of3::security-persona-matrix::google-gemini-3.1-flash-lite',
    },
  },
  {
    '@timestamp': '2026-09-06T09:58:34.991Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-c',
      input: {
        question:
          "Open a Security case for the confirmed Chrysalis incident on srv-win-defend-01. Title it 'Chrysalis backdoor \u2014 srv-win-defend-01', set severity to critical, and",
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.5-flash',
      },
      output: {
        messages: [
          {
            message:
              'I have opened a critical Security case for the confirmed Chrysalis backdoor incident on `srv-win-defend-01`.\n\n### Summary of Side-Loading Activity\n- **Malware f',
          },
        ],
      },
    },
    evaluator: {
      name: 'Latency',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s3of3::security-persona-matrix::google-gemini-3.5-flash',
    },
  },
  {
    '@timestamp': '2026-09-06T09:58:29.986Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-c',
      input: {
        question:
          "Open a Security case for the confirmed Chrysalis incident on srv-win-defend-01. Title it 'Chrysalis backdoor \u2014 srv-win-defend-01', set severity to critical, and",
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.5-flash',
      },
      output: {
        messages: [
          {
            message:
              'I have opened a critical Security case for the confirmed Chrysalis backdoor incident on `srv-win-defend-01`.\n\n### Summary of Side-Loading Activity\n- **Malware f',
          },
        ],
      },
    },
    evaluator: {
      name: 'Tool Calls',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s3of3::security-persona-matrix::google-gemini-3.5-flash',
    },
  },
  {
    '@timestamp': '2026-09-06T09:58:24.982Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-c',
      input: {
        question:
          "Open a Security case for the confirmed Chrysalis incident on srv-win-defend-01. Title it 'Chrysalis backdoor \u2014 srv-win-defend-01', set severity to critical, and",
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.5-flash',
      },
      output: {
        messages: [
          {
            message:
              'I have opened a critical Security case for the confirmed Chrysalis backdoor incident on `srv-win-defend-01`.\n\n### Summary of Side-Loading Activity\n- **Malware f',
          },
        ],
      },
    },
    evaluator: {
      name: 'Output Tokens',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s3of3::security-persona-matrix::google-gemini-3.5-flash',
    },
  },
  {
    '@timestamp': '2026-09-06T09:58:21.724Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-b',
      input: {
        question:
          'Who is currently on call to own a Chrysalis incident response? Look up the on-call schedule and tell me the primary responder.',
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.5-flash',
      },
      output: {
        messages: [
          {
            message:
              "Let's look at the fields we have in the `on-call-schedule` index:\nWe have:\n- Dana Whitfield (Primary) - Shift: 2026-07-20 to 2026-07-27.\n- Ravi Osei (Secondary)",
          },
        ],
      },
    },
    evaluator: {
      name: 'Latency',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s2of3::security-persona-matrix::google-gemini-3.5-flash',
    },
  },
  {
    '@timestamp': '2026-09-06T09:58:16.722Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-b',
      input: {
        question:
          'Who is currently on call to own a Chrysalis incident response? Look up the on-call schedule and tell me the primary responder.',
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.5-flash',
      },
      output: {
        messages: [
          {
            message:
              "Let's look at the fields we have in the `on-call-schedule` index:\nWe have:\n- Dana Whitfield (Primary) - Shift: 2026-07-20 to 2026-07-27.\n- Ravi Osei (Secondary)",
          },
        ],
      },
    },
    evaluator: {
      name: 'Tool Calls',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s2of3::security-persona-matrix::google-gemini-3.5-flash',
    },
  },
  {
    '@timestamp': '2026-09-06T09:58:11.718Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-b',
      input: {
        question:
          'Who is currently on call to own a Chrysalis incident response? Look up the on-call schedule and tell me the primary responder.',
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.5-flash',
      },
      output: {
        messages: [
          {
            message:
              "Let's look at the fields we have in the `on-call-schedule` index:\nWe have:\n- Dana Whitfield (Primary) - Shift: 2026-07-20 to 2026-07-27.\n- Ravi Osei (Secondary)",
          },
        ],
      },
    },
    evaluator: {
      name: 'Output Tokens',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s2of3::security-persona-matrix::google-gemini-3.5-flash',
    },
  },
  {
    '@timestamp': '2026-09-06T09:58:25.372Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-c',
      input: {
        question:
          "Open a Security case for the confirmed Chrysalis incident on srv-win-defend-01. Title it 'Chrysalis backdoor \u2014 srv-win-defend-01', set severity to critical, and",
      },
      output: {},
    },
    task: {
      model: {
        id: 'openai-gpt-5.4-mini',
      },
      output: {
        messages: [
          {
            message:
              'Created the Security case and set it to critical.\n\n<render_attachment id="bf3cb959-219f-49dc-b6ab-d0b1426d6315" />',
          },
        ],
      },
    },
    evaluator: {
      name: 'Latency',
    },
    metadata: {
      execution_id: 'sweep-1788685878-rjc-s3of3::security-persona-matrix::openai-gpt-5.4-mini',
    },
  },
  {
    '@timestamp': '2026-09-06T09:58:20.370Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-c',
      input: {
        question:
          "Open a Security case for the confirmed Chrysalis incident on srv-win-defend-01. Title it 'Chrysalis backdoor \u2014 srv-win-defend-01', set severity to critical, and",
      },
      output: {},
    },
    task: {
      model: {
        id: 'openai-gpt-5.4-mini',
      },
      output: {
        messages: [
          {
            message:
              'Created the Security case and set it to critical.\n\n<render_attachment id="bf3cb959-219f-49dc-b6ab-d0b1426d6315" />',
          },
        ],
      },
    },
    evaluator: {
      name: 'Tool Calls',
    },
    metadata: {
      execution_id: 'sweep-1788685878-rjc-s3of3::security-persona-matrix::openai-gpt-5.4-mini',
    },
  },
  {
    '@timestamp': '2026-09-06T09:58:15.368Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-c',
      input: {
        question:
          "Open a Security case for the confirmed Chrysalis incident on srv-win-defend-01. Title it 'Chrysalis backdoor \u2014 srv-win-defend-01', set severity to critical, and",
      },
      output: {},
    },
    task: {
      model: {
        id: 'openai-gpt-5.4-mini',
      },
      output: {
        messages: [
          {
            message:
              'Created the Security case and set it to critical.\n\n<render_attachment id="bf3cb959-219f-49dc-b6ab-d0b1426d6315" />',
          },
        ],
      },
    },
    evaluator: {
      name: 'Output Tokens',
    },
    metadata: {
      execution_id: 'sweep-1788685878-rjc-s3of3::security-persona-matrix::openai-gpt-5.4-mini',
    },
  },
  {
    '@timestamp': '2026-09-06T09:58:15.367Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-authoring-c',
      input: {
        question:
          "I want to automate Chrysalis incident notifications. Author a workflow (YAML) with a manual trigger that takes a 'summary' string input and posts it to Slack #g",
      },
      output: {},
    },
    task: {
      model: {
        id: 'openai-gpt-5.4-mini',
      },
      output: {
        messages: [
          {
            message:
              'Done \u2014 I created the workflow draft.\n\nIf you want, I can also:\n- render the YAML diff/workflow attachment here, or\n- validate the workflow before you save/use i',
          },
        ],
      },
    },
    evaluator: {
      name: 'Latency',
    },
    metadata: {
      execution_id: 'sweep-1788685878-rjc-s3of3::security-persona-matrix::openai-gpt-5.4-mini',
    },
  },
  {
    '@timestamp': '2026-09-06T09:58:10.362Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-authoring-c',
      input: {
        question:
          "I want to automate Chrysalis incident notifications. Author a workflow (YAML) with a manual trigger that takes a 'summary' string input and posts it to Slack #g",
      },
      output: {},
    },
    task: {
      model: {
        id: 'openai-gpt-5.4-mini',
      },
      output: {
        messages: [
          {
            message:
              'Done \u2014 I created the workflow draft.\n\nIf you want, I can also:\n- render the YAML diff/workflow attachment here, or\n- validate the workflow before you save/use i',
          },
        ],
      },
    },
    evaluator: {
      name: 'Tool Calls',
    },
    metadata: {
      execution_id: 'sweep-1788685878-rjc-s3of3::security-persona-matrix::openai-gpt-5.4-mini',
    },
  },
  {
    '@timestamp': '2026-09-06T09:58:05.359Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-authoring-c',
      input: {
        question:
          "I want to automate Chrysalis incident notifications. Author a workflow (YAML) with a manual trigger that takes a 'summary' string input and posts it to Slack #g",
      },
      output: {},
    },
    task: {
      model: {
        id: 'openai-gpt-5.4-mini',
      },
      output: {
        messages: [
          {
            message:
              'Done \u2014 I created the workflow draft.\n\nIf you want, I can also:\n- render the YAML diff/workflow attachment here, or\n- validate the workflow before you save/use i',
          },
        ],
      },
    },
    evaluator: {
      name: 'Output Tokens',
    },
    metadata: {
      execution_id: 'sweep-1788685878-rjc-s3of3::security-persona-matrix::openai-gpt-5.4-mini',
    },
  },
  {
    '@timestamp': '2026-09-06T09:58:16.899Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-b',
      input: {
        question:
          'Who is currently on call to own a Chrysalis incident response? Look up the on-call schedule and tell me the primary responder.',
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.1-pro',
      },
      output: {
        messages: [
          {
            message:
              "I checked the on-call schedule, but there doesn't seem to be an active shift logged for the current date (September 6, 2026). The most recent primary on-call re",
          },
        ],
      },
    },
    evaluator: {
      name: 'Latency',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s2of3::security-persona-matrix::google-gemini-3.1-pro',
    },
  },
  {
    '@timestamp': '2026-09-06T09:58:11.898Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-b',
      input: {
        question:
          'Who is currently on call to own a Chrysalis incident response? Look up the on-call schedule and tell me the primary responder.',
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.1-pro',
      },
      output: {
        messages: [
          {
            message:
              "I checked the on-call schedule, but there doesn't seem to be an active shift logged for the current date (September 6, 2026). The most recent primary on-call re",
          },
        ],
      },
    },
    evaluator: {
      name: 'Tool Calls',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s2of3::security-persona-matrix::google-gemini-3.1-pro',
    },
  },
  {
    '@timestamp': '2026-09-06T09:58:06.891Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-b',
      input: {
        question:
          'Who is currently on call to own a Chrysalis incident response? Look up the on-call schedule and tell me the primary responder.',
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.1-pro',
      },
      output: {
        messages: [
          {
            message:
              "I checked the on-call schedule, but there doesn't seem to be an active shift logged for the current date (September 6, 2026). The most recent primary on-call re",
          },
        ],
      },
    },
    evaluator: {
      name: 'Output Tokens',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s2of3::security-persona-matrix::google-gemini-3.1-pro',
    },
  },
  {
    '@timestamp': '2026-09-06T09:58:01.889Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-authoring-b',
      input: {
        question:
          "Author an Elastic workflow in YAML that, on a manual trigger, posts a fixed one-line message 'Chrysalis hunt complete \u2014 see case for details' to Slack channel #",
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.1-pro',
      },
      output: {
        messages: [
          {
            message:
              'I have created the requested workflow. It uses a manual trigger and an HTTP step configured to use a Slack connector to post your message to `#general`. \n\nHere ',
          },
        ],
      },
    },
    evaluator: {
      name: 'Latency',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s2of3::security-persona-matrix::google-gemini-3.1-pro',
    },
  },
  {
    '@timestamp': '2026-09-06T09:57:56.885Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-authoring-b',
      input: {
        question:
          "Author an Elastic workflow in YAML that, on a manual trigger, posts a fixed one-line message 'Chrysalis hunt complete \u2014 see case for details' to Slack channel #",
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.1-pro',
      },
      output: {
        messages: [
          {
            message:
              'I have created the requested workflow. It uses a manual trigger and an HTTP step configured to use a Slack connector to post your message to `#general`. \n\nHere ',
          },
        ],
      },
    },
    evaluator: {
      name: 'Tool Calls',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s2of3::security-persona-matrix::google-gemini-3.1-pro',
    },
  },
  {
    '@timestamp': '2026-09-06T09:57:51.881Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-authoring-b',
      input: {
        question:
          "Author an Elastic workflow in YAML that, on a manual trigger, posts a fixed one-line message 'Chrysalis hunt complete \u2014 see case for details' to Slack channel #",
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.1-pro',
      },
      output: {
        messages: [
          {
            message:
              'I have created the requested workflow. It uses a manual trigger and an HTTP step configured to use a Slack connector to post your message to `#general`. \n\nHere ',
          },
        ],
      },
    },
    evaluator: {
      name: 'Output Tokens',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s2of3::security-persona-matrix::google-gemini-3.1-pro',
    },
  },
  {
    '@timestamp': '2026-09-06T09:56:08.937Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-a',
      input: {
        question:
          'The Chrysalis loader hash is 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f. Check this hash against VirusTotal and tell me the verdict.',
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.0-flash',
      },
      output: {
        messages: [
          {
            message:
              'The VirusTotal verdict for the Chrysalis loader hash (`275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f`) is **malicious**.\n\n**Details:**\n*   **',
          },
        ],
      },
    },
    evaluator: {
      name: 'Latency',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s1of3::security-persona-matrix::google-gemini-3.0-flash',
    },
  },
  {
    '@timestamp': '2026-09-06T09:56:03.933Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-a',
      input: {
        question:
          'The Chrysalis loader hash is 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f. Check this hash against VirusTotal and tell me the verdict.',
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.0-flash',
      },
      output: {
        messages: [
          {
            message:
              'The VirusTotal verdict for the Chrysalis loader hash (`275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f`) is **malicious**.\n\n**Details:**\n*   **',
          },
        ],
      },
    },
    evaluator: {
      name: 'Tool Calls',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s1of3::security-persona-matrix::google-gemini-3.0-flash',
    },
  },
  {
    '@timestamp': '2026-09-06T09:55:58.929Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-a',
      input: {
        question:
          'The Chrysalis loader hash is 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f. Check this hash against VirusTotal and tell me the verdict.',
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.0-flash',
      },
      output: {
        messages: [
          {
            message:
              'The VirusTotal verdict for the Chrysalis loader hash (`275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f`) is **malicious**.\n\n**Details:**\n*   **',
          },
        ],
      },
    },
    evaluator: {
      name: 'Output Tokens',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s1of3::security-persona-matrix::google-gemini-3.0-flash',
    },
  },
  {
    '@timestamp': '2026-09-06T09:56:02.371Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-c',
      input: {
        question:
          "Open a Security case for the confirmed Chrysalis incident on srv-win-defend-01. Title it 'Chrysalis backdoor \u2014 srv-win-defend-01', set severity to critical, and",
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.0-flash',
      },
      output: {
        messages: [
          {
            message:
              'I\'ve opened a new critical Security case to track the Chrysalis incident on **srv-win-defend-01**.\n\n<render_attachment id="fb18b1de-6326-4b2a-9c72-d06d6e77f2f1"',
          },
        ],
      },
    },
    evaluator: {
      name: 'Latency',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s3of3::security-persona-matrix::google-gemini-3.0-flash',
    },
  },
  {
    '@timestamp': '2026-09-06T09:55:57.367Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-c',
      input: {
        question:
          "Open a Security case for the confirmed Chrysalis incident on srv-win-defend-01. Title it 'Chrysalis backdoor \u2014 srv-win-defend-01', set severity to critical, and",
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.0-flash',
      },
      output: {
        messages: [
          {
            message:
              'I\'ve opened a new critical Security case to track the Chrysalis incident on **srv-win-defend-01**.\n\n<render_attachment id="fb18b1de-6326-4b2a-9c72-d06d6e77f2f1"',
          },
        ],
      },
    },
    evaluator: {
      name: 'Tool Calls',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s3of3::security-persona-matrix::google-gemini-3.0-flash',
    },
  },
  {
    '@timestamp': '2026-09-06T09:55:52.363Z',
    experiment_id: 'fixture',
    example: {
      id: 'workflow-execution-c',
      input: {
        question:
          "Open a Security case for the confirmed Chrysalis incident on srv-win-defend-01. Title it 'Chrysalis backdoor \u2014 srv-win-defend-01', set severity to critical, and",
      },
      output: {},
    },
    task: {
      model: {
        id: 'google-gemini-3.0-flash',
      },
      output: {
        messages: [
          {
            message:
              'I\'ve opened a new critical Security case to track the Chrysalis incident on **srv-win-defend-01**.\n\n<render_attachment id="fb18b1de-6326-4b2a-9c72-d06d6e77f2f1"',
          },
        ],
      },
    },
    evaluator: {
      name: 'Output Tokens',
    },
    metadata: {
      execution_id: 'sweep-1788685888-rj3-s3of3::security-persona-matrix::google-gemini-3.0-flash',
    },
  },
] as unknown as EvaluationScoreDocument[];
