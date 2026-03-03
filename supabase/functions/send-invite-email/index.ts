import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function escapeHtml(text: string): string {
  if (!text) return '';
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char] || char);
}

interface InviteEmailRequest {
  name: string;
  email: string;
  hospitalName: string;
  loginUrl?: string;
  redirectUrl?: string;
  tenantId: string;
  sendEmail?: boolean;
}

function normalizeRedirectUrl(_input: string | undefined, _loginUrl: string): string {
  // Force canonical production reset route to avoid stale preview domains in invites.
  return "https://app.medescalas.com.br/reset-password";
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { name, email, hospitalName, redirectUrl, tenantId, sendEmail = true }: InviteEmailRequest = await req.json();
    const loginUrl = "https://app.medescalas.com.br/auth";

    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId é obrigatório' }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured");
    }

    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: missing token' }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : authHeader;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user: requester },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !requester) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('memberships')
      .select('role, active')
      .eq('tenant_id', tenantId)
      .eq('user_id', requester.id)
      .eq('active', true)
      .maybeSingle();

    if (membershipError) {
      throw new Error(`Erro ao validar permissões: ${membershipError.message}`);
    }

    if (!membership || !['admin', 'owner'].includes(membership.role)) {
      return new Response(
        JSON.stringify({ error: 'Apenas administradores do hospital/serviço podem enviar convites' }),
        {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const safeRedirectUrl = normalizeRedirectUrl(redirectUrl, loginUrl);
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: safeRedirectUrl },
    });
    if (linkError) {
      throw new Error(`Erro ao gerar link de definição de senha: ${linkError.message}`);
    }
    const rawActionLink = (linkData.properties as any)?.action_link as string | undefined;
    const tokenHash = (linkData.properties as any)?.hashed_token as string | undefined;
    // Use token_hash link as primary to avoid stale redirect_to values from action_link.
    // ResetPassword page handles token_hash via verifyOtp.
    const resetLink = tokenHash
      ? `${safeRedirectUrl}?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`
      : (rawActionLink || safeRedirectUrl);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">MedEscala</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Sistema de Gestão de Escalas</p>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
          <h2 style="color: #059669; margin-top: 0;">Olá, ${escapeHtml(name)}!</h2>
          
          <p>Você foi cadastrado no sistema de escalas do <strong>${escapeHtml(hospitalName)}</strong>.</p>
          
          <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #374151;">Seus dados de acesso:</h3>
            <p style="margin: 10px 0;"><strong>Email:</strong> ${escapeHtml(email)}</p>
            <p style="margin: 10px 0;">Para seu primeiro acesso, defina sua senha clicando no botão abaixo.</p>
            <p style="margin: 10px 0;">Depois de salvar a senha, você será direcionado para a tela de login.</p>
          </div>
          
          <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e;">
              <strong>⚠️ Importante:</strong> Por segurança, altere sua senha no primeiro acesso.
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${escapeHtml(resetLink)}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 14px 30px; border-radius: 8px; font-weight: bold; font-size: 16px;">
              Definir senha
            </a>
          </div>
          <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 13px;">
            Se o botão não abrir, copie e cole este link no navegador:<br />
            <a href="${escapeHtml(resetLink)}">${escapeHtml(resetLink)}</a>
          </p>
          
          <p style="color: #6b7280; font-size: 14px;">
            Se você não reconhece este email, por favor ignore-o.
          </p>
        </div>
        
        <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
          <p>© ${new Date().getFullYear()} MedEscala. Todos os direitos reservados.</p>
        </div>
      </body>
      </html>
    `;

    if (!sendEmail) {
      return new Response(JSON.stringify({ success: true, resetLink, emailSent: false }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const fromAddress = "MedEscala <noreply@medescalas.com.br>";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [email],
        subject: `Bem-vindo ao ${escapeHtml(hospitalName)} - MedEscala`,
        html: htmlContent,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to send email");
    }

    return new Response(JSON.stringify({ success: true, data, resetLink, emailSent: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
