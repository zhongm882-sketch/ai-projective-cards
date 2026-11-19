-- 添加用户手机号字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- 添加索引（手机号可选，但如果填了应该是唯一的）
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_key ON users(phone) WHERE phone IS NOT NULL;

-- 添加注释
COMMENT ON COLUMN users.phone IS '用户手机号（可选）';
