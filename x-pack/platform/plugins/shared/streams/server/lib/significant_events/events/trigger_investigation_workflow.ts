/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import { STREAMS_INVESTIGATION_WORKFLOW_ID } from '@kbn/workflows/managed';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { SignificantEvent } from '@kbn/significant-events-schema';

/**
 * Runs the managed investigation workflow for the given significant event in the
 * caller's current space. Returns the execution id when started, or undefined when
 * workflows are unavailable or the managed workflow has not been installed yet.
 */
export const triggerInvestigationWorkflow = async ({
  workflowsManagement,
  spaces,
  request,
  logger,
  event,
}: {
  workflowsManagement?: WorkflowsServerPluginSetup;
  spaces?: SpacesPluginStart;
  request: KibanaRequest;
  logger: Logger;
  event: SignificantEvent;
}): Promise<string | undefined> => {
  if (!workflowsManagement) {
    logger.debug('Workflows management not available, skipping investigation trigger');
    return undefined;
  }

  const spaceId = spaces?.spacesService.getSpaceId(request) ?? DEFAULT_SPACE_ID;
  const workflow = await workflowsManagement.management.getWorkflow(
    STREAMS_INVESTIGATION_WORKFLOW_ID,
    spaceId
  );

  if (!workflow || !workflow.definition) {
    logger.warn(
      `Managed workflow "${STREAMS_INVESTIGATION_WORKFLOW_ID}" not found, skipping investigation trigger`
    );
    return undefined;
  }

  const {
    title,
    summary,
    root_cause,
    stream_names,
    event_id,
    discovery_slug,
    status,
    criticality,
    confidence,
    recommendations,
  } = event;

  const inputs = {
    message: `${title}\n\n${summary}\n\nProbable cause: ${root_cause}`,
    stream_names: stream_names ?? [],
    concurrency_key: discovery_slug,
    context: {
      source: 'significant_event',
      event_id,
      discovery_slug,
      status,
      criticality,
      confidence,
      root_cause,
      recommendations,
    },
  };

  const executionId = await workflowsManagement.management.runWorkflow(
    { ...workflow, definition: workflow.definition },
    spaceId,
    inputs,
    request,
    'sigevents-investigation-ui'
  );

  logger.info(
    `Triggered investigation workflow for event "${event_id}", executionId=${executionId}`
  );
  return executionId;
};
