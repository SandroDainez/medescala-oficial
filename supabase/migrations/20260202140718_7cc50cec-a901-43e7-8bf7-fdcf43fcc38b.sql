-- ============================================
-- PUSH NOTIFICATIONS & CALENDAR SYNC TABLES
-- ============================================

-- 1. Device tokens for push notifications (OneSignal)
CREATE TABLE public.push_device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  onesignal_player_id TEXT, -- OneSignal specific identifier
  app_version TEXT,
  device_model TEXT,
  os_version TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, device_token)
);

-- 2. User notification preferences
CREATE TABLE public.user_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Push preferences
  push_enabled BOOLEAN DEFAULT true,
  reminder_24h_enabled BOOLEAN DEFAULT true,
  reminder_2h_enabled BOOLEAN DEFAULT true,
  shift_start_enabled BOOLEAN DEFAULT true,
  swap_notifications_enabled BOOLEAN DEFAULT true,
  -- Calendar sync preferences
  calendar_sync_enabled BOOLEAN DEFAULT false,
  calendar_id TEXT, -- Native calendar ID chosen by user
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Calendar sync events (track native event IDs)
CREATE TABLE public.calendar_sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES public.shift_assignments(id) ON DELETE SET NULL,
  native_event_id TEXT NOT NULL, -- ID returned by iOS/Android calendar
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  shift_hash TEXT, -- Hash of shift data to detect changes
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, shift_id, platform)
);

-- 4. Push notification queue (for scheduled sends)
CREATE TABLE public.push_notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES public.shifts(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('reminder_24h', 'reminder_2h', 'shift_start', 'swap_request', 'swap_accepted', 'swap_rejected')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.push_device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notification_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies for push_device_tokens
CREATE POLICY "Users can manage their own device tokens"
  ON public.push_device_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for user_notification_preferences
CREATE POLICY "Users can manage their own notification preferences"
  ON public.user_notification_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for calendar_sync_events
CREATE POLICY "Users can manage their own calendar sync events"
  ON public.calendar_sync_events
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for push_notification_queue
CREATE POLICY "Users can view their own notifications"
  ON public.push_notification_queue
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can manage notification queue"
  ON public.push_notification_queue
  FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(auth.uid(), tenant_id)
  );

-- Indexes for performance
CREATE INDEX idx_push_device_tokens_user ON public.push_device_tokens(user_id);
CREATE INDEX idx_push_device_tokens_tenant ON public.push_device_tokens(tenant_id);
CREATE INDEX idx_push_device_tokens_active ON public.push_device_tokens(is_active) WHERE is_active = true;

CREATE INDEX idx_calendar_sync_shift ON public.calendar_sync_events(shift_id);
CREATE INDEX idx_calendar_sync_user ON public.calendar_sync_events(user_id);

CREATE INDEX idx_push_queue_scheduled ON public.push_notification_queue(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_push_queue_user ON public.push_notification_queue(user_id);

-- Trigger for updated_at
CREATE TRIGGER update_push_device_tokens_updated_at
  BEFORE UPDATE ON public.push_device_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_calendar_sync_updated_at
  BEFORE UPDATE ON public.calendar_sync_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to schedule shift reminders when assignment is created/updated
CREATE OR REPLACE FUNCTION public.schedule_shift_reminders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shift_date DATE;
  v_start_time TIME;
  v_shift_datetime TIMESTAMPTZ;
  v_shift_title TEXT;
  v_tenant_id UUID;
  v_prefs RECORD;
BEGIN
  -- Get shift details
  SELECT s.shift_date, s.start_time, s.title, s.tenant_id
  INTO v_shift_date, v_start_time, v_shift_title, v_tenant_id
  FROM public.shifts s
  WHERE s.id = NEW.shift_id;

  -- Calculate shift datetime
  v_shift_datetime := (v_shift_date || ' ' || v_start_time)::TIMESTAMPTZ;

  -- Get user preferences
  SELECT * INTO v_prefs
  FROM public.user_notification_preferences
  WHERE user_id = NEW.user_id;

  -- If no preferences, use defaults
  IF v_prefs IS NULL THEN
    v_prefs.push_enabled := true;
    v_prefs.reminder_24h_enabled := true;
    v_prefs.reminder_2h_enabled := true;
    v_prefs.shift_start_enabled := true;
  END IF;

  -- Only schedule if push is enabled
  IF v_prefs.push_enabled THEN
    -- Cancel any existing reminders for this assignment
    UPDATE public.push_notification_queue
    SET status = 'cancelled'
    WHERE user_id = NEW.user_id
      AND shift_id = NEW.shift_id
      AND status = 'pending';

    -- Schedule 24h reminder
    IF v_prefs.reminder_24h_enabled AND v_shift_datetime - INTERVAL '24 hours' > NOW() THEN
      INSERT INTO public.push_notification_queue (user_id, tenant_id, shift_id, notification_type, title, message, scheduled_for, data)
      VALUES (
        NEW.user_id,
        v_tenant_id,
        NEW.shift_id,
        'reminder_24h',
        '📅 Plantão amanhã',
        'Seu plantão "' || v_shift_title || '" começa em 24 horas.',
        v_shift_datetime - INTERVAL '24 hours',
        jsonb_build_object('shift_id', NEW.shift_id, 'assignment_id', NEW.id)
      );
    END IF;

    -- Schedule 2h reminder
    IF v_prefs.reminder_2h_enabled AND v_shift_datetime - INTERVAL '2 hours' > NOW() THEN
      INSERT INTO public.push_notification_queue (user_id, tenant_id, shift_id, notification_type, title, message, scheduled_for, data)
      VALUES (
        NEW.user_id,
        v_tenant_id,
        NEW.shift_id,
        'reminder_2h',
        '⏰ Plantão em 2 horas',
        'Seu plantão "' || v_shift_title || '" começa em 2 horas!',
        v_shift_datetime - INTERVAL '2 hours',
        jsonb_build_object('shift_id', NEW.shift_id, 'assignment_id', NEW.id)
      );
    END IF;

    -- Schedule shift start notification
    IF v_prefs.shift_start_enabled AND v_shift_datetime > NOW() THEN
      INSERT INTO public.push_notification_queue (user_id, tenant_id, shift_id, notification_type, title, message, scheduled_for, data)
      VALUES (
        NEW.user_id,
        v_tenant_id,
        NEW.shift_id,
        'shift_start',
        '🏥 Plantão iniciando',
        'Seu plantão "' || v_shift_title || '" está começando agora. Não esqueça do check-in!',
        v_shift_datetime,
        jsonb_build_object('shift_id', NEW.shift_id, 'assignment_id', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger to schedule reminders on assignment insert/update
CREATE TRIGGER trigger_schedule_shift_reminders
  AFTER INSERT OR UPDATE OF user_id ON public.shift_assignments
  FOR EACH ROW
  WHEN (NEW.status IN ('assigned', 'confirmed'))
  EXECUTE FUNCTION public.schedule_shift_reminders();

-- Trigger to cancel reminders when assignment is removed
CREATE OR REPLACE FUNCTION public.cancel_shift_reminders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.push_notification_queue
  SET status = 'cancelled'
  WHERE user_id = OLD.user_id
    AND shift_id = OLD.shift_id
    AND status = 'pending';
  
  RETURN OLD;
END;
$$;

CREATE TRIGGER trigger_cancel_shift_reminders
  BEFORE DELETE ON public.shift_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.cancel_shift_reminders();