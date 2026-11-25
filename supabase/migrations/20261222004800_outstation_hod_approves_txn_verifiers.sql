-- (1) Outstation allowance: the HOD approves it (the final approval), not verifies. Emails and the
--     approval link name the step that way.
-- (2) Petty cash transactions keep who verified them (verified_by: the fleet manager, then the HOD),
--     shown in the transactions table and its export.

-- (1)
create or replace function public.workflow_step_label_for(p_table text, p_step text)
returns text language sql immutable as $$
  select case
    when p_table in ('petty_cash_requests', 'petty_cash_transactions') and p_step = 'approval' then 'Fleet manager verification'
    when p_table in ('petty_cash_requests', 'petty_cash_transactions') and p_step in ('hod_approval', 'hod_verify') then 'HOD verification'
    when p_table = 'outstation_requests' and p_step = 'hod_verify' then 'HOD final approval'
    else public.workflow_step_label(p_step) end;
$$;

-- (2) One line per person, this round: "Name (Fleet manager verification)", then the HOD.
create or replace function public.petty_cash_txn_verifiers(p_id uuid, p_final uuid)
returns text language sql stable security definer set search_path = public as $$
  select nullif(concat_ws(E'\n',
    (select string_agg(coalesce(nullif(s.signer_name, ''), 'Someone') || ' (' || public.workflow_step_label_for('petty_cash_transactions', s.step) || ')', E'\n' order by s.created_at)
       from public.approval_signoffs s
       where s.table_name = 'petty_cash_transactions' and s.record_id = p_id
         -- This round only (a transaction sent again after a rejection starts over).
         and s.created_at >= coalesce((select x.submitted_at from public.petty_cash_transactions x where x.id = p_id), '-infinity'::timestamptz)),
    (select coalesce(nullif(p.full_name, ''), 'Someone') || ' (HOD verification)' from public.profiles p where p.id = p_final)), '');
$$;

-- When a step is signed.
create or replace function public.approval_signoffs_txn_verifiers()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.table_name = 'petty_cash_transactions' then
    update public.petty_cash_transactions t
    set verified_by = public.petty_cash_txn_verifiers(t.id, case when t.status = 'approved' then t.approved_by end)
    where t.id = new.record_id;
  end if;
  return null;
end;
$$;
drop trigger if exists approval_signoffs_txn_verifiers on public.approval_signoffs;
create trigger approval_signoffs_txn_verifiers after insert on public.approval_signoffs
  for each row execute function public.approval_signoffs_txn_verifiers();

-- When the HOD verifies it (the final step) or it goes back.
create or replace function public.petty_cash_txn_verified_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status or new.approved_by is distinct from old.approved_by then
    if new.status = 'approved' then
      new.verified_by := public.petty_cash_txn_verifiers(new.id, coalesce(new.approved_by, auth.uid()));
      new.verification := 'verified';
    else
      new.verified_by := public.petty_cash_txn_verifiers(new.id, null);
      new.verification := 'not_verified';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists petty_cash_txn_verified_by on public.petty_cash_transactions;
create trigger petty_cash_txn_verified_by before update on public.petty_cash_transactions
  for each row execute function public.petty_cash_txn_verified_by();

-- Transactions so far.
update public.petty_cash_transactions t
set verified_by = coalesce(public.petty_cash_txn_verifiers(t.id, case when t.status = 'approved' then t.approved_by end), t.verified_by)
where t.deleted_at is null;
