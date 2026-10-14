select t.as_admin();
do $$
begin
  if exists (select 1 from t.log where not ok) then
    raise exception E'SWAP TESTS FAILED:\n%',
      (select string_agg(n || ' ' || label || coalesce(' [' || detail || ']', ''), E'\n' order by n) from t.log where not ok);
  end if;
end
$$;
select count(*) as checks_passed from t.log;
rollback;
