import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  console.log("update-user function called");

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
      userId,
      tenantId,
      // Profile fields
      name,
      profileType,
      // Auth fields
      email,
      sendInviteEmail,
      resetPassword,
      // Private profile fields
      phone,
      cpf,
      crm,
      rqe,
      address,
      bankName,
      bankAgency,
      bankAccount,
      pixKey,
    } = await req.json()

    console.log(`Updating user ${userId} in tenant ${tenantId}`);

    // Verify the requesting user is an admin of the tenant
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('memberships')
      .select('role')
      .eq('user_id', requestingUser.id)
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .single()

    if (membershipError || !membership || membership.role !== 'admin') {
      throw new Error('Only tenant admins can update users')
    }

    // Verify the target user belongs to this tenant
    const { data: targetMembership, error: targetError } = await supabaseAdmin
      .from('memberships')
      .select('id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .single()

    if (targetError || !targetMembership) {
      throw new Error('User not found in this tenant')
    }

    // Update profile fields (server-side) to avoid client RLS issues
    let profileUpdated = false
    if (typeof name === 'string' || typeof profileType === 'string') {
      const payload: Record<string, unknown> = {}
      if (typeof name === 'string') payload.name = name
      if (typeof profileType === 'string') payload.profile_type = profileType

      const { error: updateProfileError } = await supabaseAdmin
        .from('profiles')
        .update(payload)
        .eq('id', userId)

      if (updateProfileError) {
        console.error('Error updating profile:', updateProfileError)
        throw new Error(`Erro ao atualizar perfil: ${updateProfileError.message}`)
      }

      profileUpdated = true
    }

    // Update private profile fields (encrypted PII data)
    const hasPrivateFields = phone !== undefined || cpf !== undefined || crm !== undefined || 
                             rqe !== undefined || address !== undefined || bankName !== undefined || 
                             bankAgency !== undefined || bankAccount !== undefined || pixKey !== undefined;
    
    let privateProfileUpdated = false
    if (hasPrivateFields) {
      const encryptionKey = Deno.env.get('PII_ENCRYPTION_KEY')
      
      if (!encryptionKey) {
        console.error('PII_ENCRYPTION_KEY not configured')
        throw new Error('Configuração de criptografia não encontrada')
      }

      try {
        const cryptoKey = await deriveKey(encryptionKey)
        const privatePayload: Record<string, unknown> = {}
        
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
          // Only include fields that were explicitly sent (not undefined)
          if (value !== undefined) {
             if (value) {
               const encryptedB64 = await encryptValue(value, cryptoKey)
               const encryptedBytes = base64ToBytes(encryptedB64)
               const hex = bytesToHex(encryptedBytes)
               // profiles_private.*_enc are bytea
               privatePayload[`${key}_enc`] = `\\x${hex}`
             } else {
               privatePayload[`${key}_enc`] = null
             }
          }
        }

        // Only update if there are fields to update
        if (Object.keys(privatePayload).length > 0) {
          // Check if private profile exists
          const { data: existingPrivate } = await supabaseAdmin
            .from('profiles_private')
            .select('user_id')
            .eq('user_id', userId)
            .maybeSingle()

          if (existingPrivate) {
            // Update existing record
            const { error: updatePrivateError } = await supabaseAdmin
              .from('profiles_private')
              .update(privatePayload)
              .eq('user_id', userId)

            if (updatePrivateError) {
              console.error('Error updating private profile:', updatePrivateError)
              throw new Error(`Erro ao atualizar dados privados: ${updatePrivateError.message}`)
            }
          } else {
            // Insert new record with tenant_id
            const { error: insertPrivateError } = await supabaseAdmin
              .from('profiles_private')
              .insert({
                user_id: userId,
                tenant_id: tenantId,
                ...privatePayload
              })

            if (insertPrivateError) {
              console.error('Error inserting private profile:', insertPrivateError)
              throw new Error(`Erro ao criar dados privados: ${insertPrivateError.message}`)
            }
          }

          privateProfileUpdated = true
          console.log('Private profile updated successfully')
        }
      } catch (err) {
        console.error('Encryption/update error:', err)
        if (err instanceof Error && err.message.startsWith('Erro ao')) {
          throw err
        }
        throw new Error('Erro ao processar dados criptografados')
      }
    }

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .single()

    // Get user profile for name (after potential update)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('name')
      .eq('id', userId)
      .single()

    let emailUpdated = false
    let passwordReset = false
    let emailSent = false
    let emailSendError: string | null = null
    let newPassword = ''

    // Update email if provided and different
    const nextEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

    if (nextEmail) {
      if (nextEmail.length > 255) {
        throw new Error('Email muito longo')
      }

      // Get current user email
      const { data: { user: targetUser } } = await supabaseAdmin.auth.admin.getUserById(userId)

      console.log(`Email received for update: ${nextEmail}`)
      console.log(`Current auth email: ${targetUser?.email ?? '(none)'}`)

      if (targetUser && targetUser.email !== nextEmail) {
        console.log(`Updating email from ${targetUser.email} to ${nextEmail}`)

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          email: nextEmail,
          email_confirm: true,
        })

        if (updateError) {
          console.error('Error updating email:', updateError)
          throw new Error(`Erro ao atualizar email: ${updateError.message}`)
        }

        emailUpdated = true
      } else {
        console.log('Email not changed (same as current)')
      }
    } else {
      console.log('No email provided for update')
    }
    // Reset password if requested
    if (resetPassword) {
      // Generate new password
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
      newPassword = '';
      for (let i = 0; i < 12; i++) {
        newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: newPassword
      })

      if (passwordError) {
        console.error('Error resetting password:', passwordError);
        throw new Error(`Erro ao resetar senha: ${passwordError.message}`)
      }

      // Set must_change_password flag
      await supabaseAdmin
        .from('profiles')
        .update({ must_change_password: true })
        .eq('id', userId)

      passwordReset = true
    }

    // Send invite email if requested
    if (sendInviteEmail && email && !email.includes('@interno.hospital')) {
      try {
        const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")
        if (RESEND_API_KEY) {
          const loginUrl = `${req.headers.get('origin') || 'https://app.medescala.com'}/auth`
          const userName = profile?.name || 'Usuário'
          const hospitalName = tenant?.name || 'Hospital'
          
          let htmlContent = ''
          
          if (passwordReset && newPassword) {
            // Email with new password
            htmlContent = `
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
                  <h2 style="color: #059669; margin-top: 0;">Olá, ${escapeHtml(userName)}!</h2>
                  
                  <p>Sua senha foi resetada no sistema de escalas do <strong>${escapeHtml(hospitalName)}</strong>.</p>
                  
                  <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #374151;">Seus novos dados de acesso:</h3>
                    <p style="margin: 10px 0;"><strong>Email:</strong> ${escapeHtml(email)}</p>
                    <p style="margin: 10px 0;"><strong>Nova senha:</strong> <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${escapeHtml(newPassword)}</code></p>
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
                </div>
                
                <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
                  <p>© ${new Date().getFullYear()} MedEscala. Todos os direitos reservados.</p>
                </div>
              </body>
              </html>
            `
          } else {
            // Simple notification email
            htmlContent = `
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
                  <h2 style="color: #059669; margin-top: 0;">Olá, ${escapeHtml(userName)}!</h2>
                  
                  <p>Seus dados foram atualizados no sistema de escalas do <strong>${escapeHtml(hospitalName)}</strong>.</p>
                  
                  <p>Seu email de acesso agora é: <strong>${escapeHtml(email)}</strong></p>
                  
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${escapeHtml(loginUrl)}" style="display: inline-block; background: #059669; color: white; text-decoration: none; padding: 14px 30px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                      Acessar o Sistema
                    </a>
                  </div>
                </div>
                
                <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
                  <p>© ${new Date().getFullYear()} MedEscala. Todos os direitos reservados.</p>
                </div>
              </body>
              </html>
            `
          }

          // Remetente fixo — sem fallback para resend.dev
          const fromAddress = "MedEscala <noreply@medescalas.com.br>";
          const toAddress = email;
          const emailSubject = passwordReset 
            ? `Sua senha foi resetada - ${escapeHtml(hospitalName)}`
            : `Seus dados foram atualizados - ${escapeHtml(hospitalName)}`;
          
          console.log(`[update-user] Enviando email:`);
          console.log(`[update-user]   from: ${fromAddress}`);
          console.log(`[update-user]   to: ${toAddress}`);
          console.log(`[update-user]   subject: ${emailSubject}`);

          const emailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: fromAddress,
              to: [toAddress],
              subject: emailSubject,
              html: htmlContent,
            }),
          })

          const responseData = await emailResponse.json().catch(() => ({}));
          const resendId = responseData?.id || responseData?.data?.id || 'N/A';
          
          console.log(`[update-user] Resend response status: ${emailResponse.status}`);
          console.log(`[update-user] Resend response id: ${resendId}`);

          if (emailResponse.ok) {
            emailSent = true
            console.log(`[update-user] Email enviado com sucesso! ID: ${resendId}`)
          } else {
            console.error(`[update-user] Resend API error:`, responseData)
            emailSendError = (responseData as any)?.message
              ? String((responseData as any).message)
              : JSON.stringify(responseData)
          }
        } else {
          console.warn('[update-user] RESEND_API_KEY not configured')
          emailSendError = 'RESEND_API_KEY not configured'
        }
      } catch (emailError) {
        console.error('[update-user] Error sending email:', emailError)
        emailSendError = emailError instanceof Error ? emailError.message : 'Unknown email error'
        // Don't throw, update succeeded
      }
    }

      // Return the current auth email as source-of-truth
      let currentAuthEmail: string | null = null
      try {
        const { data: { user: refreshedUser } } = await supabaseAdmin.auth.admin.getUserById(userId)
        currentAuthEmail = refreshedUser?.email ?? null
      } catch (e) {
        console.warn('Could not refresh user email after update')
      }

      return new Response(
      JSON.stringify({
        success: true,
        profileUpdated,
        privateProfileUpdated,
        emailUpdated,
        currentAuthEmail,
        passwordReset,
        emailSent,
        emailSendError,
        newPassword: passwordReset ? newPassword : undefined,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update user'
    console.log('update-user error:', errorMessage)
    console.error('Error updating user:', error)

    return new Response(
      JSON.stringify({
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
