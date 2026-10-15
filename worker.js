import { onRequestGet } from "./functions/api/product.js";

const encoder = new TextEncoder();
const maxDraftBytes = 1_500_000;

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function safeId(value) {
  return /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

function validateDraft(draft, id) {
  if (
    !draft ||
    typeof draft !== "object" ||
    typeof draft.name !== "string" ||
    !draft.name.trim() ||
    !Array.isArray(draft.products)
  ) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id,
    name: draft.name.trim().slice(0, 100),
    clientName: typeof draft.clientName === "string" ? draft.clientName.slice(0, 200) : "",
    sellerName: typeof draft.sellerName === "string" ? draft.sellerName.slice(0, 200) : "",
    createdAt:
      typeof draft.createdAt === "string" && !Number.isNaN(Date.parse(draft.createdAt))
        ? draft.createdAt
        : now,
    updatedAt: now,
    draft,
  };
}

async function upsertQuote(env, quote) {
  const serializedDraft = JSON.stringify({
    ...quote.draft,
    id: quote.id,
    name: quote.name,
    clientName: quote.clientName,
    sellerName: quote.sellerName,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
  });
  if (encoder.encode(serializedDraft).length > maxDraftBytes) {
    return json({ error: "O orçamento excede o limite de armazenamento." }, 413);
  }

  await env.QUOTES_DB.prepare(
    `INSERT INTO quotes
      (id, name, client_name, seller_name, created_at, updated_at, draft_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       client_name = excluded.client_name,
       seller_name = excluded.seller_name,
       updated_at = excluded.updated_at,
       draft_json = excluded.draft_json`,
  )
    .bind(
      quote.id,
      quote.name,
      quote.clientName,
      quote.sellerName,
      quote.createdAt,
      quote.updatedAt,
      serializedDraft,
    )
    .run();

  return json({ id: quote.id, updatedAt: quote.updatedAt });
}

async function handleQuotes(request, env, pathname) {
  if (!env.QUOTES_DB) {
    return json({ error: "O armazenamento de orçamentos não está configurado." }, 503);
  }

  if (pathname === "/api/quotes") {
    if (request.method !== "GET") {
      return json({ error: "Método não permitido." }, 405, { Allow: "GET" });
    }
    const result = await env.QUOTES_DB.prepare(
      `SELECT id, name, client_name AS clientName, seller_name AS sellerName,
              created_at AS createdAt, updated_at AS updatedAt
       FROM quotes ORDER BY updated_at DESC`,
    ).all();
    return json({ quotes: result.results || [] });
  }

  const match = pathname.match(/^\/api\/quotes\/([a-zA-Z0-9_-]{1,80})$/);
  if (!match || !safeId(match[1])) {
    return json({ error: "Orçamento não encontrado." }, 404);
  }

  const [, id] = match;
  const existing = await env.QUOTES_DB.prepare(
    "SELECT * FROM quotes WHERE id = ?",
  )
    .bind(id)
    .first();

  if (request.method === "GET") {
    if (!existing) return json({ error: "Orçamento não encontrado." }, 404);
    let draft;
    try {
      draft = JSON.parse(existing.draft_json);
    } catch (error) {
      console.error("Orçamento salvo contém JSON inválido:", id, error);
      return json({ error: "Não foi possível ler os dados deste orçamento." }, 500);
    }
    return json({ ...draft, id });
  }

  if (request.method === "DELETE") {
    if (!existing) return json({ error: "Orçamento não encontrado." }, 404);
    await env.QUOTES_DB.prepare("DELETE FROM quotes WHERE id = ?").bind(id).run();
    return json({ deleted: true });
  }

  if (request.method !== "PUT") {
    return json({ error: "Método não permitido." }, 405, { Allow: "GET, PUT, DELETE" });
  }

  if (!(request.headers.get("Content-Type") || "").includes("application/json")) {
    return json({ error: "Envie o orçamento em formato JSON." }, 415);
  }
  const rawDraft = await request.text();
  if (encoder.encode(rawDraft).length > maxDraftBytes) {
    return json({ error: "O orçamento excede o limite de armazenamento." }, 413);
  }
  let draft;
  try {
    draft = JSON.parse(rawDraft);
  } catch {
    return json({ error: "Dados enviados para salvar o orçamento são inválidos." }, 400);
  }

  const quote = validateDraft(draft, id);
  if (!quote) {
    return json({ error: "Informe o nome do orçamento e pelo menos uma lista de produtos." }, 400);
  }
  if (existing?.created_at) quote.createdAt = existing.created_at;
  return upsertQuote(env, quote);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/product") {
        if (request.method !== "GET") {
          return json({ error: "Método não permitido." }, 405, { Allow: "GET" });
        }
        return onRequestGet({ request });
      }
      if (url.pathname === "/api/quotes" || url.pathname.startsWith("/api/quotes/")) {
        return handleQuotes(request, env, url.pathname);
      }
      if (url.pathname.startsWith("/api/")) {
        return json({ error: "Rota não encontrada." }, 404);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("Falha ao processar solicitação:", error);
      return json({ error: "Não foi possível concluir a solicitação." }, 500);
    }
  },
};
