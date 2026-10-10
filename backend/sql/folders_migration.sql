-- Folder support for Secure Upload System

create table if not exists folders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  is_favorite boolean default false,
  parent_id uuid references folders(id) on delete cascade,
  created_at timestamp default now()
);

alter table folders
  add column if not exists is_favorite boolean default false;

alter table files
  add column if not exists folder_id uuid references folders(id) on delete set null;

create index if not exists idx_folders_user_parent on folders(user_id, parent_id);
create index if not exists idx_files_user_folder_deleted on files(user_id, folder_id, is_deleted);
