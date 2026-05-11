import fs from "node:fs/promises";
import path from "node:path";

function resolveDataDir() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join("/tmp", "speaknow-data");
  }
  return path.join(process.cwd(), "data");
}

const DATA_DIR = resolveDataDir();
const DATA_FILE = path.join(DATA_DIR, "app-db.json");

const EMPTY_DB = {
  users: [],
  voiceSessions: [],
  presentationSessions: [],
  activityRecords: [],
  settings: {
    adminEmails: [],
  },
};

async function ensureDbFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(EMPTY_DB, null, 2), "utf8");
  }
}

export async function readAppDb() {
  await ensureDbFile();
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      voiceSessions: Array.isArray(parsed.voiceSessions) ? parsed.voiceSessions : [],
      presentationSessions: Array.isArray(parsed.presentationSessions) ? parsed.presentationSessions : [],
      activityRecords: Array.isArray(parsed.activityRecords) ? parsed.activityRecords : [],
      settings: {
        adminEmails: Array.isArray(parsed.settings?.adminEmails)
          ? parsed.settings.adminEmails
          : [],
      },
    };
  } catch {
    return { ...EMPTY_DB };
  }
}

export async function writeAppDb(db) {
  await ensureDbFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}

export async function mutateAppDb(mutator) {
  const db = await readAppDb();
  const nextDb = (await mutator(db)) || db;
  await writeAppDb(nextDb);
  return nextDb;
}
