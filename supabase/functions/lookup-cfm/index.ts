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

function normalizeCrm(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\D/g, "").slice(0, 7);
}

function normalizeUf(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
}

type CfmApiResult = {
  status?: string;
  dados?: Array<Record<string, unknown>>;
};

type RqeDetail = {
  rqe: string;
  especialidade: string | null;
};

type RegionalLookupPayload = {
  rqeList: string[];
  rqeDetails: RqeDetail[];
  fotoUrl: string | null;
  lattesUrl: string | null;
};

function normalizeRqe(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return normalizeRqeToken(String(value)) ?? "";
}

function normalizeRqeToken(value: string): string | null {
  const cleaned = value.trim().replace(/[^\d/A-Z]/gi, "").toUpperCase();
  const match = cleaned.match(/^(\d{1,8})(?:\/([A-Z]{2}))?$/);
  if (!match) return null;
  const number = match[1];
  const uf = match[2];
  return uf ? `${number}/${uf}` : number;
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

function collectRqeValues(input: unknown, bucket: Set<string>, depth = 0): void {
  if (depth > 5 || input == null) return;

  if (Array.isArray(input)) {
    for (const item of input) {
      collectRqeValues(item, bucket, depth + 1);
    }
    return;
  }

  if (typeof input === "object") {
    const record = input as Record<string, unknown>;
    for (const [rawKey, rawValue] of Object.entries(record)) {
      const key = rawKey.toUpperCase();
      const keyLooksRqe =
        key.includes("RQE") ||
        key.includes("QUALIFIC") ||
        key.includes("ESPECIALISTA") ||
        (key.includes("REGISTRO") && key.includes("ESPECIAL")) ||
        key.includes("REG_QUAL");

      if (keyLooksRqe) {
        if (Array.isArray(rawValue)) {
          for (const part of rawValue) {
            const normalized = normalizeRqe(part);
            if (normalized) bucket.add(normalized);
          }
        } else if (typeof rawValue === "string" || typeof rawValue === "number") {
          const text = String(rawValue);
          const candidates = text.split(/[;,|]/g);
          for (const candidate of candidates) {
            const normalized = normalizeRqe(candidate);
            if (normalized) bucket.add(normalized);
          }
          collectRqeFromText(text, bucket);
        }
      }

      collectRqeValues(rawValue, bucket, depth + 1);
    }
  }
}

function findStringByKeyFragment(input: unknown, fragments: string[], depth = 0): string | null {
  if (depth > 4 || input == null) return null;
  if (Array.isArray(input)) {
    for (const item of input) {
      const value = findStringByKeyFragment(item, fragments, depth + 1);
      if (value) return value;
    }
    return null;
  }
  if (typeof input !== "object") return null;

  const entries = Object.entries(input as Record<string, unknown>);
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.toUpperCase();
    const matches = fragments.some((fragment) => key.includes(fragment));
    if (matches && typeof rawValue === "string") {
      const normalized = rawValue.trim();
      if (normalized.length > 0) return normalized;
    }
  }

  for (const [, rawValue] of entries) {
    const value = findStringByKeyFragment(rawValue, fragments, depth + 1);
    if (value) return value;
  }
  return null;
}

function collectRqeFromText(input: string, bucket: Set<string>) {
  const patterns = [
    /\bRQE(?:S)?\b[\s:#-]*([0-9A-Z\/,\s;|EeOUou-]{1,80})/gi,
    /\bREG(?:ISTRO)?[\s_-]*DE[\s_-]*QUALIFICA[CÇ][AÃ]O(?:[\s_-]*DE[\s_-]*ESPECIALISTA)?\b[\s:#-]*([0-9A-Z\/,\s;|EeOUou-]{1,80})/gi,
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

function candidateIdsFromRecord(record: Record<string, unknown>): string[] {
  const keys = [
    "ID",
    "ID_MEDICO",
    "IDPROFISSIONAL",
    "CO_SEQ",
    "CO_MEDICO",
    "NU_CRM",
    "NU_CRM_NATURAL",
  ];
  const values = keys
    .map((key) => record[key])
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
  return Array.from(new Set(values));
}

function normalizeSpecialty(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeSpecialtyToken(value: string): string | null {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/[;,.]+$/g, "")
    .trim();
  if (cleaned.length < 3) return null;
  return cleaned;
}

function collectRqeSpecialtyFromText(input: string): RqeDetail[] {
  const details: RqeDetail[] = [];

  const patterns: Array<{ pattern: RegExp; rqeIndex: number; specIndex: number }> = [
    {
      // "RQE 58201 - ANESTESIOLOGIA"
      pattern: /\bRQE(?:S)?\b[\s:#-]*(\d{1,8}(?:\/[A-Z]{2})?)\s*[-–—:]\s*([A-ZÀ-Ú][A-ZÀ-Ú\s\-]{2,80})/gi,
      rqeIndex: 1,
      specIndex: 2,
    },
    {
      // "ANESTESIOLOGIA - RQE 58201"
      pattern: /\b([A-ZÀ-Ú][A-ZÀ-Ú\s\-]{2,80})\s*[-–—:]\s*\bRQE(?:S)?\b[\s:#-]*(\d{1,8}(?:\/[A-Z]{2})?)/gi,
      rqeIndex: 2,
      specIndex: 1,
    },
    {
      // JSON-like: "ESPECIALIDADE":"ANESTESIOLOGIA"... "NU_RQE":"58201"
      pattern: /"(?:ESPECIALIDADE|NM_ESPECIALIDADE|DS_ESPECIALIDADE)"\s*:\s*"([^"]{3,80})"[\s\S]{0,220}"(?:NU_RQE|RQE|NU_REG_QUAL|REGISTRO_QUALIFICACAO)"\s*:\s*"?(?:RQE[\s:#-]*)?(\d{1,8}(?:\/[A-Z]{2})?)"?/gi,
      rqeIndex: 2,
      specIndex: 1,
    },
    {
      // reverse JSON-like
      pattern: /"(?:NU_RQE|RQE|NU_REG_QUAL|REGISTRO_QUALIFICACAO)"\s*:\s*"?(?:RQE[\s:#-]*)?(\d{1,8}(?:\/[A-Z]{2})?)"?[\s\S]{0,220}"(?:ESPECIALIDADE|NM_ESPECIALIDADE|DS_ESPECIALIDADE)"\s*:\s*"([^"]{3,80})"/gi,
      rqeIndex: 1,
      specIndex: 2,
    },
    {
      // CREMESP style: "descricao":"ANESTESIOLOGIA"... "numeroRequerimento":58201
      pattern: /"DESCRICAO"\s*:\s*"([^"]{3,120})"[\s\S]{0,220}"NUMEROREQUERIMENTO"\s*:\s*"?(\d{1,8})"?/gi,
      rqeIndex: 2,
      specIndex: 1,
    },
    {
      // CREMESP reverse style
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
      if (rqe) {
        details.push({ rqe, especialidade: especialidade ?? null });
      }
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

function collectRqeDetailsFromRows(rows: Array<Record<string, unknown>>): RqeDetail[] {
  const details: RqeDetail[] = [];

  for (const row of rows) {
    let specialty: string | null = null;
    const rqeCandidates: string[] = [];

    for (const [rawKey, rawValue] of Object.entries(row)) {
      const key = rawKey.toUpperCase();
      if (key.includes("ESPECIAL")) {
        specialty = specialty ?? normalizeSpecialty(rawValue);
      }
      if (
        key.includes("RQE") ||
        key.includes("QUALIFIC") ||
        (key.includes("REGISTRO") && key.includes("ESPECIAL"))
      ) {
        if (typeof rawValue === "string" || typeof rawValue === "number") {
          const value = normalizeRqe(rawValue);
          if (value) rqeCandidates.push(value);
          const bag = new Set<string>();
          collectRqeFromText(String(rawValue), bag);
          for (const parsed of bag) rqeCandidates.push(parsed);
        }
      }

      if (!specialty && typeof rawValue === "string" && /ANESTESIOLOGIA|TERAPIA INTENSIVA|ESPECIALIDADE/i.test(rawValue)) {
        specialty = normalizeSpecialty(rawValue);
      }
    }

    const uniqueRqe = Array.from(new Set(rqeCandidates));
    for (const rqe of uniqueRqe) {
      details.push({ rqe, especialidade: specialty });
    }
  }

  const unique = new Map<string, RqeDetail>();
  for (const item of details) {
    const key = `${item.rqe}::${item.especialidade ?? ""}`;
    if (!unique.has(key)) unique.set(key, item);
  }

  return Array.from(unique.values());
}

async function fetchDetailFallbackData(first: Record<string, unknown>, crm: string, uf: string): Promise<string[]> {
  const base = "https://portal.cfm.org.br/api_rest_php/api/v2/medicos";
  const headers = {
    "Content-Type": "application/json",
    "Origin": "https://portal.cfm.org.br",
    "Referer": "https://portal.cfm.org.br/busca-medicos/",
  };

  const ids = candidateIdsFromRecord(first);
  const bodyCandidates: unknown[] = [
    { id: ids[0] ?? null, crm, uf },
    { medico: { id: ids[0] ?? null, crmMedico: crm, ufMedico: uf } },
    { medico: first },
    [{ medico: first, page: 1, pageSize: 20 }],
  ];

  const endpoints = [
    `${base}/detalhes_medico`,
    `${base}/buscar_detalhes_medico`,
    `${base}/buscar_medico_detalhes`,
    `${base}/detalhe_medico`,
    `${base}/buscar_medicos_detalhes`,
    `${base}/buscar_especialidades_medico`,
    `${base}/buscar_medico_especialidades`,
    `${base}/especialidades_medico`,
    `${base}/medico_especialidades`,
    `${base}/buscar_areas_atuacao_medico`,
    `${base}/areas_atuacao_medico`,
  ];

  const collected: string[] = [];

  for (const endpoint of endpoints) {
    for (const body of bodyCandidates) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        if (!response.ok) continue;
        const text = await response.text();
        if (!text) continue;
        collected.push(text);
      } catch {
        // Continue with other candidates.
      }
    }
  }

  const getEndpoints = [
    `${base}/buscar_especialidades_medico?crm=${encodeURIComponent(crm)}&uf=${encodeURIComponent(uf)}`,
    `${base}/buscar_medico_especialidades?crm=${encodeURIComponent(crm)}&uf=${encodeURIComponent(uf)}`,
    `${base}/especialidades_medico?crm=${encodeURIComponent(crm)}&uf=${encodeURIComponent(uf)}`,
    `${base}/areas_atuacao_medico?crm=${encodeURIComponent(crm)}&uf=${encodeURIComponent(uf)}`,
    `${base}/detalhes_medico?crm=${encodeURIComponent(crm)}&uf=${encodeURIComponent(uf)}`,
  ];

  for (const endpoint of getEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers,
      });
      if (!response.ok) continue;
      const text = await response.text();
      if (!text) continue;
      collected.push(text);
    } catch {
      // Ignore and keep trying.
    }
  }

  return collected;
}

function parseRegionalRqeFromUnknown(input: unknown): RegionalLookupPayload {
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
          if (/(RQE|QUALIFIC|ESPECIALIDADE|REGISTRO)/.test(key)) {
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

async function fetchRegionalFallback(crm: string, uf: string): Promise<RegionalLookupPayload> {
  const lookupUrl = Deno.env.get("REGIONAL_CRM_LOOKUP_URL");
  const lookupToken = Deno.env.get("REGIONAL_CRM_LOOKUP_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const internalLookupUrl = supabaseUrl ? `${supabaseUrl.replace(/\/+$/g, "")}/functions/v1/lookup-regional-crm` : null;
  const finalLookupUrl = lookupUrl ?? internalLookupUrl;
  if (!finalLookupUrl) {
    return {
      rqeList: [],
      rqeDetails: [],
      fotoUrl: null,
      lattesUrl: null,
    };
  }

  try {
    const response = await fetch(finalLookupUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(lookupToken ? { Authorization: `Bearer ${lookupToken}` } : {}),
        ...(serviceRoleKey ? { apikey: serviceRoleKey } : {}),
      },
      body: JSON.stringify({ crm, uf }),
    });
    if (!response.ok) {
      return {
        rqeList: [],
        rqeDetails: [],
        fotoUrl: null,
        lattesUrl: null,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (
      body &&
      typeof body === "object" &&
      "rqeList" in (body as Record<string, unknown>) &&
      "rqeDetails" in (body as Record<string, unknown>)
    ) {
      const record = body as Record<string, unknown>;
      return {
        rqeList: Array.isArray(record.rqeList) ? record.rqeList.map((item) => String(item ?? "").trim()).filter(Boolean) : [],
        rqeDetails: Array.isArray(record.rqeDetails)
          ? record.rqeDetails
              .map((item) => {
                const obj = (item ?? {}) as Record<string, unknown>;
                return {
                  rqe: String(obj.rqe ?? "").trim(),
                  especialidade: String(obj.especialidade ?? "").trim() || null,
                };
              })
              .filter((item) => item.rqe.length > 0)
          : [],
        fotoUrl: typeof record.fotoUrl === "string" ? record.fotoUrl : null,
        lattesUrl: typeof record.lattesUrl === "string" ? record.lattesUrl : null,
      };
    }

    return parseRegionalRqeFromUnknown(body);
  } catch {
    return {
      rqeList: [],
      rqeDetails: [],
      fotoUrl: null,
      lattesUrl: null,
    };
  }
}

function firstMatch(input: string, pattern: RegExp): string | null {
  const found = input.match(pattern);
  const value = found?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

async function fetchPortalFallback(crm: string, uf: string) {
  if (!crm || !uf) return { photoUrl: null as string | null, lattesUrl: null as string | null, rqeList: [] as string[] };

  const queryUrl = `https://portal.cfm.org.br/busca-medicos/?crm=${encodeURIComponent(crm)}&uf=${encodeURIComponent(uf)}`;
  try {
    const response = await fetch(queryUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MedEscalaBot/1.0)",
      },
    });
    if (!response.ok) {
      return { photoUrl: null, lattesUrl: null, rqeList: [] };
    }

    const html = await response.text();
    if (!html || html.length < 100) {
      return { photoUrl: null, lattesUrl: null, rqeList: [] };
    }

    const rqeSet = new Set<string>();
    collectRqeFromText(html, rqeSet);

    const photoUrl =
      firstMatch(html, /"(https?:\/\/[^"]+\.(?:png|jpg|jpeg|webp))"/i) ??
      firstMatch(html, /'((?:https?:)?\/\/[^']+\.(?:png|jpg|jpeg|webp))'/i);

    const lattesUrl = firstMatch(html, /(https?:\/\/lattes\.cnpq\.br\/\d{16})/i);

    return {
      photoUrl,
      lattesUrl,
      rqeList: Array.from(rqeSet),
    };
  } catch {
    return { photoUrl: null, lattesUrl: null, rqeList: [] };
  }
}

async function fetchCremespFallback(crm: string): Promise<RegionalLookupPayload> {
  if (!crm) {
    return { rqeList: [], rqeDetails: [], fotoUrl: null, lattesUrl: null };
  }

  const browserLikeHeaders: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    Origin: "https://guiamedico.cremesp.org.br",
    Referer: "https://guiamedico.cremesp.org.br/",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
  };

  const mergeRegional = (base: RegionalLookupPayload, next: RegionalLookupPayload): RegionalLookupPayload => {
    const rqeList = Array.from(new Set([...(base.rqeList ?? []), ...(next.rqeList ?? [])]));
    const detailMap = new Map<string, RqeDetail>();
    for (const item of [...(base.rqeDetails ?? []), ...(next.rqeDetails ?? [])]) {
      const normalizedRqe = normalizeRqeToken(item?.rqe ?? "");
      if (!normalizedRqe) continue;
      const normalizedSpec = normalizeSpecialtyToken(item?.especialidade ?? "") ?? null;
      const key = `${normalizedRqe}::${normalizedSpec ?? ""}`;
      detailMap.set(key, { rqe: normalizedRqe, especialidade: normalizedSpec });
    }
    return {
      rqeList,
      rqeDetails: Array.from(detailMap.values()),
      fotoUrl: base.fotoUrl ?? next.fotoUrl ?? null,
      lattesUrl: base.lattesUrl ?? next.lattesUrl ?? null,
    };
  };

  const parseUnknownRegional = (input: unknown): RegionalLookupPayload => {
    const rqeSet = new Set<string>();
    collectRqeValues(input, rqeSet);
    collectRqeFromText(JSON.stringify(input), rqeSet);
    const rqeDetails = collectRqeSpecialtyFromText(JSON.stringify(input));
    const fotoUrl =
      findStringByKeyFragment(input, ["FOTO", "IMAGEM", "PHOTO", "FOTOPERFIL"]) ??
      null;
    const lattesUrl =
      findStringByKeyFragment(input, ["LATTES", "CURRICULO", "CURRICULUM"]) ??
      null;

    return {
      rqeList: Array.from(rqeSet),
      rqeDetails,
      fotoUrl,
      lattesUrl,
    };
  };

  try {
    let out: RegionalLookupPayload = { rqeList: [], rqeDetails: [], fotoUrl: null, lattesUrl: null };
    const sequencias = new Set<string>();

    // 1) Primeiro tenta o filtrar para obter sequencia e possíveis detalhes.
    try {
      const searchResponse = await fetch("https://api.cremesp.org.br/guia-medico/filtrar", {
        method: "POST",
        headers: {
          ...browserLikeHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          indexInicioPagina: 0,
          tamanhoPagina: 0,
          crm: Number(crm),
          nome: "",
          situacao: "A",
        }),
      });
      if (searchResponse.ok) {
        const searchBody = await searchResponse.json();
        out = mergeRegional(out, parseUnknownRegional(searchBody));
        const content = (searchBody as Record<string, unknown>)?.content;
        if (Array.isArray(content)) {
          for (const row of content) {
            const seq = (row as Record<string, unknown>)?.sequencia;
            if (typeof seq === "number" || typeof seq === "string") {
              const value = String(seq).trim();
              if (value) sequencias.add(value);
            }
          }
        }
      }
    } catch {
      // continue
    }

    // 2) Tenta múltiplas rotas de detalhe com crm e sequencia.
    const ids = Array.from(new Set([crm, ...Array.from(sequencias)]));
    const getCandidates = ids.flatMap((id) => [
      `https://api.cremesp.org.br/guia-medico/${encodeURIComponent(id)}`,
      `https://api.cremesp.org.br/guia-medico/detalhe/${encodeURIComponent(id)}`,
      `https://api.cremesp.org.br/guia-medico/medico/${encodeURIComponent(id)}`,
      `https://api.cremesp.org.br/guia-medico/profissional/${encodeURIComponent(id)}`,
    ]);
    const postCandidates = [
      { url: "https://api.cremesp.org.br/guia-medico/detalhar", body: { crm: Number(crm) } },
      { url: "https://api.cremesp.org.br/guia-medico/detalhar", body: { crm } },
      ...Array.from(sequencias).flatMap((sequencia) => ([
        { url: "https://api.cremesp.org.br/guia-medico/detalhar", body: { sequencia: Number(sequencia) } },
        { url: "https://api.cremesp.org.br/guia-medico/detalhar", body: { sequencia } },
      ])),
    ];

    for (const url of getCandidates) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: browserLikeHeaders,
        });
        if (!response.ok) continue;
        const contentType = response.headers.get("content-type") ?? "";
        const body = contentType.includes("application/json") ? await response.json() : await response.text();
        out = mergeRegional(out, parseUnknownRegional(body));
      } catch {
        // continue
      }
    }

    for (const candidate of postCandidates) {
      try {
        const response = await fetch(candidate.url, {
          method: "POST",
          headers: {
            ...browserLikeHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(candidate.body),
        });
        if (!response.ok) continue;
        const contentType = response.headers.get("content-type") ?? "";
        const body = contentType.includes("application/json") ? await response.json() : await response.text();
        out = mergeRegional(out, parseUnknownRegional(body));
      } catch {
        // continue
      }
    }

    return out;
  } catch {
    return { rqeList: [], rqeDetails: [], fotoUrl: null, lattesUrl: null };
  }
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

    if (!crm) {
      return json({ error: "CRM inválido" }, 400);
    }

    const payload = [{
      useCaptchav2: false,
      captcha: "",
      medico: {
        nome: "",
        ufMedico: uf,
        crmMedico: crm,
        municipioMedico: "",
        tipoInscricaoMedico: "",
        situacaoMedico: "",
        detalheSituacaoMedico: "",
        especialidadeMedico: "",
        areaAtuacaoMedico: "",
      },
      page: 1,
      pageNumber: 1,
      pageSize: 10,
    }];

    const cfmResponse = await fetch("https://portal.cfm.org.br/api_rest_php/api/v2/medicos/buscar_medicos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://portal.cfm.org.br",
        "Referer": "https://portal.cfm.org.br/busca-medicos/",
      },
      body: JSON.stringify(payload),
    });

    if (!cfmResponse.ok) {
      return json({
        ok: false,
        found: false,
        error: `CFM indisponível no momento (${cfmResponse.status})`,
      });
    }

    const rawBody = await cfmResponse.text();
    let result: CfmApiResult | null = null;
    try {
      result = JSON.parse(rawBody) as CfmApiResult;
    } catch {
      return json({
        ok: false,
        found: false,
        error: "Resposta inválida do CFM no momento.",
      });
    }

    const rows = Array.isArray(result.dados) ? result.dados : [];
    const first = rows[0];

    if (!first) {
      return json({ ok: true, found: false });
    }

    const situacao = String(first.SITUACAO ?? "");
    const rqeSet = new Set<string>();
    for (const row of rows) {
      collectRqeValues(row, rqeSet);
    }
    collectRqeFromText(JSON.stringify(rows), rqeSet);
    const portalFallback = await fetchPortalFallback(
      (typeof first.NU_CRM === "string" ? first.NU_CRM : crm) ?? crm,
      (typeof first.SG_UF === "string" ? first.SG_UF : uf) ?? uf,
    );
    const regionalFallback = await fetchRegionalFallback(
      (typeof first.NU_CRM === "string" ? first.NU_CRM : crm) ?? crm,
      (typeof first.SG_UF === "string" ? first.SG_UF : uf) ?? uf,
    );
    const cremespFallback =
      (((typeof first.SG_UF === "string" ? first.SG_UF : uf) ?? uf).toUpperCase() === "SP")
        ? await fetchCremespFallback((typeof first.NU_CRM === "string" ? first.NU_CRM : crm) ?? crm)
        : { rqeList: [], rqeDetails: [], fotoUrl: null, lattesUrl: null };
    const detailFallbackTexts = await fetchDetailFallbackData(first, crm, uf);
    for (const text of detailFallbackTexts) {
      collectRqeFromText(text, rqeSet);
    }
    for (const item of portalFallback.rqeList) {
      const normalized = normalizeRqe(item);
      if (normalized) rqeSet.add(normalized);
    }
    for (const item of regionalFallback.rqeList) {
      const normalized = normalizeRqe(item);
      if (normalized) rqeSet.add(normalized);
    }
    for (const item of cremespFallback.rqeList) {
      const normalized = normalizeRqe(item);
      if (normalized) rqeSet.add(normalized);
    }
    const rqeList = Array.from(rqeSet);
    const rqeDetailsFromRows = collectRqeDetailsFromRows(rows);
    const rqeDetailsFromDetailsText = detailFallbackTexts.flatMap((text) => collectRqeSpecialtyFromText(text));
    const rqeDetailsFromPortalText = collectRqeSpecialtyFromText(JSON.stringify(rows));
    const mergedDetails = [
      ...rqeDetailsFromRows,
      ...rqeDetailsFromDetailsText,
      ...rqeDetailsFromPortalText,
      ...regionalFallback.rqeDetails,
      ...cremespFallback.rqeDetails,
    ];
    const detailMap = new Map<string, RqeDetail>();
    for (const item of mergedDetails) {
      const normalizedRqe = normalizeRqeToken(item.rqe ?? "");
      if (!normalizedRqe) continue;
      const key = `${normalizedRqe}::${item.especialidade ?? ""}`;
      if (!detailMap.has(key)) {
        detailMap.set(key, { rqe: normalizedRqe, especialidade: item.especialidade ?? null });
      }
    }
    const rqeDetails = Array.from(detailMap.values());
    const fotoUrl =
      findStringByKeyFragment(first, ["FOTO", "IMAGEM", "PHOTO"]) ??
      findStringByKeyFragment(rows, ["FOTO", "IMAGEM", "PHOTO"]) ??
      portalFallback.photoUrl ??
      regionalFallback.fotoUrl ??
      cremespFallback.fotoUrl;
    const lattesUrl =
      findStringByKeyFragment(first, ["LATTES", "CURRICULO", "CURRICULUM"]) ??
      findStringByKeyFragment(rows, ["LATTES", "CURRICULO", "CURRICULUM"]) ??
      portalFallback.lattesUrl ??
      regionalFallback.lattesUrl;

    const responsePayload: Record<string, unknown> = {
      ok: true,
      found: true,
      regular: /regular/i.test(situacao),
      doctor: {
        nome: typeof first.NM_MEDICO === "string" ? first.NM_MEDICO : null,
        crm:
          (typeof first.NU_CRM === "string" ? first.NU_CRM : null) ??
          (typeof first.NU_CRM_NATURAL === "string" ? first.NU_CRM_NATURAL : null) ??
          crm,
        uf: (typeof first.SG_UF === "string" ? first.SG_UF : null) ?? uf,
        situacao,
        tipoInscricao: typeof first.TIPO_INSCRICAO === "string" ? first.TIPO_INSCRICAO : null,
        dataInscricao: typeof first.DT_INSCRICAO === "string" ? first.DT_INSCRICAO : null,
        instituicaoGraduacao:
          typeof first.NM_INSTITUICAO_GRADUACAO === "string" ? first.NM_INSTITUICAO_GRADUACAO : null,
        anoGraduacao: typeof first.DT_GRADUACAO === "string" ? first.DT_GRADUACAO : null,
        rqeList,
        rqeDetails,
        fotoUrl,
        lattesUrl,
      },
    };

    if (debug) {
      const rowKeys = Array.from(
        new Set(
          rows.flatMap((row) => Object.keys(row).map((key) => key.toUpperCase())).filter((key) => key.length > 0),
        ),
      );
      const snippets = detailFallbackTexts
        .slice(0, 3)
        .map((text) => text.slice(0, 1200));
      responsePayload.debug = {
        rowKeys,
        fallbackCount: detailFallbackTexts.length,
        fallbackSnippets: snippets,
      };
    }

    return json(responsePayload);
  } catch (err) {
    return json({
      ok: false,
      found: false,
      error: "Erro inesperado",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});
