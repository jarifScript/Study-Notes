-- Upgrade the original singleton admin configuration to support multiple admins.
-- Existing configured admin accounts are preserved.
begin;

alter table public.admin_config drop constraint if exists admin_config_pkey;
alter table public.admin_config drop constraint if exists admin_config_user_id_key;
alter table public.admin_config drop column if exists singleton;
alter table public.admin_config add constraint admin_config_pkey primary key (user_id);

commit;
