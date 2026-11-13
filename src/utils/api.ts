const SESSION_STORAGE_KEY = 'rf_github_session_id';

export function getStoredGitHubSessionId(): string | null {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredGitHubSessionId(sessionId: string | null) {
  try {
    if (sessionId) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restrictions
  }
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const sid = getStoredGitHubSessionId();
  if (sid) {
    headers.set('x-rf-session', sid);
  }
  return fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  });
}
