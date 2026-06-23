/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { blue } from 'chalk';
import { HORIZONTAL_LINE } from '../../common/constants';
import { RunServiceStatus } from './components/run_service_status_formatter';
import { ColumnLayoutFormatter } from '../../common/screen/column_layout_formatter';
import { TOOL_TITLE } from '../constants';
import type { EmulatorRunContext } from '../services/emulator_run_context';
import type { DataFormatter } from '../../common/screen';
import { ChoiceMenuFormatter, ScreenBaseClass } from '../../common/screen';

export class ActionResponderScreen extends ScreenBaseClass {
  constructor(private readonly emulatorContext: EmulatorRunContext) {
    super();
  }

  protected header() {
    return super.header(TOOL_TITLE, 'Actions Responder');
  }

  protected body(): string | DataFormatter {
    const isServiceRunning = this.emulatorContext.getActionResponderService().isRunning;
    const actionsAndStatus = new ColumnLayoutFormatter([
      new ChoiceMenuFormatter([isServiceRunning ? 'Stop Service' : 'Start Service']),
      `Status:                ${new RunServiceStatus(isServiceRunning).output}`,
    ]);

    return `Service checks for new Endpoint Actions and automatically responds to them.
  The following tokens can be used in the Action request 'comment' to drive
  the type of response that is sent:
  Token                         Description
  ---------------------------   ------------------------------------
  RESPOND.STATE=SUCCESS         Respond with success
  RESPOND.STATE=FAILURE         Respond with failure
  RESPOND.STATE=PENDING         Leave response action pending (don't complete it)
  RESPOND.FLEET.STATE=SUCCESS   Respond to Fleet Action with success
  RESPOND.FLEET.STATE=FAILURE   Respond to Fleet Action with failure

  Action specific:
  In addition, the following can also be used when 'RESPOND.STATE' is 'SUCCESS'

  Token                         Description
  ---------------------------   ------------------------------------
  EXECUTE:SUCCESS               Successful execute response output
  EXECUTE:FAILURE               Failure execute output


${blue(HORIZONTAL_LINE.substring(0, HORIZONTAL_LINE.length - 2))}
  ${actionsAndStatus.output}`;
  }

  protected onEnterChoice(choice: string) {
    const choiceValue = choice.trim().toUpperCase();

    switch (choiceValue) {
      case 'Q':
        this.hide();
        return;

      case '1':
        {
          const actionsResponderService = this.emulatorContext.getActionResponderService();
          const isRunning = actionsResponderService.isRunning;
          if (isRunning) {
            actionsResponderService.stop();
          } else {
            actionsResponderService.start();
          }
        }
        this.reRender();
        return;
    }

    this.throwUnknownChoiceError(choice);
  }
}
