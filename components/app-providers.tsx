'use client';

import { useEffect } from 'react';

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const saved = window.localStorage.getItem('omnillm.theme') ?? 'dark';
    document.documentElement.classList.toggle('dark', saved !== 'light');
    const listener = (event: Event) => {
      const theme = (event as CustomEvent<'dark' | 'light'>).detail;
      document.documentElement.classList.toggle('dark', theme === 'dark');
      window.localStorage.setItem('omnillm.theme', theme);
    };
    window.addEventListener('omnillm:theme', listener);
    return () => window.removeEventListener('omnillm:theme', listener);
  }, []);
  return <>{children}</>;
}
