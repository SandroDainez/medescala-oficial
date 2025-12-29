-- Allow users to delete their own notifications
CREATE POLICY "Users can delete their own notifications"
ON public.notifications
FOR DELETE
USING (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
  AND is_tenant_member(auth.uid(), tenant_id)
);