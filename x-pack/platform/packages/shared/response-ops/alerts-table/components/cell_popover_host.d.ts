import type { EuiDataGridCellPopoverElementProps } from '@elastic/eui/src/components/datagrid/data_grid_types';
import React from 'react';
/**
 * Entry point for rendering cell popovers
 *
 * Wraps the provided `CellPopover` with an `ErrorBoundary` to catch any errors
 */
export declare const CellPopoverHost: (props: EuiDataGridCellPopoverElementProps) => React.JSX.Element;
