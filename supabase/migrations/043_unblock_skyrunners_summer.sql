-- Skyrunners is back in good standing: remove its summer-spending block.
delete from public.eoy_summer_blocks
where team_id in (select id from public.teams where name ilike '%skyrunner%');
