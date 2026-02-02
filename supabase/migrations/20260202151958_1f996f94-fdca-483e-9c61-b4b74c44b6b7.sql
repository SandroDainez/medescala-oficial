-- Enable realtime for notifications table so DELETE events are broadcasted
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;