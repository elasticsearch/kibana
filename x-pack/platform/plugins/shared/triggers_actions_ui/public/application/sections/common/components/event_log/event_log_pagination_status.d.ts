import React from 'react';
import type { Pagination } from '@elastic/eui';
export type EventLogPaginationStatusProps = Required<Pick<Pagination, 'pageIndex' | 'pageSize' | 'totalItemCount'>>;
export declare const EventLogPaginationStatus: (props: EventLogPaginationStatusProps) => React.JSX.Element;
