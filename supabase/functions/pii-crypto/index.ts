import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PiiData {
  cpf?: string | null;
  crm?: string | null;
  rqe?: string | null;
  phone?: string | null;
  address?: string | null;
  bank_name?: string | null;
  bank_agency?: string | null;
  bank_account?: string | null;
  pix_key?: string | null;
}

interface RequestBody {
  action: 'encrypt' | 'decrypt' | 'decrypt_batch';
  userId?: string;
  userIds?: string[];
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

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('\\x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

// Decrypt ciphertext using AES-GCM
async function decryptValue(ciphertextBase64: string, key: CryptoKey): Promise<string> {
  const combined = base64ToBytes(ciphertextBase64);

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

    const { action, userId, userIds, data }: RequestBody = await req.json()

    console.log(`PII crypto: ${action} for user(s) ${userId || userIds?.join(',')} by ${requestingUser.id}`);

    // Get encryption key
    const encryptionKey = Deno.env.get('PII_ENCRYPTION_KEY')
    if (!encryptionKey) {
      throw new Error('PII_ENCRYPTION_KEY not configured')
    }

    // Derive the crypto key
    const cryptoKey = await deriveKey(encryptionKey)

    // Handle batch decrypt - skip per-user access check for performance (admin verified once)
    if (action === 'decrypt_batch' && userIds && userIds.length > 0) {
      // Verify admin has access to at least one tenant
      const { data: adminMemberships } = await supabaseAdmin
        .from('memberships')
        .select('tenant_id')
        .eq('user_id', requestingUser.id)
        .eq('role', 'admin')
        .eq('active', true)

      if (!adminMemberships || adminMemberships.length === 0) {
        throw new Error('Access denied: not authorized')
      }

      const adminTenantIds = adminMemberships.map(m => m.tenant_id)

      // Fetch all target users in admin's tenants
      const { data: targetMemberships } = await supabaseAdmin
        .from('memberships')
        .select('user_id')
        .in('user_id', userIds)
        .in('tenant_id', adminTenantIds)
        .eq('active', true)

      const allowedUserIds = new Set(targetMemberships?.map(m => m.user_id) || [])

      // Fetch all profiles_private for allowed users in one query
      const { data: profiles, error: fetchError } = await supabaseAdmin
        .from('profiles_private')
        .select('user_id, cpf_enc, crm_enc, rqe_enc, phone_enc, address_enc, bank_name_enc, bank_agency_enc, bank_account_enc, pix_key_enc')
        .in('user_id', Array.from(allowedUserIds))

      if (fetchError) {
        console.error('Error fetching profiles:', fetchError)
        throw new Error('Failed to fetch profiles')
      }

      const result: Record<string, PiiData> = {}
      const fields = ['cpf', 'crm', 'rqe', 'phone', 'address', 'bank_name', 'bank_agency', 'bank_account', 'pix_key'] as const

      for (const profile of (profiles || [])) {
        const decryptedData: PiiData = {}

        for (const field of fields) {
          const encField = `${field}_enc` as keyof typeof profile
          const rawValue = profile[encField]

          if (!rawValue) continue

          try {
            let ciphertextB64: string | null = null

            if (typeof rawValue === 'string') {
              if (rawValue.startsWith('\\x')) {
                const bytes = hexToBytes(rawValue)
                ciphertextB64 = bytesToBase64(bytes)
              } else {
                ciphertextB64 = rawValue
              }
            }

            if (!ciphertextB64) {
              decryptedData[field] = null
              continue
            }

            try {
              decryptedData[field] = await decryptValue(ciphertextB64, cryptoKey)
            } catch {
              const maybeAsciiB64 = new TextDecoder().decode(base64ToBytes(ciphertextB64))
              decryptedData[field] = await decryptValue(maybeAsciiB64, cryptoKey)
            }
          } catch (err) {
            console.error(`Error decrypting ${field} for ${profile.user_id}:`, err)
            decryptedData[field] = null
          }
        }

        result[profile.user_id] = decryptedData
      }

      console.log(`PII batch decrypt: ${Object.keys(result).length} users decrypted`)

      return new Response(
        JSON.stringify({ success: true, data: result }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Single user operations require userId
    if (!userId) {
      throw new Error('userId is required for encrypt/decrypt')
    }

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
      // Encrypt data and save to database (bytea columns)
      // IMPORTANT: profiles_private.*_enc are bytea. We must store raw bytes, not the base64 text.
      // We store as Postgres bytea hex format: "\\x...".
      const fields = ['cpf', 'crm', 'rqe', 'phone', 'address', 'bank_name', 'bank_agency', 'bank_account', 'pix_key'] as const

      const updatePayload: Record<string, unknown> = { user_id: userId }

      for (const field of fields) {
        const value = data[field]
        if (value) {
          try {
            const encryptedB64 = await encryptValue(value, cryptoKey)
            const encryptedBytes = base64ToBytes(encryptedB64)
            const hex = bytesToHex(encryptedBytes)
            updatePayload[`${field}_enc`] = `\\x${hex}`
          } catch (err) {
            console.error(`Error encrypting ${field}:`, err)
            throw new Error(`Failed to encrypt ${field}`)
          }
        } else {
          updatePayload[`${field}_enc`] = null
        }
      }

      console.log('Saving encrypted PII data for user:', userId)

      const { error: upsertError } = await supabaseAdmin
        .from('profiles_private')
        .upsert(updatePayload, { onConflict: 'user_id' })

      if (upsertError) {
        console.error('Error saving encrypted data:', upsertError)
        throw new Error(`Failed to save encrypted data: ${upsertError.message}`)
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
        .select('cpf_enc, crm_enc, rqe_enc, phone_enc, address_enc, bank_name_enc, bank_agency_enc, bank_account_enc, pix_key_enc')
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
      const fields = ['cpf', 'crm', 'rqe', 'phone', 'address', 'bank_name', 'bank_agency', 'bank_account', 'pix_key'] as const

      for (const field of fields) {
        const encField = `${field}_enc` as keyof typeof profile
        const rawValue = profile[encField]

        if (!rawValue) continue

        try {
          // Supabase/PostgREST can return bytea in different representations depending on client/runtime.
          // We support:
          // - "\\x..." hex string (common)
          // - base64 string
          // - legacy corrupted rows where bytea contains ASCII(base64) (double-encoded)
          let ciphertextB64: string | null = null

          if (typeof rawValue === 'string') {
            if (rawValue.startsWith('\\x')) {
              const bytes = hexToBytes(rawValue)
              ciphertextB64 = bytesToBase64(bytes)
            } else {
              // First assume it's already the ciphertext base64
              ciphertextB64 = rawValue
            }
          }

          if (!ciphertextB64) {
            decryptedData[field] = null
            continue
          }

          // Try normal decrypt
          try {
            decryptedData[field] = await decryptValue(ciphertextB64, cryptoKey)
            continue
          } catch {
            // Try legacy: bytea stored ASCII(base64) so we need one extra decode pass
            // Step1: base64 -> bytes; Step2: bytes -> string (should be base64); Step3: decrypt
            const maybeAsciiB64 = new TextDecoder().decode(base64ToBytes(ciphertextB64))
            decryptedData[field] = await decryptValue(maybeAsciiB64, cryptoKey)
          }
        } catch (err) {
          console.error(`Error decrypting ${field}:`, err)
          decryptedData[field] = null
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
