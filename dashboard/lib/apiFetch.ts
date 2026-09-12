import { getOwnerSupabaseClient } from './supabaseClient';

export async function fetchOwnerApi(apiPath: string): Promise<unknown> {
  const { data: sessionData } = await getOwnerSupabaseClient().auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    window.location.href = '/login';
    throw new Error('Not authenticated');
  }
  const apiResponse = await fetch(apiPath, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (apiResponse.status === 401) {
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  if (!apiResponse.ok) {
    const errorBody = (await apiResponse.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(errorBody?.error?.message ?? `Request failed: ${apiResponse.status}`);
  }
  if (apiResponse.status === 204) return null;
  return apiResponse.json();
}
