import type { NewGameResponse, SubmitHandRequest, SubmitHandResponse, SuggestHandResponse } from './types';

const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
const apiUrl = (path: string) => `${API_BASE}${path}`;

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    ...init
  });

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in (data as any)
        ? String((data as any).error)
        : `Request failed: ${res.status}`;
    throw new Error(msg);
  }

  return data as T;
}

export function newGame(): Promise<NewGameResponse> {
  return jsonFetch<NewGameResponse>(apiUrl('/api/new-game'), { method: 'POST' });
}

export function submitHand(body: SubmitHandRequest): Promise<SubmitHandResponse> {
  return jsonFetch<SubmitHandResponse>(apiUrl('/api/submit-hand'), {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function suggestHand(gameId: string): Promise<SuggestHandResponse> {
  return jsonFetch<SuggestHandResponse>(apiUrl('/api/suggest-hand'), {
    method: 'POST',
    body: JSON.stringify({ gameId })
  });
}
