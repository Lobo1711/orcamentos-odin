import { onRequestGet } from "./functions/api/product.js";

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);

    if (requestUrl.pathname === "/api/product") {
      if (request.method !== "GET") {
        return Response.json(
          { error: "Método não permitido." },
          {
            status: 405,
            headers: { Allow: "GET" },
          },
        );
      }

      return onRequestGet({ request });
    }

    if (requestUrl.pathname.startsWith("/api/")) {
      return Response.json({ error: "Rota não encontrada." }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
};
