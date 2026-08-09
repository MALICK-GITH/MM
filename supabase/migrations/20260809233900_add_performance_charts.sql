-- ==========================================
-- SKILL2CASH — Fonctions pour graphiques de performance
-- ==========================================

-- Fonction RPC pour récupérer l'évolution du solde dans le temps
CREATE OR REPLACE FUNCTION public.get_balance_evolution(
  user_id_param uuid,
  days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  date text,
  balance numeric,
  transactions_count integer
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH daily_transactions AS (
    SELECT 
      DATE(created_at) as transaction_date,
      COALESCE(SUM(CASE 
        WHEN type IN ('deposit', 'win') THEN amount
        WHEN type IN ('withdrawal', 'loss', 'stake_locked') THEN -amount
        ELSE 0
      END), 0) as daily_change,
      COUNT(*) as tx_count
    FROM public.transactions
    WHERE user_id = user_id_param
      AND created_at >= NOW() - (days_back || ' days')::interval
    GROUP BY DATE(created_at)
  ),
  cumulative_balance AS (
    SELECT 
      transaction_date,
      SUM(daily_change) OVER (ORDER BY transaction_date) as running_balance,
      tx_count
    FROM daily_transactions
  )
  SELECT 
    TO_CHAR(transaction_date, 'DD/MM/YYYY') as date,
    COALESCE(running_balance, 0) as balance,
    COALESCE(tx_count, 0) as transactions_count
  FROM cumulative_balance
  ORDER BY transaction_date;
$$;

-- Fonction RPC pour récupérer les gains vs pertes par période
CREATE OR REPLACE FUNCTION public.get_wins_losses(
  user_id_param uuid,
  days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  period text,
  wins numeric,
  losses numeric,
  net_result numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    TO_CHAR(DATE(created_at), 'DD/MM') as period,
    COALESCE(SUM(CASE WHEN type = 'win' THEN amount ELSE 0 END), 0) as wins,
    COALESCE(SUM(CASE WHEN type = 'loss' THEN amount ELSE 0 END), 0) as losses,
    COALESCE(SUM(CASE 
      WHEN type = 'win' THEN amount
      WHEN type = 'loss' THEN -amount
      ELSE 0
    END), 0) as net_result
  FROM public.transactions
  WHERE user_id = user_id_param
    AND type IN ('win', 'loss')
    AND created_at >= NOW() - (days_back || ' days')::interval
  GROUP BY DATE(created_at)
  ORDER BY DATE(created_at);
$$;

-- Fonction RPC pour récupérer la répartition des transactions
CREATE OR REPLACE FUNCTION public.get_transaction_distribution(
  user_id_param uuid,
  days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  transaction_type text,
  total_amount numeric,
  count integer
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    type as transaction_type,
    COALESCE(SUM(amount), 0) as total_amount,
    COUNT(*) as count
  FROM public.transactions
  WHERE user_id = user_id_param
    AND created_at >= NOW() - (days_back || ' days')::interval
  GROUP BY type
  ORDER BY total_amount DESC;
$$;

-- Fonction RPC pour les statistiques de performance
CREATE OR REPLACE FUNCTION public.get_performance_stats(
  user_id_param uuid,
  days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  total_wins numeric,
  total_losses numeric,
  net_profit numeric,
  win_rate numeric,
  max_win numeric,
  max_loss numeric,
  avg_daily_profit numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH stats AS (
    SELECT 
      COALESCE(SUM(CASE WHEN type = 'win' THEN amount ELSE 0 END), 0) as total_wins,
      COALESCE(SUM(CASE WHEN type = 'loss' THEN amount ELSE 0 END), 0) as total_losses,
      COALESCE(SUM(CASE 
        WHEN type = 'win' THEN amount
        WHEN type = 'loss' THEN -amount
        ELSE 0
      END), 0) as net_profit,
      COUNT(CASE WHEN type = 'win' THEN 1 END) as win_count,
      COUNT(CASE WHEN type = 'loss' THEN 1 END) as loss_count,
      COALESCE(MAX(CASE WHEN type = 'win' THEN amount END), 0) as max_win,
      COALESCE(MAX(CASE WHEN type = 'loss' THEN amount END), 0) as max_loss
    FROM public.transactions
    WHERE user_id = user_id_param
      AND type IN ('win', 'loss')
      AND created_at >= NOW() - (days_back || ' days')::interval
  ),
  daily_avg AS (
    SELECT 
      AVG(daily_net) as avg_daily
    FROM (
      SELECT 
        COALESCE(SUM(CASE 
          WHEN type = 'win' THEN amount
          WHEN type = 'loss' THEN -amount
          ELSE 0
        END), 0) as daily_net
      FROM public.transactions
      WHERE user_id = user_id_param
        AND type IN ('win', 'loss')
        AND created_at >= NOW() - (days_back || ' days')::interval
      GROUP BY DATE(created_at)
    ) sub
  )
  SELECT 
    s.total_wins,
    s.total_losses,
    s.net_profit,
    CASE 
      WHEN s.win_count + s.loss_count > 0 THEN 
        ROUND((s.win_count::NUMERIC / (s.win_count + s.loss_count)::NUMERIC) * 100, 2)
      ELSE 0 
    END as win_rate,
    s.max_win,
    s.max_loss,
    COALESCE(d.avg_daily, 0) as avg_daily_profit
  FROM stats s, daily_avg d;
$$;
