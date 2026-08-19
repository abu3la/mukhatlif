-- Align the current Plus catalog price with the approved admin studio handoff.
-- Existing subscriptions keep their original price snapshot by design.
update plans
set price_minor = 2900
where id = 'pln-plus';
