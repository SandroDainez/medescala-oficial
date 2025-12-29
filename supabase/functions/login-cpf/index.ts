import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    console.log(`Login attempt with CPF: ${formattedCpf.substring(0, 3)}***`);

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

    // Get encryption key
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

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ error: "CPF não encontrado" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find matching CPF by decrypting each one
    let matchedUserId: string | null = null;

    for (const profile of profiles) {
      if (profile.cpf_enc) {
        try {
          const decryptedCpf = await decryptValue(profile.cpf_enc, cryptoKey);
          const formattedDecryptedCpf = formatCpf(decryptedCpf);
          
          if (formattedDecryptedCpf === formattedCpf) {
            matchedUserId = profile.user_id;
            break;
          }
        } catch (err) {
          console.error("Error decrypting CPF:", err);
          continue;
        }
      }
    }

    if (!matchedUserId) {
      console.log("CPF not found in any profile");
      return new Response(
        JSON.stringify({ error: "CPF não encontrado" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`CPF matched to user: ${matchedUserId}`);

    // Get user email from auth.users
    const { data: authUser, error: userError } = await supabaseAdmin.auth.admin.getUserById(matchedUserId);

    if (userError || !authUser?.user?.email) {
      console.error("Error fetching user:", userError);
      return new Response(
        JSON.stringify({ error: "Usuário não encontrado" }),
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
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
