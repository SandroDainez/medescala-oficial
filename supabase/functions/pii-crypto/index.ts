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
      const encryptedData: Record<string, Uint8Array | null> = {}
      
      for (const [key, value] of Object.entries(data)) {
        if (value) {
          // Use pgp_sym_encrypt via SQL
          const { data: result, error } = await supabaseAdmin.rpc('encrypt_pii_value', {
            plaintext: value,
            encryption_key: encryptionKey
          })
          
          if (error) {
            console.error(`Error encrypting ${key}:`, error)
            throw new Error(`Failed to encrypt ${key}`)
          }
          
          encryptedData[`${key}_enc`] = result
        } else {
          encryptedData[`${key}_enc`] = null
        }
      }

      // Update profiles_private with encrypted data
      const updatePayload: Record<string, unknown> = {
        user_id: userId,
      }

      // Add encrypted columns
      for (const [key, value] of Object.entries(encryptedData)) {
        updatePayload[key] = value
      }

      // Clear plaintext columns
      for (const key of Object.keys(data)) {
        updatePayload[key] = null
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
      // Fetch and decrypt data
      const { data: profile, error: fetchError } = await supabaseAdmin
        .from('profiles_private')
        .select('cpf_enc, crm_enc, phone_enc, address_enc, bank_name_enc, bank_agency_enc, bank_account_enc, pix_key_enc, cpf, crm, phone, address, bank_name, bank_agency, bank_account, pix_key')
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
      const encryptedFields = ['cpf', 'crm', 'phone', 'address', 'bank_name', 'bank_agency', 'bank_account', 'pix_key']

      for (const field of encryptedFields) {
        const encField = `${field}_enc` as keyof typeof profile
        const plainField = field as keyof typeof profile
        
        // Prefer encrypted version if available
        if (profile[encField]) {
          const { data: decrypted, error } = await supabaseAdmin.rpc('decrypt_pii_value', {
            ciphertext: profile[encField],
            encryption_key: encryptionKey
          })
          
          if (error) {
            console.error(`Error decrypting ${field}:`, error)
            // Fallback to plaintext if available
            decryptedData[field as keyof PiiData] = profile[plainField] as string | null
          } else {
            decryptedData[field as keyof PiiData] = decrypted
          }
        } else if (profile[plainField]) {
          // Use plaintext if no encrypted version
          decryptedData[field as keyof PiiData] = profile[plainField] as string | null
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
