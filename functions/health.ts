import { proxyToApi } from "./_lib/proxy";

export const onRequest: PagesFunction = async (context) => {
  return proxyToApi(context.request, "/health");
};
