'use client';

const storageKey = 'omnillm.workspace-token';

export function getOwnerToken() {
  if (typeof window === 'undefined') return '';
  let token = window.localStorage.getItem(storageKey);
  if (!token) {
    token = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    window.localStorage.setItem(storageKey, token);
  }
  return token;
}

export async function workspaceFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set('x-omnillm-owner', getOwnerToken());
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return fetch(path, { ...init, headers, cache: 'no-store' });
}

