-- Allow supplier and customer archives to maintain separate code namespaces.
DROP INDEX IF EXISTS "Partner_accountSetId_code_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Partner_accountSetId_partnerType_code_key"
ON "Partner"("accountSetId", "partnerType", "code");
