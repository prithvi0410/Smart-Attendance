import React from 'react';
import { cn } from '../../utils/cn';

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState = ({ icon: Icon, title, description, action, className }: EmptyStateProps) => {
  return (
    <div className={cn('flex flex-col items-center justify-center p-8 text-center bg-white rounded-lg border border-gray-100 shadow-sm', className)}>
      <div className="bg-gray-50 p-4 rounded-full mb-4">
        <Icon className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-500 max-w-sm mb-6">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
