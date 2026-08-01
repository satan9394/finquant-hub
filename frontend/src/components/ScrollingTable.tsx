import type { ReactNode } from 'react';

export interface ScrollingTableColumn<Row> {
  key: string;
  title: string;
  render: (row: Row) => ReactNode;
}

export default function ScrollingTable<Row>({ columns, rows, rowKey, emptyText = '暂无实时数据' }: {
  columns: ScrollingTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  emptyText?: string;
}) {
  return (
    <div className="scrolling-table" role="region" aria-label="实时信息流" tabIndex={0}>
      <table>
        <thead><tr>{columns.map((column) => <th key={column.key}>{column.title}</th>)}</tr></thead>
        <tbody>
          {rows.length > 0 ? rows.map((row) => (
            <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}</tr>
          )) : <tr><td className="scrolling-table__empty" colSpan={columns.length}>{emptyText}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
