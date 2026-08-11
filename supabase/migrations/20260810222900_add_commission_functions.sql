-- ==========================================
-- SKILL2CASH — Ajout des fonctions RPC pour les commissions (table déjà existe)
-- ==========================================

-- Fonction RPC pour enregistrer une commission de plateforme
CREATE OR REPLACE FUNCTION public.record_platform_commission(
  p_duel_id uuid,
  p_amount numeric,
  p_rate numeric DEFAULT 10.00
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_commission_id uuid;
  v_commission_amount numeric;
BEGIN
  -- Calculer le montant de la commission
  v_commission_amount := (p_amount * p_rate) / 100;
  
  -- Insérer la commission
  INSERT INTO public.platform_commissions (duel_id, amount, commission_rate)
  VALUES (p_duel_id, v_commission_amount, p_rate)
  RETURNING id INTO v_commission_id;
  
  RETURN v_commission_id;
END;
$$;

-- Fonction RPC pour obtenir les statistiques de revenus de la plateforme
CREATE OR REPLACE FUNCTION public.get_platform_revenue_stats(
  p_days_back integer DEFAULT 30
)
RETURNS TABLE (
  total_revenue numeric,
  total_duels_count bigint,
  avg_commission_per_duel numeric,
  commission_rate_avg numeric,
  daily_revenue numeric,
  revenue_by_day jsonb
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start_date timestamptz;
BEGIN
  v_start_date := now() - (p_days_back || ' days')::interval;
  
  RETURN QUERY
  WITH stats AS (
    SELECT
      COALESCE(SUM(amount), 0) as total_revenue,
      COUNT(*) as total_duels_count,
      COALESCE(AVG(amount), 0) as avg_commission_per_duel,
      COALESCE(AVG(commission_rate), 0) as commission_rate_avg,
      COALESCE(SUM(amount) / NULLIF(p_days_back, 0), 0) as daily_revenue
    FROM public.platform_commissions
    WHERE created_at >= v_start_date
  ),
  daily_data AS (
    SELECT
      DATE(created_at) as day,
      SUM(amount) as daily_amount
    FROM public.platform_commissions
    WHERE created_at >= v_start_date
    GROUP BY DATE(created_at)
    ORDER BY day DESC
  )
  SELECT
    s.total_revenue,
    s.total_duels_count,
    s.avg_commission_per_duel,
    s.commission_rate_avg,
    s.daily_revenue,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(d.day, 'DD/MM/YYYY'),
          'amount', d.daily_amount
        )
      ),
      '[]'::jsonb
    ) as revenue_by_day
  FROM stats s, daily_data d;
END;
$$;

-- Fonction RPC pour obtenir l'évolution des revenus par jour
CREATE OR REPLACE FUNCTION public.get_revenue_evolution(
  p_days_back integer DEFAULT 30
)
RETURNS TABLE (
  date text,
  revenue numeric,
  duels_count bigint,
  avg_commission numeric
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(DATE(pc.created_at), 'DD/MM/YYYY') as date,
    COALESCE(SUM(pc.amount), 0) as revenue,
    COUNT(*) as duels_count,
    COALESCE(AVG(pc.amount), 0) as avg_commission
  FROM public.platform_commissions pc
  WHERE pc.created_at >= now() - (p_days_back || ' days')::interval
  GROUP BY DATE(pc.created_at)
  ORDER BY DATE(pc.created_at) ASC;
END;
$$;

-- Accorder les permissions pour les fonctions RPC
GRANT EXECUTE ON FUNCTION public.record_platform_commission(uuid, numeric, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_platform_revenue_stats(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_revenue_evolution(integer) TO authenticated;
