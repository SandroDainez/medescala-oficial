import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
      address,
      bankName,
      bankAgency,
      bankAccount,
      pixKey
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

    // Update/upsert the profile with additional info
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: newUser.user.id,
        name,
        profile_type: profileType || 'plantonista',
        phone: phone || null,
        cpf: cpf || null,
        crm: crm || null,
        address: address || null,
        bank_name: bankName || null,
        bank_agency: bankAgency || null,
        bank_account: bankAccount || null,
        pix_key: pixKey || null
      })

    if (profileError) {
      console.error('Profile error:', profileError)
      // Don't throw, the user is created, profile can be updated later
    }

    // Create membership for the new user
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: newUser.user.id,
        email: newUser.user.email
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
