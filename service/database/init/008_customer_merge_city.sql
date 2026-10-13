BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'master_customer' AND column_name = 'kota'
  ) THEN
    UPDATE master_customer
    SET alamat = CASE
      WHEN btrim(alamat) = '' THEN btrim(kota)
      ELSE btrim(alamat) || ', ' || btrim(kota)
    END
    WHERE nullif(btrim(kota), '') IS NOT NULL
      AND position(lower(btrim(kota)) in lower(alamat)) = 0;

    ALTER TABLE master_customer DROP COLUMN kota;
  END IF;
END $$;

COMMIT;
