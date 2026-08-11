-- ==========================================
-- SKILL2CASH — Triggers pour envoyer les notifications push
-- ==========================================

-- Fonction pour envoyer une notification push via l'Edge Function
CREATE OR REPLACE FUNCTION public.send_push_notification_edge(
  p_user_id uuid,
  p_title text,
  p_body text DEFAULT NULL,
  p_link text DEFAULT NULL,
  p_data jsonb DEFAULT '{}'
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_edge_function_url text;
  v_response jsonb;
BEGIN
  -- URL de l'Edge Function (à adapter selon votre environnement)
  v_edge_function_url := Deno.env.get('SUPABASE_URL') || '/functions/v1/send-push-notification';
  
  -- Envoyer la requête à l'Edge Function
  -- Note: Cette fonction utilise pg_net pour les requêtes HTTP
  -- Assurez-vous que l'extension pg_net est activée
  PERFORM net.http_post(
    url := v_edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || Deno.env.get('SUPABASE_ANON_KEY')
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'title', p_title,
      'body', p_body,
      'link', p_link,
      'data', p_data
    )
  );
  
  RETURN true;
  
EXCEPTION WHEN OTHERS THEN
  -- En cas d'erreur, logguer mais ne pas bloquer l'opération
  RAISE WARNING 'Erreur envoi notification push: %', SQLERRM;
  RETURN false;
END;
$$;

-- Trigger pour envoyer une notification push quand un message est envoyé
CREATE OR REPLACE FUNCTION public.trigger_push_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Envoyer une notification push au destinataire du message
  -- (sauf si c'est l'expéditeur lui-même)
  IF NEW.sender_id != NEW.duel_id THEN -- Simplifié, adapter selon votre logique
    PERFORM public.send_push_notification_edge(
      p_user_id := NEW.sender_id, -- Adapter selon votre logique
      p_title := 'Nouveau message',
      p_body := 'Tu as reçu un nouveau message',
      p_link := '/duels/' || NEW.duel_id,
      p_data := jsonb_build_object('type', 'message', 'duel_id', NEW.duel_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger pour envoyer une notification push quand une demande de retrait est créée
CREATE OR REPLACE FUNCTION public.trigger_push_on_withdrawal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    -- Notification à l'admin (via _notify_admins)
    -- Notification push à l'utilisateur
    PERFORM public.send_push_notification_edge(
      p_user_id := NEW.user_id,
      p_title := 'Demande de retrait',
      p_body := 'Ta demande de retrait de ' || NEW.amount || ' FCFA a été envoyée',
      p_link := '/portefeuille',
      p_data := jsonb_build_object('type', 'withdrawal', 'withdrawal_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger pour envoyer une notification push quand un dépôt est créé
CREATE OR REPLACE FUNCTION public.trigger_push_on_deposit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    -- Notification à l'admin (via _notify_admins)
    -- Notification push à l'utilisateur
    PERFORM public.send_push_notification_edge(
      p_user_id := NEW.user_id,
      p_title := 'Dépôt en attente',
      p_body := 'Ton dépôt de ' || NEW.amount || ' FCFA est en attente de validation',
      p_link := '/portefeuille',
      p_data := jsonb_build_object('type', 'deposit', 'deposit_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger pour envoyer une notification push quand un duel est créé
CREATE OR REPLACE FUNCTION public.trigger_push_on_duel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Notification au joueur 2
    PERFORM public.send_push_notification_edge(
      p_user_id := NEW.player2_id,
      p_title := 'Nouveau défi',
      p_body := p(NEW.player1_id) || ' t\'a défié pour ' || NEW.amount || ' FCFA',
      p_link := '/duels/' || NEW.id,
      p_data := jsonb_build_object('type', 'challenge', 'duel_id', NEW.id)
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'finished' AND OLD.status != 'finished' THEN
    -- Notification aux deux joueurs
    PERFORM public.send_push_notification_edge(
      p_user_id := NEW.player1_id,
      p_title := 'Duel terminé',
      p_body := 'Le duel est terminé. Résultat: ' || NEW.winner_id,
      p_link := '/duels/' || NEW.id,
      p_data := jsonb_build_object('type', 'duel_finished', 'duel_id', NEW.id)
    );
    PERFORM public.send_push_notification_edge(
      p_user_id := NEW.player2_id,
      p_title := 'Duel terminé',
      p_body := 'Le duel est terminé. Résultat: ' || NEW.winner_id,
      p_link := '/duels/' || NEW.id,
      p_data := jsonb_build_object('type', 'duel_finished', 'duel_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Créer les triggers
DROP TRIGGER IF EXISTS trg_push_on_message ON public.duel_messages;
CREATE TRIGGER trg_push_on_message
  AFTER INSERT ON public.duel_messages
  FOR EACH ROW EXECUTE FUNCTION public.trigger_push_on_message();

DROP TRIGGER IF EXISTS trg_push_on_withdrawal ON public.withdrawals;
CREATE TRIGGER trg_push_on_withdrawal
  AFTER INSERT ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.trigger_push_on_withdrawal();

DROP TRIGGER IF EXISTS trg_push_on_deposit ON public.deposits;
CREATE TRIGGER trg_push_on_deposit
  AFTER INSERT ON public.deposits
  FOR EACH ROW EXECUTE FUNCTION public.trigger_push_on_deposit();

DROP TRIGGER IF EXISTS trg_push_on_duel ON public.duels;
CREATE TRIGGER trg_push_on_duel
  AFTER INSERT OR UPDATE ON public.duels
  FOR EACH ROW EXECUTE FUNCTION public.trigger_push_on_duel();

-- Note: Assurez-vous que l'extension pg_net est activée dans Supabase
-- CREATE EXTENSION IF NOT EXISTS pg_net;
