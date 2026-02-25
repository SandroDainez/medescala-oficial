-- Explicitly grant execute to authenticated for sensitive RPCs
GRANT EXECUTE ON FUNCTION public.get_tenant_access_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tenants(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_add_user_to_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_schedule_reopen_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
