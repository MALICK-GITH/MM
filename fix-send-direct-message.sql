-- ==========================================
-- Vérifier et corriger la fonction send_direct_message
-- ==========================================

-- 1. Vérifier la signature actuelle de la fonction
SELECT 
    routine_name,
    routine_type,
    data_type,
    external_language
FROM information_schema.routines
WHERE routine_schema = 'public' 
AND routine_name = 'send_direct_message';

-- 2. Vérifier les paramètres de la fonction
SELECT 
    parameter_name,
    data_type,
    ordinal_position
FROM information_schema.parameters
WHERE specific_schema = 'public' 
AND specific_name = 'send_direct_message'
ORDER BY ordinal_position;

-- 3. Recréer la fonction avec la signature correcte
DROP FUNCTION IF EXISTS public.send_direct_message(uuid, text, text, text, text, integer);
DROP FUNCTION IF EXISTS public.send_direct_message(uuid, text);

CREATE OR REPLACE FUNCTION public.send_direct_message(
  p_conversation uuid,
  p_body text,
  p_attachment_path text DEFAULT NULL,
  p_attachment_type text DEFAULT NULL,
  p_attachment_name text DEFAULT NULL,
  p_attachment_size integer DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.conversations%ROWTYPE;
  v_me uuid := auth.uid();
  v_other uuid;
  v_id uuid;
  v_text text;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  -- Récupérer la conversation
  SELECT * INTO c FROM public.conversations WHERE id = p_conversation;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation non trouvée';
  END IF;

  -- Vérifier que l'utilisateur fait partie de la conversation
  IF c.user_low != v_me AND c.user_high != v_me THEN
    RAISE EXCEPTION 'Vous n''êtes pas autorisé à envoyer dans cette conversation';
  END IF;

  -- Déterminer l'autre utilisateur
  v_other := CASE WHEN c.user_low = v_me THEN c.user_high ELSE c.user_low END;

  -- Créer le message
  INSERT INTO public.conversation_messages (
    conversation_id,
    sender_id,
    body,
    attachment_path,
    attachment_type,
    attachment_name,
    attachment_size,
    created_at
  ) VALUES (
    p_conversation,
    v_me,
    p_body,
    p_attachment_path,
    p_attachment_type,
    p_attachment_name,
    p_attachment_size,
    now()
  ) RETURNING id INTO v_id;

  -- Mettre à jour la conversation
  UPDATE public.conversations
  SET last_message_at = now(),
      last_message_preview = LEFT(p_body, 100),
      updated_at = now()
  WHERE id = p_conversation;

  -- Marquer comme non lu pour l'autre utilisateur
  UPDATE public.conversation_participants
  SET last_read_at = NULL,
      unread_count = COALESCE(unread_count, 0) + 1
  WHERE conversation_id = p_conversation AND user_id = v_other;

  RETURN v_id;
END;
$$;

-- 4. Accorder les permissions
GRANT EXECUTE ON FUNCTION public.send_direct_message(uuid, text, text, text, text, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.send_direct_message(uuid, text, text, text, text, integer) FROM anon;

-- 5. Vérifier que la table conversation_messages existe
SELECT * FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'conversation_messages';

-- 6. Vérifier que la table conversations existe
SELECT * FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'conversations';

-- 7. Vérifier que la table conversation_participants existe
SELECT * FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'conversation_participants';
