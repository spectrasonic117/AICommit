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
      vscode3.window.showInformationMessage(`✅ Committed: ${message}`);
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

//# debugId=CCB2BF4B952FEAAA64756E2164756E21
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2NvbW1hbmRzLnRzIiwgInNyYy9haS9nZW1pbmkudHMiLCAic3JjL2dpdC9vcGVyYXRpb25zLnRzIiwgInNyYy91aS9hcGlLZXlQcm9tcHQudHMiLCAic3JjL2V4dGVuc2lvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsKICAgICJpbXBvcnQgKiBhcyB2c2NvZGUgZnJvbSBcInZzY29kZVwiO1xuaW1wb3J0IHsgZ2VuZXJhdGVDb21taXRNZXNzYWdlLCBsaXN0QXZhaWxhYmxlTW9kZWxzIH0gZnJvbSBcIi4vYWkvZ2VtaW5pXCI7XG5pbXBvcnQge1xuICBnZXRHaXRBUEksXG4gIGdldFJlcG9zaXRvcnksXG4gIHN0YWdlQWxsQ2hhbmdlcyxcbiAgaGFzQW55Q2hhbmdlcyxcbiAgZ2V0U3RhZ2VkRGlmZixcbiAgY29tbWl0LFxufSBmcm9tIFwiLi9naXQvb3BlcmF0aW9uc1wiO1xuaW1wb3J0IHsgZ2V0QXBpS2V5LCBwcm9tcHRGb3JBcGlLZXkgfSBmcm9tIFwiLi91aS9hcGlLZXlQcm9tcHRcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29tbWFuZHMoY29udGV4dDogdnNjb2RlLkV4dGVuc2lvbkNvbnRleHQpOiB2b2lkIHtcbiAgY29udGV4dC5zdWJzY3JpcHRpb25zLnB1c2goXG4gICAgdnNjb2RlLmNvbW1hbmRzLnJlZ2lzdGVyQ29tbWFuZChcbiAgICAgIFwiYWlDb21taXQuZ2VuZXJhdGVDb21taXRcIixcbiAgICAgICgpID0+IGhhbmRsZUdlbmVyYXRlQ29tbWl0KGNvbnRleHQpXG4gICAgKSxcbiAgICB2c2NvZGUuY29tbWFuZHMucmVnaXN0ZXJDb21tYW5kKFxuICAgICAgXCJhaUNvbW1pdC5zZWxlY3RNb2RlbFwiLFxuICAgICAgKCkgPT4gaGFuZGxlU2VsZWN0TW9kZWwoKVxuICAgICksXG4gICAgdnNjb2RlLmNvbW1hbmRzLnJlZ2lzdGVyQ29tbWFuZChcbiAgICAgIFwiYWlDb21taXQuc2V0QXBpS2V5XCIsXG4gICAgICAoKSA9PiBwcm9tcHRGb3JBcGlLZXkoY29udGV4dClcbiAgICApLFxuICAgIHZzY29kZS5jb21tYW5kcy5yZWdpc3RlckNvbW1hbmQoXG4gICAgICBcImFpQ29tbWl0LmRpYWdub3NlXCIsXG4gICAgICAoKSA9PiBoYW5kbGVEaWFnbm9zZShjb250ZXh0KVxuICAgIClcbiAgKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlR2VuZXJhdGVDb21taXQoXG4gIGNvbnRleHQ6IHZzY29kZS5FeHRlbnNpb25Db250ZXh0XG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBnaXQgPSBhd2FpdCBnZXRHaXRBUEkoKTtcbiAgICBpZiAoIWdpdCkge1xuICAgICAgdnNjb2RlLndpbmRvdy5zaG93RXJyb3JNZXNzYWdlKFwiR2l0IGV4dGVuc2lvbiBub3QgZm91bmQuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHJlcG8gPSBnZXRSZXBvc2l0b3J5KGdpdCk7XG4gICAgaWYgKCFyZXBvKSB7XG4gICAgICB2c2NvZGUud2luZG93LnNob3dXYXJuaW5nTWVzc2FnZShcbiAgICAgICAgXCJObyBnaXQgcmVwb3NpdG9yeSBmb3VuZC4gT3BlbiBhIGZvbGRlciB3aXRoIGEgZ2l0IHJlcG9zaXRvcnkuXCJcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCFoYXNBbnlDaGFuZ2VzKHJlcG8pKSB7XG4gICAgICB2c2NvZGUud2luZG93LnNob3dXYXJuaW5nTWVzc2FnZShcIk5vIGNoYW5nZXMgdG8gY29tbWl0LlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgYXBpS2V5ID0gYXdhaXQgZ2V0QXBpS2V5KGNvbnRleHQpO1xuICAgIGlmICghYXBpS2V5KSB7XG4gICAgICBhcGlLZXkgPSBhd2FpdCBwcm9tcHRGb3JBcGlLZXkoY29udGV4dCk7XG4gICAgICBpZiAoIWFwaUtleSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgY29uZmlnID0gdnNjb2RlLndvcmtzcGFjZS5nZXRDb25maWd1cmF0aW9uKFwiYWlDb21taXRcIik7XG4gICAgY29uc3QgbW9kZWwgPSBjb25maWcuZ2V0PHN0cmluZz4oXCJtb2RlbFwiLCBcImdlbW1hLTQtMzFiLWl0XCIpO1xuICAgIGNvbnN0IHN5c3RlbVByb21wdCA9IGNvbmZpZy5nZXQ8c3RyaW5nPihcInN5c3RlbVByb21wdFwiLCBcIlwiKTtcblxuICAgIGNvbnN0IHN0YWdlZENvdW50ID0gcmVwby5zdGF0ZS5pbmRleENoYW5nZXMubGVuZ3RoO1xuICAgIGNvbnN0IHVuc3RhZ2VkQ291bnQgPSByZXBvLnN0YXRlLndvcmtpbmdUcmVlQ2hhbmdlcy5sZW5ndGg7XG5cbiAgICBhd2FpdCB2c2NvZGUud2luZG93LndpdGhQcm9ncmVzcyhcbiAgICAgIHtcbiAgICAgICAgbG9jYXRpb246IHZzY29kZS5Qcm9ncmVzc0xvY2F0aW9uLlNvdXJjZUNvbnRyb2wsXG4gICAgICAgIHRpdGxlOiBcIkdlbmVyYXRpbmcgQUkgY29tbWl0IG1lc3NhZ2UuLi5cIixcbiAgICAgIH0sXG4gICAgICBhc3luYyAocHJvZ3Jlc3MpID0+IHtcbiAgICAgICAgcHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogXCJTdGFnaW5nIGNoYW5nZXMuLi5cIiB9KTtcblxuICAgICAgICBpZiAodW5zdGFnZWRDb3VudCA+IDApIHtcbiAgICAgICAgICBhd2FpdCBzdGFnZUFsbENoYW5nZXMocmVwbyk7XG4gICAgICAgIH1cblxuICAgICAgICBwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBcIkdldHRpbmcgZGlmZi4uLlwiIH0pO1xuICAgICAgICBjb25zdCBkaWZmID0gYXdhaXQgZ2V0U3RhZ2VkRGlmZihyZXBvKTtcblxuICAgICAgICBpZiAoIWRpZmYpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyBkaWZmIGF2YWlsYWJsZSBhZnRlciBzdGFnaW5nLlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IFwiQ2FsbGluZyBHZW1pbmkgQVBJLi4uXCIgfSk7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBhd2FpdCBnZW5lcmF0ZUNvbW1pdE1lc3NhZ2UoXG4gICAgICAgICAgbW9kZWwsXG4gICAgICAgICAgYXBpS2V5ISxcbiAgICAgICAgICBzeXN0ZW1Qcm9tcHQsXG4gICAgICAgICAgZGlmZlxuICAgICAgICApO1xuXG4gICAgICAgIHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IFwiQ29tbWl0dGluZy4uLlwiIH0pO1xuICAgICAgICByZXBvLmlucHV0Qm94LnZhbHVlID0gbWVzc2FnZTtcbiAgICAgICAgYXdhaXQgY29tbWl0KHJlcG8sIG1lc3NhZ2UpO1xuXG4gICAgICAgIHZzY29kZS53aW5kb3cuc2hvd0luZm9ybWF0aW9uTWVzc2FnZShcbiAgICAgICAgICBg4pyFIENvbW1pdHRlZDogJHttZXNzYWdlfWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiVW5rbm93biBlcnJvclwiO1xuICAgIHZzY29kZS53aW5kb3cuc2hvd0Vycm9yTWVzc2FnZShgQUkgQ29tbWl0IGZhaWxlZDogJHttZXNzYWdlfWApO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVNlbGVjdE1vZGVsKCk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBjb25maWcgPSB2c2NvZGUud29ya3NwYWNlLmdldENvbmZpZ3VyYXRpb24oXCJhaUNvbW1pdFwiKTtcbiAgY29uc3QgY3VycmVudCA9IGNvbmZpZy5nZXQ8c3RyaW5nPihcIm1vZGVsXCIsIFwiZ2VtbWEtNC0zMWItaXRcIik7XG5cbiAgY29uc3QgaXRlbXM6IHZzY29kZS5RdWlja1BpY2tJdGVtW10gPSBbXG4gICAge1xuICAgICAgbGFiZWw6IFwiZ2VtbWEtNC0zMWItaXRcIixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIk1vcmUgY2FwYWJsZSwgc2xpZ2h0bHkgc2xvd2VyXCIsXG4gICAgICBkZXRhaWw6IGN1cnJlbnQgPT09IFwiZ2VtbWEtNC0zMWItaXRcIiA/IFwiQ3VycmVudGx5IHNlbGVjdGVkXCIgOiB1bmRlZmluZWQsXG4gICAgfSxcbiAgICB7XG4gICAgICBsYWJlbDogXCJnZW1tYS00LTI2Yi1hNGItaXRcIixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkZhc3RlciwgbGlnaHRlclwiLFxuICAgICAgZGV0YWlsOiBjdXJyZW50ID09PSBcImdlbW1hLTQtMjZiLWE0Yi1pdFwiID8gXCJDdXJyZW50bHkgc2VsZWN0ZWRcIiA6IHVuZGVmaW5lZCxcbiAgICB9LFxuICBdO1xuXG4gIGNvbnN0IHBpY2tlZCA9IGF3YWl0IHZzY29kZS53aW5kb3cuc2hvd1F1aWNrUGljayhpdGVtcywge1xuICAgIHRpdGxlOiBcIkFJIENvbW1pdDogU2VsZWN0IE1vZGVsXCIsXG4gICAgcGxhY2VIb2xkZXI6IFwiQ2hvb3NlIHRoZSBHZW1pbmkgbW9kZWwgZm9yIGNvbW1pdCBnZW5lcmF0aW9uXCIsXG4gIH0pO1xuXG4gIGlmIChwaWNrZWQpIHtcbiAgICBhd2FpdCBjb25maWcudXBkYXRlKFxuICAgICAgXCJtb2RlbFwiLFxuICAgICAgcGlja2VkLmxhYmVsLFxuICAgICAgdnNjb2RlLkNvbmZpZ3VyYXRpb25UYXJnZXQuR2xvYmFsXG4gICAgKTtcbiAgICB2c2NvZGUud2luZG93LnNob3dJbmZvcm1hdGlvbk1lc3NhZ2UoXG4gICAgICBgQUkgQ29tbWl0IG1vZGVsIHNldCB0bzogJHtwaWNrZWQubGFiZWx9YFxuICAgICk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlRGlhZ25vc2UoXG4gIGNvbnRleHQ6IHZzY29kZS5FeHRlbnNpb25Db250ZXh0XG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgYXBpS2V5ID0gYXdhaXQgZ2V0QXBpS2V5KGNvbnRleHQpO1xuICBpZiAoIWFwaUtleSkge1xuICAgIGNvbnN0IHByb21wdGVkID0gYXdhaXQgcHJvbXB0Rm9yQXBpS2V5KGNvbnRleHQpO1xuICAgIGlmICghcHJvbXB0ZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gIH1cblxuICBjb25zdCBrZXkgPSAoYXdhaXQgZ2V0QXBpS2V5KGNvbnRleHQpKSE7XG5cbiAgY29uc3Qgb3V0cHV0ID0gdnNjb2RlLndpbmRvdy5jcmVhdGVPdXRwdXRDaGFubmVsKFwiQUkgQ29tbWl0OiBEaWFnbm9zZVwiKTtcbiAgb3V0cHV0LnNob3coKTtcblxuICBvdXRwdXQuYXBwZW5kTGluZShcIj09PSBBSSBDb21taXQgRGlhZ25vc2lzID09PVwiKTtcbiAgb3V0cHV0LmFwcGVuZExpbmUoXCJcIik7XG5cbiAgb3V0cHV0LmFwcGVuZExpbmUoXCIxLiBDaGVja2luZyBhdmFpbGFibGUgbW9kZWxzLi4uXCIpO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgbW9kZWxzID0gYXdhaXQgbGlzdEF2YWlsYWJsZU1vZGVscyhrZXkpO1xuICAgIG91dHB1dC5hcHBlbmRMaW5lKGAgICBGb3VuZCAke21vZGVscy5sZW5ndGh9IG1vZGVsczpgKTtcblxuICAgIGNvbnN0IGdlbW1hTW9kZWxzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgbSBvZiBtb2RlbHMpIHtcbiAgICAgIGNvbnN0IG1ldGhvZHMgPSBtLnN1cHBvcnRlZEdlbmVyYXRpb25NZXRob2RzPy5qb2luKFwiLCBcIikgfHwgXCJub25lXCI7XG4gICAgICBvdXRwdXQuYXBwZW5kTGluZShgICAgLSAke20ubmFtZX0gKCR7bS5kaXNwbGF5TmFtZX0pIFske21ldGhvZHN9XWApO1xuICAgICAgaWYgKG0ubmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKFwiZ2VtbWFcIikpIHtcbiAgICAgICAgZ2VtbWFNb2RlbHMucHVzaChtLm5hbWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIG91dHB1dC5hcHBlbmRMaW5lKFwiXCIpO1xuICAgIG91dHB1dC5hcHBlbmRMaW5lKFwiMi4gR2VtbWEgbW9kZWxzIGZvdW5kOlwiKTtcbiAgICBpZiAoZ2VtbWFNb2RlbHMubGVuZ3RoID4gMCkge1xuICAgICAgZm9yIChjb25zdCBnIG9mIGdlbW1hTW9kZWxzKSB7XG4gICAgICAgIG91dHB1dC5hcHBlbmRMaW5lKGAgICDinJMgJHtnfWApO1xuICAgICAgfVxuICAgICAgb3V0cHV0LmFwcGVuZExpbmUoXCJcIik7XG4gICAgICBvdXRwdXQuYXBwZW5kTGluZShcbiAgICAgICAgXCIgICBVc2UgdGhlc2UgRVhBQ1QgbmFtZXMgaW4gU2V0dGluZ3Mg4oaSIEFJIENvbW1pdCDihpIgTW9kZWwuXCJcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dHB1dC5hcHBlbmRMaW5lKFxuICAgICAgICBcIiAgIOKclyBObyBHZW1tYSBtb2RlbHMgZm91bmQgZm9yIHRoaXMgQVBJIGtleS5cIlxuICAgICAgKTtcbiAgICAgIG91dHB1dC5hcHBlbmRMaW5lKFxuICAgICAgICBcIiAgIFRyeSBhdCBodHRwczovL2Fpc3R1ZGlvLmdvb2dsZS5jb20gdG8gZW5hYmxlIEdlbW1hIG1vZGVscy5cIlxuICAgICAgKTtcbiAgICB9XG5cbiAgICBvdXRwdXQuYXBwZW5kTGluZShcIlwiKTtcbiAgICBvdXRwdXQuYXBwZW5kTGluZShcIjMuIFRlc3RpbmcgJ2dlbW1hLTQtMzFiLWl0Jy4uLlwiKTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgZ2VuZXJhdGVDb21taXRNZXNzYWdlKFxuICAgICAgICBcImdlbW1hLTQtMzFiLWl0XCIsXG4gICAgICAgIGtleSxcbiAgICAgICAgXCJ0ZXN0XCIsXG4gICAgICAgIFwidGVzdCBkaWZmXCJcbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgb3V0cHV0LmFwcGVuZExpbmUoXG4gICAgICAgIGAgICDinJcgZ2VtbWEtNC0zMWItaXQ6ICR7ZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpfWBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgb3V0cHV0LmFwcGVuZExpbmUoXCJcIik7XG4gICAgb3V0cHV0LmFwcGVuZExpbmUoXCI0LiBUZXN0aW5nICdnZW1tYS00LTI2Yi1hNGItaXQnLi4uXCIpO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBnZW5lcmF0ZUNvbW1pdE1lc3NhZ2UoXG4gICAgICAgIFwiZ2VtbWEtNC0yNmItYTRiLWl0XCIsXG4gICAgICAgIGtleSxcbiAgICAgICAgXCJ0ZXN0XCIsXG4gICAgICAgIFwidGVzdCBkaWZmXCJcbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgb3V0cHV0LmFwcGVuZExpbmUoXG4gICAgICAgIGAgICDinJcgZ2VtbWEtNC0yNmItYTRiLWl0OiAke2UgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKX1gXG4gICAgICApO1xuICAgIH1cbiAgfSBjYXRjaCAoZSkge1xuICAgIG91dHB1dC5hcHBlbmRMaW5lKFxuICAgICAgYCAgIOKclyBGYWlsZWQ6ICR7ZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpfWBcbiAgICApO1xuICB9XG5cbiAgb3V0cHV0LmFwcGVuZExpbmUoXCJcIik7XG4gIG91dHB1dC5hcHBlbmRMaW5lKFwiPT09IERpYWdub3NpcyBjb21wbGV0ZSA9PT1cIik7XG59XG4iLAogICAgImltcG9ydCAqIGFzIGh0dHBzIGZyb20gXCJub2RlOmh0dHBzXCI7XG5cbmNvbnN0IEFQSV9IT1NUID0gXCJnZW5lcmF0aXZlbGFuZ3VhZ2UuZ29vZ2xlYXBpcy5jb21cIjtcbmNvbnN0IEFQSV9QQVRIID0gXCIvdjFiZXRhL21vZGVscy9cIjtcblxuaW50ZXJmYWNlIE1vZGVsSW5mbyB7XG4gIG5hbWU6IHN0cmluZztcbiAgZGlzcGxheU5hbWU6IHN0cmluZztcbiAgc3VwcG9ydGVkR2VuZXJhdGlvbk1ldGhvZHM6IHN0cmluZ1tdO1xufVxuXG5pbnRlcmZhY2UgTGlzdE1vZGVsc1Jlc3BvbnNlIHtcbiAgbW9kZWxzOiBNb2RlbEluZm9bXTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxpc3RBdmFpbGFibGVNb2RlbHMoXG4gIGFwaUtleTogc3RyaW5nXG4pOiBQcm9taXNlPE1vZGVsSW5mb1tdPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcmVxID0gaHR0cHMucmVxdWVzdChcbiAgICAgIHtcbiAgICAgICAgaG9zdG5hbWU6IEFQSV9IT1NULFxuICAgICAgICBwYXRoOiBcIi92MWJldGEvbW9kZWxzXCIsXG4gICAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIFwieC1nb29nLWFwaS1rZXlcIjogYXBpS2V5LFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiAxMDAwMCxcbiAgICAgIH0sXG4gICAgICAocmVzKSA9PiB7XG4gICAgICAgIGxldCBkYXRhID0gXCJcIjtcbiAgICAgICAgcmVzLm9uKFwiZGF0YVwiLCAoY2h1bmspID0+IChkYXRhICs9IGNodW5rKSk7XG4gICAgICAgIHJlcy5vbihcImVuZFwiLCAoKSA9PiB7XG4gICAgICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSAyMDApIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoZGF0YSkgYXMgTGlzdE1vZGVsc1Jlc3BvbnNlO1xuICAgICAgICAgICAgICByZXNvbHZlKHBhcnNlZC5tb2RlbHMgfHwgW10pO1xuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoXCJGYWlsZWQgdG8gcGFyc2UgbW9kZWwgbGlzdC5cIikpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICBgRmFpbGVkIHRvIGxpc3QgbW9kZWxzICgke3Jlcy5zdGF0dXNDb2RlfSk6ICR7ZGF0YX1gXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgcmVxLm9uKFwiZXJyb3JcIiwgKGVycjogTm9kZUpTLkVycm5vRXhjZXB0aW9uKSA9PiB7XG4gICAgICByZWplY3QobmV3IEVycm9yKGBOZXR3b3JrIGVycm9yOiAke2Vyci5tZXNzYWdlfWApKTtcbiAgICB9KTtcblxuICAgIHJlcS5vbihcInRpbWVvdXRcIiwgKCkgPT4ge1xuICAgICAgcmVxLmRlc3Ryb3koKTtcbiAgICAgIHJlamVjdChuZXcgRXJyb3IoXCJSZXF1ZXN0IHRpbWVkIG91dC5cIikpO1xuICAgIH0pO1xuXG4gICAgcmVxLmVuZCgpO1xuICB9KTtcbn1cblxuaW50ZXJmYWNlIEdlbWluaVJlc3BvbnNlIHtcbiAgY2FuZGlkYXRlcz86IHtcbiAgICBjb250ZW50OiB7XG4gICAgICByb2xlOiBzdHJpbmc7XG4gICAgICBwYXJ0czogeyB0ZXh0OiBzdHJpbmc7IHRob3VnaHQ/OiBib29sZWFuIH1bXTtcbiAgICB9O1xuICAgIGZpbmlzaFJlYXNvbjogc3RyaW5nO1xuICB9W107XG4gIHByb21wdEZlZWRiYWNrPzoge1xuICAgIGJsb2NrUmVhc29uOiBzdHJpbmc7XG4gIH07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZUNvbW1pdE1lc3NhZ2UoXG4gIG1vZGVsOiBzdHJpbmcsXG4gIGFwaUtleTogc3RyaW5nLFxuICBzeXN0ZW1Qcm9tcHQ6IHN0cmluZyxcbiAgZGlmZjogc3RyaW5nXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCBib2R5ID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgIHN5c3RlbUluc3RydWN0aW9uOiB7XG4gICAgICBwYXJ0czogW3sgdGV4dDogc3lzdGVtUHJvbXB0IH1dLFxuICAgIH0sXG4gICAgY29udGVudHM6IFtcbiAgICAgIHtcbiAgICAgICAgcm9sZTogXCJ1c2VyXCIsXG4gICAgICAgIHBhcnRzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgdGV4dDogYEdlbmVyYXRlIGEgY29tbWl0IG1lc3NhZ2UgZm9yIHRoZSBmb2xsb3dpbmcgZ2l0IGRpZmY6XFxuXFxuXFxgXFxgXFxgZGlmZlxcbiR7ZGlmZn1cXG5cXGBcXGBcXGBgLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgIF0sXG4gICAgZ2VuZXJhdGlvbkNvbmZpZzoge1xuICAgICAgdGVtcGVyYXR1cmU6IDAuMixcbiAgICAgIG1heE91dHB1dFRva2VuczogMTUwLFxuICAgICAgdG9wUDogMC45NSxcbiAgICB9LFxuICB9KTtcblxuICByZXR1cm4gbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcmVxID0gaHR0cHMucmVxdWVzdChcbiAgICAgIHtcbiAgICAgICAgaG9zdG5hbWU6IEFQSV9IT1NULFxuICAgICAgICBwYXRoOiBgJHtBUElfUEFUSH0ke21vZGVsfTpnZW5lcmF0ZUNvbnRlbnRgLFxuICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgICAgICAgXCJ4LWdvb2ctYXBpLWtleVwiOiBhcGlLZXksXG4gICAgICAgICAgXCJDb250ZW50LUxlbmd0aFwiOiBCdWZmZXIuYnl0ZUxlbmd0aChib2R5KS50b1N0cmluZygpLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiAxNTAwMCxcbiAgICAgIH0sXG4gICAgICAocmVzKSA9PiB7XG4gICAgICAgIGxldCBkYXRhID0gXCJcIjtcblxuICAgICAgICByZXMub24oXCJkYXRhXCIsIChjaHVuaykgPT4ge1xuICAgICAgICAgIGRhdGEgKz0gY2h1bms7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJlcy5vbihcImVuZFwiLCAoKSA9PiB7XG4gICAgICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSA0MDEpIHtcbiAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgIFwiSW52YWxpZCBBUEkga2V5LiBVc2UgJ0FJIENvbW1pdDogU2V0IEFQSSBLZXknIHRvIHVwZGF0ZSBpdC5cIlxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gNDI5KSB7XG4gICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICBcIlJhdGUgbGltaXRlZCBieSBHZW1pbmkgQVBJLiBQbGVhc2Ugd2FpdCBhIG1vbWVudCBhbmQgdHJ5IGFnYWluLlwiXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCFyZXMuc3RhdHVzQ29kZSB8fCByZXMuc3RhdHVzQ29kZSA+PSA0MDApIHtcbiAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgIGBHZW1pbmkgQVBJIGVycm9yICgke3Jlcy5zdGF0dXNDb2RlfSk6ICR7ZGF0YS5zbGljZSgwLCA1MDApfWBcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShkYXRhKSBhcyBHZW1pbmlSZXNwb25zZTtcblxuICAgICAgICAgICAgaWYgKCFwYXJzZWQuY2FuZGlkYXRlcyB8fCBwYXJzZWQuY2FuZGlkYXRlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgaWYgKHBhcnNlZC5wcm9tcHRGZWVkYmFjaz8uYmxvY2tSZWFzb24pIHtcbiAgICAgICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIGBDb250ZW50IGJsb2NrZWQ6ICR7cGFyc2VkLnByb21wdEZlZWRiYWNrLmJsb2NrUmVhc29ufWBcbiAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICAgICAgYE5vIGNvbW1pdCBtZXNzYWdlIGdlbmVyYXRlZC4gUmF3IHJlc3BvbnNlOiAke2RhdGEuc2xpY2UoMCwgMzAwKX1gXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZSA9IHBhcnNlZC5jYW5kaWRhdGVzWzBdO1xuICAgICAgICAgICAgY29uc3QgcGFydHMgPSBjYW5kaWRhdGUuY29udGVudD8ucGFydHM7XG4gICAgICAgICAgICBpZiAoIXBhcnRzIHx8IHBhcnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgICAgYEFJIHJldHVybmVkIG5vIHBhcnRzLiBmaW5pc2hSZWFzb246ICR7Y2FuZGlkYXRlLmZpbmlzaFJlYXNvbn0uIFJhdzogJHtkYXRhLnNsaWNlKDAsIDMwMCl9YFxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBHZW1tYSBtb2RlbHMgcmV0dXJuIGEgXCJ0aG91Z2h0XCIgcGFydCBmaXJzdCwgdGhlbiB0aGUgYWN0dWFsIHJlc3BvbnNlLlxuICAgICAgICAgICAgLy8gRmluZCB0aGUgZmlyc3Qgbm9uLXRob3VnaHQgcGFydCB3aXRoIHRleHQuXG4gICAgICAgICAgICBjb25zdCB0ZXh0UGFydCA9IHBhcnRzLmZpbmQoKHApID0+ICFwLnRob3VnaHQgJiYgcC50ZXh0Py50cmltKCkpO1xuICAgICAgICAgICAgY29uc3QgdGV4dCA9IHRleHRQYXJ0Py50ZXh0ID8/IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdPy50ZXh0O1xuXG4gICAgICAgICAgICBpZiAoIXRleHQgfHwgdGV4dC50cmltKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgICBgQUkgcmV0dXJuZWQgZW1wdHkgdGV4dC4gZmluaXNoUmVhc29uOiAke2NhbmRpZGF0ZS5maW5pc2hSZWFzb259LiBSYXc6ICR7ZGF0YS5zbGljZSgwLCAzMDApfWBcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVzb2x2ZSh0ZXh0LnRyaW0oKSk7XG4gICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgIG5ldyBFcnJvcihgRmFpbGVkIHRvIHBhcnNlIEdlbWluaSBBUEkgcmVzcG9uc2UuIFJhdzogJHtkYXRhLnNsaWNlKDAsIDMwMCl9YClcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgcmVxLm9uKFwiZXJyb3JcIiwgKGVycikgPT4ge1xuICAgICAgY29uc3Qgbm9kZUVyciA9IGVyciBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb247XG4gICAgICBpZiAobm9kZUVyci5jb2RlID09PSBcIkVDT05OUkVGVVNFRFwiKSB7XG4gICAgICAgIHJlamVjdChcbiAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICBcIkNhbm5vdCByZWFjaCBHb29nbGUgQVBJIChjb25uZWN0aW9uIHJlZnVzZWQpLiBDaGVjayB5b3VyIGludGVybmV0IGNvbm5lY3Rpb24uXCJcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKG5vZGVFcnIuY29kZSA9PT0gXCJFTk9URk9VTkRcIiB8fCBub2RlRXJyLmNvZGUgPT09IFwiRUFJX0FHQUlOXCIpIHtcbiAgICAgICAgcmVqZWN0KFxuICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgIFwiQ2Fubm90IHJlc29sdmUgR29vZ2xlIEFQSSBob3N0IChETlMgZXJyb3IpLiBDaGVjayB5b3VyIGludGVybmV0IGNvbm5lY3Rpb24uXCJcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKG5vZGVFcnIuY29kZSA9PT0gXCJFVElNRURPVVRcIiB8fCBub2RlRXJyLmNvZGUgPT09IFwiRUNPTk5SRVNFVFwiKSB7XG4gICAgICAgIHJlamVjdChcbiAgICAgICAgICBuZXcgRXJyb3IoXCJBUEkgcmVxdWVzdCB0aW1lZCBvdXQuIENoZWNrIHlvdXIgaW50ZXJuZXQgY29ubmVjdGlvbi5cIilcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAobm9kZUVyci5jb2RlID09PSBcIkNFUlRfSEFTX0VYUElSRURcIiB8fCBub2RlRXJyLmNvZGUgPT09IFwiVU5BQkxFX1RPX1ZFUklGWV9MRUFGX1NJR05BVFVSRVwiKSB7XG4gICAgICAgIHJlamVjdChcbiAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICBcIlNTTCBjZXJ0aWZpY2F0ZSBlcnJvciBjb25uZWN0aW5nIHRvIEdvb2dsZSBBUEkuIFlvdXIgc3lzdGVtIGNsb2NrIG1heSBiZSB3cm9uZy5cIlxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlamVjdChcbiAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICBgTmV0d29yayBlcnJvcjogJHtub2RlRXJyLm1lc3NhZ2V9IChjb2RlOiAke25vZGVFcnIuY29kZSB8fCBcIm5vbmVcIn0pYFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJlcS5vbihcInRpbWVvdXRcIiwgKCkgPT4ge1xuICAgICAgcmVxLmRlc3Ryb3koKTtcbiAgICAgIHJlamVjdChuZXcgRXJyb3IoXCJBUEkgcmVxdWVzdCB0aW1lZCBvdXQuIENoZWNrIHlvdXIgaW50ZXJuZXQgY29ubmVjdGlvbi5cIikpO1xuICAgIH0pO1xuXG4gICAgcmVxLndyaXRlKGJvZHkpO1xuICAgIHJlcS5lbmQoKTtcbiAgfSk7XG59XG4iLAogICAgImltcG9ydCAqIGFzIHZzY29kZSBmcm9tIFwidnNjb2RlXCI7XG5cbmludGVyZmFjZSBHaXRBUEkge1xuICByZXBvc2l0b3JpZXM6IFJlcG9zaXRvcnlbXTtcbn1cblxuaW50ZXJmYWNlIFJlcG9zaXRvcnkge1xuICByb290VXJpOiB2c2NvZGUuVXJpO1xuICBpbnB1dEJveDogeyB2YWx1ZTogc3RyaW5nIH07XG4gIHN0YXRlOiBSZXBvc2l0b3J5U3RhdGU7XG4gIGFkZChwYXRoczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+O1xuICBjb21taXQobWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcbiAgZGlmZihjYWNoZWQ/OiBib29sZWFuKTogUHJvbWlzZTxzdHJpbmc+O1xufVxuXG5pbnRlcmZhY2UgUmVwb3NpdG9yeVN0YXRlIHtcbiAgaW5kZXhDaGFuZ2VzOiBDaGFuZ2VbXTtcbiAgd29ya2luZ1RyZWVDaGFuZ2VzOiBDaGFuZ2VbXTtcbn1cblxuaW50ZXJmYWNlIENoYW5nZSB7XG4gIHVyaTogdnNjb2RlLlVyaTtcbiAgc3RhdHVzOiBudW1iZXI7XG59XG5cbmxldCBnaXRBcGlDYWNoZTogR2l0QVBJIHwgdW5kZWZpbmVkO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0R2l0QVBJKCk6IFByb21pc2U8R2l0QVBJIHwgdW5kZWZpbmVkPiB7XG4gIGlmIChnaXRBcGlDYWNoZSkge1xuICAgIHJldHVybiBnaXRBcGlDYWNoZTtcbiAgfVxuICBjb25zdCBleHQgPSB2c2NvZGUuZXh0ZW5zaW9ucy5nZXRFeHRlbnNpb24oXCJ2c2NvZGUuZ2l0XCIpO1xuICBpZiAoIWV4dCkge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgaWYgKCFleHQuaXNBY3RpdmUpIHtcbiAgICBhd2FpdCBleHQuYWN0aXZhdGUoKTtcbiAgfVxuICBnaXRBcGlDYWNoZSA9IGV4dC5leHBvcnRzLmdldEFQSSgxKTtcbiAgcmV0dXJuIGdpdEFwaUNhY2hlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVwb3NpdG9yeShnaXQ6IEdpdEFQSSk6IFJlcG9zaXRvcnkgfCB1bmRlZmluZWQge1xuICBpZiAoZ2l0LnJlcG9zaXRvcmllcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG4gIHJldHVybiBnaXQucmVwb3NpdG9yaWVzWzBdO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc3RhZ2VBbGxDaGFuZ2VzKHJlcG86IFJlcG9zaXRvcnkpOiBQcm9taXNlPG51bWJlcj4ge1xuICBjb25zdCB1bnN0YWdlZCA9IHJlcG8uc3RhdGUud29ya2luZ1RyZWVDaGFuZ2VzO1xuICBpZiAodW5zdGFnZWQubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIDA7XG4gIH1cbiAgY29uc3QgcGF0aHMgPSB1bnN0YWdlZC5tYXAoKGNoYW5nZSkgPT4gY2hhbmdlLnVyaS5mc1BhdGgpO1xuICBhd2FpdCByZXBvLmFkZChwYXRocyk7XG4gIHJldHVybiBwYXRocy5sZW5ndGg7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNBbnlDaGFuZ2VzKHJlcG86IFJlcG9zaXRvcnkpOiBib29sZWFuIHtcbiAgcmV0dXJuIChcbiAgICByZXBvLnN0YXRlLmluZGV4Q2hhbmdlcy5sZW5ndGggPiAwIHx8XG4gICAgcmVwby5zdGF0ZS53b3JraW5nVHJlZUNoYW5nZXMubGVuZ3RoID4gMFxuICApO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0U3RhZ2VkRGlmZihyZXBvOiBSZXBvc2l0b3J5KTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgcmV0dXJuIHJlcG8uZGlmZih0cnVlKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbW1pdChyZXBvOiBSZXBvc2l0b3J5LCBtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgYXdhaXQgcmVwby5jb21taXQobWVzc2FnZSk7XG59XG4iLAogICAgImltcG9ydCAqIGFzIHZzY29kZSBmcm9tIFwidnNjb2RlXCI7XG5cbmNvbnN0IFNFQ1JFVF9LRVkgPSBcImFpQ29tbWl0LmFwaUtleVwiO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0QXBpS2V5KFxuICBjb250ZXh0OiB2c2NvZGUuRXh0ZW5zaW9uQ29udGV4dFxuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcbiAgY29uc3QgZnJvbVNlY3JldHMgPSBhd2FpdCBjb250ZXh0LnNlY3JldHMuZ2V0KFNFQ1JFVF9LRVkpO1xuICBpZiAoZnJvbVNlY3JldHMpIHtcbiAgICByZXR1cm4gZnJvbVNlY3JldHM7XG4gIH1cbiAgY29uc3QgZnJvbUNvbmZpZyA9IHZzY29kZS53b3Jrc3BhY2VcbiAgICAuZ2V0Q29uZmlndXJhdGlvbihcImFpQ29tbWl0XCIpXG4gICAgLmdldDxzdHJpbmc+KFwiYXBpS2V5XCIpO1xuICBpZiAoZnJvbUNvbmZpZykge1xuICAgIGF3YWl0IGNvbnRleHQuc2VjcmV0cy5zdG9yZShTRUNSRVRfS0VZLCBmcm9tQ29uZmlnKTtcbiAgICByZXR1cm4gZnJvbUNvbmZpZztcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvbXB0Rm9yQXBpS2V5KFxuICBjb250ZXh0OiB2c2NvZGUuRXh0ZW5zaW9uQ29udGV4dFxuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcbiAgY29uc3QgZXhpc3RpbmdLZXkgPSBhd2FpdCBjb250ZXh0LnNlY3JldHMuZ2V0KFNFQ1JFVF9LRVkpO1xuXG4gIHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+KChyZXNvbHZlKSA9PiB7XG4gICAgY29uc3QgaW5wdXRCb3ggPSB2c2NvZGUud2luZG93LmNyZWF0ZUlucHV0Qm94KCk7XG4gICAgaW5wdXRCb3gudGl0bGUgPSBcIkFJIENvbW1pdDogRW50ZXIgR2VtaW5pIEFQSSBLZXlcIjtcbiAgICBpbnB1dEJveC5wbGFjZWhvbGRlciA9IFwiUGFzdGUgeW91ciBBUEkga2V5IGZyb20gR29vZ2xlIEFJIFN0dWRpb1wiO1xuICAgIGlucHV0Qm94LnByb21wdCA9XG4gICAgICBcIkdldCBhIGZyZWUgQVBJIGtleSBhdCBodHRwczovL2Fpc3R1ZGlvLmdvb2dsZS5jb20vYXBpa2V5XCI7XG4gICAgaW5wdXRCb3gucGFzc3dvcmQgPSB0cnVlO1xuICAgIGlucHV0Qm94Lmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcbiAgICBpbnB1dEJveC52YWx1ZSA9IGV4aXN0aW5nS2V5IHx8IFwiXCI7XG5cbiAgICBpbnB1dEJveC5idXR0b25zID0gW1xuICAgICAge1xuICAgICAgICBpY29uUGF0aDogbmV3IHZzY29kZS5UaGVtZUljb24oXCJsaW5rLWV4dGVybmFsXCIpLFxuICAgICAgICB0b29sdGlwOiBcIkdldCBBUEkgS2V5IGZyb20gR29vZ2xlIEFJIFN0dWRpb1wiLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgaWNvblBhdGg6IG5ldyB2c2NvZGUuVGhlbWVJY29uKFwiaW5mb1wiKSxcbiAgICAgICAgdG9vbHRpcDogXCJIb3cgaXMgbXkga2V5IHN0b3JlZD9cIixcbiAgICAgIH0sXG4gICAgXTtcblxuICAgIGlucHV0Qm94Lm9uRGlkQ2hhbmdlVmFsdWUoKHZhbHVlKSA9PiB7XG4gICAgICBpZiAodmFsdWUudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBpbnB1dEJveC52YWxpZGF0aW9uTWVzc2FnZSA9IFwiQVBJIGtleSBjYW5ub3QgYmUgZW1wdHlcIjtcbiAgICAgIH0gZWxzZSBpZiAodmFsdWUudHJpbSgpLmxlbmd0aCA8IDEwKSB7XG4gICAgICAgIGlucHV0Qm94LnZhbGlkYXRpb25NZXNzYWdlID0gXCJBUEkga2V5IHNlZW1zIHRvbyBzaG9ydFwiO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW5wdXRCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpbnB1dEJveC5vbkRpZFRyaWdnZXJCdXR0b24oKGJ1dHRvbikgPT4ge1xuICAgICAgaWYgKGJ1dHRvbi50b29sdGlwID09PSBcIkdldCBBUEkgS2V5IGZyb20gR29vZ2xlIEFJIFN0dWRpb1wiKSB7XG4gICAgICAgIHZzY29kZS5lbnYub3BlbkV4dGVybmFsKFxuICAgICAgICAgIHZzY29kZS5VcmkucGFyc2UoXCJodHRwczovL2Fpc3R1ZGlvLmdvb2dsZS5jb20vYXBpa2V5XCIpXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKGJ1dHRvbi50b29sdGlwID09PSBcIkhvdyBpcyBteSBrZXkgc3RvcmVkP1wiKSB7XG4gICAgICAgIHZzY29kZS53aW5kb3cuc2hvd0luZm9ybWF0aW9uTWVzc2FnZShcbiAgICAgICAgICBcIllvdXIgQVBJIGtleSBpcyBzdG9yZWQgc2VjdXJlbHkgdXNpbmcgVlNDb2RlJ3MgU2VjcmV0U3RvcmFnZS4gSXQncyBlbmNyeXB0ZWQgYW5kIG5ldmVyIHNoYXJlZC5cIixcbiAgICAgICAgICBcIk9LXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlucHV0Qm94Lm9uRGlkQWNjZXB0KGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gaW5wdXRCb3gudmFsdWUudHJpbSgpO1xuICAgICAgaWYgKHZhbHVlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgYXdhaXQgY29udGV4dC5zZWNyZXRzLnN0b3JlKFNFQ1JFVF9LRVksIHZhbHVlKTtcbiAgICAgICAgdnNjb2RlLndpbmRvdy5zaG93SW5mb3JtYXRpb25NZXNzYWdlKFxuICAgICAgICAgIFwi4pyFIEdlbWluaSBBUEkga2V5IHNhdmVkIHNlY3VyZWx5IVwiXG4gICAgICAgICk7XG4gICAgICAgIGlucHV0Qm94LmhpZGUoKTtcbiAgICAgICAgcmVzb2x2ZSh2YWx1ZSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpbnB1dEJveC5vbkRpZEhpZGUoKCkgPT4ge1xuICAgICAgaW5wdXRCb3guZGlzcG9zZSgpO1xuICAgICAgcmVzb2x2ZSh1bmRlZmluZWQpO1xuICAgIH0pO1xuXG4gICAgaW5wdXRCb3guc2hvdygpO1xuICB9KTtcbn1cbiIsCiAgICAiaW1wb3J0ICogYXMgdnNjb2RlIGZyb20gXCJ2c2NvZGVcIjtcbmltcG9ydCB7IHJlZ2lzdGVyQ29tbWFuZHMgfSBmcm9tIFwiLi9jb21tYW5kc1wiO1xuXG5leHBvcnQgZnVuY3Rpb24gYWN0aXZhdGUoY29udGV4dDogdnNjb2RlLkV4dGVuc2lvbkNvbnRleHQpIHtcbiAgcmVnaXN0ZXJDb21tYW5kcyhjb250ZXh0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlYWN0aXZhdGUoKSB7fVxuIgogIF0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBd0IsSUFBeEI7OztBQ0F1QixJQUF2QjtBQUVBLElBQU0sV0FBVztBQUNqQixJQUFN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O0FBQUEsSUFDbEQsSUFBSTtBQUFBLE1BQ0YsTUFBTSxzQkFDSixrQkFDQSxLQUNBLFFBQ0EsV0FDRjtBQUFBLE1BQ0EsT0FBTyxHQUFHO0FBQUEsTUFDVixPQUFPLFdBQ0wsd0JBQXVCLGFBQWEsUUFBUSxFQUFFLFVBQVUsT0FBTyxDQUFDLEdBQ2xFO0FBQUE7QUFBQSxJQUdGLE9BQU8sV0FBVyxFQUFFO0FBQUEsSUFDcEIsT0FBTyxXQUFXLG9DQUFvQztBQUFBLElBQ3RELElBQUk7QUFBQSxNQUNGLE1BQU0sc0JBQ0osc0JBQ0EsS0FDQSxRQUNBLFdBQ0Y7QUFBQSxNQUNBLE9BQU8sR0FBRztBQUFBLE1BQ1YsT0FBTyxXQUNMLDRCQUEyQixhQUFhLFFBQVEsRUFBRSxVQUFVLE9BQU8sQ0FBQyxHQUN0RTtBQUFBO0FBQUEsSUFFRixPQUFPLEdBQUc7QUFBQSxJQUNWLE9BQU8sV0FDTCxnQkFBZSxhQUFhLFFBQVEsRUFBRSxVQUFVLE9BQU8sQ0FBQyxHQUMxRDtBQUFBO0FBQUEsRUFHRixPQUFPLFdBQVcsRUFBRTtBQUFBLEVBQ3BCLE9BQU8sV0FBVyw0QkFBNEI7QUFBQTs7O0FJek96QyxTQUFTLFFBQVEsQ0FBQyxTQUFrQztBQUFBLEVBQ3pELGlCQUFpQixPQUFPO0FBQUE7QUFHbkIsU0FBUyxVQUFVLEdBQUc7IiwKICAiZGVidWdJZCI6ICJDQ0IyQkY0Qjk1MkZFQUFBNjQ3NTZFMjE2NDc1NkUyMSIsCiAgIm5hbWVzIjogW10KfQ==
