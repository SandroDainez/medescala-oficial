import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

Deno.serve(async (req) => {
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
          persistSession: false,
        },
      }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header')

    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !requestingUser) throw new Error('Unauthorized')

    const body = await req.json().catch(() => ({}))
    const { userId, tenantId } = body as { userId?: unknown; tenantId?: unknown }

    if (!isValidUuid(userId) || !isValidUuid(tenantId)) {
      throw new Error('Parâmetros inválidos')
    }

    // Verify requester is admin of tenant
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('memberships')
      .select('role')
      .eq('user_id', requestingUser.id)
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .single()

    if (membershipError || !membership || membership.role !== 'admin') {
      throw new Error('Only tenant admins can view user emails')
    }

    // Verify target user belongs to tenant
    const { data: targetMembership, error: targetError } = await supabaseAdmin
      .from('memberships')
      .select('id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .single()

    if (targetError || !targetMembership) {
      throw new Error('User not found in this tenant')
    }

    const { data: { user: targetUser }, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (userError || !targetUser) throw new Error('User not found')

    return new Response(
      JSON.stringify({
        success: true,
        email: targetUser.email ?? null,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch user email'

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
