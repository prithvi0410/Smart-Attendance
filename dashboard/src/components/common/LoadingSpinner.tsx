import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

export const LoadingSpinner = ({ className, size = 24 }: { className?: string, size?: number }) => {
  return (
    <div className={cn('flex items-center justify-center p-4', className)}>
      <Loader2 className="animate-spin text-blue-600" size={size} />
    </div>
  );
};
