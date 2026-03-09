const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RqeDetail = {
  rqe: string;
  especialidade: string | null;
};

type RegionalLookupPayload = {
  ok: boolean;
  found: boolean;
  source?: string;
  rqeList: string[];
  rqeDetails: RqeDetail[];
  fotoUrl: string | null;
  lattesUrl: string | null;
  debug?: Record<string, unknown>;
};

type RegionalParsed = Omit<RegionalLookupPayload, "ok" | "found" | "source">;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function normalizeCrm(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\D/g, "").slice(0, 8);
}

function normalizeUf(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
}

function normalizeRqeToken(value: string): string | null {
  const cleaned = value.trim().replace(/[^\d/A-Z]/gi, "").toUpperCase();
  const match = cleaned.match(/^(\d{1,8})(?:\/([A-Z]{2}))?$/);
  if (!match) return null;
  const number = match[1];
  const uf = match[2];
  return uf ? `${number}/${uf}` : number;
}

function normalizeSpecialtyToken(value: string): string | null {
  const cleaned = value.replace(/\s+/g, " ").replace(/[;,.]+$/g, "").trim();
  if (cleaned.length < 3) return null;
  return cleaned;
}

function addRqeSeries(series: string, bucket: Set<string>) {
  const tokens = series
    .split(/[,\s;|]+|(?:\be\b)|(?:\bou\b)/gi)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  for (const token of tokens) {
    const normalized = normalizeRqeToken(token);
    if (normalized) bucket.add(normalized);
  }
}

function collectRqeFromText(input: string, bucket: Set<string>) {
  const patterns = [
    /\bRQE(?:S)?\b[\s:#-]*([0-9A-Z/,\s;|EeOUou-]{1,80})/gi,
    /\bREG(?:ISTRO)?[\s_-]*DE[\s_-]*QUALIFICA[CÇ][AÃ]O(?:[\s_-]*DE[\s_-]*ESPECIALISTA)?\b[\s:#-]*([0-9A-Z/,\s;|EeOUou-]{1,80})/gi,
    /"NU[_-]?(?:RQE|REG(?:ISTRO)?[_-]?QUAL(?:IFICACAO)?)"\s*:\s*"([^"]{1,80})"/gi,
    /"RQE"\s*:\s*"([^"]{1,80})"/gi,
    /"(?:NR|NUMERO|NUMBER)?[_-]?(?:RQE|REGISTRO[_-]?ESPECIAL(?:ISTA)?)"\s*:\s*"([^"]{1,80})"/gi,
    /"NUMEROREQUERIMENTO"\s*:\s*"?(\d{1,8})"?/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null = pattern.exec(input);
    while (match) {
      addRqeSeries(match[1], bucket);
      match = pattern.exec(input);
    }
  }
}

function collectRqeSpecialtyFromText(input: string): RqeDetail[] {
  const details: RqeDetail[] = [];
  const patterns: Array<{ pattern: RegExp; rqeIndex: number; specIndex: number }> = [
    {
      pattern: /\bRQE(?:S)?\b[\s:#-]*(\d{1,8}(?:\/[A-Z]{2})?)\s*[-–—:]\s*([A-ZÀ-Ú][A-ZÀ-Ú\s-]{2,80})/gi,
      rqeIndex: 1,
      specIndex: 2,
    },
    {
      pattern: /\b([A-ZÀ-Ú][A-ZÀ-Ú\s-]{2,80})\s*[-–—:]\s*\bRQE(?:S)?\b[\s:#-]*(\d{1,8}(?:\/[A-Z]{2})?)/gi,
      rqeIndex: 2,
      specIndex: 1,
    },
    {
      pattern: /"(?:ESPECIALIDADE|NM_ESPECIALIDADE|DS_ESPECIALIDADE)"\s*:\s*"([^"]{3,80})"[\s\S]{0,220}"(?:NU_RQE|RQE|NU_REG_QUAL|REGISTRO_QUALIFICACAO)"\s*:\s*"?(?:RQE[\s:#-]*)?(\d{1,8}(?:\/[A-Z]{2})?)"?/gi,
      rqeIndex: 2,
      specIndex: 1,
    },
    {
      pattern: /"(?:NU_RQE|RQE|NU_REG_QUAL|REGISTRO_QUALIFICACAO)"\s*:\s*"?(?:RQE[\s:#-]*)?(\d{1,8}(?:\/[A-Z]{2})?)"?[\s\S]{0,220}"(?:ESPECIALIDADE|NM_ESPECIALIDADE|DS_ESPECIALIDADE)"\s*:\s*"([^"]{3,80})"/gi,
      rqeIndex: 1,
      specIndex: 2,
    },
    {
      pattern: /"DESCRICAO"\s*:\s*"([^"]{3,120})"[\s\S]{0,220}"NUMEROREQUERIMENTO"\s*:\s*"?(\d{1,8})"?/gi,
      rqeIndex: 2,
      specIndex: 1,
    },
    {
      pattern: /"NUMEROREQUERIMENTO"\s*:\s*"?(\d{1,8})"?[\s\S]{0,220}"DESCRICAO"\s*:\s*"([^"]{3,120})"/gi,
      rqeIndex: 1,
      specIndex: 2,
    },
  ];

  for (const { pattern, rqeIndex, specIndex } of patterns) {
    let match: RegExpExecArray | null = pattern.exec(input);
    while (match) {
      const rqe = normalizeRqeToken(match[rqeIndex] ?? "");
      const especialidade = normalizeSpecialtyToken(match[specIndex] ?? "");
      if (rqe) details.push({ rqe, especialidade: especialidade ?? null });
      match = pattern.exec(input);
    }
  }

  const unique = new Map<string, RqeDetail>();
  for (const detail of details) {
    const key = `${detail.rqe}::${detail.especialidade ?? ""}`;
    if (!unique.has(key)) unique.set(key, detail);
  }
  return Array.from(unique.values());
}

function parseRegionalRqeFromUnknown(input: unknown): RegionalParsed {
  const rqeBag = new Set<string>();
  const detailMap = new Map<string, RqeDetail>();
  let fotoUrl: string | null = null;
  let lattesUrl: string | null = null;

  const stack: unknown[] = [input];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current == null) continue;

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }

    if (typeof current === "object") {
      const record = current as Record<string, unknown>;
      for (const [rawKey, rawValue] of Object.entries(record)) {
        const key = rawKey.toUpperCase();
        if (typeof rawValue === "string") {
          if (!fotoUrl && /(FOTO|IMAGEM|PHOTO|AVATAR)/.test(key)) fotoUrl = rawValue.trim() || null;
          if (!lattesUrl && /(LATTES|CURRICULO)/.test(key)) lattesUrl = rawValue.trim() || null;
          if (/(RQE|QUALIFIC|ESPECIALIDADE|REGISTRO|REQUERIMENTO|DESCRICAO)/.test(key)) {
            const bag = new Set<string>();
            collectRqeFromText(rawValue, bag);
            for (const item of bag) rqeBag.add(item);
            const details = collectRqeSpecialtyFromText(rawValue);
            for (const detail of details) {
              const normalizedRqe = normalizeRqeToken(detail.rqe ?? "");
              if (!normalizedRqe) continue;
              const normalizedSpecialty = normalizeSpecialtyToken(detail.especialidade ?? "") ?? null;
              const mapKey = `${normalizedRqe}::${normalizedSpecialty ?? ""}`;
              detailMap.set(mapKey, { rqe: normalizedRqe, especialidade: normalizedSpecialty });
            }
          }
        }
        stack.push(rawValue);
      }
      continue;
    }

    if (typeof current === "string") {
      const bag = new Set<string>();
      collectRqeFromText(current, bag);
      for (const item of bag) rqeBag.add(item);
      const details = collectRqeSpecialtyFromText(current);
      for (const detail of details) {
        const normalizedRqe = normalizeRqeToken(detail.rqe ?? "");
        if (!normalizedRqe) continue;
        const normalizedSpecialty = normalizeSpecialtyToken(detail.especialidade ?? "") ?? null;
        const mapKey = `${normalizedRqe}::${normalizedSpecialty ?? ""}`;
        detailMap.set(mapKey, { rqe: normalizedRqe, especialidade: normalizedSpecialty });
      }
    }
  }

  return {
    rqeList: Array.from(rqeBag),
    rqeDetails: Array.from(detailMap.values()),
    fotoUrl,
    lattesUrl,
  };
}

function absolutizeUrl(urlLike: string, base: string): string {
  try {
    return new URL(urlLike, base).toString();
  } catch {
    return urlLike;
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function mergeParsed(base: RegionalParsed, next: RegionalParsed): RegionalParsed {
  const rqe = new Set<string>([...base.rqeList, ...next.rqeList]);
  const detailMap = new Map<string, RqeDetail>();
  for (const item of [...base.rqeDetails, ...next.rqeDetails]) {
    const normalizedRqe = normalizeRqeToken(item.rqe ?? "");
    if (!normalizedRqe) continue;
    const normalizedSpecialty = normalizeSpecialtyToken(item.especialidade ?? "") ?? null;
    const key = `${normalizedRqe}::${normalizedSpecialty ?? ""}`;
    detailMap.set(key, { rqe: normalizedRqe, especialidade: normalizedSpecialty });
  }

  return {
    rqeList: Array.from(rqe),
    rqeDetails: Array.from(detailMap.values()),
    fotoUrl: base.fotoUrl ?? next.fotoUrl ?? null,
    lattesUrl: base.lattesUrl ?? next.lattesUrl ?? null,
  };
}

function parseCremespHtml(html: string): RegionalParsed {
  const parsed = parseRegionalRqeFromUnknown(html);
  const details: RqeDetail[] = [...parsed.rqeDetails];

  const tableRowPattern = /<tr[^>]*>\s*<td[^>]*>\s*([^<]{3,120})\s*<\/td>\s*<td[^>]*>\s*(\d{3,8})\s*<\/td>\s*<\/tr>/gi;
  let rowMatch: RegExpExecArray | null = tableRowPattern.exec(html);
  while (rowMatch) {
    const specialty = normalizeSpecialtyToken(decodeHtmlEntities(rowMatch[1] ?? ""));
    const rqe = normalizeRqeToken(rowMatch[2] ?? "");
    if (rqe) details.push({ rqe, especialidade: specialty ?? null });
    rowMatch = tableRowPattern.exec(html);
  }

  const imagePattern = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let imageMatch: RegExpExecArray | null = imagePattern.exec(html);
  let fotoUrl: string | null = parsed.fotoUrl;
  while (imageMatch) {
    const src = (imageMatch[1] ?? "").trim();
    if (!src) {
      imageMatch = imagePattern.exec(html);
      continue;
    }

    // Ignore obvious theme logos; keep first likely profile image.
    if (/logo|cremesp|portalcfm|cfm_logo/i.test(src)) {
      imageMatch = imagePattern.exec(html);
      continue;
    }

    fotoUrl = absolutizeUrl(src, "https://guiamedico.cremesp.org.br/");
    break;
  }

  const merged = mergeParsed(parsed, {
    rqeList: details.map((item) => item.rqe),
    rqeDetails: details,
    fotoUrl,
    lattesUrl: null,
  });

  return merged;
}

async function fetchCremespRegional(crm: string): Promise<RegionalParsed> {
  let out: RegionalParsed = {
    rqeList: [],
    rqeDetails: [],
    fotoUrl: null,
    lattesUrl: null,
  };

  // Attempt API used by search/list first.
  try {
    const apiResponse = await fetch("https://api.cremesp.org.br/guia-medico/filtrar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://guiamedico.cremesp.org.br",
        Referer: "https://guiamedico.cremesp.org.br/",
      },
      body: JSON.stringify({
        indexInicioPagina: 0,
        tamanhoPagina: 0,
        crm: Number(crm),
        nome: "",
        situacao: "A",
      }),
    });
    if (apiResponse.ok) {
      const apiBody = await apiResponse.json();
      out = mergeParsed(out, parseRegionalRqeFromUnknown(apiBody));
    }
  } catch {
    // ignore API failures and continue with HTML fallback
  }

  // Attempt direct profile endpoint observed in CREMESP network panel.
  try {
    const detailResponse = await fetch(`https://api.cremesp.org.br/guia-medico/${encodeURIComponent(crm)}`, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        Origin: "https://guiamedico.cremesp.org.br",
        Referer: "https://guiamedico.cremesp.org.br/",
      },
    });
    if (detailResponse.ok) {
      const detailBody = await detailResponse.json();
      out = mergeParsed(out, parseRegionalRqeFromUnknown(detailBody));
    }
  } catch {
    // ignore direct endpoint failures
  }

  // Parse public page HTML for profile modal/table content.
  try {
    const pageResponse = await fetch(`https://guiamedico.cremesp.org.br/?crm=${encodeURIComponent(crm)}`, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (pageResponse.ok) {
      const html = await pageResponse.text();
      out = mergeParsed(out, parseCremespHtml(html));
    }
  } catch {
    // ignore HTML fallback failures
  }

  return out;
}

function buildRegionalEnvPrefix(uf: string): string[] {
  return [`REGIONAL_CRM_${uf}`, "REGIONAL_CRM_DEFAULT"];
}

function envFor(prefixes: string[], suffix: string): string | null {
  for (const prefix of prefixes) {
    const value = Deno.env.get(`${prefix}_${suffix}`);
    if (value && value.trim().length > 0) return value.trim();
  }
  return null;
}

function applyTemplate(template: string, crm: string, uf: string): string {
  return template.replaceAll("{{crm}}", crm).replaceAll("{{uf}}", uf);
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
    const crm = normalizeCrm(body.crm);
    const uf = normalizeUf(body.uf);
    const debug = Boolean(body.debug);

    if (!crm || !uf) {
      return json({ ok: false, found: false, error: "crm e uf são obrigatórios" }, 400);
    }

    // SP has a public CREMESP portal with data not always exposed by generic JSON endpoints.
    if (uf === "SP") {
      const parsed = await fetchCremespRegional(crm);
      const hasAny = parsed.rqeList.length > 0 || parsed.rqeDetails.length > 0 || Boolean(parsed.fotoUrl) || Boolean(parsed.lattesUrl);
      return json({
        ok: true,
        found: hasAny,
        source: "regional_sp_cremesp",
        rqeList: parsed.rqeList,
        rqeDetails: parsed.rqeDetails,
        fotoUrl: parsed.fotoUrl,
        lattesUrl: parsed.lattesUrl,
      });
    }

    const prefixes = buildRegionalEnvPrefix(uf);
    const lookupUrl = envFor(prefixes, "URL");
    if (!lookupUrl) {
      return json({
        ok: true,
        found: false,
        source: "regional_not_configured",
        rqeList: [],
        rqeDetails: [],
        fotoUrl: null,
        lattesUrl: null,
      });
    }

    const method = (envFor(prefixes, "METHOD") ?? "POST").toUpperCase();
    const token = envFor(prefixes, "TOKEN");
    const tokenHeader = envFor(prefixes, "TOKEN_HEADER") ?? "Authorization";
    const headersJson = envFor(prefixes, "HEADERS_JSON");
    const bodyTemplate = envFor(prefixes, "BODY_TEMPLATE");
    const queryCrmParam = envFor(prefixes, "QUERY_CRM_PARAM") ?? "crm";
    const queryUfParam = envFor(prefixes, "QUERY_UF_PARAM") ?? "uf";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (headersJson) {
      try {
        const parsed = JSON.parse(headersJson) as Record<string, unknown>;
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string") headers[k] = v;
        }
      } catch {
        // Ignore malformed custom headers.
      }
    }

    if (token) {
      headers[tokenHeader] = tokenHeader.toLowerCase() === "authorization" ? `Bearer ${token}` : token;
    }

    let finalUrl = lookupUrl;
    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (method === "GET") {
      const url = new URL(lookupUrl);
      url.searchParams.set(queryCrmParam, crm);
      url.searchParams.set(queryUfParam, uf);
      finalUrl = url.toString();
    } else {
      const payload = bodyTemplate
        ? JSON.parse(applyTemplate(bodyTemplate, crm, uf))
        : { crm, uf };
      fetchOptions.body = JSON.stringify(payload);
    }

    const response = await fetch(finalUrl, fetchOptions);
    if (!response.ok) {
      return json({
        ok: true,
        found: false,
        source: "regional_http_error",
        rqeList: [],
        rqeDetails: [],
        fotoUrl: null,
        lattesUrl: null,
        debug: debug ? { status: response.status, url: finalUrl } : undefined,
      });
    }

    const contentType = response.headers.get("content-type") ?? "";
    const parsedBody = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    const parsed = parseRegionalRqeFromUnknown(parsedBody);
    const hasAny = parsed.rqeList.length > 0 || parsed.rqeDetails.length > 0 || Boolean(parsed.fotoUrl) || Boolean(parsed.lattesUrl);

    const out: RegionalLookupPayload = {
      ok: true,
      found: hasAny,
      source: `regional_${uf.toLowerCase()}`,
      rqeList: parsed.rqeList,
      rqeDetails: parsed.rqeDetails,
      fotoUrl: parsed.fotoUrl,
      lattesUrl: parsed.lattesUrl,
    };

    if (debug) {
      out.debug = {
        url: finalUrl,
        method,
        contentType,
      };
    }

    return json(out);
  } catch (err) {
    return json(
      {
        ok: false,
        found: false,
        error: "Erro inesperado",
        details: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});
