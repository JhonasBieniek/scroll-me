-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GITHUB');

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "auth_provider" "AuthProvider" NOT NULL DEFAULT 'LOCAL';
ALTER TABLE "users" ADD COLUMN "github_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_github_id_key" ON "users"("github_id");
