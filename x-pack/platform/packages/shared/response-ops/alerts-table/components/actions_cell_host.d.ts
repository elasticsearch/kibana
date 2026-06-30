import type { SetRequired } from 'type-fest';
import type { ComponentProps } from 'react';
import React from 'react';
import type { AdditionalContext, AlertsTableProps } from '../types';
/**
 * Entry point for rendering actions cells (in control columns)
 */
export declare const ActionsCellHost: <AC extends AdditionalContext>(props: SetRequired<ComponentProps<NonNullable<AlertsTableProps<AC>["renderActionsCell"]>>, "renderActionsCell">) => React.JSX.Element | null;
