const API = "https://api.fixmyiron.com";

function hopByHop(): Set<string> {
  return new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "cf-connecting-ip",
    "cf-ray",
    "cf-visitor",
    "cf-ew-via",
    "cf-worker",
  ]);
}

export async function proxyToApi(request: Request, pathname: string): Promise<Response> {
  const incoming = new URL(request.url);
  const target = `${API}${pathname}${incoming.search}`;
  const headers = new Headers();
  const skip = hopByHop();
  request.headers.forEach((value, key) => {
    if (!skip.has(key.toLowerCase())) headers.set(key, value);
  });
  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }
  return fetch(target, init);
}
