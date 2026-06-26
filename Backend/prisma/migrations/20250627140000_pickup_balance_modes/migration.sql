-- Multi-criteria pickup balancing
ALTER TABLE "League" ADD COLUMN "pickupBalanceModes" "PickupBalanceMode"[] NOT NULL DEFAULT ARRAY['RATING']::"PickupBalanceMode"[];

UPDATE "League"
SET "pickupBalanceModes" = ARRAY["pickupBalanceMode"]::"PickupBalanceMode"[];
