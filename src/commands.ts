import * as vscode from "vscode";
import { generateCommitMessage, listAvailableModels } from "./ai/gemini";
import {
  getGitAPI,
  getRepository,
  stageAllChanges,
  hasAnyChanges,
  getStagedDiff,
  commit,
} from "./git/operations";
import { getApiKey, promptForApiKey } from "./ui/apiKeyPrompt";

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "aiCommit.generateCommit",
      () => handleGenerateCommit(context)
    ),
    vscode.commands.registerCommand(
      "aiCommit.selectModel",
      () => handleSelectModel()
    ),
    vscode.commands.registerCommand(
      "aiCommit.setApiKey",
      () => promptForApiKey(context)
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

    let apiKey = await getApiKey(context);
    if (!apiKey) {
      apiKey = await promptForApiKey(context);
      if (!apiKey) {
        return;
      }
    }

    const config = vscode.workspace.getConfiguration("aiCommit");
    const model = config.get<string>("model", "gemma-4-31b-it");
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

        progress.report({ message: "Calling Gemini API..." });
        const message = await generateCommitMessage(
          model,
          apiKey!,
          systemPrompt,
          diff
        );

        progress.report({ message: "Committing..." });
        repo.inputBox.value = message;
        await commit(repo, message);

        vscode.window.showInformationMessage(
          `✅ Committed: ${message}`
        );
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(`AI Commit failed: ${message}`);
  }
}

async function handleSelectModel(): Promise<void> {
  const config = vscode.workspace.getConfiguration("aiCommit");
  const current = config.get<string>("model", "gemma-4-31b-it");

  const items: vscode.QuickPickItem[] = [
    {
      label: "gemma-4-31b-it",
      description: "More capable, slightly slower",
      detail: current === "gemma-4-31b-it" ? "Currently selected" : undefined,
    },
    {
      label: "gemma-4-26b-a4b-it",
      description: "Faster, lighter",
      detail: current === "gemma-4-26b-a4b-it" ? "Currently selected" : undefined,
    },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: "AI Commit: Select Model",
    placeHolder: "Choose the Gemini model for commit generation",
  });

  if (picked) {
    await config.update(
      "model",
      picked.label,
      vscode.ConfigurationTarget.Global
    );
    vscode.window.showInformationMessage(
      `AI Commit model set to: ${picked.label}`
    );
  }
}

async function handleDiagnose(
  context: vscode.ExtensionContext
): Promise<void> {
  const apiKey = await getApiKey(context);
  if (!apiKey) {
    const prompted = await promptForApiKey(context);
    if (!prompted) {
      return;
    }
  }

  const key = (await getApiKey(context))!;

  const output = vscode.window.createOutputChannel("AI Commit: Diagnose");
  output.show();

  output.appendLine("=== AI Commit Diagnosis ===");
  output.appendLine("");

  output.appendLine("1. Checking available models...");

  try {
    const models = await listAvailableModels(key);
    output.appendLine(`   Found ${models.length} models:`);

    const gemmaModels: string[] = [];
    for (const m of models) {
      const methods = m.supportedGenerationMethods?.join(", ") || "none";
      output.appendLine(`   - ${m.name} (${m.displayName}) [${methods}]`);
      if (m.name.toLowerCase().includes("gemma")) {
        gemmaModels.push(m.name);
      }
    }

    output.appendLine("");
    output.appendLine("2. Gemma models found:");
    if (gemmaModels.length > 0) {
      for (const g of gemmaModels) {
        output.appendLine(`   ✓ ${g}`);
      }
      output.appendLine("");
      output.appendLine(
        "   Use these EXACT names in Settings → AI Commit → Model."
      );
    } else {
      output.appendLine(
        "   ✗ No Gemma models found for this API key."
      );
      output.appendLine(
        "   Try at https://aistudio.google.com to enable Gemma models."
      );
    }

    output.appendLine("");
    output.appendLine("3. Testing 'gemma-4-31b-it'...");
    try {
      await generateCommitMessage(
        "gemma-4-31b-it",
        key,
        "test",
        "test diff"
      );
    } catch (e) {
      output.appendLine(
        `   ✗ gemma-4-31b-it: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    output.appendLine("");
    output.appendLine("4. Testing 'gemma-4-26b-a4b-it'...");
    try {
      await generateCommitMessage(
        "gemma-4-26b-a4b-it",
        key,
        "test",
        "test diff"
      );
    } catch (e) {
      output.appendLine(
        `   ✗ gemma-4-26b-a4b-it: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  } catch (e) {
    output.appendLine(
      `   ✗ Failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  output.appendLine("");
  output.appendLine("=== Diagnosis complete ===");
}
