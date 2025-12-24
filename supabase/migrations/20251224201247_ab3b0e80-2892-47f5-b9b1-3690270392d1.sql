-- Tabela de alertas/notificações no app
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('checkin_reminder_15min', 'checkin_reminder_now', 'checkin_reminder_late', 'marked_absent')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  shift_assignment_id UUID REFERENCES public.shift_assignments(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "System can create notifications"
ON public.notifications FOR INSERT
WITH CHECK (is_tenant_member(auth.uid(), tenant_id) OR is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins can manage all notifications"
ON public.notifications FOR ALL
USING (is_tenant_admin(auth.uid(), tenant_id));

-- Índices
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id, read_at) WHERE read_at IS NULL;

-- Adicionar campo de tolerância por setor (em minutos)
ALTER TABLE public.sectors
ADD COLUMN checkin_tolerance_minutes INTEGER NOT NULL DEFAULT 30;