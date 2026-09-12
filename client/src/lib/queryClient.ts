import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { ApiError, apiErrorMessage, apiFetch, getStoredAuthToken } from "./api";

async function throwIfResNotOk(res: Response, fallback = "Request failed") {
  if (!res.ok) throw new ApiError(await apiErrorMessage(res, fallback), res.status);
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (data !== undefined) headers["Content-Type"] = "application/json";
  const res = await apiFetch(url, {
    method,
    headers,
    body: data !== undefined ? JSON.stringify(data) : undefined,
  }, { authenticated: true });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const token = getStoredAuthToken();
    const res = await apiFetch(
      queryKey.join("/") as string,
      {},
      { authenticated: Boolean(token), token },
    );

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
