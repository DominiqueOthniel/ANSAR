ALTER TABLE trucks
  ADD COLUMN IF NOT EXISTS flotte VARCHAR(20) NOT NULL DEFAULT 'ansar';

ALTER TABLE trucks DROP CONSTRAINT IF EXISTS trucks_flotte_check;
ALTER TABLE trucks
  ADD CONSTRAINT trucks_flotte_check CHECK (flotte IN ('ansar', 'tjk'));

CREATE INDEX IF NOT EXISTS idx_trucks_flotte ON trucks(flotte);
