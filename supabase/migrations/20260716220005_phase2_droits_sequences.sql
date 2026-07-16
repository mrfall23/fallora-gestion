-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 2 — Retablir les droits de service_role sur les sequences
--
-- Constat (verifie le 16/07/2026) : anon et authenticated ont USAGE sur
-- toutes les sequences de public, service_role ne l'a sur aucune. C'est
-- l'inverse de la configuration Supabase par defaut — un GRANT a du etre
-- revoque manuellement a un moment.
--
-- Consequence : service_role peut lire et modifier, mais pas INSERT sur une
-- table a id auto-incremente (nextval refuse). Bloquant pour la route serveur
-- de creation des vendeuses (phase 5), qui utilise la cle secrete.
-- ═══════════════════════════════════════════════════════════════════════

grant usage, select on all sequences in schema public to service_role;

-- Meme traitement pour les sequences creees plus tard, sinon l'anomalie
-- reapparaitra a la prochaine table.
alter default privileges in schema public
  grant usage, select on sequences to service_role;
