-- =============================================================
-- RLS Policies for absence-documents bucket (storage.objects)
-- NOTE: Bucket must be created manually via Cloud UI first
-- =============================================================

-- 1. Users can upload their own documents
CREATE POLICY "Users can upload own absence documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'absence-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 2. Users can view their own documents
CREATE POLICY "Users can view own absence documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'absence-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Users can update their own documents
CREATE POLICY "Users can update own absence documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'absence-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Users can delete their own documents
CREATE POLICY "Users can delete own absence documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'absence-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. Tenant admins can view documents of users in their tenant
CREATE POLICY "Tenant admins can view absence documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'absence-documents'
  AND EXISTS (
    SELECT 1 FROM public.memberships admin_m
    INNER JOIN public.memberships user_m ON user_m.tenant_id = admin_m.tenant_id
    WHERE admin_m.user_id = auth.uid() 
      AND admin_m.role = 'admin'
      AND admin_m.active = true
      AND user_m.user_id = (storage.foldername(name))[1]::uuid
      AND user_m.active = true
  )
);

-- 6. Super admins can view ALL absence documents (global support/audit)
CREATE POLICY "Super admins can view all absence documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'absence-documents'
  AND public.is_super_admin(auth.uid())
);