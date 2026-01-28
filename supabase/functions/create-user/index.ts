import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// HTML escape function to prevent XSS in email templates
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

// Encrypt plaintext using AES-GCM
async function encryptValue(plaintext: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Create admin client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verify the requesting user is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Get the requesting user
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !requestingUser) {
      throw new Error('Unauthorized')
    }

    const { 
      email, 
      password, 
      name, 
      tenantId, 
      role, 
      profileType,
      phone,
      cpf,
      crm,
      rqe,
      address,
      bankName,
      bankAgency,
      bankAccount,
      pixKey,
      sendInviteEmail
    } = await req.json()

    // Verify the requesting user is an admin of the tenant
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('memberships')
      .select('role')
      .eq('user_id', requestingUser.id)
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .single()

    if (membershipError || !membership || membership.role !== 'admin') {
      throw new Error('Only tenant admins can create users')
    }

    // Get tenant info for the email
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .single()

    // Create the new user using admin API
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        name
      }
    })

    if (createError) {
      throw createError
    }

    if (!newUser.user) {
      throw new Error('Failed to create user')
    }

    // Wait for the trigger to create the profile
    await new Promise(resolve => setTimeout(resolve, 500))

    // Update/upsert the profile with basic info and must_change_password flag
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: newUser.user.id,
        name,
        profile_type: profileType || 'plantonista',
        must_change_password: true // User must change password on first login
      })

    if (profileError) {
      console.error('Profile error:', profileError)
      // Don't throw, the user is created, profile can be updated later
    }

    // Create membership FIRST so profiles_private can reference it
    const { error: membershipInsertError } = await supabaseAdmin
      .from('memberships')
      .insert({
        tenant_id: tenantId,
        user_id: newUser.user.id,
        role: role || 'user',
        active: true,
        created_by: requestingUser.id
      })

    if (membershipInsertError) {
      throw membershipInsertError
    }

    // Save private profile data with encryption (only encrypted columns exist)
    const encryptionKey = Deno.env.get('PII_ENCRYPTION_KEY')
    const privatePayload: Record<string, unknown> = {
      user_id: newUser.user.id,
      tenant_id: tenantId, // Explicitly set tenant_id
    }

    if (encryptionKey) {
      try {
        const cryptoKey = await deriveKey(encryptionKey)
        
        const fieldsToEncrypt = [
          { key: 'phone', value: phone },
          { key: 'cpf', value: cpf },
          { key: 'crm', value: crm },
          { key: 'rqe', value: rqe },
          { key: 'address', value: address },
          { key: 'bank_name', value: bankName },
          { key: 'bank_agency', value: bankAgency },
          { key: 'bank_account', value: bankAccount },
          { key: 'pix_key', value: pixKey },
        ]

        for (const { key, value } of fieldsToEncrypt) {
          if (value) {
            privatePayload[`${key}_enc`] = await encryptValue(value, cryptoKey)
          } else {
            privatePayload[`${key}_enc`] = null
          }
        }
      } catch (err) {
        console.error('Encryption error:', err)
        throw new Error('Failed to encrypt PII data. PII_ENCRYPTION_KEY is required.')
      }
    } else {
      throw new Error('PII_ENCRYPTION_KEY is not configured. Cannot create user without encryption.')
    }

    const { error: privateProfileError } = await supabaseAdmin
      .from('profiles_private')
      .upsert(privatePayload)

    if (privateProfileError) {
      console.error('Private profile error:', privateProfileError)
      // Don't throw, the user is created, profile can be updated later
    }

    // Also add the role to user_roles table
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .upsert({
        user_id: newUser.user.id,
        role: role || 'user'
      })

    if (roleError) {
      console.error('Role error:', roleError)
      // Don't throw, main user creation succeeded
    }

    // Send invite email if requested and we have a real email
    let emailSent = false
    let emailError: string | null = null
    if (sendInviteEmail && email && !email.includes('@interno.hospital')) {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")
      if (!RESEND_API_KEY) {
        emailError = 'RESEND_API_KEY não configurada'
        console.warn('RESEND_API_KEY not configured, skipping email')
      } else {
        try {
          const loginUrl = `${req.headers.get('origin') || 'https://app.medescala.com'}/auth`
          
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
                
                <p>Você foi cadastrado no sistema de escalas do <strong>${escapeHtml(tenant?.name || 'Hospital')}</strong>.</p>
                
                <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                  <h3 style="margin-top: 0; color: #374151;">Seus dados de acesso:</h3>
                  <p style="margin: 10px 0;"><strong>Email:</strong> ${escapeHtml(email)}</p>
                  <p style="margin: 10px 0;"><strong>Senha provisória:</strong> <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${escapeHtml(password)}</code></p>
                </div>
                
                <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0; color: #92400e;">
                    <strong>⚠️ Importante:</strong> Por segurança, você deverá alterar sua senha no primeiro acesso.
                  </p>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${escapeHtml(loginUrl)}" style="display: inline-block; background: #059669; color: white; text-decoration: none; padding: 14px 30px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                    Acessar o Sistema
                  </a>
                </div>
                
                <p style="color: #6b7280; font-size: 14px;">
                  Se você não reconhece este email, por favor ignore-o.
                </p>
              </div>
              
              <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
                <p>© ${new Date().getFullYear()} MedEscala. Todos os direitos reservados.</p>
              </div>
            </body>
            </html>
          `

          const emailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "MedEscala <onboarding@resend.dev>",
              to: [email],
              subject: `Bem-vindo ao ${escapeHtml(tenant?.name || 'Hospital')} - MedEscala`,
              html: htmlContent,
            }),
          })

          if (emailResponse.ok) {
            emailSent = true
            console.log('Invite email sent successfully')
          } else {
            const errorData = await emailResponse.json()
            console.error('Failed to send invite email:', errorData)
            // Common Resend sandbox error: can only send to verified emails
            if (errorData?.message?.includes('verify a domain') || errorData?.statusCode === 403) {
              emailError = 'Domínio de email não verificado. Configure um domínio no Resend para enviar para qualquer email.'
            } else {
              emailError = errorData?.message || 'Falha ao enviar email'
            }
          }
        } catch (err) {
          console.error('Error sending invite email:', err)
          emailError = err instanceof Error ? err.message : 'Erro ao enviar email'
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: newUser.user.id,
        email: newUser.user.email,
        emailSent,
        emailError
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error: unknown) {
    console.error('Error creating user:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to create user'
    return new Response(
      JSON.stringify({ 
        error: errorMessage
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})
