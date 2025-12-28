import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  console.log("migrate-pii function called");

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
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

    // Verify the requesting user is authenticated and is a super admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !requestingUser) {
      throw new Error('Unauthorized')
    }

    // Check if user is super admin
    const { data: isSuperAdmin } = await supabaseAdmin
      .rpc('is_super_admin', { _user_id: requestingUser.id })

    if (!isSuperAdmin) {
      throw new Error('Only super admins can run migrations')
    }

    // Get encryption key
    const encryptionKey = Deno.env.get('PII_ENCRYPTION_KEY')
    if (!encryptionKey) {
      throw new Error('PII_ENCRYPTION_KEY not configured')
    }

    const cryptoKey = await deriveKey(encryptionKey)

    // Fetch all profiles_private that have plaintext data but no encrypted data
    const { data: profiles, error: fetchError } = await supabaseAdmin
      .from('profiles_private')
      .select('user_id, cpf, crm, phone, address, bank_name, bank_agency, bank_account, pix_key, cpf_enc, crm_enc, phone_enc, address_enc, bank_name_enc, bank_agency_enc, bank_account_enc, pix_key_enc')

    if (fetchError) {
      throw new Error(`Failed to fetch profiles: ${fetchError.message}`)
    }

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, migrated: 0, message: 'No profiles to migrate' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const fields = ['cpf', 'crm', 'phone', 'address', 'bank_name', 'bank_agency', 'bank_account', 'pix_key'] as const
    let migratedCount = 0
    const errors: string[] = []

    for (const profile of profiles) {
      const updatePayload: Record<string, unknown> = {}
      let needsUpdate = false

      for (const field of fields) {
        const plainValue = profile[field]
        const encValue = profile[`${field}_enc` as keyof typeof profile]

        // Only migrate if there's plaintext but no encrypted value
        if (plainValue && !encValue) {
          try {
            const encrypted = await encryptValue(plainValue, cryptoKey)
            updatePayload[`${field}_enc`] = encrypted
            updatePayload[field] = null // Clear plaintext
            needsUpdate = true
          } catch (err) {
            errors.push(`Failed to encrypt ${field} for user ${profile.user_id}: ${err}`)
          }
        }
      }

      if (needsUpdate) {
        const { error: updateError } = await supabaseAdmin
          .from('profiles_private')
          .update(updatePayload)
          .eq('user_id', profile.user_id)

        if (updateError) {
          errors.push(`Failed to update user ${profile.user_id}: ${updateError.message}`)
        } else {
          migratedCount++
          console.log(`Migrated PII for user ${profile.user_id}`)
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        migrated: migratedCount, 
        total: profiles.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Migration failed'
    console.error('migrate-pii error:', errorMessage)

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
