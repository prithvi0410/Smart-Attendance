import { AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '../../utils/cn';

interface ErrorMessageProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorMessage = ({ title = 'Error', message, onRetry, className }: ErrorMessageProps) => {
  return (
    <div className={cn('bg-red-50 border-l-4 border-red-500 p-4 rounded-md', className)}>
      <div className="flex items-start">
        <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-800">{title}</h3>
          <div className="mt-1 text-sm text-red-700">
            {message}
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 flex items-center text-sm font-medium text-red-800 hover:text-red-900"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
