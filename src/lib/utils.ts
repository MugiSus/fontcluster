import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getSafeFontName(fontName: string): string {
  return fontName.replace(/\s/g, '_').replace(/\//g, '_');
}
