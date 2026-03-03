// Prisma CLI config — loads dev DATABASE_URL by default for migrations.
// To run against prod: DATABASE_URL="prod-url" npx prisma migrate deploy
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config({ path: ".env.development.local" });
dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
