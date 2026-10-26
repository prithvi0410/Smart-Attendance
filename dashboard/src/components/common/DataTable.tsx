import React from 'react';
import { cn } from '../../utils/cn';

export interface Column<T> {
  header: string;
  accessor?: keyof T;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  className?: string;
}

export function DataTable<T>({ columns, data, keyExtractor, onRowClick, className }: DataTableProps<T>) {
  return (
    <div className={cn('overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm', className)}>
      <table className="w-full text-sm text-left text-gray-500">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
          <tr>
            {columns.map((col, idx) => (
              <th key={idx} scope="col" className={cn("px-6 py-3 font-medium", col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {data.map((row) => (
            <tr
              key={keyExtractor(row)}
              onClick={() => onRowClick?.(row)}
              className={cn('bg-white hover:bg-gray-50 transition-colors', onRowClick && 'cursor-pointer')}
            >
              {columns.map((col, idx) => (
                <td key={idx} className={cn("px-6 py-4 whitespace-nowrap text-gray-900", col.className)}>
                  {col.render ? col.render(row) : String(row[col.accessor as keyof T] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
