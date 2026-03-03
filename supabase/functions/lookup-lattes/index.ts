const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function extractLattesId(raw: string): string {
  const cleaned = raw.replace(/\s+/g, "");
  const matchByUrl = cleaned.match(/lattes\.cnpq\.br\/(\d{16})/i);
  if (matchByUrl) return matchByUrl[1];

  const matchByQuery = cleaned.match(/[?&]id=([a-zA-Z0-9]+)/i);
  if (matchByQuery) return matchByQuery[1];

  const justId = cleaned.match(/^(\d{16})$/);
  if (justId) return justId[1];

  return "";
}

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function findByRegex(input: string, pattern: RegExp): string {
  const found = input.match(pattern);
  return found?.[1]?.trim() ?? "";
}

function parseLattesHtml(html: string) {
  const plain = stripHtml(html);
  const title = findByRegex(html, /<title>([^<]+)<\/title>/i);
  const nameFromTitle = title.replace(/^\s*Currículo do Sistema de Currículos Lattes\s*/i, "").trim();

  const updated =
    findByRegex(plain, /Última atualização do currículo em\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i) ||
    findByRegex(plain, /Ultima atualizacao do curriculo em\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);

  const summary =
    findByRegex(plain, /Resumo informado pelo autor[:\s]+(.{30,600}?)(?:Formação acadêmica|Formacao academica|Atuação profissional|Areas de atuacao|Produções|Producao técnica)/i) ||
    "";

  return {
    name: nameFromTitle || "",
    updatedAt: updated || "",
    summary: summary || "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const input = normalizeText(body.lattes);
    if (!input) {
      return json({ ok: false, error: "Informe URL ou ID do Lattes." }, 400);
    }

    const id = extractLattesId(input);
    if (!id) {
      return json({ ok: false, error: "Não foi possível identificar o ID do Lattes." }, 400);
    }

    const canonicalUrl = `http://lattes.cnpq.br/${id}`;
    const htmlCandidates = [
      `http://lattes.cnpq.br/${id}`,
      `http://buscatextual.cnpq.br/buscatextual/visualizacv.do?id=${id}`,
      `https://buscatextual.cnpq.br/buscatextual/visualizacv.do?id=${id}`,
    ];

    let html = "";
    let sourceUrl = "";

    for (const candidate of htmlCandidates) {
      try {
        const response = await fetch(candidate, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; MedEscalaBot/1.0)",
          },
        });
        if (!response.ok) continue;
        const bodyText = await response.text();
        if (!bodyText || bodyText.length < 100) continue;
        html = bodyText;
        sourceUrl = candidate;
        break;
      } catch {
        // Try next candidate.
      }
    }

    if (!html) {
      return json({
        ok: true,
        found: false,
        lattes: {
          id,
          canonicalUrl,
        },
        warning: "Lattes encontrado por ID, mas não foi possível carregar os dados agora.",
      });
    }

    const parsed = parseLattesHtml(html);
    return json({
      ok: true,
      found: true,
      lattes: {
        id,
        canonicalUrl,
        sourceUrl,
        name: parsed.name || null,
        updatedAt: parsed.updatedAt || null,
        summary: parsed.summary || null,
      },
    });
  } catch (err) {
    return json({
      ok: false,
      error: "Erro inesperado",
      details: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
