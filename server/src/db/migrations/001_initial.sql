-- AI 投射卡：初始表结构
--
-- 加密边界（这是整套隐私设计的核心）：
--   * 用户逐字说的话（rounds）、报告正文、留言 → 应用层 AES-256-GCM 加密后存 bytea，
--     数据库被脱库也读不出内容。
--   * 主题标签（「关系」「成长」这类词）→ 明文存 report_themes。
--     敏感度低、查询价值高，成长轨迹的趋势统计全靠它。

CREATE EXTENSION IF NOT EXISTS citext;

-- ── 用户与设备 ──────────────────────────────────────────────

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,   -- citext：邮箱不区分大小写
  password_hash text   NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 游客身份。device_key 由客户端生成并保存在本地。
-- user_id 为空表示还是游客；注册后回填，原有探索记录随之归属到账号。
CREATE TABLE devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_key   text NOT NULL UNIQUE,
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX devices_user_id_idx ON devices(user_id) WHERE user_id IS NOT NULL;

-- ── 刷新 token ──────────────────────────────────────────────

-- 只存哈希，不存原文：这是长期凭据，明文入库等于把钥匙留在门口。
CREATE TABLE auth_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('user', 'device')),
  subject_id   uuid NOT NULL,
  refresh_hash text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_tokens_subject_idx ON auth_tokens(subject_type, subject_id);
CREATE INDEX auth_tokens_expires_idx ON auth_tokens(expires_at) WHERE revoked_at IS NULL;

-- ── 探索记录 ────────────────────────────────────────────────

CREATE TABLE explorations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 客户端生成的 id，用于去重：同一次探索重复上传不应产生两条记录。
  client_id     text,
  user_id       uuid REFERENCES users(id) ON DELETE CASCADE,
  device_id     uuid REFERENCES devices(id) ON DELETE CASCADE,

  card_path        text,
  card_description text,

  -- 完整对话，加密存储
  rounds_cipher bytea NOT NULL,
  rounds_iv     bytea NOT NULL,
  rounds_tag    bytea NOT NULL,
  round_count   int   NOT NULL DEFAULT 0,

  -- 「还有什么想说的吗」留言，加密存储（可为空）
  note_cipher bytea,
  note_iv     bytea,
  note_tag    bytea,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- 归属必须明确：要么属于某个用户，要么属于某台设备，不能都为空。
  CONSTRAINT explorations_owner_present
    CHECK (user_id IS NOT NULL OR device_id IS NOT NULL)
);

-- 去重索引。用户和设备分开建：游客升级成账号后，
-- 同一个 client_id 在新归属下仍然唯一。
CREATE UNIQUE INDEX explorations_user_client_uniq
  ON explorations(user_id, client_id)
  WHERE user_id IS NOT NULL AND client_id IS NOT NULL;

CREATE UNIQUE INDEX explorations_device_client_uniq
  ON explorations(device_id, client_id)
  WHERE user_id IS NULL AND device_id IS NOT NULL AND client_id IS NOT NULL;

-- 列表按时间倒序翻页，这两个索引是给它用的
CREATE INDEX explorations_user_created_idx
  ON explorations(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX explorations_device_created_idx
  ON explorations(device_id, created_at DESC) WHERE device_id IS NOT NULL;

-- ── 报告 ────────────────────────────────────────────────────

CREATE TABLE reports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exploration_id uuid NOT NULL UNIQUE REFERENCES explorations(id) ON DELETE CASCADE,

  -- 报告的十个文字字段整体序列化后加密
  prose_cipher bytea NOT NULL,
  prose_iv     bytea NOT NULL,
  prose_tag    bytea NOT NULL,

  -- 元数据，明文即可，便于排查「哪个模型写出来的报告质量差」
  provider     text,
  model        text,
  generated_at timestamptz NOT NULL DEFAULT now()
);

-- 主题标签明文存储，这是成长轨迹统计的基础
CREATE TABLE report_themes (
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  theme     text NOT NULL,
  position  int  NOT NULL DEFAULT 0,
  PRIMARY KEY (report_id, theme)
);

CREATE INDEX report_themes_theme_idx ON report_themes(theme);

-- ── 反馈 ────────────────────────────────────────────────────

CREATE TABLE feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  device_id  uuid REFERENCES devices(id) ON DELETE SET NULL,
  message    text NOT NULL,
  contact    text,
  created_at timestamptz NOT NULL DEFAULT now()
);
