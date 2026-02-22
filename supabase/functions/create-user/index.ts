import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getProjectRef(url: string) {
  // https://ppjtcwdbeuhljmfdcxhq.supabase.co -> ppjtcwdbeuhljmfdcxhq
  try {
    const host = new URL(url).host;
    return host.split(".")[0];
  } catch {
    return "unknown";
  }
}

Deno.serve(async (req) => {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing env",
          details: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const projectRef = getProjectRef(SUPABASE_URL);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { userId, name } = await req.json();

    if (!userId || !String(userId).trim()) {
      return new Response(
        JSON.stringify({ ok: false, error: "userId obrigatório", projectRef }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const cleanName = String(name ?? "").trim();
    if (!cleanName) {
      return new Response(
        JSON.stringify({ ok: false, error: "name obrigatório", projectRef }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ✅ UPDATE com contagem exata e retorno do registro
    const { data, error, count } = await admin
      .from("profiles")
      .update({ name: cleanName }, { count: "exact" })
      .eq("id", userId)
      .select("id, name, updated_at")
      .maybeSingle();

    if (error) {
      return new Response(
        JSON.stringify({ ok: false, error: error.message, projectRef }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!count || count < 1 || !data) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Nenhuma linha foi atualizada (id não encontrado?)",
          projectRef,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, profile: data, projectRef }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});