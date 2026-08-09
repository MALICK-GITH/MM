-- ==========================================
-- SKILL2CASH — Correction du tri du classement ELO
-- ==========================================

-- Mettre à jour la fonction get_leaderboard pour ajouter des critères de tri secondaires
-- quand les ELO sont égaux

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
    ROW_NUMBER() OVER (ORDER BY p.elo_rating DESC, p.wins DESC, p.total_earnings DESC, p.created_at ASC) as rank,
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
  ORDER BY p.elo_rating DESC, p.wins DESC, p.total_earnings DESC, p.created_at ASC
  LIMIT limit_count
  OFFSET offset_count;
$$;
