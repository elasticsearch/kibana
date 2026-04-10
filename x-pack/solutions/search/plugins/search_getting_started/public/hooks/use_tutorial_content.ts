/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { basicsTutorial } from '../components/tutorials/new_tutorial_content/basics_tutorial';
import { semanticTutorial } from '../components/tutorials/new_tutorial_content/semantic_tutorial';
import { esqlTutorial } from '../components/tutorials/new_tutorial_content/esql_tutorial';
import { timeSeriesTutorial } from '../components/tutorials/new_tutorial_content/time_series_tutorial';
import { agentBuilderTutorial } from '../components/tutorials/new_tutorial_content/agent_builder_tutorial';

type StepID = string;
type ResponsePath = string;
export type SnippetVariableKey = string;
type MarkdownSnippet = string;
type ApiSnippet = string;

export type TutorialStepType = 'apiCall' | 'ingestData';

// TODO: an agent can reason about responses and keep track of relevant
//  information for subsequent steps. Consider loading context into agent builder
// and having it generate the next steps and run the snippets (might need to hand off
//  api execution to workflows?)
export interface TutorialStep {
  id: StepID;
  type: TutorialStepType;
  header: MarkdownSnippet;
  description: MarkdownSnippet;
  explanation: MarkdownSnippet;
  apiSnippet: ApiSnippet;
  valuesToInsert: Array<SnippetVariableKey>;
  valuesToSave: Record<SnippetVariableKey, ResponsePath>;
  /** JSON paths into the apiSnippet body to highlight after execution (e.g. ['query.multi_match']) */
  apiSnippetHighlights?: string[];
}

export interface TutorialSummaryLink {
  label: string;
  href: string;
}

export interface CleanupItem {
  /** Display label shown in the cleanup list (e.g. "Index: my_index"). Supports {{variable}} substitution. */
  label: string;
  /** Console-style DELETE snippet (e.g. "DELETE /my_index") */
  apiSnippet: ApiSnippet;
}

export interface TutorialDefinition {
  slug: string;
  title: string;
  description: string;
  globalVariables?: Record<SnippetVariableKey, string>;
  /** NDJSON body for bulk ingest steps; referenced by steps with type `ingestData` */
  sampleData?: string;
  summary: {
    text: string;
    links: TutorialSummaryLink[];
  };
  steps: TutorialStep[];
  /** Optional cleanup items shown as the final step; each item deletes a resource created by the tutorial */
  cleanup?: CleanupItem[];
}

export const BULK_INGEST_SNIPPET_PREFIX = 'POST /{{index_name}}/_bulk';

export type TutorialSlug = (typeof AVAILABLE_TUTORIALS)[number]['slug'];

export const AVAILABLE_TUTORIALS: TutorialDefinition[] = [
  basicsTutorial,
  semanticTutorial,
  esqlTutorial,
  timeSeriesTutorial,
  agentBuilderTutorial,
];

const TUTORIAL_BY_SLUG = new Map(AVAILABLE_TUTORIALS.map((t) => [t.slug, t]));

export const useTutorialContent = (slug: TutorialSlug): TutorialDefinition => {
  const tutorial = TUTORIAL_BY_SLUG.get(slug);
  if (!tutorial) {
    throw new Error(`Unknown tutorial slug: ${slug}`);
  }
  return tutorial;
};
