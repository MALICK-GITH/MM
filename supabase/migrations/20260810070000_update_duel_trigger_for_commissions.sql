-- ==========================================
-- SKILL2CASH — Mise à jour du trigger de fin de duel pour enregistrer les commissions
-- ==========================================

-- Mettre à jour la fonction trigger pour enregistrer les commissions de plateforme
CREATE OR REPLACE FUNCTION public.trigger_update_elo_on_duel_finish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'finished' AND OLD.status != 'finished' THEN
    -- Mettre à jour l'ELO
    PERFORM public.update_duel_elo(NEW.id);
    
    -- Enregistrer la commission de plateforme (10% par défaut)
    PERFORM public.record_platform_commission(NEW.id, NEW.amount, 10.00);
  END IF;
  RETURN NEW;
END;
$$;
