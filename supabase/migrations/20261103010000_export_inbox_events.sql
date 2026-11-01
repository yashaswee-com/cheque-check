CREATE FUNCTION public.emit_export_inbox_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
BEGIN
  IF NEW.status IN ('ready','failed') AND NEW.status IS DISTINCT FROM OLD.status
    AND EXISTS(SELECT 1 FROM public.businesses b JOIN public.profiles p ON p.user_id=b.user_id
      WHERE b.id=NEW.business_id AND b.user_id=NEW.user_id AND b.deleted_at IS NULL AND p.deleted_at IS NULL)
  THEN
    INSERT INTO public.notification_inbox(user_id,business_id,kind,event_key)
      VALUES(NEW.user_id,NEW.business_id,'export_'||NEW.status,'export:'||NEW.id||':'||NEW.status)
      ON CONFLICT(event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.emit_export_inbox_event() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER export_inbox_event AFTER UPDATE OF status ON public.report_export_jobs
  FOR EACH ROW EXECUTE FUNCTION public.emit_export_inbox_event();
