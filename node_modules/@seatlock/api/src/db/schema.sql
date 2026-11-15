CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  tz_offset_minutes integer NOT NULL DEFAULT 0 CHECK (tz_offset_minutes BETWEEN -840 AND 840),
  availability_start_minutes integer NOT NULL DEFAULT 0 CHECK (availability_start_minutes BETWEEN 0 AND 1439),
  availability_end_minutes integer NOT NULL DEFAULT 1440 CHECK (availability_end_minutes BETWEEN 1 AND 1440),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (availability_start_minutes <> availability_end_minutes)
);

CREATE TABLE IF NOT EXISTS hackathons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  min_size integer NOT NULL CHECK (min_size > 0),
  max_size integer NOT NULL CHECK (max_size >= min_size),
  check_in_cutoff timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_hackathon_name ON hackathons(lower(name));

CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES hackathons(id),
  name text NOT NULL,
  min_size integer NOT NULL,
  max_size integer NOT NULL,
  member_count integer NOT NULL DEFAULT 0 CHECK (member_count >= 0 AND member_count <= max_size),
  version bigint NOT NULL DEFAULT 0,
  locked_in boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (min_size > 0 AND max_size >= min_size)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_live_team_name
  ON teams(hackathon_id, lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS memberships (
  team_id uuid NOT NULL REFERENCES teams(id),
  hackathon_id uuid NOT NULL REFERENCES hackathons(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('leader', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id),
  UNIQUE (hackathon_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_live_team_leader
  ON memberships(team_id) WHERE role = 'leader';

CREATE TABLE IF NOT EXISTS invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id),
  digest bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id),
  user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_request
  ON join_requests(team_id, user_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  request_hash text NOT NULL,
  status integer,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, user_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  team_id uuid REFERENCES teams(id),
  target_user_id uuid REFERENCES users(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash text NOT NULL,
  hash text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS outbox (
  sequence bigserial PRIMARY KEY,
  topic text NOT NULL,
  aggregate_id uuid,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS code_failures (
  key text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teams_board_keyset
  ON teams(hackathon_id, created_at DESC, id) INCLUDE (name, member_count, max_size)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS memberships_team_tenure ON memberships(team_id, joined_at, user_id);
CREATE INDEX IF NOT EXISTS outbox_sequence ON outbox(sequence);

CREATE OR REPLACE FUNCTION prevent_member_count_drift() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.member_count <> (SELECT count(*) FROM memberships WHERE team_id = NEW.id) THEN
    RAISE EXCEPTION 'member_count must equal membership rows';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS team_count_matches_memberships ON teams;
CREATE CONSTRAINT TRIGGER team_count_matches_memberships
AFTER INSERT OR UPDATE OF member_count ON teams
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION prevent_member_count_drift();
