import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}



Deno.serve(async (req) => {
  console.log('delete-users function called', { method: req.method, origin: req.headers.get('origin') })

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }


  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    if (!supabaseUrl) throw new Error('SUPABASE_URL not configured')
    if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
    if (!anonKey) throw new Error('SUPABASE_ANON_KEY not configured')

    // Service role client (admin operations)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Verify the requesting user is authenticated
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization')
    if (!authHeader) {
      console.error('No authorization header provided')
      return new Response(JSON.stringify({ error: 'Unauthorized: missing token' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : authHeader

    // User-scoped client (token validation)
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const {
      data: { user: requestingUser },
      error: authError,
    } = await supabaseUser.auth.getUser()

    if (authError || !requestingUser) {
      console.error('Auth error:', authError?.message)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    console.log(`Request from user: ${requestingUser.email} (${requestingUser.id})`)

    let body: any
    try {
      body = await req.json()
    } catch (_e) {
      console.error('Failed to parse JSON body')
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const userIds = Array.isArray(body?.userIds) ? body.userIds : []
    const tenantId = body?.tenantId

    console.log(`Request params - userIds: ${JSON.stringify(userIds)}, tenantId: ${tenantId}`)


    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'Tenant ID is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    if (userIds.length === 0) {
      return new Response(JSON.stringify({ error: 'No user IDs provided' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Verify permissions: super admin OR tenant admin
    const { data: isSuperAdmin, error: superAdminError } = await supabaseAdmin.rpc('is_super_admin', {
      _user_id: requestingUser.id,
    })

    console.log(`Is super admin: ${isSuperAdmin}, error: ${superAdminError?.message}`)

    if (!isSuperAdmin) {
      const { data: membership, error: membershipError } = await supabaseAdmin
        .from('memberships')
        .select('role')
        .eq('user_id', requestingUser.id)
        .eq('tenant_id', tenantId)
        .eq('active', true)
        .maybeSingle()

      console.log(`Membership check - data: ${JSON.stringify(membership)}, error: ${membershipError?.message}`)

      if (membershipError) {
        console.error('Membership query error:', membershipError.message)
        return new Response(JSON.stringify({ error: `Failed to verify permissions: ${membershipError.message}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }

      if (!membership || membership.role !== 'admin') {
        console.error('User is not an admin of this tenant')
        return new Response(JSON.stringify({ error: 'Only super admins or tenant admins can delete users' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        })
      }
    }

    console.log('Permission verified, proceeding with deletion')

    // Verify selected users belong to the tenant
    const { data: memberships, error: membershipsError } = await supabaseAdmin
      .from('memberships')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .in('user_id', userIds)

    if (membershipsError) {
      console.error('Failed to fetch memberships:', membershipsError.message)
      return new Response(JSON.stringify({ error: `Failed to verify users: ${membershipsError.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const validUserIds = memberships?.map((m: any) => m.user_id) || []
    console.log(`Valid user IDs in tenant: ${JSON.stringify(validUserIds)}`)

    const deletedUsers: string[] = []
    const errors: string[] = []

    for (const userId of validUserIds) {
      try {

        const { data: userResp, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId)
        if (getUserError) {
          console.error(`Failed to fetch user ${userId}:`, getUserError.message)
          errors.push(`${userId}: ${getUserError.message}`)
          continue
        }

        const userToDelete = userResp.user

        console.log(`Deleting user: ${userToDelete?.email} (${userId})`)

        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

        if (deleteError) {
          console.error(`Failed to delete user ${userId}:`, deleteError.message)
          errors.push(`${userToDelete?.email || userId}: ${deleteError.message}`)
        } else {
          deletedUsers.push(userToDelete?.email || userId)
          console.log(`Successfully deleted user: ${userToDelete?.email}`)
        }
      } catch (err) {
        console.error(`Error deleting user ${userId}:`, err)
        errors.push(`${userId}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    console.log(`Deletion complete. Deleted: ${deletedUsers.length}, Errors: ${errors.length}`)

    return new Response(
      JSON.stringify({
        success: true,
        deletedCount: deletedUsers.length,
        deletedUsers,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete users'
    console.error('Error deleting users:', errorMessage)

    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
