-- ==========================================
-- SKILL2CASH — Trigger pour envoyer les notifications push
-- ==========================================

-- Créer la fonction pour envoyer les notifications push via Edge Function
CREATE OR REPLACE FUNCTION public.send_push_notification_via_edge(p_user_id uuid, p_title text, p_body text DEFAULT NULL, p_link text DEFAULT NULL, p_data jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_edge_url text;
BEGIN
  -- URL de l'Edge Function
  v_edge_url := 'https://jdyoozwiwbmhtsgkwqsq.supabase.co/functions/v1/send-push-notification';
  
  -- Envoyer la notification via l'Edge Function
  PERFORM net.http_post(
    url := v_edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'title', p_title,
      'body', p_body,
      'link', p_link,
      'data', p_data
    )
  );
  
EXCEPTION WHEN OTHERS THEN
  -- Ne pas échouer si l'envoi de notification push échoue
  RAISE WARNING 'Erreur envoi notification push: %', SQLERRM;
END;
$$;

-- Créer le trigger pour envoyer les notifications push quand une notification est créée
CREATE OR REPLACE FUNCTION public.trigger_send_push_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Envoyer la notification push si l'utilisateur a un token
  IF NEW.user_id IS NOT NULL AND NOT NEW.is_admin_notice THEN
    PERFORM public.send_push_notification_via_edge(
      NEW.user_id,
      NEW.title,
      NEW.body,
      NEW.link,
      NEW.metadata
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Créer le trigger sur la table notifications
DROP TRIGGER IF EXISTS trg_send_push_notification ON public.notifications;
CREATE TRIGGER trg_send_push_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_send_push_notification();

-- Commentaire
COMMENT ON FUNCTION public.send_push_notification_via_edge IS 'Envoie une notification push via l''Edge Function Firebase';
COMMENT ON FUNCTION public.trigger_send_push_notification IS 'Trigger pour envoyer automatiquement les notifications push';
