-- Additive flag on the existing family_people table: may this person be called by Nikki?
-- (Every person can already be "talked about", so that toggle is replaced by this one.)
alter table family_people add column if not exists can_be_called_by_nikki boolean not null default false;
