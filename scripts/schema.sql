-- Reference schema created by TypeORM entities (TYPEORM_SYNC=true in development).
-- Tables: users, otp_challenges, apartments, parking_slots, parking_bookings

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone varchar(10) NOT NULL UNIQUE,
  name varchar(120) NULL,
  email varchar(160) NULL,
  roles text[] NOT NULL DEFAULT '{resident}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone varchar(10) NOT NULL,
  otp varchar(6) NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_phone ON otp_challenges (phone);

CREATE TABLE IF NOT EXISTS apartments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  invite_code varchar(16) NOT NULL UNIQUE,
  city varchar(80) NOT NULL,
  state varchar(80) NOT NULL,
  address_line varchar(240) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  latitude double precision NULL,
  longitude double precision NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_apartments_city ON apartments (city);

CREATE TABLE IF NOT EXISTS parking_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  title varchar(120) NOT NULL,
  description varchar(1000) NULL,
  block_name varchar(40) NULL,
  spot_code varchar(40) NOT NULL,
  rent_type varchar(20) NOT NULL,
  price_in_paise int NOT NULL,
  vehicle_size varchar(20) NOT NULL DEFAULT 'four_wheeler',
  image_urls text[] NOT NULL DEFAULT '{}',
  status varchar(32) NOT NULL DEFAULT 'pending_approval',
  latitude double precision NULL,
  longitude double precision NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parking_slots_apartment_id ON parking_slots (apartment_id);
CREATE INDEX IF NOT EXISTS idx_parking_slots_status ON parking_slots (status);

CREATE TABLE IF NOT EXISTS parking_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL,
  apartment_id uuid NOT NULL,
  renter_user_id uuid NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'pending',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  amount_in_paise int NOT NULL,
  payment_status varchar(32) NOT NULL DEFAULT 'pending',
  check_in_code varchar(32) NOT NULL,
  checked_in_at timestamptz NULL,
  checked_out_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parking_bookings_slot_id ON parking_bookings (slot_id);
CREATE INDEX IF NOT EXISTS idx_parking_bookings_status ON parking_bookings (status);
