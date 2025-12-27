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
      email,
      sendInviteEmail,
      resetPassword
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

    // Get tenant info for email
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .single()

    // Get user profile for name
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('name')
      .eq('id', userId)
      .single()

    let emailUpdated = false
    let passwordReset = false
    let emailSent = false
    let newPassword = ''

    // Update email if provided and different
    if (email) {
      // Get current user email
      const { data: { user: targetUser } } = await supabaseAdmin.auth.admin.getUserById(userId)
      
      if (targetUser && targetUser.email !== email) {
        console.log(`Updating email from ${targetUser.email} to ${email}`);
        
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          email: email,
          email_confirm: true
        })

        if (updateError) {
          console.error('Error updating email:', updateError);
          throw new Error(`Erro ao atualizar email: ${updateError.message}`)
        }
        
        emailUpdated = true
      }
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

          const emailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "MedEscala <onboarding@resend.dev>",
              to: [email],
              subject: passwordReset 
                ? `Sua senha foi resetada - ${escapeHtml(hospitalName)}`
                : `Seus dados foram atualizados - ${escapeHtml(hospitalName)}`,
              html: htmlContent,
            }),
          })

          if (emailResponse.ok) {
            emailSent = true
            console.log('Email sent successfully')
          } else {
            const emailError = await emailResponse.json()
            console.error('Failed to send email:', emailError)
          }
        } else {
          console.warn('RESEND_API_KEY not configured')
        }
      } catch (emailError) {
        console.error('Error sending email:', emailError)
        // Don't throw, update succeeded
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        emailUpdated,
        passwordReset,
        emailSent,
        newPassword: passwordReset ? newPassword : undefined
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
