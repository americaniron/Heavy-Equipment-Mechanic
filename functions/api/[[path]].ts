import { proxyToApi } from "../_lib/proxy";

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  return proxyToApi(context.request, url.pathname);
};
