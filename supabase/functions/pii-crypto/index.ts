import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PiiData {
  cpf?: string | null;
  crm?: string | null;
  phone?: string | null;
  address?: string | null;
  bank_name?: string | null;
  bank_agency?: string | null;
  bank_account?: string | null;
  pix_key?: string | null;
}

interface RequestBody {
  action: 'encrypt' | 'decrypt';
  userId: string;
  data?: PiiData;
}

// Derive a CryptoKey from the encryption key string
async function deriveKey(keyString: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(keyString);
  
  // Use SHA-256 to create a consistent 256-bit key
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
  
  // Generate a random IV (12 bytes for AES-GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  // Combine IV + ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

// Decrypt ciphertext using AES-GCM
async function decryptValue(ciphertext: string, key: CryptoKey): Promise<string> {
  // Decode from base64
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  
  // Extract IV (first 12 bytes) and ciphertext
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

Deno.serve(async (req) => {
  console.log("pii-crypto function called");

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

    // Verify the requesting user is authenticated
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

    const { action, userId, data }: RequestBody = await req.json()

    console.log(`PII crypto: ${action} for user ${userId} by ${requestingUser.id}`);

    // Get encryption key
    const encryptionKey = Deno.env.get('PII_ENCRYPTION_KEY')
    if (!encryptionKey) {
      throw new Error('PII_ENCRYPTION_KEY not configured')
    }

    // Derive the crypto key
    const cryptoKey = await deriveKey(encryptionKey)

    // Check access: user can access their own data OR admin can access users in their tenant
    const isOwnData = requestingUser.id === userId

    if (!isOwnData) {
      // Check if requesting user is admin of a tenant where target user belongs
      const { data: adminMemberships } = await supabaseAdmin
        .from('memberships')
        .select('tenant_id')
        .eq('user_id', requestingUser.id)
        .eq('role', 'admin')
        .eq('active', true)

      if (!adminMemberships || adminMemberships.length === 0) {
        throw new Error('Access denied: not authorized to access this user data')
      }

      const adminTenantIds = adminMemberships.map(m => m.tenant_id)

      const { data: targetMembership } = await supabaseAdmin
        .from('memberships')
        .select('tenant_id')
        .eq('user_id', userId)
        .eq('active', true)
        .in('tenant_id', adminTenantIds)
        .limit(1)
        .maybeSingle()

      if (!targetMembership) {
        throw new Error('Access denied: user not in your tenant')
      }
    }

    if (action === 'encrypt' && data) {
      // Encrypt data and save to database
      const updatePayload: Record<string, unknown> = {
        user_id: userId,
      }

      const fields = ['cpf', 'crm', 'phone', 'address', 'bank_name', 'bank_agency', 'bank_account', 'pix_key'] as const
      
      for (const field of fields) {
        const value = data[field]
        if (value) {
          try {
            const encrypted = await encryptValue(value, cryptoKey)
            updatePayload[`${field}_enc`] = encrypted
          } catch (err) {
            console.error(`Error encrypting ${field}:`, err)
            throw new Error(`Failed to encrypt ${field}`)
          }
        } else {
          updatePayload[`${field}_enc`] = null
        }
      }

      const { error: updateError } = await supabaseAdmin
        .from('profiles_private')
        .upsert(updatePayload)

      if (updateError) {
        console.error('Error saving encrypted data:', updateError)
        throw new Error('Failed to save encrypted data')
      }

      console.log('PII data encrypted and saved successfully')

      return new Response(
        JSON.stringify({ success: true }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )

    } else if (action === 'decrypt') {
      // Fetch and decrypt data (only encrypted columns exist now)
      const { data: profile, error: fetchError } = await supabaseAdmin
        .from('profiles_private')
        .select('cpf_enc, crm_enc, phone_enc, address_enc, bank_name_enc, bank_agency_enc, bank_account_enc, pix_key_enc')
        .eq('user_id', userId)
        .maybeSingle()

      if (fetchError) {
        console.error('Error fetching profile:', fetchError)
        throw new Error('Failed to fetch profile')
      }

      if (!profile) {
        return new Response(
          JSON.stringify({ success: true, data: {} }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        )
      }

      const decryptedData: PiiData = {}
      const fields = ['cpf', 'crm', 'phone', 'address', 'bank_name', 'bank_agency', 'bank_account', 'pix_key'] as const

      for (const field of fields) {
        const encField = `${field}_enc` as keyof typeof profile
        
        if (profile[encField]) {
          try {
            const decrypted = await decryptValue(profile[encField] as string, cryptoKey)
            decryptedData[field] = decrypted
          } catch (err) {
            console.error(`Error decrypting ${field}:`, err)
            decryptedData[field] = null
          }
        }
      }

      console.log('PII data decrypted successfully')

      return new Response(
        JSON.stringify({ success: true, data: decryptedData }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )

    } else {
      throw new Error('Invalid action. Use "encrypt" or "decrypt"')
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'PII crypto operation failed'
    console.error('pii-crypto error:', errorMessage)

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
