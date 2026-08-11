-- Activer l'extension pg_net pour les requêtes HTTP depuis PostgreSQL
-- Exécuter ce script dans le SQL Editor de Supabase

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Vérifier que l'extension est activée
SELECT * FROM pg_extension WHERE extname = 'pg_net';
