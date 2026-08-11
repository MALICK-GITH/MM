-- ==========================================
-- SKILL2CASH — Système de notifications push
-- ==========================================

-- Créer la table pour stocker les abonnements push
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  device_info jsonb DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Créer des index pour les performances
CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_active ON public.push_subscriptions(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_push_subscriptions_token ON public.push_subscriptions(token);

-- Accorder les permissions
GRANT SELECT, INSERT, UPDATE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

-- Activer RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Politique RLS : les utilisateurs peuvent voir leurs propres abonnements
CREATE POLICY "push_subscriptions_select_own" ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Politique RLS : les utilisateurs peuvent insérer leurs propres abonnements
CREATE POLICY "push_subscriptions_insert_own" ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Politique RLS : les utilisateurs peuvent mettre à jour leurs propres abonnements
CREATE POLICY "push_subscriptions_update_own" ON public.push_subscriptions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Fonction pour mettre à jour le timestamp updated_at
CREATE OR REPLACE FUNCTION public.update_push_subscription_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger pour mettre à jour updated_at automatiquement
CREATE TRIGGER trigger_update_push_subscription_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_push_subscription_updated_at();

-- Fonction RPC pour enregistrer un abonnement push
CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_token text,
  p_device_info jsonb DEFAULT '{}'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  
  -- Désactiver les anciens abonnements du même utilisateur
  UPDATE public.push_subscriptions
  SET is_active = false
  WHERE user_id = v_me AND token = p_token;
  
  -- Insérer ou réactiver l'abonnement
  INSERT INTO public.push_subscriptions (user_id, token, device_info, is_active)
  VALUES (v_me, p_token, p_device_info, true)
  ON CONFLICT (user_id, token)
  DO UPDATE SET
    device_info = p_device_info,
    is_active = true,
    updated_at = now()
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Fonction RPC pour désactiver un abonnement push
CREATE OR REPLACE FUNCTION public.unregister_push_subscription(p_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  
  UPDATE public.push_subscriptions
  SET is_active = false
  WHERE user_id = v_me AND token = p_token;
  
  RETURN true;
END;
$$;

-- Fonction RPC pour obtenir les tokens push actifs d'un utilisateur
CREATE OR REPLACE FUNCTION public.get_user_push_tokens(p_user_id uuid)
RETURNS TABLE (token text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT token
  FROM public.push_subscriptions
  WHERE user_id = p_user_id AND is_active = true;
END;
$$;

-- Accorder les permissions pour les fonctions RPC
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_push_subscription(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_push_tokens(uuid) TO service_role;

-- Commentaire sur la table
COMMENT ON TABLE public.push_subscriptions IS 'Table pour stocker les abonnements aux notifications push des utilisateurs';
COMMENT ON COLUMN public.push_subscriptions.token IS 'Token FCM pour les notifications push';
COMMENT ON COLUMN public.push_subscriptions.device_info IS 'Informations sur l\'appareil (user agent, platform, etc.)';
