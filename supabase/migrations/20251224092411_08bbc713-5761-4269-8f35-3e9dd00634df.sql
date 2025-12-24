-- Ensure profiles policies apply to authenticated users
ALTER POLICY "Users can view their own profile" ON public.profiles TO authenticated;
ALTER POLICY "Users can update their own profile" ON public.profiles TO authenticated;
ALTER POLICY "Users can insert their own profile" ON public.profiles TO authenticated;
ALTER POLICY "Admins can view all profiles" ON public.profiles TO authenticated;
ALTER POLICY "Admins can update all profiles" ON public.profiles TO authenticated;
ALTER POLICY "Admins can insert profiles" ON public.profiles TO authenticated;
