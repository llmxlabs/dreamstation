import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const prismaClientSingleton = () => {
  const envUrl = process.env.DATABASE_URL;
  // Resolve to an absolute file path — strip "file:" prefix if present
  const rawUrl =
    !envUrl || envUrl === "undefined"
      ? `file:./prisma/dev.db`
      : envUrl;
  // better-sqlite3 url param is the filename: plain absolute path or ":memory:"
  const dbPath = rawUrl.startsWith("file:")
    ? path.resolve(/* turbopackIgnore: true */ process.cwd(), rawUrl.replace(/^file:\/\//, "").replace(/^file:/, ""))
    : path.resolve(/* turbopackIgnore: true */ rawUrl);
  const adapter = new PrismaBetterSqlite3({ url: dbPath });
  return new PrismaClient({ adapter });
};

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prisma ?? prismaClientSingleton();
export default prisma;

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;
