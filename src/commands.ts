import * as vscode from "vscode";
import { generateCommitMessage as geminiGenerateCommit } from "./ai/gemini";
import { generateCommitMessage as mistralGenerateCommit } from "./ai/mistral";
import {
  Provider,
  ProviderId,
  PROVIDERS,
  getProvider,
  getConfiguredProvider,
  setProvider,
} from "./ai/providers";
import {
  getApiKey,
  promptForApiKey,
  getOrPromptApiKey,
} from "./ui/apiKeyPrompt";
import {
  getGitAPI,
  getRepository,
  stageAllChanges,
  hasAnyChanges,
  getStagedDiff,
  commit,
} from "./git/operations";

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "aiCommit.generateCommit",
      () => handleGenerateCommit(context)
    ),
    vscode.commands.registerCommand(
      "aiCommit.selectProvider",
      () => handleSelectProvider()
    ),
    vscode.commands.registerCommand(
      "aiCommit.selectModel",
      () => handleSelectModel()
    ),
    vscode.commands.registerCommand(
      "aiCommit.setApiKey",
      () => handleSetApiKey(context)
    ),
    vscode.commands.registerCommand(
      "aiCommit.diagnose",
      () => handleDiagnose(context)
    )
  );
}

async function handleGenerateCommit(
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    const git = await getGitAPI();
    if (!git) {
      vscode.window.showErrorMessage("Git extension not found.");
      return;
    }

    const repo = getRepository(git);
    if (!repo) {
      vscode.window.showWarningMessage(
        "No git repository found. Open a folder with a git repository."
      );
      return;
    }

    if (!hasAnyChanges(repo)) {
      vscode.window.showWarningMessage("No changes to commit.");
      return;
    }

    const provider = await getConfiguredProvider();
    let apiKey = await getApiKey(context, provider.id);

    if (!apiKey) {
      apiKey = await promptForApiKey(context, provider.id);
      if (!apiKey) {
        return;
      }
    }

    const config = vscode.workspace.getConfiguration("aiCommit");
    const model = config.get<string>(`model${provider.id.charAt(0).toUpperCase() + provider.id.slice(1)}`, provider.models[0]?.id || "");
    const systemPrompt = config.get<string>("systemPrompt", "");

    const stagedCount = repo.state.indexChanges.length;
    const unstagedCount = repo.state.workingTreeChanges.length;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.SourceControl,
        title: "Generating AI commit message...",
      },
      async (progress) => {
        progress.report({ message: "Staging changes..." });

        if (unstagedCount > 0) {
          await stageAllChanges(repo);
        }

        progress.report({ message: "Getting diff..." });
        const diff = await getStagedDiff(repo);

        if (!diff) {
          throw new Error("No diff available after staging.");
        }

        progress.report({ message: `Calling ${provider.name} API...` });

        let message: string;
        if (provider.id === "google") {
          message = await geminiGenerateCommit(model, apiKey!, systemPrompt, diff);
        } else if (provider.id === "mistral") {
          message = await mistralGenerateCommit(model, apiKey!, systemPrompt, diff);
        } else {
          throw new Error(`Unsupported provider: ${provider.id}`);
        }

        progress.report({ message: "Committing..." });
        repo.inputBox.value = message;
        await commit(repo, message);

        vscode.window.showInformationMessage("Commit Generated Successfully");
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(`AI Commit failed: ${message}`);
  }
}

async function handleSelectProvider(): Promise<void> {
  const currentProvider = await getConfiguredProvider();

  const items: vscode.QuickPickItem[] = PROVIDERS.map((p) => ({
    label: p.name,
    description: `${p.models.length} models available`,
    detail: currentProvider.id === p.id ? "Currently selected" : undefined,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: "AI Commit: Select Provider",
    placeHolder: "Choose the AI provider for commit generation",
  });

  if (picked) {
    const selectedProvider = PROVIDERS.find((p) => p.name === picked.label);
    if (selectedProvider) {
      await setProvider(selectedProvider.id);

      const config = vscode.workspace.getConfiguration("aiCommit");
      const modelKey = `model${selectedProvider.id.charAt(0).toUpperCase() + selectedProvider.id.slice(1)}`;
      const currentModel = config.get<string>(modelKey);

      if (!currentModel || !selectedProvider.models.some((m) => m.id === currentModel)) {
        await config.update(
          modelKey,
          selectedProvider.models[0]?.id,
          vscode.ConfigurationTarget.Global
        );
      }

      vscode.window.showInformationMessage(
        `AI Commit provider set to: ${selectedProvider.name}`
      );
    }
  }
}

async function handleSelectModel(): Promise<void> {
  const provider = await getConfiguredProvider();
  const config = vscode.workspace.getConfiguration("aiCommit");
  const modelKey = `model${provider.id.charAt(0).toUpperCase() + provider.id.slice(1)}`;
  const current = config.get<string>(modelKey, provider.models[0]?.id || "");

  const items: vscode.QuickPickItem[] = provider.models.map((m) => ({
    label: m.name,
    detail: current === m.id ? "Currently selected" : undefined,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: `AI Commit: Select Model (${provider.name})`,
    placeHolder: `Choose the model for ${provider.name}`,
  });

  if (picked) {
    await config.update(
      modelKey,
      picked.label,
      vscode.ConfigurationTarget.Global
    );
    vscode.window.showInformationMessage(
      `AI Commit model set to: ${picked.label}`
    );
  }
}

async function handleSetApiKey(context: vscode.ExtensionContext): Promise<void> {
  const provider = await getConfiguredProvider();
  await promptForApiKey(context, provider.id);
}

async function handleDiagnose(
  context: vscode.ExtensionContext
): Promise<void> {
  const provider = await getConfiguredProvider();
  const apiKey = await getApiKey(context, provider.id);

  if (!apiKey) {
    const prompted = await promptForApiKey(context, provider.id);
    if (!prompted) {
      return;
    }
  }

  const key = (await getApiKey(context, provider.id))!;

  const output = vscode.window.createOutputChannel("AI Commit: Diagnose");
  output.show();

  output.appendLine("=== AI Commit Diagnosis ===");
  output.appendLine("");
  output.appendLine(`Provider: ${provider.name}`);
  output.appendLine("");

  output.appendLine(`Available models for ${provider.name}:`);

  for (const m of provider.models) {
    output.appendLine(`   - ${m.name}`);
  }

  output.appendLine("");

  const modelKey = `model${provider.id.charAt(0).toUpperCase() + provider.id.slice(1)}`;
  const config = vscode.workspace.getConfiguration("aiCommit");
  const currentModel = config.get<string>(modelKey, provider.models[0]?.id || "");

  output.appendLine(`Testing '${currentModel}'...`);
  try {
    if (provider.id === "google") {
      await geminiGenerateCommit(currentModel, key, "test", "test diff");
    } else if (provider.id === "mistral") {
      await mistralGenerateCommit(currentModel, key, "test", "test diff");
    }
    output.appendLine(`   ✓ ${currentModel}: OK`);
  } catch (e) {
    output.appendLine(
      `   ✗ ${currentModel}: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  output.appendLine("");
  output.appendLine("=== Diagnosis complete ===");
}
