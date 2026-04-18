import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

type LookupResponse = {
  ok: boolean;
  found: boolean;
  regular?: boolean;
  sourceUsed: string;
  consultedAt: string;
  verificationStatus?: "verified" | "partial" | "pending_manual";
  error?: string;
  doctor?: {
    nome?: string | null;
    crm?: string | null;
    uf?: string | null;
    situacao?: string | null;
    tipoInscricao?: string | null;
    rqeList?: string[];
    rqeDetails?: Array<{ rqe: string; especialidade?: string | null }>;
    fotoUrl?: string | null;
    lattesUrl?: string | null;
  };
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
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

function deriveStatus(found: boolean, regular: boolean | undefined): "verified" | "partial" | "pending_manual" {
  if (!found) return "pending_manual";
  if (regular === true) return "verified";
  return "partial";
}

async function getExecutablePath(): Promise<string> {
  const vercelPath = await chromium.executablePath();
  if (vercelPath) return vercelPath;

  if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }

  const envPath = process.env.CHROME_EXECUTABLE_PATH || process.env.GOOGLE_CHROME_BIN;
  if (envPath) return envPath;

  throw new Error("Chrome executable not available");
}

async function performLookup(crm: string): Promise<LookupResponse> {
  const executablePath = await getExecutablePath();
  const isLocalMac = process.platform === "darwin" && executablePath.includes("Google Chrome.app");

  const browser = await puppeteer.launch({
    executablePath,
    headless: isLocalMac ? true : "shell",
    args: isLocalMac ? ["--no-sandbox"] : chromium.args,
    defaultViewport: chromium.defaultViewport,
  });

  try {
    const page = await browser.newPage();
    await page.goto("https://guiamedico.cremesp.org.br/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForSelector('input[name="crm"]', { timeout: 15000 });
    await page.evaluate((crmValue) => {
      const input = document.querySelector('input[name="crm"]') as HTMLInputElement | null;
      if (!input) return;
      input.focus();
      input.value = crmValue;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, crm);

    const response = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("https://api.cremesp.org.br/guia-medico/filtrar") &&
          res.request().method() === "POST",
        { timeout: 30000 },
      ),
      page.click("button.btn-crm"),
    ]).then(([res]) => res);

    const body = await response.json() as Record<string, unknown>;
    const content = Array.isArray(body?.content) ? body.content : [];
    const first = (content[0] ?? {}) as Record<string, unknown>;

    const found = content.length > 0;
    const situacao = typeof first?.situacao === "string" ? first.situacao : null;
    const regular = situacao === "A";
    const crmResolved =
      typeof first?.crm === "number" || typeof first?.crm === "string"
        ? String(first.crm)
        : crm;
    const nome = typeof first?.nome === "string" ? first.nome : null;
    const tipoInscricao = typeof first?.tipoInscricao === "string" ? first.tipoInscricao : null;

    return {
      ok: true,
      found,
      regular,
      sourceUsed: "cremesp-browser",
      consultedAt: new Date().toISOString(),
      verificationStatus: deriveStatus(found, regular),
      doctor: {
        nome,
        crm: crmResolved,
        uf: "SP",
        situacao: regular ? "Ativo" : situacao,
        tipoInscricao,
        rqeList: [],
        rqeDetails: [],
        fotoUrl: null,
        lattesUrl: null,
      },
    };
  } finally {
    await browser.close();
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const crm = normalizeCrm(body?.crm);
    const uf = normalizeUf(body?.uf);

    if (!crm || uf !== "SP") {
      return json({
        ok: false,
        found: false,
        sourceUsed: "cremesp-browser",
        consultedAt: new Date().toISOString(),
        error: "crm válido e uf=SP são obrigatórios",
      }, 400);
    }

    const result = await performLookup(crm);
    return json(result);
  } catch (error) {
    return json({
      ok: false,
      found: false,
      sourceUsed: "cremesp-browser",
      consultedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
}
