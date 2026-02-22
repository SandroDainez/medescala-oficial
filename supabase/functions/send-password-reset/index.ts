import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PasswordResetRequest {
  email: string;
  redirectUrl: string;
}

function normalizeRedirectUrl(input: string | undefined): string {
  const fallback = 'https://medescala.vercel.app/reset-password';
  if (!input) return fallback;

  try {
    const url = new URL(input);
    // Capacitor/local origins are not reachable from an email client.
    if (url.protocol === 'capacitor:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return fallback;
    }

    // Force path to reset-password for safety/consistency
    return `${url.origin}/reset-password`;
  } catch {
    return fallback;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("send-password-reset function called");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, redirectUrl }: PasswordResetRequest = await req.json();

    if (!email) {
      throw new Error("Email é obrigatório");
    }

    console.log(`Processing password reset for: ${email}`);
    const safeRedirectUrl = normalizeRedirectUrl(redirectUrl);
    console.log(`Redirect URL (raw): ${redirectUrl}`);
    console.log(`Redirect URL (safe): ${safeRedirectUrl}`);

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if user exists
    const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
    
    if (userError) {
      console.error("Error listing users:", userError);
      throw new Error("Erro ao verificar usuário");
    }

    const user = userData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      console.log("User not found, returning success anyway for security");
      // Return success even if user doesn't exist (security best practice)
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`User found: ${user.id}`);

    // Generate password reset link using admin API
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: safeRedirectUrl,
      },
    });

    if (linkError) {
      console.error("Error generating reset link:", linkError);
      throw new Error("Erro ao gerar link de recuperação");
    }

    console.log("Reset link generated successfully");

    // Get the action link from the response
    const resetLink = linkData.properties?.action_link;
    
    if (!resetLink) {
      console.error("No action link in response:", linkData);
      throw new Error("Link de recuperação não gerado");
    }

    console.log("Sending email via Resend...");

    // Send email using Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      throw new Error("Serviço de email não configurado");
    }

    const subject = "🔐 Recuperação de Senha - MedEscala";
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperação de Senha</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #14b8a6 100%); padding: 30px 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">
                🏥 MedEscala
              </h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">
                Gestão de Escalas Médicas
              </p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #f1f5f9; margin: 0 0 20px 0; font-size: 22px;">
                Recuperação de Senha
              </h2>
              
              <p style="color: #94a3b8; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                Olá! Recebemos uma solicitação para redefinir a senha da sua conta no MedEscala.
              </p>
              
              <p style="color: #94a3b8; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Clique no botão abaixo para criar uma nova senha:
              </p>
              
              <!-- Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 10px 0 30px 0;">
                    <a href="${resetLink}" 
                       style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #14b8a6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.4);">
                      🔑 Redefinir Minha Senha
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Alternative Link -->
              <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin: 0 0 15px 0;">
                Se o botão não funcionar, copie e cole este link no seu navegador:
              </p>
              <p style="color: #10b981; font-size: 12px; word-break: break-all; background-color: #0f172a; padding: 12px; border-radius: 8px; margin: 0 0 30px 0;">
                ${resetLink}
              </p>
              
              <!-- Warning -->
              <div style="background-color: rgba(251, 191, 36, 0.1); border-left: 4px solid #fbbf24; padding: 15px; border-radius: 0 8px 8px 0; margin: 0 0 20px 0;">
                <p style="color: #fbbf24; font-size: 14px; margin: 0; font-weight: 500;">
                  ⚠️ Este link expira em 1 hora
                </p>
                <p style="color: #94a3b8; font-size: 13px; margin: 8px 0 0 0;">
                  Se você não solicitou esta recuperação, ignore este email.
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #0f172a; padding: 25px 40px; text-align: center; border-top: 1px solid #334155;">
              <p style="color: #64748b; font-size: 12px; margin: 0;">
                © 2024 MedEscala. Todos os direitos reservados.
              </p>
              <p style="color: #475569; font-size: 11px; margin: 10px 0 0 0;">
                Este é um email automático, não responda.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `;

    // Remetente fixo — sem fallback para resend.dev
    const fromAddress = "MedEscala <noreply@medescalas.com.br>";
    console.log(`[send-password-reset] Enviando email com from="${fromAddress}" para "${email}"`);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [email],
        subject,
        html,
      }),
    });

    const emailResult = await emailResponse.json().catch(() => ({}));

    if (!emailResponse.ok) {
      console.error("[send-password-reset] Resend API error:", emailResponse.status, emailResult);
      throw new Error((emailResult as any)?.message || "Erro ao enviar email");
    }

    console.log("[send-password-reset] Email enviado com sucesso:", emailResult);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in password reset function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
