-- ============================================================
-- English Training — Supabase Schema Migration
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ──────────────────────────────────────────────
-- Phase 1: Profiles (extends auth.users)
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL
    CHECK (length(username) BETWEEN 3 AND 20)
    CHECK (username ~ '^[a-zA-Z0-9_]+$'),
  display_name TEXT CHECK (length(display_name) <= 50),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles (username text_pattern_ops);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ──────────────────────────────────────────────
-- Phase 2: User Progress & Achievements
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_progress (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  total_xp INTEGER NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  level INTEGER NOT NULL DEFAULT 0 CHECK (level >= 0),
  daily_xp INTEGER NOT NULL DEFAULT 0 CHECK (daily_xp >= 0),
  daily_xp_date DATE,
  weekly_xp INTEGER NOT NULL DEFAULT 0 CHECK (weekly_xp >= 0),
  weekly_start DATE,
  unlocked_rewards TEXT[] NOT NULL DEFAULT '{}',
  current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak INTEGER NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  total_questions INTEGER NOT NULL DEFAULT 0 CHECK (total_questions >= 0),
  total_correct INTEGER NOT NULL DEFAULT 0 CHECK (total_correct >= 0),
  predicted_score REAL DEFAULT 0,
  expedition_best_floor INTEGER NOT NULL DEFAULT 0 CHECK (expedition_best_floor >= 0),
  expedition_total_runs INTEGER NOT NULL DEFAULT 0,
  expedition_completed_runs INTEGER NOT NULL DEFAULT 0,
  expedition_coins INTEGER NOT NULL DEFAULT 50 CHECK (expedition_coins >= 0),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "progress_select_own" ON user_progress FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "progress_insert_own" ON user_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "progress_update_own" ON user_progress FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  NEW.synced_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON user_progress
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL CHECK (length(achievement_id) <= 50),
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "achievements_select_own" ON user_achievements FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "achievements_insert_own" ON user_achievements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS daily_stats (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date_key DATE NOT NULL,
  questions_attempted INTEGER NOT NULL DEFAULT 0 CHECK (questions_attempted >= 0),
  questions_correct INTEGER NOT NULL DEFAULT 0 CHECK (questions_correct >= 0),
  time_spent_seconds INTEGER NOT NULL DEFAULT 0 CHECK (time_spent_seconds >= 0),
  xp_earned INTEGER NOT NULL DEFAULT 0 CHECK (xp_earned >= 0),
  PRIMARY KEY (user_id, date_key)
);

ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_stats_own" ON daily_stats FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ──────────────────────────────────────────────
-- Phase 3: Friendships & Leaderboards
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships (requester_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships (addressee_id, status);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendships_select" ON friendships FOR SELECT
  USING (auth.uid() IN (requester_id, addressee_id));
CREATE POLICY "friendships_insert" ON friendships FOR INSERT
  WITH CHECK (auth.uid() = requester_id AND status = 'pending');
CREATE POLICY "friendships_update" ON friendships FOR UPDATE
  USING (auth.uid() = addressee_id AND status = 'pending')
  WITH CHECK (status IN ('accepted', 'declined'));
CREATE POLICY "friendships_delete" ON friendships FOR DELETE
  USING (auth.uid() IN (requester_id, addressee_id));

-- RLS policies that depend on friendships table (moved from Phase 2)
CREATE POLICY "progress_select_friends" ON user_progress FOR SELECT
  USING (
    user_id IN (
      SELECT CASE WHEN requester_id = auth.uid() THEN addressee_id ELSE requester_id END
      FROM friendships
      WHERE (requester_id = auth.uid() OR addressee_id = auth.uid()) AND status = 'accepted'
    )
  );

CREATE POLICY "achievements_select_friends" ON user_achievements FOR SELECT
  USING (
    user_id IN (
      SELECT CASE WHEN requester_id = auth.uid() THEN addressee_id ELSE requester_id END
      FROM friendships
      WHERE (requester_id = auth.uid() OR addressee_id = auth.uid()) AND status = 'accepted'
    )
  );

-- Friend limit enforcement (max 50)
CREATE OR REPLACE FUNCTION check_friend_limit()
RETURNS TRIGGER AS $$
DECLARE
  requester_count INTEGER;
  addressee_count INTEGER;
BEGIN
  IF NEW.status = 'accepted' THEN
    SELECT COUNT(*) INTO requester_count
    FROM friendships
    WHERE (requester_id = NEW.requester_id OR addressee_id = NEW.requester_id)
      AND status = 'accepted';

    SELECT COUNT(*) INTO addressee_count
    FROM friendships
    WHERE (requester_id = NEW.addressee_id OR addressee_id = NEW.addressee_id)
      AND status = 'accepted';

    IF requester_count >= 50 OR addressee_count >= 50 THEN
      RAISE EXCEPTION 'Friend limit reached (max 50)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_friend_limit
  BEFORE INSERT OR UPDATE ON friendships
  FOR EACH ROW EXECUTE FUNCTION check_friend_limit();

-- ──────────────────────────────────────────────
-- Leaderboard Functions
-- ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_friend_leaderboard(
  requesting_user UUID,
  metric TEXT DEFAULT 'weekly_xp'
)
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  value INTEGER,
  level INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH friend_ids AS (
    SELECT requesting_user AS uid
    UNION
    SELECT CASE WHEN f.requester_id = requesting_user THEN f.addressee_id ELSE f.requester_id END
    FROM friendships f
    WHERE (f.requester_id = requesting_user OR f.addressee_id = requesting_user)
      AND f.status = 'accepted'
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY
      CASE metric
        WHEN 'weekly_xp' THEN up.weekly_xp
        WHEN 'total_xp' THEN up.total_xp
        WHEN 'streak' THEN up.current_streak
        WHEN 'expedition' THEN up.expedition_best_floor
      END DESC
    ) AS rank,
    p.id AS user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    CASE metric
      WHEN 'weekly_xp' THEN up.weekly_xp
      WHEN 'total_xp' THEN up.total_xp
      WHEN 'streak' THEN up.current_streak
      WHEN 'expedition' THEN up.expedition_best_floor
    END AS value,
    up.level
  FROM friend_ids fi
  JOIN profiles p ON p.id = fi.uid
  JOIN user_progress up ON up.user_id = fi.uid
  ORDER BY rank;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_global_leaderboard(metric TEXT DEFAULT 'weekly_xp')
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  value INTEGER,
  level INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY
      CASE metric
        WHEN 'weekly_xp' THEN up.weekly_xp
        WHEN 'total_xp' THEN up.total_xp
        WHEN 'streak' THEN up.current_streak
        WHEN 'expedition' THEN up.expedition_best_floor
      END DESC
    ) AS rank,
    p.id AS user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    CASE metric
      WHEN 'weekly_xp' THEN up.weekly_xp
      WHEN 'total_xp' THEN up.total_xp
      WHEN 'streak' THEN up.current_streak
      WHEN 'expedition' THEN up.expedition_best_floor
    END AS value,
    up.level
  FROM profiles p
  JOIN user_progress up ON up.user_id = p.id
  ORDER BY rank
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
