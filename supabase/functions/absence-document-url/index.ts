import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const BUCKET_NAME = 'absence-documents'
const SIGNED_URL_EXPIRY_SECONDS = 3600 // 1 hour

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // Create admin client for storage operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Verify requesting user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Não autenticado')
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      throw new Error('Não autorizado')
    }

    const { action, filePath, absenceId, tenantId } = await req.json()

    // Validate required fields
    if (!action) {
      throw new Error('Ação não especificada')
    }

    if (!tenantId) {
      throw new Error('Tenant não especificado')
    }

    // Verify user is a member of the tenant
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .single()

    if (membershipError || !membership) {
      throw new Error('Usuário não é membro deste tenant')
    }

    const isAdmin = membership.role === 'admin'

    // Check if user is super admin
    const { data: superAdmin } = await supabaseAdmin
      .from('super_admins')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    const isSuperAdmin = !!superAdmin

    // Handle different actions
    if (action === 'upload') {
      // Generate upload URL - users can only upload to their own folder
      const fileName = `${user.id}/${Date.now()}_${crypto.randomUUID()}`
      
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .createSignedUploadUrl(fileName)

      if (uploadError) {
        console.error('Upload URL error:', uploadError)
        throw new Error('Erro ao gerar URL de upload')
      }

      return new Response(
        JSON.stringify({
          success: true,
          uploadUrl: uploadData.signedUrl,
          filePath: fileName,
          token: uploadData.token,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'download') {
      if (!filePath) {
        throw new Error('Caminho do arquivo não especificado')
      }

      // Extract user ID from file path (format: userId/filename)
      const pathParts = filePath.split('/')
      const fileOwnerId = pathParts[0]

      // Check access permissions
      const canAccess = 
        // Own file
        fileOwnerId === user.id ||
        // Super admin
        isSuperAdmin ||
        // Tenant admin can access files of tenant members
        (isAdmin && await checkTenantMembership(supabaseAdmin, fileOwnerId, tenantId))

      if (!canAccess) {
        throw new Error('Sem permissão para acessar este arquivo')
      }

      // Generate signed download URL
      const { data: downloadData, error: downloadError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .createSignedUrl(filePath, SIGNED_URL_EXPIRY_SECONDS)

      if (downloadError) {
        console.error('Download URL error:', downloadError)
        throw new Error('Erro ao gerar URL de download')
      }

      return new Response(
        JSON.stringify({
          success: true,
          downloadUrl: downloadData.signedUrl,
          expiresIn: SIGNED_URL_EXPIRY_SECONDS,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'delete') {
      if (!filePath) {
        throw new Error('Caminho do arquivo não especificado')
      }

      // Extract user ID from file path
      const pathParts = filePath.split('/')
      const fileOwnerId = pathParts[0]

      // Only owner, admin, or super admin can delete
      const canDelete = 
        fileOwnerId === user.id ||
        isSuperAdmin ||
        (isAdmin && await checkTenantMembership(supabaseAdmin, fileOwnerId, tenantId))

      if (!canDelete) {
        throw new Error('Sem permissão para excluir este arquivo')
      }

      const { error: deleteError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .remove([filePath])

      if (deleteError) {
        console.error('Delete error:', deleteError)
        throw new Error('Erro ao excluir arquivo')
      }

      // Also clear the document_url from the absence record if absenceId provided
      if (absenceId) {
        await supabaseAdmin
          .from('absences')
          .update({ document_url: null })
          .eq('id', absenceId)
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    throw new Error('Ação inválida')

  } catch (error: unknown) {
    console.error('Absence document URL error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Erro interno'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

// Helper function to check if a user is a member of a specific tenant
async function checkTenantMembership(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  tenantId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .maybeSingle()

  return !!data
}
