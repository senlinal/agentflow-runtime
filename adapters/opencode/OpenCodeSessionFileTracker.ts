import { resolve } from "node:path";

export class OpenCodeSessionFileTracker {
  private readonly created = new Set<string>();
  private readonly deleted = new Set<string>();
  private readonly projectRoot: string;

  constructor(projectRoot = process.cwd()) {
    this.projectRoot = resolve(projectRoot);
  }

  markCreated(path: string): void {
    this.created.add(this.normalize(path));
  }

  markDeleted(path: string): void {
    this.deleted.add(this.normalize(path));
  }

  isCreatedInSession(path: string): boolean {
    return this.created.has(this.normalize(path));
  }

  listCreatedFiles(): string[] {
    return [...this.created].sort();
  }

  listDeletedFiles(): string[] {
    return [...this.deleted].sort();
  }

  normalize(path: string): string {
    return resolve(this.projectRoot, path);
  }
}
