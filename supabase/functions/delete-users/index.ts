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
      throw new Error('No authorization header')
    }

    // Get the requesting user
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !requestingUser) {
      throw new Error('Unauthorized')
    }

    const { userIds, excludeEmail, tenantId } = await req.json()

    console.log(`Deleting users, excluding: ${excludeEmail}`);

    // Verify the requesting user is a super admin or tenant admin
    const { data: isSuperAdmin } = await supabaseAdmin.rpc('is_super_admin', { _user_id: requestingUser.id })
    
    if (!isSuperAdmin) {
      // Check if tenant admin
      const { data: membership } = await supabaseAdmin
        .from('memberships')
        .select('role')
        .eq('user_id', requestingUser.id)
        .eq('tenant_id', tenantId)
        .eq('active', true)
        .single()

      if (!membership || membership.role !== 'admin') {
        throw new Error('Only super admins or tenant admins can delete users')
      }
    }

    const deletedUsers: string[] = []
    const errors: string[] = []

    // Get all users except the excluded one
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    
    if (listError) {
      throw new Error(`Failed to list users: ${listError.message}`)
    }

    for (const user of users.users) {
      if (user.email === excludeEmail) {
        console.log(`Skipping user: ${user.email}`)
        continue
      }

      // If userIds is provided, only delete those users
      if (userIds && userIds.length > 0 && !userIds.includes(user.id)) {
        continue
      }

      try {
        console.log(`Deleting user: ${user.email} (${user.id})`)

        // Delete from auth.users (this will cascade to profiles due to FK)
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)

        if (deleteError) {
          console.error(`Failed to delete user ${user.email}:`, deleteError)
          errors.push(`${user.email}: ${deleteError.message}`)
        } else {
          deletedUsers.push(user.email || user.id)
          console.log(`Successfully deleted user: ${user.email}`)
        }
      } catch (err) {
        console.error(`Error deleting user ${user.email}:`, err)
        errors.push(`${user.email}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

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
    console.error('Error deleting users:', error)

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
