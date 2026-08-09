-- ==========================================
-- SKILL2CASH — Ajout du système de classement ELO
-- ==========================================

-- Ajouter la colonne elo_rating à la table profiles
ALTER TABLE public.profiles 
ADD COLUMN elo_rating INTEGER NOT NULL DEFAULT 1000;

-- Ajouter la colonne elo_change à la table duels pour tracer les changements
ALTER TABLE public.duels 
ADD COLUMN player1_elo_change INTEGER,
ADD COLUMN player2_elo_change INTEGER;

-- Créer un index sur elo_rating pour le classement
CREATE INDEX idx_profiles_elo_rating ON public.profiles(elo_rating DESC);

-- Créer une table pour l'historique des changements ELO
CREATE TABLE public.elo_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  duel_id uuid REFERENCES public.duels(id) ON DELETE SET NULL,
  old_rating INTEGER NOT NULL,
  new_rating INTEGER NOT NULL,
  change_amount INTEGER NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.elo_history TO authenticated;
GRANT ALL ON public.elo_history TO service_role;
ALTER TABLE public.elo_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "elo_history_select_own" ON public.elo_history FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Fonction pour calculer la probabilité de victoire attendue
CREATE OR REPLACE FUNCTION public.calculate_expected_rating(
  player_rating INTEGER,
  opponent_rating INTEGER
)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT 1.0 / (1.0 + POWER(10.0, (opponent_rating - player_rating) / 400.0));
$$;

-- Fonction pour calculer le nouveau rating ELO
CREATE OR REPLACE FUNCTION public.calculate_new_elo(
  current_rating INTEGER,
  opponent_rating INTEGER,
  actual_score NUMERIC, -- 1.0 pour victoire, 0.5 pour nul, 0.0 pour défaite
  k_factor INTEGER DEFAULT 32
)
RETURNS INTEGER LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT ROUND(current_rating::NUMERIC + k_factor::NUMERIC * (actual_score - public.calculate_expected_rating(current_rating, opponent_rating)))::INTEGER;
$$;

-- Fonction pour mettre à jour les ELO après un duel terminé
CREATE OR REPLACE FUNCTION public.update_duel_elo(duel_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_duel RECORD;
  v_player1_old_elo INTEGER;
  v_player2_old_elo INTEGER;
  v_player1_new_elo INTEGER;
  v_player2_new_elo INTEGER;
  v_player1_score NUMERIC;
  v_player2_score NUMERIC;
  v_reason text;
BEGIN
  -- Récupérer les informations du duel
  SELECT * INTO v_duel 
  FROM public.duels 
  WHERE id = duel_id AND status = 'finished';
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Récupérer les ELO actuels
  SELECT elo_rating INTO v_player1_old_elo
  FROM public.profiles 
  WHERE id = v_duel.player1_id;
  
  SELECT elo_rating INTO v_player2_old_elo
  FROM public.profiles 
  WHERE id = v_duel.player2_id;
  
  -- Déterminer les scores
  IF v_duel.is_draw THEN
    v_player1_score := 0.5;
    v_player2_score := 0.5;
    v_reason := 'Match nul';
  ELSIF v_duel.winner_id = v_duel.player1_id THEN
    v_player1_score := 1.0;
    v_player2_score := 0.0;
    v_reason := 'Victoire joueur 1';
  ELSIF v_duel.winner_id = v_duel.player2_id THEN
    v_player1_score := 0.0;
    v_player2_score := 1.0;
    v_reason := 'Victoire joueur 2';
  ELSE
    RETURN; -- Pas de vainqueur défini
  END IF;
  
  -- Calculer les nouveaux ELO
  v_player1_new_elo := public.calculate_new_elo(v_player1_old_elo, v_player2_old_elo, v_player1_score);
  v_player2_new_elo := public.calculate_new_elo(v_player2_old_elo, v_player1_old_elo, v_player2_score);
  
  -- Mettre à jour les profils
  UPDATE public.profiles 
  SET elo_rating = v_player1_new_elo
  WHERE id = v_duel.player1_id;
  
  UPDATE public.profiles 
  SET elo_rating = v_player2_new_elo
  WHERE id = v_duel.player2_id;
  
  -- Enregistrer les changements dans le duel
  UPDATE public.duels 
  SET 
    player1_elo_change = v_player1_new_elo - v_player1_old_elo,
    player2_elo_change = v_player2_new_elo - v_player2_old_elo
  WHERE id = duel_id;
  
  -- Enregistrer l'historique pour joueur 1
  INSERT INTO public.elo_history (user_id, duel_id, old_rating, new_rating, change_amount, reason)
  VALUES (v_duel.player1_id, duel_id, v_player1_old_elo, v_player1_new_elo, v_player1_new_elo - v_player1_old_elo, v_reason);
  
  -- Enregistrer l'historique pour joueur 2
  INSERT INTO public.elo_history (user_id, duel_id, old_rating, new_rating, change_amount, reason)
  VALUES (v_duel.player2_id, duel_id, v_player2_old_elo, v_player2_new_elo, v_player2_new_elo - v_player2_old_elo, v_reason);
  
END;
$$;

-- Fonction RPC pour obtenir le classement
CREATE OR REPLACE FUNCTION public.get_leaderboard(limit_count INTEGER DEFAULT 50, offset_count INTEGER DEFAULT 0)
RETURNS TABLE (
  rank INTEGER,
  user_id uuid,
  username text,
  efootball_username text,
  elo_rating INTEGER,
  wins INTEGER,
  losses INTEGER,
  win_rate NUMERIC,
  total_earnings NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    ROW_NUMBER() OVER (ORDER BY p.elo_rating DESC) as rank,
    p.id as user_id,
    p.username,
    p.efootball_username,
    p.elo_rating,
    p.wins,
    p.losses,
    CASE 
      WHEN p.wins + p.losses > 0 THEN 
        ROUND((p.wins::NUMERIC / (p.wins + p.losses)::NUMERIC) * 100, 2)
      ELSE 0 
    END as win_rate,
    p.total_earnings
  FROM public.profiles p
  WHERE p.status = 'active' AND NOT p.is_banned
  ORDER BY p.elo_rating DESC
  LIMIT limit_count
  OFFSET offset_count;
$$;

-- Fonction RPC pour obtenir l'historique ELO d'un utilisateur
CREATE OR REPLACE FUNCTION public.get_user_elo_history(user_id_param uuid, limit_count INTEGER DEFAULT 20)
RETURNS TABLE (
  duel_id uuid,
  old_rating INTEGER,
  new_rating INTEGER,
  change_amount INTEGER,
  reason text,
  created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    eh.duel_id,
    eh.old_rating,
    eh.new_rating,
    eh.change_amount,
    eh.reason,
    eh.created_at
  FROM public.elo_history eh
  WHERE eh.user_id = user_id_param
  ORDER BY eh.created_at DESC
  LIMIT limit_count;
$$;

-- Trigger pour mettre à jour automatiquement l'ELO quand un duel est terminé
CREATE OR REPLACE FUNCTION public.trigger_update_elo_on_duel_finish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'finished' AND OLD.status != 'finished' THEN
    PERFORM public.update_duel_elo(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_elo_on_duel_finish
  AFTER UPDATE ON public.duels
  FOR EACH ROW EXECUTE FUNCTION public.trigger_update_elo_on_duel_finish();
