import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatETA = (seconds: number) => {
  if (!seconds || seconds <= 0) return '';
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

export const getHealth = async () => {
  const resp = await fetch('/api/health');
  if (!resp.ok) {
    return { message: 'Failed to get health' };
  }
  const payload = await resp.json();
  return payload;
};
