var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// src/extension.ts
var exports_extension = {};
__export(exports_extension, {
  deactivate: () => deactivate,
  activate: () => activate
});
module.exports = __toCommonJS(exports_extension);

// src/commands.ts
var vscode3 = __toESM(require("vscode"));

// src/ai/gemini.ts
var https = __toESM(require("node:https"));
var API_HOST = "generativelanguage.googleapis.com";
var API_PATH = "/v1beta/models/";
async function listAvailableModels(apiKey) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_HOST,
      path: "/v1beta/models",
      method: "GET",
      headers: {
        "x-goog-api-key": apiKey
      },
      timeout: 1e4
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.models || []);
          } catch {
            reject(new Error("Failed to parse model list."));
          }
        } else {
          reject(new Error(`Failed to list models (${res.statusCode}): ${data}`));
        }
      });
    });
    req.on("error", (err) => {
      reject(new Error(`Network error: ${err.message}`));
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out."));
    });
    req.end();
  });
}
async function generateCommitMessage(model, apiKey, systemPrompt, diff) {
  const body = JSON.stringify({
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Generate a commit message for the following git diff:

\`\`\`diff
${diff}
\`\`\``
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 150,
      topP: 0.95
    }
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_HOST,
      path: `${API_PATH}${model}:generateContent`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
        "Content-Length": Buffer.byteLength(body).toString()
      },
      timeout: 15000
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode === 401) {
          reject(new Error("Invalid API key. Use 'AI Commit: Set API Key' to update it."));
          return;
        }
        if (res.statusCode === 429) {
          reject(new Error("Rate limited by Gemini API. Please wait a moment and try again."));
          return;
        }
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`Gemini API error (${res.statusCode}): ${data.slice(0, 500)}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (!parsed.candidates || parsed.candidates.length === 0) {
            if (parsed.promptFeedback?.blockReason) {
              reject(new Error(`Content blocked: ${parsed.promptFeedback.blockReason}`));
            } else {
              reject(new Error(`No commit message generated. Raw response: ${data.slice(0, 300)}`));
            }
            return;
          }
          const candidate = parsed.candidates[0];
          const parts = candidate.content?.parts;
          if (!parts || parts.length === 0) {
            reject(new Error(`AI returned no parts. finishReason: ${candidate.finishReason}. Raw: ${data.slice(0, 300)}`));
            return;
          }
          const textPart = parts.find((p) => !p.thought && p.text?.trim());
          const text = textPart?.text ?? parts[parts.length - 1]?.text;
          if (!text || text.trim().length === 0) {
            reject(new Error(`AI returned empty text. finishReason: ${candidate.finishReason}. Raw: ${data.slice(0, 300)}`));
            return;
          }
          resolve(text.trim());
        } catch {
          reject(new Error(`Failed to parse Gemini API response. Raw: ${data.slice(0, 300)}`));
        }
      });
    });
    req.on("error", (err) => {
      const nodeErr = err;
      if (nodeErr.code === "ECONNREFUSED") {
        reject(new Error("Cannot reach Google API (connection refused). Check your internet connection."));
      } else if (nodeErr.code === "ENOTFOUND" || nodeErr.code === "EAI_AGAIN") {
        reject(new Error("Cannot resolve Google API host (DNS error). Check your internet connection."));
      } else if (nodeErr.code === "ETIMEDOUT" || nodeErr.code === "ECONNRESET") {
        reject(new Error("API request timed out. Check your internet connection."));
      } else if (nodeErr.code === "CERT_HAS_EXPIRED" || nodeErr.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
        reject(new Error("SSL certificate error connecting to Google API. Your system clock may be wrong."));
      } else {
        reject(new Error(`Network error: ${nodeErr.message} (code: ${nodeErr.code || "none"})`));
      }
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("API request timed out. Check your internet connection."));
    });
    req.write(body);
    req.end();
  });
}

// src/git/operations.ts
var vscode = __toESM(require("vscode"));
var gitApiCache;
async function getGitAPI() {
  if (gitApiCache) {
    return gitApiCache;
  }
  const ext = vscode.extensions.getExtension("vscode.git");
  if (!ext) {
    return;
  }
  if (!ext.isActive) {
    await ext.activate();
  }
  gitApiCache = ext.exports.getAPI(1);
  return gitApiCache;
}
function getRepository(git) {
  if (git.repositories.length === 0) {
    return;
  }
  return git.repositories[0];
}
async function stageAllChanges(repo) {
  const unstaged = repo.state.workingTreeChanges;
  if (unstaged.length === 0) {
    return 0;
  }
  const paths = unstaged.map((change) => change.uri.fsPath);
  await repo.add(paths);
  return paths.length;
}
function hasAnyChanges(repo) {
  return repo.state.indexChanges.length > 0 || repo.state.workingTreeChanges.length > 0;
}
async function getStagedDiff(repo) {
  return repo.diff(true);
}
async function commit(repo, message) {
  await repo.commit(message);
}

// src/ui/apiKeyPrompt.ts
var vscode2 = __toESM(require("vscode"));
var SECRET_KEY = "aiCommit.apiKey";
async function getApiKey(context) {
  const fromSecrets = await context.secrets.get(SECRET_KEY);
  if (fromSecrets) {
    return fromSecrets;
  }
  const fromConfig = vscode2.workspace.getConfiguration("aiCommit").get("apiKey");
  if (fromConfig) {
    await context.secrets.store(SECRET_KEY, fromConfig);
    return fromConfig;
  }
  return;
}
async function promptForApiKey(context) {
  const existingKey = await context.secrets.get(SECRET_KEY);
  return new Promise((resolve) => {
    const inputBox = vscode2.window.createInputBox();
    inputBox.title = "AI Commit: Enter Gemini API Key";
    inputBox.placeholder = "Paste your API key from Google AI Studio";
    inputBox.prompt = "Get a free API key at https://aistudio.google.com/apikey";
    inputBox.password = true;
    inputBox.ignoreFocusOut = true;
    inputBox.value = existingKey || "";
    inputBox.buttons = [
      {
        iconPath: new vscode2.ThemeIcon("link-external"),
        tooltip: "Get API Key from Google AI Studio"
      },
      {
        iconPath: new vscode2.ThemeIcon("info"),
        tooltip: "How is my key stored?"
      }
    ];
    inputBox.onDidChangeValue((value) => {
      if (value.trim().length === 0) {
        inputBox.validationMessage = "API key cannot be empty";
      } else if (value.trim().length < 10) {
        inputBox.validationMessage = "API key seems too short";
      } else {
        inputBox.validationMessage = undefined;
      }
    });
    inputBox.onDidTriggerButton((button) => {
      if (button.tooltip === "Get API Key from Google AI Studio") {
        vscode2.env.openExternal(vscode2.Uri.parse("https://aistudio.google.com/apikey"));
      } else if (button.tooltip === "How is my key stored?") {
        vscode2.window.showInformationMessage("Your API key is stored securely using VSCode's SecretStorage. It's encrypted and never shared.", "OK");
      }
    });
    inputBox.onDidAccept(async () => {
      const value = inputBox.value.trim();
      if (value.length > 0) {
        await context.secrets.store(SECRET_KEY, value);
        vscode2.window.showInformationMessage("✅ Gemini API key saved securely!");
        inputBox.hide();
        resolve(value);
      }
    });
    inputBox.onDidHide(() => {
      inputBox.dispose();
      resolve(undefined);
    });
    inputBox.show();
  });
}

// src/commands.ts
function registerCommands(context) {
  context.subscriptions.push(vscode3.commands.registerCommand("aiCommit.generateCommit", () => handleGenerateCommit(context)), vscode3.commands.registerCommand("aiCommit.selectModel", () => handleSelectModel()), vscode3.commands.registerCommand("aiCommit.setApiKey", () => promptForApiKey(context)), vscode3.commands.registerCommand("aiCommit.diagnose", () => handleDiagnose(context)));
}
async function handleGenerateCommit(context) {
  try {
    const git = await getGitAPI();
    if (!git) {
      vscode3.window.showErrorMessage("Git extension not found.");
      return;
    }
    const repo = getRepository(git);
    if (!repo) {
      vscode3.window.showWarningMessage("No git repository found. Open a folder with a git repository.");
      return;
    }
    if (!hasAnyChanges(repo)) {
      vscode3.window.showWarningMessage("No changes to commit.");
      return;
    }
    let apiKey = await getApiKey(context);
    if (!apiKey) {
      apiKey = await promptForApiKey(context);
      if (!apiKey) {
        return;
      }
    }
    const config = vscode3.workspace.getConfiguration("aiCommit");
    const model = config.get("model", "gemma-4-31b-it");
    const systemPrompt = config.get("systemPrompt", "");
    const stagedCount = repo.state.indexChanges.length;
    const unstagedCount = repo.state.workingTreeChanges.length;
    await vscode3.window.withProgress({
      location: vscode3.ProgressLocation.SourceControl,
      title: "Generating AI commit message..."
    }, async (progress) => {
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
      const message = await generateCommitMessage(model, apiKey, systemPrompt, diff);
      progress.report({ message: "Committing..." });
      repo.inputBox.value = message;
      await commit(repo, message);
      vscode3.window.showInformationMessage("Commit Generated Successfully");
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode3.window.showErrorMessage(`AI Commit failed: ${message}`);
  }
}
async function handleSelectModel() {
  const config = vscode3.workspace.getConfiguration("aiCommit");
  const current = config.get("model", "gemma-4-31b-it");
  const items = [
    {
      label: "gemma-4-31b-it",
      description: "More capable, slightly slower",
      detail: current === "gemma-4-31b-it" ? "Currently selected" : undefined
    },
    {
      label: "gemma-4-26b-a4b-it",
      description: "Faster, lighter",
      detail: current === "gemma-4-26b-a4b-it" ? "Currently selected" : undefined
    }
  ];
  const picked = await vscode3.window.showQuickPick(items, {
    title: "AI Commit: Select Model",
    placeHolder: "Choose the Gemini model for commit generation"
  });
  if (picked) {
    await config.update("model", picked.label, vscode3.ConfigurationTarget.Global);
    vscode3.window.showInformationMessage(`AI Commit model set to: ${picked.label}`);
  }
}
async function handleDiagnose(context) {
  const apiKey = await getApiKey(context);
  if (!apiKey) {
    const prompted = await promptForApiKey(context);
    if (!prompted) {
      return;
    }
  }
  const key = await getApiKey(context);
  const output = vscode3.window.createOutputChannel("AI Commit: Diagnose");
  output.show();
  output.appendLine("=== AI Commit Diagnosis ===");
  output.appendLine("");
  output.appendLine("1. Checking available models...");
  try {
    const models = await listAvailableModels(key);
    output.appendLine(`   Found ${models.length} models:`);
    const gemmaModels = [];
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
      output.appendLine("   Use these EXACT names in Settings → AI Commit → Model.");
    } else {
      output.appendLine("   ✗ No Gemma models found for this API key.");
      output.appendLine("   Try at https://aistudio.google.com to enable Gemma models.");
    }
    output.appendLine("");
    output.appendLine("3. Testing 'gemma-4-31b-it'...");
    try {
      await generateCommitMessage("gemma-4-31b-it", key, "test", "test diff");
    } catch (e) {
      output.appendLine(`   ✗ gemma-4-31b-it: ${e instanceof Error ? e.message : String(e)}`);
    }
    output.appendLine("");
    output.appendLine("4. Testing 'gemma-4-26b-a4b-it'...");
    try {
      await generateCommitMessage("gemma-4-26b-a4b-it", key, "test", "test diff");
    } catch (e) {
      output.appendLine(`   ✗ gemma-4-26b-a4b-it: ${e instanceof Error ? e.message : String(e)}`);
    }
  } catch (e) {
    output.appendLine(`   ✗ Failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  output.appendLine("");
  output.appendLine("=== Diagnosis complete ===");
}

// src/extension.ts
function activate(context) {
  registerCommands(context);
}
function deactivate() {}

//# debugId=4ECF6A13E0218ED864756E2164756E21
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2NvbW1hbmRzLnRzIiwgInNyYy9haS9nZW1pbmkudHMiLCAic3JjL2dpdC9vcGVyYXRpb25zLnRzIiwgInNyYy91aS9hcGlLZXlQcm9tcHQudHMiLCAic3JjL2V4dGVuc2lvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsKICAgICJpbXBvcnQgKiBhcyB2c2NvZGUgZnJvbSBcInZzY29kZVwiO1xuaW1wb3J0IHsgZ2VuZXJhdGVDb21taXRNZXNzYWdlLCBsaXN0QXZhaWxhYmxlTW9kZWxzIH0gZnJvbSBcIi4vYWkvZ2VtaW5pXCI7XG5pbXBvcnQge1xuICBnZXRHaXRBUEksXG4gIGdldFJlcG9zaXRvcnksXG4gIHN0YWdlQWxsQ2hhbmdlcyxcbiAgaGFzQW55Q2hhbmdlcyxcbiAgZ2V0U3RhZ2VkRGlmZixcbiAgY29tbWl0LFxufSBmcm9tIFwiLi9naXQvb3BlcmF0aW9uc1wiO1xuaW1wb3J0IHsgZ2V0QXBpS2V5LCBwcm9tcHRGb3JBcGlLZXkgfSBmcm9tIFwiLi91aS9hcGlLZXlQcm9tcHRcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29tbWFuZHMoY29udGV4dDogdnNjb2RlLkV4dGVuc2lvbkNvbnRleHQpOiB2b2lkIHtcbiAgY29udGV4dC5zdWJzY3JpcHRpb25zLnB1c2goXG4gICAgdnNjb2RlLmNvbW1hbmRzLnJlZ2lzdGVyQ29tbWFuZChcbiAgICAgIFwiYWlDb21taXQuZ2VuZXJhdGVDb21taXRcIixcbiAgICAgICgpID0+IGhhbmRsZUdlbmVyYXRlQ29tbWl0KGNvbnRleHQpXG4gICAgKSxcbiAgICB2c2NvZGUuY29tbWFuZHMucmVnaXN0ZXJDb21tYW5kKFxuICAgICAgXCJhaUNvbW1pdC5zZWxlY3RNb2RlbFwiLFxuICAgICAgKCkgPT4gaGFuZGxlU2VsZWN0TW9kZWwoKVxuICAgICksXG4gICAgdnNjb2RlLmNvbW1hbmRzLnJlZ2lzdGVyQ29tbWFuZChcbiAgICAgIFwiYWlDb21taXQuc2V0QXBpS2V5XCIsXG4gICAgICAoKSA9PiBwcm9tcHRGb3JBcGlLZXkoY29udGV4dClcbiAgICApLFxuICAgIHZzY29kZS5jb21tYW5kcy5yZWdpc3RlckNvbW1hbmQoXG4gICAgICBcImFpQ29tbWl0LmRpYWdub3NlXCIsXG4gICAgICAoKSA9PiBoYW5kbGVEaWFnbm9zZShjb250ZXh0KVxuICAgIClcbiAgKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlR2VuZXJhdGVDb21taXQoXG4gIGNvbnRleHQ6IHZzY29kZS5FeHRlbnNpb25Db250ZXh0XG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBnaXQgPSBhd2FpdCBnZXRHaXRBUEkoKTtcbiAgICBpZiAoIWdpdCkge1xuICAgICAgdnNjb2RlLndpbmRvdy5zaG93RXJyb3JNZXNzYWdlKFwiR2l0IGV4dGVuc2lvbiBub3QgZm91bmQuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHJlcG8gPSBnZXRSZXBvc2l0b3J5KGdpdCk7XG4gICAgaWYgKCFyZXBvKSB7XG4gICAgICB2c2NvZGUud2luZG93LnNob3dXYXJuaW5nTWVzc2FnZShcbiAgICAgICAgXCJObyBnaXQgcmVwb3NpdG9yeSBmb3VuZC4gT3BlbiBhIGZvbGRlciB3aXRoIGEgZ2l0IHJlcG9zaXRvcnkuXCJcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCFoYXNBbnlDaGFuZ2VzKHJlcG8pKSB7XG4gICAgICB2c2NvZGUud2luZG93LnNob3dXYXJuaW5nTWVzc2FnZShcIk5vIGNoYW5nZXMgdG8gY29tbWl0LlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgYXBpS2V5ID0gYXdhaXQgZ2V0QXBpS2V5KGNvbnRleHQpO1xuICAgIGlmICghYXBpS2V5KSB7XG4gICAgICBhcGlLZXkgPSBhd2FpdCBwcm9tcHRGb3JBcGlLZXkoY29udGV4dCk7XG4gICAgICBpZiAoIWFwaUtleSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgY29uZmlnID0gdnNjb2RlLndvcmtzcGFjZS5nZXRDb25maWd1cmF0aW9uKFwiYWlDb21taXRcIik7XG4gICAgY29uc3QgbW9kZWwgPSBjb25maWcuZ2V0PHN0cmluZz4oXCJtb2RlbFwiLCBcImdlbW1hLTQtMzFiLWl0XCIpO1xuICAgIGNvbnN0IHN5c3RlbVByb21wdCA9IGNvbmZpZy5nZXQ8c3RyaW5nPihcInN5c3RlbVByb21wdFwiLCBcIlwiKTtcblxuICAgIGNvbnN0IHN0YWdlZENvdW50ID0gcmVwby5zdGF0ZS5pbmRleENoYW5nZXMubGVuZ3RoO1xuICAgIGNvbnN0IHVuc3RhZ2VkQ291bnQgPSByZXBvLnN0YXRlLndvcmtpbmdUcmVlQ2hhbmdlcy5sZW5ndGg7XG5cbiAgICBhd2FpdCB2c2NvZGUud2luZG93LndpdGhQcm9ncmVzcyhcbiAgICAgIHtcbiAgICAgICAgbG9jYXRpb246IHZzY29kZS5Qcm9ncmVzc0xvY2F0aW9uLlNvdXJjZUNvbnRyb2wsXG4gICAgICAgIHRpdGxlOiBcIkdlbmVyYXRpbmcgQUkgY29tbWl0IG1lc3NhZ2UuLi5cIixcbiAgICAgIH0sXG4gICAgICBhc3luYyAocHJvZ3Jlc3MpID0+IHtcbiAgICAgICAgcHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogXCJTdGFnaW5nIGNoYW5nZXMuLi5cIiB9KTtcblxuICAgICAgICBpZiAodW5zdGFnZWRDb3VudCA+IDApIHtcbiAgICAgICAgICBhd2FpdCBzdGFnZUFsbENoYW5nZXMocmVwbyk7XG4gICAgICAgIH1cblxuICAgICAgICBwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBcIkdldHRpbmcgZGlmZi4uLlwiIH0pO1xuICAgICAgICBjb25zdCBkaWZmID0gYXdhaXQgZ2V0U3RhZ2VkRGlmZihyZXBvKTtcblxuICAgICAgICBpZiAoIWRpZmYpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyBkaWZmIGF2YWlsYWJsZSBhZnRlciBzdGFnaW5nLlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IFwiQ2FsbGluZyBHZW1pbmkgQVBJLi4uXCIgfSk7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBhd2FpdCBnZW5lcmF0ZUNvbW1pdE1lc3NhZ2UoXG4gICAgICAgICAgbW9kZWwsXG4gICAgICAgICAgYXBpS2V5ISxcbiAgICAgICAgICBzeXN0ZW1Qcm9tcHQsXG4gICAgICAgICAgZGlmZlxuICAgICAgICApO1xuXG4gICAgICAgIHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IFwiQ29tbWl0dGluZy4uLlwiIH0pO1xuICAgICAgICByZXBvLmlucHV0Qm94LnZhbHVlID0gbWVzc2FnZTtcbiAgICAgICAgYXdhaXQgY29tbWl0KHJlcG8sIG1lc3NhZ2UpO1xuXG4gICAgICAgIHZzY29kZS53aW5kb3cuc2hvd0luZm9ybWF0aW9uTWVzc2FnZShcIkNvbW1pdCBHZW5lcmF0ZWQgU3VjY2Vzc2Z1bGx5XCIpO1xuICAgICAgfVxuICAgICk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJVbmtub3duIGVycm9yXCI7XG4gICAgdnNjb2RlLndpbmRvdy5zaG93RXJyb3JNZXNzYWdlKGBBSSBDb21taXQgZmFpbGVkOiAke21lc3NhZ2V9YCk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlU2VsZWN0TW9kZWwoKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IGNvbmZpZyA9IHZzY29kZS53b3Jrc3BhY2UuZ2V0Q29uZmlndXJhdGlvbihcImFpQ29tbWl0XCIpO1xuICBjb25zdCBjdXJyZW50ID0gY29uZmlnLmdldDxzdHJpbmc+KFwibW9kZWxcIiwgXCJnZW1tYS00LTMxYi1pdFwiKTtcblxuICBjb25zdCBpdGVtczogdnNjb2RlLlF1aWNrUGlja0l0ZW1bXSA9IFtcbiAgICB7XG4gICAgICBsYWJlbDogXCJnZW1tYS00LTMxYi1pdFwiLFxuICAgICAgZGVzY3JpcHRpb246IFwiTW9yZSBjYXBhYmxlLCBzbGlnaHRseSBzbG93ZXJcIixcbiAgICAgIGRldGFpbDogY3VycmVudCA9PT0gXCJnZW1tYS00LTMxYi1pdFwiID8gXCJDdXJyZW50bHkgc2VsZWN0ZWRcIiA6IHVuZGVmaW5lZCxcbiAgICB9LFxuICAgIHtcbiAgICAgIGxhYmVsOiBcImdlbW1hLTQtMjZiLWE0Yi1pdFwiLFxuICAgICAgZGVzY3JpcHRpb246IFwiRmFzdGVyLCBsaWdodGVyXCIsXG4gICAgICBkZXRhaWw6IGN1cnJlbnQgPT09IFwiZ2VtbWEtNC0yNmItYTRiLWl0XCIgPyBcIkN1cnJlbnRseSBzZWxlY3RlZFwiIDogdW5kZWZpbmVkLFxuICAgIH0sXG4gIF07XG5cbiAgY29uc3QgcGlja2VkID0gYXdhaXQgdnNjb2RlLndpbmRvdy5zaG93UXVpY2tQaWNrKGl0ZW1zLCB7XG4gICAgdGl0bGU6IFwiQUkgQ29tbWl0OiBTZWxlY3QgTW9kZWxcIixcbiAgICBwbGFjZUhvbGRlcjogXCJDaG9vc2UgdGhlIEdlbWluaSBtb2RlbCBmb3IgY29tbWl0IGdlbmVyYXRpb25cIixcbiAgfSk7XG5cbiAgaWYgKHBpY2tlZCkge1xuICAgIGF3YWl0IGNvbmZpZy51cGRhdGUoXG4gICAgICBcIm1vZGVsXCIsXG4gICAgICBwaWNrZWQubGFiZWwsXG4gICAgICB2c2NvZGUuQ29uZmlndXJhdGlvblRhcmdldC5HbG9iYWxcbiAgICApO1xuICAgIHZzY29kZS53aW5kb3cuc2hvd0luZm9ybWF0aW9uTWVzc2FnZShcbiAgICAgIGBBSSBDb21taXQgbW9kZWwgc2V0IHRvOiAke3BpY2tlZC5sYWJlbH1gXG4gICAgKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVEaWFnbm9zZShcbiAgY29udGV4dDogdnNjb2RlLkV4dGVuc2lvbkNvbnRleHRcbik6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBhcGlLZXkgPSBhd2FpdCBnZXRBcGlLZXkoY29udGV4dCk7XG4gIGlmICghYXBpS2V5KSB7XG4gICAgY29uc3QgcHJvbXB0ZWQgPSBhd2FpdCBwcm9tcHRGb3JBcGlLZXkoY29udGV4dCk7XG4gICAgaWYgKCFwcm9tcHRlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGtleSA9IChhd2FpdCBnZXRBcGlLZXkoY29udGV4dCkpITtcblxuICBjb25zdCBvdXRwdXQgPSB2c2NvZGUud2luZG93LmNyZWF0ZU91dHB1dENoYW5uZWwoXCJBSSBDb21taXQ6IERpYWdub3NlXCIpO1xuICBvdXRwdXQuc2hvdygpO1xuXG4gIG91dHB1dC5hcHBlbmRMaW5lKFwiPT09IEFJIENvbW1pdCBEaWFnbm9zaXMgPT09XCIpO1xuICBvdXRwdXQuYXBwZW5kTGluZShcIlwiKTtcblxuICBvdXRwdXQuYXBwZW5kTGluZShcIjEuIENoZWNraW5nIGF2YWlsYWJsZSBtb2RlbHMuLi5cIik7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBtb2RlbHMgPSBhd2FpdCBsaXN0QXZhaWxhYmxlTW9kZWxzKGtleSk7XG4gICAgb3V0cHV0LmFwcGVuZExpbmUoYCAgIEZvdW5kICR7bW9kZWxzLmxlbmd0aH0gbW9kZWxzOmApO1xuXG4gICAgY29uc3QgZ2VtbWFNb2RlbHM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChjb25zdCBtIG9mIG1vZGVscykge1xuICAgICAgY29uc3QgbWV0aG9kcyA9IG0uc3VwcG9ydGVkR2VuZXJhdGlvbk1ldGhvZHM/LmpvaW4oXCIsIFwiKSB8fCBcIm5vbmVcIjtcbiAgICAgIG91dHB1dC5hcHBlbmRMaW5lKGAgICAtICR7bS5uYW1lfSAoJHttLmRpc3BsYXlOYW1lfSkgWyR7bWV0aG9kc31dYCk7XG4gICAgICBpZiAobS5uYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoXCJnZW1tYVwiKSkge1xuICAgICAgICBnZW1tYU1vZGVscy5wdXNoKG0ubmFtZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgb3V0cHV0LmFwcGVuZExpbmUoXCJcIik7XG4gICAgb3V0cHV0LmFwcGVuZExpbmUoXCIyLiBHZW1tYSBtb2RlbHMgZm91bmQ6XCIpO1xuICAgIGlmIChnZW1tYU1vZGVscy5sZW5ndGggPiAwKSB7XG4gICAgICBmb3IgKGNvbnN0IGcgb2YgZ2VtbWFNb2RlbHMpIHtcbiAgICAgICAgb3V0cHV0LmFwcGVuZExpbmUoYCAgIOKckyAke2d9YCk7XG4gICAgICB9XG4gICAgICBvdXRwdXQuYXBwZW5kTGluZShcIlwiKTtcbiAgICAgIG91dHB1dC5hcHBlbmRMaW5lKFxuICAgICAgICBcIiAgIFVzZSB0aGVzZSBFWEFDVCBuYW1lcyBpbiBTZXR0aW5ncyDihpIgQUkgQ29tbWl0IOKGkiBNb2RlbC5cIlxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgb3V0cHV0LmFwcGVuZExpbmUoXG4gICAgICAgIFwiICAg4pyXIE5vIEdlbW1hIG1vZGVscyBmb3VuZCBmb3IgdGhpcyBBUEkga2V5LlwiXG4gICAgICApO1xuICAgICAgb3V0cHV0LmFwcGVuZExpbmUoXG4gICAgICAgIFwiICAgVHJ5IGF0IGh0dHBzOi8vYWlzdHVkaW8uZ29vZ2xlLmNvbSB0byBlbmFibGUgR2VtbWEgbW9kZWxzLlwiXG4gICAgICApO1xuICAgIH1cblxuICAgIG91dHB1dC5hcHBlbmRMaW5lKFwiXCIpO1xuICAgIG91dHB1dC5hcHBlbmRMaW5lKFwiMy4gVGVzdGluZyAnZ2VtbWEtNC0zMWItaXQnLi4uXCIpO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBnZW5lcmF0ZUNvbW1pdE1lc3NhZ2UoXG4gICAgICAgIFwiZ2VtbWEtNC0zMWItaXRcIixcbiAgICAgICAga2V5LFxuICAgICAgICBcInRlc3RcIixcbiAgICAgICAgXCJ0ZXN0IGRpZmZcIlxuICAgICAgKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBvdXRwdXQuYXBwZW5kTGluZShcbiAgICAgICAgYCAgIOKclyBnZW1tYS00LTMxYi1pdDogJHtlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSl9YFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBvdXRwdXQuYXBwZW5kTGluZShcIlwiKTtcbiAgICBvdXRwdXQuYXBwZW5kTGluZShcIjQuIFRlc3RpbmcgJ2dlbW1hLTQtMjZiLWE0Yi1pdCcuLi5cIik7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGdlbmVyYXRlQ29tbWl0TWVzc2FnZShcbiAgICAgICAgXCJnZW1tYS00LTI2Yi1hNGItaXRcIixcbiAgICAgICAga2V5LFxuICAgICAgICBcInRlc3RcIixcbiAgICAgICAgXCJ0ZXN0IGRpZmZcIlxuICAgICAgKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBvdXRwdXQuYXBwZW5kTGluZShcbiAgICAgICAgYCAgIOKclyBnZW1tYS00LTI2Yi1hNGItaXQ6ICR7ZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpfWBcbiAgICAgICk7XG4gICAgfVxuICB9IGNhdGNoIChlKSB7XG4gICAgb3V0cHV0LmFwcGVuZExpbmUoXG4gICAgICBgICAg4pyXIEZhaWxlZDogJHtlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSl9YFxuICAgICk7XG4gIH1cblxuICBvdXRwdXQuYXBwZW5kTGluZShcIlwiKTtcbiAgb3V0cHV0LmFwcGVuZExpbmUoXCI9PT0gRGlhZ25vc2lzIGNvbXBsZXRlID09PVwiKTtcbn1cbiIsCiAgICAiaW1wb3J0ICogYXMgaHR0cHMgZnJvbSBcIm5vZGU6aHR0cHNcIjtcblxuY29uc3QgQVBJX0hPU1QgPSBcImdlbmVyYXRpdmVsYW5ndWFnZS5nb29nbGVhcGlzLmNvbVwiO1xuY29uc3QgQVBJX1BBVEggPSBcIi92MWJldGEvbW9kZWxzL1wiO1xuXG5pbnRlcmZhY2UgTW9kZWxJbmZvIHtcbiAgbmFtZTogc3RyaW5nO1xuICBkaXNwbGF5TmFtZTogc3RyaW5nO1xuICBzdXBwb3J0ZWRHZW5lcmF0aW9uTWV0aG9kczogc3RyaW5nW107XG59XG5cbmludGVyZmFjZSBMaXN0TW9kZWxzUmVzcG9uc2Uge1xuICBtb2RlbHM6IE1vZGVsSW5mb1tdO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbGlzdEF2YWlsYWJsZU1vZGVscyhcbiAgYXBpS2V5OiBzdHJpbmdcbik6IFByb21pc2U8TW9kZWxJbmZvW10+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCByZXEgPSBodHRwcy5yZXF1ZXN0KFxuICAgICAge1xuICAgICAgICBob3N0bmFtZTogQVBJX0hPU1QsXG4gICAgICAgIHBhdGg6IFwiL3YxYmV0YS9tb2RlbHNcIixcbiAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgXCJ4LWdvb2ctYXBpLWtleVwiOiBhcGlLZXksXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IDEwMDAwLFxuICAgICAgfSxcbiAgICAgIChyZXMpID0+IHtcbiAgICAgICAgbGV0IGRhdGEgPSBcIlwiO1xuICAgICAgICByZXMub24oXCJkYXRhXCIsIChjaHVuaykgPT4gKGRhdGEgKz0gY2h1bmspKTtcbiAgICAgICAgcmVzLm9uKFwiZW5kXCIsICgpID0+IHtcbiAgICAgICAgICBpZiAocmVzLnN0YXR1c0NvZGUgPT09IDIwMCkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShkYXRhKSBhcyBMaXN0TW9kZWxzUmVzcG9uc2U7XG4gICAgICAgICAgICAgIHJlc29sdmUocGFyc2VkLm1vZGVscyB8fCBbXSk7XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihcIkZhaWxlZCB0byBwYXJzZSBtb2RlbCBsaXN0LlwiKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgIGBGYWlsZWQgdG8gbGlzdCBtb2RlbHMgKCR7cmVzLnN0YXR1c0NvZGV9KTogJHtkYXRhfWBcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICk7XG5cbiAgICByZXEub24oXCJlcnJvclwiLCAoZXJyOiBOb2RlSlMuRXJybm9FeGNlcHRpb24pID0+IHtcbiAgICAgIHJlamVjdChuZXcgRXJyb3IoYE5ldHdvcmsgZXJyb3I6ICR7ZXJyLm1lc3NhZ2V9YCkpO1xuICAgIH0pO1xuXG4gICAgcmVxLm9uKFwidGltZW91dFwiLCAoKSA9PiB7XG4gICAgICByZXEuZGVzdHJveSgpO1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcihcIlJlcXVlc3QgdGltZWQgb3V0LlwiKSk7XG4gICAgfSk7XG5cbiAgICByZXEuZW5kKCk7XG4gIH0pO1xufVxuXG5pbnRlcmZhY2UgR2VtaW5pUmVzcG9uc2Uge1xuICBjYW5kaWRhdGVzPzoge1xuICAgIGNvbnRlbnQ6IHtcbiAgICAgIHJvbGU6IHN0cmluZztcbiAgICAgIHBhcnRzOiB7IHRleHQ6IHN0cmluZzsgdGhvdWdodD86IGJvb2xlYW4gfVtdO1xuICAgIH07XG4gICAgZmluaXNoUmVhc29uOiBzdHJpbmc7XG4gIH1bXTtcbiAgcHJvbXB0RmVlZGJhY2s/OiB7XG4gICAgYmxvY2tSZWFzb246IHN0cmluZztcbiAgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlQ29tbWl0TWVzc2FnZShcbiAgbW9kZWw6IHN0cmluZyxcbiAgYXBpS2V5OiBzdHJpbmcsXG4gIHN5c3RlbVByb21wdDogc3RyaW5nLFxuICBkaWZmOiBzdHJpbmdcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IGJvZHkgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgc3lzdGVtSW5zdHJ1Y3Rpb246IHtcbiAgICAgIHBhcnRzOiBbeyB0ZXh0OiBzeXN0ZW1Qcm9tcHQgfV0sXG4gICAgfSxcbiAgICBjb250ZW50czogW1xuICAgICAge1xuICAgICAgICByb2xlOiBcInVzZXJcIixcbiAgICAgICAgcGFydHM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICB0ZXh0OiBgR2VuZXJhdGUgYSBjb21taXQgbWVzc2FnZSBmb3IgdGhlIGZvbGxvd2luZyBnaXQgZGlmZjpcXG5cXG5cXGBcXGBcXGBkaWZmXFxuJHtkaWZmfVxcblxcYFxcYFxcYGAsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgXSxcbiAgICBnZW5lcmF0aW9uQ29uZmlnOiB7XG4gICAgICB0ZW1wZXJhdHVyZTogMC4yLFxuICAgICAgbWF4T3V0cHV0VG9rZW5zOiAxNTAsXG4gICAgICB0b3BQOiAwLjk1LFxuICAgIH0sXG4gIH0pO1xuXG4gIHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCByZXEgPSBodHRwcy5yZXF1ZXN0KFxuICAgICAge1xuICAgICAgICBob3N0bmFtZTogQVBJX0hPU1QsXG4gICAgICAgIHBhdGg6IGAke0FQSV9QQVRIfSR7bW9kZWx9OmdlbmVyYXRlQ29udGVudGAsXG4gICAgICAgIG1ldGhvZDogXCJQT1NUXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICAgICAgICBcIngtZ29vZy1hcGkta2V5XCI6IGFwaUtleSxcbiAgICAgICAgICBcIkNvbnRlbnQtTGVuZ3RoXCI6IEJ1ZmZlci5ieXRlTGVuZ3RoKGJvZHkpLnRvU3RyaW5nKCksXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IDE1MDAwLFxuICAgICAgfSxcbiAgICAgIChyZXMpID0+IHtcbiAgICAgICAgbGV0IGRhdGEgPSBcIlwiO1xuXG4gICAgICAgIHJlcy5vbihcImRhdGFcIiwgKGNodW5rKSA9PiB7XG4gICAgICAgICAgZGF0YSArPSBjaHVuaztcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmVzLm9uKFwiZW5kXCIsICgpID0+IHtcbiAgICAgICAgICBpZiAocmVzLnN0YXR1c0NvZGUgPT09IDQwMSkge1xuICAgICAgICAgICAgcmVqZWN0KFxuICAgICAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgXCJJbnZhbGlkIEFQSSBrZXkuIFVzZSAnQUkgQ29tbWl0OiBTZXQgQVBJIEtleScgdG8gdXBkYXRlIGl0LlwiXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSA0MjkpIHtcbiAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgIFwiUmF0ZSBsaW1pdGVkIGJ5IEdlbWluaSBBUEkuIFBsZWFzZSB3YWl0IGEgbW9tZW50IGFuZCB0cnkgYWdhaW4uXCJcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoIXJlcy5zdGF0dXNDb2RlIHx8IHJlcy5zdGF0dXNDb2RlID49IDQwMCkge1xuICAgICAgICAgICAgcmVqZWN0KFxuICAgICAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgYEdlbWluaSBBUEkgZXJyb3IgKCR7cmVzLnN0YXR1c0NvZGV9KTogJHtkYXRhLnNsaWNlKDAsIDUwMCl9YFxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGRhdGEpIGFzIEdlbWluaVJlc3BvbnNlO1xuXG4gICAgICAgICAgICBpZiAoIXBhcnNlZC5jYW5kaWRhdGVzIHx8IHBhcnNlZC5jYW5kaWRhdGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICBpZiAocGFyc2VkLnByb21wdEZlZWRiYWNrPy5ibG9ja1JlYXNvbikge1xuICAgICAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICAgICAgYENvbnRlbnQgYmxvY2tlZDogJHtwYXJzZWQucHJvbXB0RmVlZGJhY2suYmxvY2tSZWFzb259YFxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVqZWN0KFxuICAgICAgICAgICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgICAgICBgTm8gY29tbWl0IG1lc3NhZ2UgZ2VuZXJhdGVkLiBSYXcgcmVzcG9uc2U6ICR7ZGF0YS5zbGljZSgwLCAzMDApfWBcbiAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY2FuZGlkYXRlID0gcGFyc2VkLmNhbmRpZGF0ZXNbMF07XG4gICAgICAgICAgICBjb25zdCBwYXJ0cyA9IGNhbmRpZGF0ZS5jb250ZW50Py5wYXJ0cztcbiAgICAgICAgICAgIGlmICghcGFydHMgfHwgcGFydHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgICBgQUkgcmV0dXJuZWQgbm8gcGFydHMuIGZpbmlzaFJlYXNvbjogJHtjYW5kaWRhdGUuZmluaXNoUmVhc29ufS4gUmF3OiAke2RhdGEuc2xpY2UoMCwgMzAwKX1gXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEdlbW1hIG1vZGVscyByZXR1cm4gYSBcInRob3VnaHRcIiBwYXJ0IGZpcnN0LCB0aGVuIHRoZSBhY3R1YWwgcmVzcG9uc2UuXG4gICAgICAgICAgICAvLyBGaW5kIHRoZSBmaXJzdCBub24tdGhvdWdodCBwYXJ0IHdpdGggdGV4dC5cbiAgICAgICAgICAgIGNvbnN0IHRleHRQYXJ0ID0gcGFydHMuZmluZCgocCkgPT4gIXAudGhvdWdodCAmJiBwLnRleHQ/LnRyaW0oKSk7XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gdGV4dFBhcnQ/LnRleHQgPz8gcGFydHNbcGFydHMubGVuZ3RoIC0gMV0/LnRleHQ7XG5cbiAgICAgICAgICAgIGlmICghdGV4dCB8fCB0ZXh0LnRyaW0oKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgcmVqZWN0KFxuICAgICAgICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICAgIGBBSSByZXR1cm5lZCBlbXB0eSB0ZXh0LiBmaW5pc2hSZWFzb246ICR7Y2FuZGlkYXRlLmZpbmlzaFJlYXNvbn0uIFJhdzogJHtkYXRhLnNsaWNlKDAsIDMwMCl9YFxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXNvbHZlKHRleHQudHJpbSgpKTtcbiAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgbmV3IEVycm9yKGBGYWlsZWQgdG8gcGFyc2UgR2VtaW5pIEFQSSByZXNwb25zZS4gUmF3OiAke2RhdGEuc2xpY2UoMCwgMzAwKX1gKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICk7XG5cbiAgICByZXEub24oXCJlcnJvclwiLCAoZXJyKSA9PiB7XG4gICAgICBjb25zdCBub2RlRXJyID0gZXJyIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcbiAgICAgIGlmIChub2RlRXJyLmNvZGUgPT09IFwiRUNPTk5SRUZVU0VEXCIpIHtcbiAgICAgICAgcmVqZWN0KFxuICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgIFwiQ2Fubm90IHJlYWNoIEdvb2dsZSBBUEkgKGNvbm5lY3Rpb24gcmVmdXNlZCkuIENoZWNrIHlvdXIgaW50ZXJuZXQgY29ubmVjdGlvbi5cIlxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAobm9kZUVyci5jb2RlID09PSBcIkVOT1RGT1VORFwiIHx8IG5vZGVFcnIuY29kZSA9PT0gXCJFQUlfQUdBSU5cIikge1xuICAgICAgICByZWplY3QoXG4gICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgXCJDYW5ub3QgcmVzb2x2ZSBHb29nbGUgQVBJIGhvc3QgKEROUyBlcnJvcikuIENoZWNrIHlvdXIgaW50ZXJuZXQgY29ubmVjdGlvbi5cIlxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAobm9kZUVyci5jb2RlID09PSBcIkVUSU1FRE9VVFwiIHx8IG5vZGVFcnIuY29kZSA9PT0gXCJFQ09OTlJFU0VUXCIpIHtcbiAgICAgICAgcmVqZWN0KFxuICAgICAgICAgIG5ldyBFcnJvcihcIkFQSSByZXF1ZXN0IHRpbWVkIG91dC4gQ2hlY2sgeW91ciBpbnRlcm5ldCBjb25uZWN0aW9uLlwiKVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChub2RlRXJyLmNvZGUgPT09IFwiQ0VSVF9IQVNfRVhQSVJFRFwiIHx8IG5vZGVFcnIuY29kZSA9PT0gXCJVTkFCTEVfVE9fVkVSSUZZX0xFQUZfU0lHTkFUVVJFXCIpIHtcbiAgICAgICAgcmVqZWN0KFxuICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgIFwiU1NMIGNlcnRpZmljYXRlIGVycm9yIGNvbm5lY3RpbmcgdG8gR29vZ2xlIEFQSS4gWW91ciBzeXN0ZW0gY2xvY2sgbWF5IGJlIHdyb25nLlwiXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVqZWN0KFxuICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgIGBOZXR3b3JrIGVycm9yOiAke25vZGVFcnIubWVzc2FnZX0gKGNvZGU6ICR7bm9kZUVyci5jb2RlIHx8IFwibm9uZVwifSlgXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmVxLm9uKFwidGltZW91dFwiLCAoKSA9PiB7XG4gICAgICByZXEuZGVzdHJveSgpO1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcihcIkFQSSByZXF1ZXN0IHRpbWVkIG91dC4gQ2hlY2sgeW91ciBpbnRlcm5ldCBjb25uZWN0aW9uLlwiKSk7XG4gICAgfSk7XG5cbiAgICByZXEud3JpdGUoYm9keSk7XG4gICAgcmVxLmVuZCgpO1xuICB9KTtcbn1cbiIsCiAgICAiaW1wb3J0ICogYXMgdnNjb2RlIGZyb20gXCJ2c2NvZGVcIjtcblxuaW50ZXJmYWNlIEdpdEFQSSB7XG4gIHJlcG9zaXRvcmllczogUmVwb3NpdG9yeVtdO1xufVxuXG5pbnRlcmZhY2UgUmVwb3NpdG9yeSB7XG4gIHJvb3RVcmk6IHZzY29kZS5Vcmk7XG4gIGlucHV0Qm94OiB7IHZhbHVlOiBzdHJpbmcgfTtcbiAgc3RhdGU6IFJlcG9zaXRvcnlTdGF0ZTtcbiAgYWRkKHBhdGhzOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD47XG4gIGNvbW1pdChtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuICBkaWZmKGNhY2hlZD86IGJvb2xlYW4pOiBQcm9taXNlPHN0cmluZz47XG59XG5cbmludGVyZmFjZSBSZXBvc2l0b3J5U3RhdGUge1xuICBpbmRleENoYW5nZXM6IENoYW5nZVtdO1xuICB3b3JraW5nVHJlZUNoYW5nZXM6IENoYW5nZVtdO1xufVxuXG5pbnRlcmZhY2UgQ2hhbmdlIHtcbiAgdXJpOiB2c2NvZGUuVXJpO1xuICBzdGF0dXM6IG51bWJlcjtcbn1cblxubGV0IGdpdEFwaUNhY2hlOiBHaXRBUEkgfCB1bmRlZmluZWQ7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRHaXRBUEkoKTogUHJvbWlzZTxHaXRBUEkgfCB1bmRlZmluZWQ+IHtcbiAgaWYgKGdpdEFwaUNhY2hlKSB7XG4gICAgcmV0dXJuIGdpdEFwaUNhY2hlO1xuICB9XG4gIGNvbnN0IGV4dCA9IHZzY29kZS5leHRlbnNpb25zLmdldEV4dGVuc2lvbihcInZzY29kZS5naXRcIik7XG4gIGlmICghZXh0KSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuICBpZiAoIWV4dC5pc0FjdGl2ZSkge1xuICAgIGF3YWl0IGV4dC5hY3RpdmF0ZSgpO1xuICB9XG4gIGdpdEFwaUNhY2hlID0gZXh0LmV4cG9ydHMuZ2V0QVBJKDEpO1xuICByZXR1cm4gZ2l0QXBpQ2FjaGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXBvc2l0b3J5KGdpdDogR2l0QVBJKTogUmVwb3NpdG9yeSB8IHVuZGVmaW5lZCB7XG4gIGlmIChnaXQucmVwb3NpdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIGdpdC5yZXBvc2l0b3JpZXNbMF07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdGFnZUFsbENoYW5nZXMocmVwbzogUmVwb3NpdG9yeSk6IFByb21pc2U8bnVtYmVyPiB7XG4gIGNvbnN0IHVuc3RhZ2VkID0gcmVwby5zdGF0ZS53b3JraW5nVHJlZUNoYW5nZXM7XG4gIGlmICh1bnN0YWdlZC5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gMDtcbiAgfVxuICBjb25zdCBwYXRocyA9IHVuc3RhZ2VkLm1hcCgoY2hhbmdlKSA9PiBjaGFuZ2UudXJpLmZzUGF0aCk7XG4gIGF3YWl0IHJlcG8uYWRkKHBhdGhzKTtcbiAgcmV0dXJuIHBhdGhzLmxlbmd0aDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc0FueUNoYW5nZXMocmVwbzogUmVwb3NpdG9yeSk6IGJvb2xlYW4ge1xuICByZXR1cm4gKFxuICAgIHJlcG8uc3RhdGUuaW5kZXhDaGFuZ2VzLmxlbmd0aCA+IDAgfHxcbiAgICByZXBvLnN0YXRlLndvcmtpbmdUcmVlQ2hhbmdlcy5sZW5ndGggPiAwXG4gICk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRTdGFnZWREaWZmKHJlcG86IFJlcG9zaXRvcnkpOiBQcm9taXNlPHN0cmluZz4ge1xuICByZXR1cm4gcmVwby5kaWZmKHRydWUpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tbWl0KHJlcG86IFJlcG9zaXRvcnksIG1lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBhd2FpdCByZXBvLmNvbW1pdChtZXNzYWdlKTtcbn1cbiIsCiAgICAiaW1wb3J0ICogYXMgdnNjb2RlIGZyb20gXCJ2c2NvZGVcIjtcblxuY29uc3QgU0VDUkVUX0tFWSA9IFwiYWlDb21taXQuYXBpS2V5XCI7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRBcGlLZXkoXG4gIGNvbnRleHQ6IHZzY29kZS5FeHRlbnNpb25Db250ZXh0XG4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuICBjb25zdCBmcm9tU2VjcmV0cyA9IGF3YWl0IGNvbnRleHQuc2VjcmV0cy5nZXQoU0VDUkVUX0tFWSk7XG4gIGlmIChmcm9tU2VjcmV0cykge1xuICAgIHJldHVybiBmcm9tU2VjcmV0cztcbiAgfVxuICBjb25zdCBmcm9tQ29uZmlnID0gdnNjb2RlLndvcmtzcGFjZVxuICAgIC5nZXRDb25maWd1cmF0aW9uKFwiYWlDb21taXRcIilcbiAgICAuZ2V0PHN0cmluZz4oXCJhcGlLZXlcIik7XG4gIGlmIChmcm9tQ29uZmlnKSB7XG4gICAgYXdhaXQgY29udGV4dC5zZWNyZXRzLnN0b3JlKFNFQ1JFVF9LRVksIGZyb21Db25maWcpO1xuICAgIHJldHVybiBmcm9tQ29uZmlnO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwcm9tcHRGb3JBcGlLZXkoXG4gIGNvbnRleHQ6IHZzY29kZS5FeHRlbnNpb25Db250ZXh0XG4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuICBjb25zdCBleGlzdGluZ0tleSA9IGF3YWl0IGNvbnRleHQuc2VjcmV0cy5nZXQoU0VDUkVUX0tFWSk7XG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4oKHJlc29sdmUpID0+IHtcbiAgICBjb25zdCBpbnB1dEJveCA9IHZzY29kZS53aW5kb3cuY3JlYXRlSW5wdXRCb3goKTtcbiAgICBpbnB1dEJveC50aXRsZSA9IFwiQUkgQ29tbWl0OiBFbnRlciBHZW1pbmkgQVBJIEtleVwiO1xuICAgIGlucHV0Qm94LnBsYWNlaG9sZGVyID0gXCJQYXN0ZSB5b3VyIEFQSSBrZXkgZnJvbSBHb29nbGUgQUkgU3R1ZGlvXCI7XG4gICAgaW5wdXRCb3gucHJvbXB0ID1cbiAgICAgIFwiR2V0IGEgZnJlZSBBUEkga2V5IGF0IGh0dHBzOi8vYWlzdHVkaW8uZ29vZ2xlLmNvbS9hcGlrZXlcIjtcbiAgICBpbnB1dEJveC5wYXNzd29yZCA9IHRydWU7XG4gICAgaW5wdXRCb3guaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuICAgIGlucHV0Qm94LnZhbHVlID0gZXhpc3RpbmdLZXkgfHwgXCJcIjtcblxuICAgIGlucHV0Qm94LmJ1dHRvbnMgPSBbXG4gICAgICB7XG4gICAgICAgIGljb25QYXRoOiBuZXcgdnNjb2RlLlRoZW1lSWNvbihcImxpbmstZXh0ZXJuYWxcIiksXG4gICAgICAgIHRvb2x0aXA6IFwiR2V0IEFQSSBLZXkgZnJvbSBHb29nbGUgQUkgU3R1ZGlvXCIsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBpY29uUGF0aDogbmV3IHZzY29kZS5UaGVtZUljb24oXCJpbmZvXCIpLFxuICAgICAgICB0b29sdGlwOiBcIkhvdyBpcyBteSBrZXkgc3RvcmVkP1wiLFxuICAgICAgfSxcbiAgICBdO1xuXG4gICAgaW5wdXRCb3gub25EaWRDaGFuZ2VWYWx1ZSgodmFsdWUpID0+IHtcbiAgICAgIGlmICh2YWx1ZS50cmltKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIGlucHV0Qm94LnZhbGlkYXRpb25NZXNzYWdlID0gXCJBUEkga2V5IGNhbm5vdCBiZSBlbXB0eVwiO1xuICAgICAgfSBlbHNlIGlmICh2YWx1ZS50cmltKCkubGVuZ3RoIDwgMTApIHtcbiAgICAgICAgaW5wdXRCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSBcIkFQSSBrZXkgc2VlbXMgdG9vIHNob3J0XCI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbnB1dEJveC52YWxpZGF0aW9uTWVzc2FnZSA9IHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlucHV0Qm94Lm9uRGlkVHJpZ2dlckJ1dHRvbigoYnV0dG9uKSA9PiB7XG4gICAgICBpZiAoYnV0dG9uLnRvb2x0aXAgPT09IFwiR2V0IEFQSSBLZXkgZnJvbSBHb29nbGUgQUkgU3R1ZGlvXCIpIHtcbiAgICAgICAgdnNjb2RlLmVudi5vcGVuRXh0ZXJuYWwoXG4gICAgICAgICAgdnNjb2RlLlVyaS5wYXJzZShcImh0dHBzOi8vYWlzdHVkaW8uZ29vZ2xlLmNvbS9hcGlrZXlcIilcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoYnV0dG9uLnRvb2x0aXAgPT09IFwiSG93IGlzIG15IGtleSBzdG9yZWQ/XCIpIHtcbiAgICAgICAgdnNjb2RlLndpbmRvdy5zaG93SW5mb3JtYXRpb25NZXNzYWdlKFxuICAgICAgICAgIFwiWW91ciBBUEkga2V5IGlzIHN0b3JlZCBzZWN1cmVseSB1c2luZyBWU0NvZGUncyBTZWNyZXRTdG9yYWdlLiBJdCdzIGVuY3J5cHRlZCBhbmQgbmV2ZXIgc2hhcmVkLlwiLFxuICAgICAgICAgIFwiT0tcIlxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaW5wdXRCb3gub25EaWRBY2NlcHQoYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBpbnB1dEJveC52YWx1ZS50cmltKCk7XG4gICAgICBpZiAodmFsdWUubGVuZ3RoID4gMCkge1xuICAgICAgICBhd2FpdCBjb250ZXh0LnNlY3JldHMuc3RvcmUoU0VDUkVUX0tFWSwgdmFsdWUpO1xuICAgICAgICB2c2NvZGUud2luZG93LnNob3dJbmZvcm1hdGlvbk1lc3NhZ2UoXG4gICAgICAgICAgXCLinIUgR2VtaW5pIEFQSSBrZXkgc2F2ZWQgc2VjdXJlbHkhXCJcbiAgICAgICAgKTtcbiAgICAgICAgaW5wdXRCb3guaGlkZSgpO1xuICAgICAgICByZXNvbHZlKHZhbHVlKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlucHV0Qm94Lm9uRGlkSGlkZSgoKSA9PiB7XG4gICAgICBpbnB1dEJveC5kaXNwb3NlKCk7XG4gICAgICByZXNvbHZlKHVuZGVmaW5lZCk7XG4gICAgfSk7XG5cbiAgICBpbnB1dEJveC5zaG93KCk7XG4gIH0pO1xufVxuIiwKICAgICJpbXBvcnQgKiBhcyB2c2NvZGUgZnJvbSBcInZzY29kZVwiO1xuaW1wb3J0IHsgcmVnaXN0ZXJDb21tYW5kcyB9IGZyb20gXCIuL2NvbW1hbmRzXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBhY3RpdmF0ZShjb250ZXh0OiB2c2NvZGUuRXh0ZW5zaW9uQ29udGV4dCkge1xuICByZWdpc3RlckNvbW1hbmRzKGNvbnRleHQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVhY3RpdmF0ZSgpIHt9XG4iCiAgXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUF3QixJQUF4Qjs7O0FDQXVCLElBQXZCO0FBRUEsSUFBTSxXQUFXO0FBQ2pCLElBQU0sV0FBVztBQVlqQixlQUFz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QUEsTUFDRixNQUFNLHNCQUNKLGtCQUNBLEtBQ0EsUUFDQSxXQUNGO0FBQUEsTUFDQSxPQUFPLEdBQUc7QUFBQSxNQUNWLE9BQU8sV0FDTCx3QkFBdUIsYUFBYSxRQUFRLEVBQUUsVUFBVSxPQUFPLENBQUMsR0FDbEU7QUFBQTtBQUFBLElBR0YsT0FBTyxXQUFXLEVBQUU7QUFBQSxJQUNwQixPQUFPLFdBQVcsb0NBQW9DO0FBQUEsSUFDdEQsSUFBSTtBQUFBLE1BQ0YsTUFBTSxzQkFDSixzQkFDQSxLQUNBLFFBQ0EsV0FDRjtBQUFBLE1BQ0EsT0FBTyxHQUFHO0FBQUEsTUFDVixPQUFPLFdBQ0wsNEJBQTJCLGFBQWEsUUFBUSxFQUFFLFVBQVUsT0FBTyxDQUFDLEdBQ3RFO0FBQUE7QUFBQSxJQUVGLE9BQU8sR0FBRztBQUFBLElBQ1YsT0FBTyxXQUNMLGdCQUFlLGFBQWEsUUFBUSxFQUFFLFVBQVUsT0FBTyxDQUFDLEdBQzFEO0FBQUE7QUFBQSxFQUdGLE9BQU8sV0FBVyxFQUFFO0FBQUEsRUFDcEIsT0FBTyxXQUFXLDRCQUE0QjtBQUFBOzs7QUl2T3pDLFNBQVMsUUFBUSxDQUFDLFNBQWtDO0FBQUEsRUFDekQsaUJBQWlCLE9BQU87QUFBQTtBQUduQixTQUFTLFVBQVUsR0FBRzsiLAogICJkZWJ1Z0lkIjogIjRFQ0Y2QTEzRTAyMThFRDg2NDc1NkUyMTY0NzU2RTIxIiwKICAibmFtZXMiOiBbXQp9
