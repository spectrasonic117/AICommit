import * as vscode from "vscode";

interface GitAPI {
  repositories: Repository[];
}

interface Repository {
  rootUri: vscode.Uri;
  inputBox: { value: string };
  state: RepositoryState;
  add(paths: string[]): Promise<void>;
  commit(message: string): Promise<void>;
  diff(cached?: boolean): Promise<string>;
}

interface RepositoryState {
  indexChanges: Change[];
  workingTreeChanges: Change[];
}

interface Change {
  uri: vscode.Uri;
  status: number;
}

let gitApiCache: GitAPI | undefined;

export async function getGitAPI(): Promise<GitAPI | undefined> {
  if (gitApiCache) {
    return gitApiCache;
  }
  const ext = vscode.extensions.getExtension("vscode.git");
  if (!ext) {
    return undefined;
  }
  if (!ext.isActive) {
    await ext.activate();
  }
  gitApiCache = ext.exports.getAPI(1);
  return gitApiCache;
}

export function getRepository(git: GitAPI): Repository | undefined {
  if (git.repositories.length === 0) {
    return undefined;
  }
  return git.repositories[0];
}

export async function stageAllChanges(repo: Repository): Promise<number> {
  const unstaged = repo.state.workingTreeChanges;
  if (unstaged.length === 0) {
    return 0;
  }
  const paths = unstaged.map((change) => change.uri.fsPath);
  await repo.add(paths);
  return paths.length;
}

export function hasAnyChanges(repo: Repository): boolean {
  return (
    repo.state.indexChanges.length > 0 ||
    repo.state.workingTreeChanges.length > 0
  );
}

export async function getStagedDiff(repo: Repository): Promise<string> {
  return repo.diff(true);
}

export async function commit(repo: Repository, message: string): Promise<void> {
  await repo.commit(message);
}
