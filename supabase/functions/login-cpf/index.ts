import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limit config
const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

// Format CPF to digits only
function formatCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

// Derive a CryptoKey from the encryption key string
async function deriveKey(keyString: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(keyString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyData);
  
  return await crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

// Decrypt ciphertext using AES-GCM
async function decryptValue(ciphertext: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// Add random delay (100-300 ms) to mitigate timing attack
async function randomDelay(): Promise<void> {
  const delay = 100 + Math.random() * 200;
  return new Promise(resolve => setTimeout(resolve, delay));
}

interface LoginCpfRequest {
  cpf: string;
  password: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("login-cpf function called");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cpf, password }: LoginCpfRequest = await req.json();

    if (!cpf || !password) {
      return new Response(
        JSON.stringify({ error: "CPF e senha são obrigatórios" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const formattedCpf = formatCpf(cpf);
    const rateLimitKey = `cpf:${formattedCpf.substring(0, 6)}`; // Partial key to avoid storing full CPF
    console.log(`Login attempt with CPF partial key: ${rateLimitKey}`);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Rate Limiting (using service role - table has RLS USING false)
    // ─────────────────────────────────────────────────────────────────────────
    const now = new Date();
    const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000);

    const { data: rateLimitRow } = await supabaseAdmin
      .from("login_cpf_rate_limits")
      .select("attempts, first_attempt_at")
      .eq("key", rateLimitKey)
      .maybeSingle();

    if (rateLimitRow) {
      const firstAttempt = new Date(rateLimitRow.first_attempt_at);
      if (firstAttempt > windowStart) {
        // Still within window
        if (rateLimitRow.attempts >= MAX_ATTEMPTS) {
          console.warn(`Rate limit exceeded for ${rateLimitKey}`);
          await randomDelay();
          return new Response(
            JSON.stringify({ error: "Muitas tentativas. Tente novamente em 15 minutos." }),
            { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        // Increment attempts
        await supabaseAdmin
          .from("login_cpf_rate_limits")
          .update({ attempts: rateLimitRow.attempts + 1, last_attempt_at: now.toISOString() })
          .eq("key", rateLimitKey);
      } else {
        // Window expired, reset
        await supabaseAdmin
          .from("login_cpf_rate_limits")
          .update({ attempts: 1, first_attempt_at: now.toISOString(), last_attempt_at: now.toISOString() })
          .eq("key", rateLimitKey);
      }
    } else {
      // First attempt
      await supabaseAdmin
        .from("login_cpf_rate_limits")
        .insert({ key: rateLimitKey, attempts: 1, first_attempt_at: now.toISOString(), last_attempt_at: now.toISOString() });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CPF lookup
    // ─────────────────────────────────────────────────────────────────────────
    const encryptionKey = Deno.env.get("PII_ENCRYPTION_KEY");
    if (!encryptionKey) {
      throw new Error("PII_ENCRYPTION_KEY not configured");
    }

    const cryptoKey = await deriveKey(encryptionKey);

    // Fetch all encrypted CPFs from profiles_private
    const { data: profiles, error: fetchError } = await supabaseAdmin
      .from("profiles_private")
      .select("user_id, cpf_enc")
      .not("cpf_enc", "is", null);

    if (fetchError) {
      console.error("Error fetching profiles:", fetchError);
      throw new Error("Erro ao buscar dados");
    }

    // Always iterate all rows (constant-time pattern to mitigate timing attacks)
    let matchedUserId: string | null = null;

    for (const profile of profiles ?? []) {
      if (profile.cpf_enc) {
        try {
          const decryptedCpf = await decryptValue(profile.cpf_enc as unknown as string, cryptoKey);
          const formattedDecryptedCpf = formatCpf(decryptedCpf);
          
          if (formattedDecryptedCpf === formattedCpf) {
            matchedUserId = profile.user_id;
            // Continue iterating to ensure constant time
          }
        } catch (err) {
          console.error("Error decrypting CPF:", err);
        }
      }
    }

    await randomDelay(); // Additional delay before returning result

    if (!matchedUserId) {
      console.log("CPF not found in any profile");
      return new Response(
        JSON.stringify({ error: "CPF ou senha incorretos" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`CPF matched to user: ${matchedUserId}`);

    // Get user email from auth.users
    const { data: authUser, error: userError } = await supabaseAdmin.auth.admin.getUserById(matchedUserId);

    if (userError || !authUser?.user?.email) {
      console.error("Error fetching user:", userError);
      return new Response(
        JSON.stringify({ error: "CPF ou senha incorretos" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Attempt to sign in with email and password
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: authUser.user.email,
      password: password,
    });

    if (signInError) {
      console.error("Sign in error:", signInError.message);
      return new Response(
        JSON.stringify({ error: "CPF ou senha incorretos" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Success - reset rate limit
    // ─────────────────────────────────────────────────────────────────────────
    await supabaseAdmin
      .from("login_cpf_rate_limits")
      .delete()
      .eq("key", rateLimitKey);

    console.log("Login successful via CPF");

    return new Response(
      JSON.stringify({ 
        success: true,
        session: signInData.session,
        user: signInData.user
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Erro no login";
    console.error("login-cpf error:", errorMessage);
    
    await randomDelay();
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
