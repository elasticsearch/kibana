/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CASE_SAVED_OBJECT } from '../../../../common/constants';
import { UserActionActions, UserActionTypes } from '../../../../common/types/domain';
import { UserActionBuilder } from '../abstract_builder';
import type { EventDetails, UserActionParameters, UserActionEvent } from '../types';

export class WorkflowUserActionBuilder extends UserActionBuilder {
  build(args: UserActionParameters<'workflow'>): UserActionEvent {
    const { caseId, user, owner, payload } = args;
    const action = UserActionActions.create;

    // buildCommonUserAction only supports a single { [valueKey]: value } payload shape.
    // Compose the protected helpers directly to avoid mutating the returned parameters.
    const parameters = {
      attributes: {
        ...this.getCommonUserActionAttributes({ user, owner }),
        action,
        payload,
        type: UserActionTypes.workflow,
      },
      references: this.createCaseReferences(caseId),
    };

    const getMessage = (id?: string) =>
      `User ran workflow id: ${payload.workflow.id} for case id: ${caseId} - user action id: ${id}`;

    const eventDetails: EventDetails = {
      getMessage,
      action,
      descriptiveAction: 'case_user_action_run_workflow',
      savedObjectId: caseId,
      savedObjectType: CASE_SAVED_OBJECT,
    };

    return { parameters, eventDetails };
  }
}
