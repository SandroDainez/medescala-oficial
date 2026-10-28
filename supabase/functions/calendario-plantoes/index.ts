// Escala do médico servida como calendário assinável.
//
// O celular consulta este endereço sozinho, sem sessão e sem poder fazer
// login: o token na URL é a credencial. Por isso aqui só existe leitura, só
// dos plantões daquele médico, e nada além do que ele já vê no app.
//
// O arquivo é montado por src/lib/calendarExport.ts — o MESMO gerador usado no
// app, importado de propósito em vez de copiado. Duas cópias divergem, e um
// plantão noturno quebrado num lado e certo no outro é impossível de perceber.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateICSFile } from "../../../src/lib/calendarExport.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Hoje em Brasília. `shift_date` é uma data pura: usar UTC descartaria o
 *  plantão de hoje durante toda a madrugada. */
function hojeEmBrasilia(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function textoSimples(mensagem: string, status: number): Response {
  return new Response(mensagem, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return textoSimples("Method not allowed", 405);
  }

  const url = new URL(req.url);
  const chave = (url.searchParams.get("chave") ?? "").trim();

  if (chave.length < 32) {
    return textoSimples("Endereço de calendário inválido.", 404);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: feed, error: feedError } = await supabase
    .from("calendar_feed_tokens")
    .select("user_id")
    .eq("token", chave)
    .maybeSingle();

  // Endereço revogado ou inexistente respondem igual: não há o que distinguir
  // para quem está tentando adivinhar.
  if (feedError || !feed?.user_id) {
    return textoSimples("Endereço de calendário inválido.", 404);
  }

  const { data: assignments, error } = await supabase
    .from("shift_assignments")
    .select(`
      id,
      status,
      shifts!inner (
        id,
        title,
        hospital,
        shift_date,
        start_time,
        end_time,
        location,
        sectors (name)
      )
    `)
    .eq("user_id", feed.user_id)
    .neq("status", "cancelled")
    .gte("shifts.shift_date", hojeEmBrasilia())
    .order("id");

  if (error) {
    console.error("[calendario-plantoes] Erro ao buscar plantões:", error);
    return textoSimples("Não foi possível montar o calendário agora.", 500);
  }

  const plantoes = (assignments ?? []).map((a: any) => ({
    id: a.shifts.id,
    title: a.shifts.title,
    hospital: a.shifts.hospital,
    location: a.shifts.location,
    shift_date: a.shifts.shift_date,
    start_time: a.shifts.start_time,
    end_time: a.shifts.end_time,
    sector_name: a.shifts.sectors?.name,
  }));

  const ics = generateICSFile(plantoes, "Meus Plantões - MedEscala");

  // Sem bloquear a resposta: saber da última consulta é diagnóstico, não parte
  // do serviço, e o celular não deve esperar por isso.
  supabase
    .from("calendar_feed_tokens")
    .update({ last_accessed_at: new Date().toISOString() })
    .eq("token", chave)
    .then(() => {}, () => {});

  return new Response(req.method === "HEAD" ? null : ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="meus-plantoes.ics"',
      // O aparelho reconsulta de hora em hora; a escala muda o dia inteiro.
      "Cache-Control": "public, max-age=3600",
      ...corsHeaders,
    },
  });
});
