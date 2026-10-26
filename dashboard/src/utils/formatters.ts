import { format, formatDistanceToNow, parseISO } from 'date-fns';

export const formatDate = (date: string | Date | null | undefined): string => {
  if (!date) return 'N/A';
  const parsedDate = typeof date === 'string' ? parseISO(date) : date;
  return format(parsedDate, 'MMM dd, yyyy');
};

export const formatTime = (date: string | Date | null | undefined): string => {
  if (!date) return 'N/A';
  // Handle HH:MM:SS format returned by DB for time types
  if (typeof date === 'string' && date.match(/^\d{2}:\d{2}:\d{2}$/)) {
    const [hours, minutes] = date.split(':');
    const d = new Date();
    d.setHours(parseInt(hours, 10));
    d.setMinutes(parseInt(minutes, 10));
    return format(d, 'h:mm a');
  }
  const parsedDate = typeof date === 'string' ? parseISO(date) : date;
  return format(parsedDate, 'h:mm a');
};

export const formatDateTime = (date: string | Date | null | undefined): string => {
  if (!date) return 'N/A';
  const parsedDate = typeof date === 'string' ? parseISO(date) : date;
  return format(parsedDate, 'MMM dd, yyyy h:mm a');
};

export const formatPercentage = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'N/A';
  return `${Math.round(value)}%`;
};

export const getRelativeTime = (date: string | Date | null | undefined): string => {
  if (!date) return 'N/A';
  const parsedDate = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(parsedDate, { addSuffix: true });
};

export const getRiskBadgeColor = (level: string | null | undefined): string => {
  switch (level?.toLowerCase()) {
    case 'high': return 'bg-red-100 text-red-800';
    case 'medium': return 'bg-yellow-100 text-yellow-800';
    case 'low': return 'bg-green-100 text-green-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

export const getTrendIcon = (trend: string | null | undefined): 'up' | 'down' | 'neutral' => {
  switch (trend?.toLowerCase()) {
    case 'improving': return 'up';
    case 'declining': return 'down';
    default: return 'neutral';
  }
};
