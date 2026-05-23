import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProfileSession } from "../types.ts";

export class ProfileSessionStore {
  private readonly baseDir: string;

  constructor(baseDir = ".agentflow/profile-sessions") {
    this.baseDir = baseDir;
  }

  async save(session: ProfileSession): Promise<{ recordPath: string; currentPath: string }> {
    await mkdir(this.recordsDir(), { recursive: true });
    const recordPath = join(this.recordsDir(), `${session.sessionId}.json`);
    const currentPath = join(this.baseDir, `current-${session.profileId}.json`);
    const payload = `${JSON.stringify(session, null, 2)}\n`;
    await writeFile(recordPath, payload);
    await writeFile(currentPath, payload);
    return { recordPath, currentPath };
  }

  async get(sessionId: string): Promise<ProfileSession> {
    try {
      return JSON.parse(await readFile(join(this.recordsDir(), `${sessionId}.json`), "utf8")) as ProfileSession;
    } catch {
      throw new Error(`Profile session not found: ${sessionId}`);
    }
  }

  async getCurrent(profileId: string): Promise<ProfileSession | null> {
    try {
      return JSON.parse(await readFile(join(this.baseDir, `current-${profileId}.json`), "utf8")) as ProfileSession;
    } catch {
      return null;
    }
  }

  async list(filters: { profileId?: string; status?: ProfileSession["status"]; limit?: number } = {}): Promise<ProfileSession[]> {
    try {
      const files = await readdir(this.recordsDir());
      const sessions = await Promise.all(files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => JSON.parse(await readFile(join(this.recordsDir(), file), "utf8")) as ProfileSession));
      return sessions
        .filter((session) => !filters.profileId || session.profileId === filters.profileId)
        .filter((session) => !filters.status || session.status === filters.status)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, filters.limit ?? sessions.length);
    } catch {
      return [];
    }
  }

  private recordsDir(): string {
    return join(this.baseDir, "records");
  }
}
