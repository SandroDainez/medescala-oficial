import { createClient } from "npm:@supabase/supabase-js@2";

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

    // Fetch all profiles_private (only encrypted columns exist now)
    const { data: profiles, error: fetchError } = await supabaseAdmin
      .from('profiles_private')
      .select('user_id, cpf_enc, crm_enc, phone_enc, address_enc, bank_name_enc, bank_agency_enc, bank_account_enc, pix_key_enc')

    if (fetchError) {
      throw new Error(`Failed to fetch profiles: ${fetchError.message}`)
    }

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, migrated: 0, message: 'No profiles found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Since plaintext columns have been removed, this migration is complete
    // Just return a success message indicating all data is now encrypted
    const encryptedCount = profiles.filter(p => 
      p.cpf_enc || p.crm_enc || p.phone_enc || p.address_enc || 
      p.bank_name_enc || p.bank_agency_enc || p.bank_account_enc || p.pix_key_enc
    ).length

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Migration complete. All PII data is now encrypted.',
        totalProfiles: profiles.length,
        profilesWithEncryptedData: encryptedCount
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
