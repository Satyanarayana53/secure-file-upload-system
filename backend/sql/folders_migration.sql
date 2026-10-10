CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_favorite BOOLEAN DEFAULT false,
  parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

alter table folders
  add column if not exists is_favorite boolean default false;

alter table files
  add column if not exists folder_id uuid references folders(id) on delete set null;

create index if not exists idx_folders_user_parent on folders(user_id, parent_id);
create index if not exists idx_files_user_folder_deleted on files(user_id, folder_id, is_deleted);
