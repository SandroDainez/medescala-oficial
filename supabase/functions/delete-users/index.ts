import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  console.log("delete-users function called");

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
      console.error('No authorization header provided')
      throw new Error('No authorization header')
    }

    // Get the requesting user
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !requestingUser) {
      console.error('Auth error:', authError)
      throw new Error('Unauthorized')
    }

    console.log(`Request from user: ${requestingUser.email} (${requestingUser.id})`)

    const { userIds, excludeEmail, tenantId } = await req.json()

    console.log(`Request params - userIds: ${JSON.stringify(userIds)}, excludeEmail: ${excludeEmail}, tenantId: ${tenantId}`)

    if (!userIds || userIds.length === 0) {
      throw new Error('No user IDs provided')
    }

    if (!tenantId) {
      throw new Error('Tenant ID is required')
    }

    // Verify the requesting user is a super admin or tenant admin
    const { data: isSuperAdmin, error: superAdminError } = await supabaseAdmin.rpc('is_super_admin', { _user_id: requestingUser.id })
    
    console.log(`Is super admin: ${isSuperAdmin}, error: ${superAdminError?.message}`)
    
    if (!isSuperAdmin) {
      // Check if tenant admin
      const { data: membership, error: membershipError } = await supabaseAdmin
        .from('memberships')
        .select('role')
        .eq('user_id', requestingUser.id)
        .eq('tenant_id', tenantId)
        .eq('active', true)
        .maybeSingle()

      console.log(`Membership check - data: ${JSON.stringify(membership)}, error: ${membershipError?.message}`)

      if (membershipError) {
        console.error('Membership query error:', membershipError)
        throw new Error(`Failed to verify permissions: ${membershipError.message}`)
      }

      if (!membership || membership.role !== 'admin') {
        console.error('User is not an admin of this tenant')
        throw new Error('Only super admins or tenant admins can delete users')
      }
    }

    console.log('Permission verified, proceeding with deletion')

    const deletedUsers: string[] = []
    const errors: string[] = []

    // Verify selected users belong to the same tenant
    const { data: memberships, error: membershipsError } = await supabaseAdmin
      .from('memberships')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .in('user_id', userIds)

    if (membershipsError) {
      console.error('Failed to fetch memberships:', membershipsError)
      throw new Error(`Failed to verify users: ${membershipsError.message}`)
    }

    const validUserIds = memberships?.map(m => m.user_id) || []
    console.log(`Valid user IDs in tenant: ${JSON.stringify(validUserIds)}`)

    for (const userId of validUserIds) {
      // Skip the requesting user
      if (userId === requestingUser.id) {
        console.log(`Skipping requesting user: ${userId}`)
        continue
      }

      try {
        // Get user email for logging
        const { data: { user: userToDelete } } = await supabaseAdmin.auth.admin.getUserById(userId)
        
        if (userToDelete?.email === excludeEmail) {
          console.log(`Skipping excluded email: ${excludeEmail}`)
          continue
        }

        console.log(`Deleting user: ${userToDelete?.email} (${userId})`)

        // Delete from auth.users (this will cascade to profiles due to FK)
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

        if (deleteError) {
          console.error(`Failed to delete user ${userId}:`, deleteError)
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
        status: 200 
      }
    )

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete users'
    console.error('Error deleting users:', errorMessage)

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
