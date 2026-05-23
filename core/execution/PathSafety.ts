import { isAbsolute, resolve, relative, basename } from "node:path";

export function resolveInsideProject(inputPath: string, projectRoot: string): string {
  const root = resolve(projectRoot);
  const candidate = isAbsolute(inputPath) ? resolve(inputPath) : resolve(root, inputPath);
  if (!isInsidePath(candidate, root)) {
    throw new Error(`Path is outside the project root: ${inputPath}`);
  }
  return candidate;
}

export function isInsidePath(candidatePath: string, rootPath: string): boolean {
  const relativePath = relative(resolve(rootPath), resolve(candidatePath));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

export function assertSafeWritablePath(inputPath: string, projectRoot: string): string {
  const resolved = resolveInsideProject(inputPath, projectRoot);
  const name = basename(resolved).toLowerCase();
  if (name === ".env" || name.endsWith(".pem") || name.endsWith(".key")) {
    throw new Error(`Refusing to write sensitive file path: ${inputPath}`);
  }
  return resolved;
}
