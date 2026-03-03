DELETE FROM server_tags
WHERE server_id IN (
  SELECT id
  FROM servers
  WHERE ptero_server_id LIKE 'seed-%'
     OR name IN ('Alpha EU', 'Bravo US', 'Charlie DE')
);

DELETE FROM endpoints
WHERE server_id IN (
  SELECT id
  FROM servers
  WHERE ptero_server_id LIKE 'seed-%'
     OR name IN ('Alpha EU', 'Bravo US', 'Charlie DE')
);

DELETE FROM servers
WHERE ptero_server_id LIKE 'seed-%'
   OR name IN ('Alpha EU', 'Bravo US', 'Charlie DE');

DELETE FROM nodes
WHERE ptero_node_id = 'node-local-1'
   OR (name = 'Local Node' AND fqdn_or_ip = '127.0.0.1');

DELETE FROM panels
WHERE name = 'Local Panel'
  AND base_url = 'http://127.0.0.1:8080'
  AND api_key_kid = 'seed-kid-1';

DELETE FROM alert_policies
WHERE name = 'default-status-policy';

DELETE FROM alert_channels
WHERE name = 'Discord Ops'
  AND config_kid = 'seed-kid-1';
