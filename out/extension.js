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
var vscode4 = __toESM(require("vscode"));

// src/ai/gemini.ts
var https = __toESM(require("node:https"));
var API_HOST = "generativelanguage.googleapis.com";
var API_PATH = "/v1beta/models/";
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

// src/ai/mistral.ts
var https2 = __toESM(require("node:https"));
var API_HOST2 = "codestral.mistral.ai";
var API_PATH2 = "/v1/chat/completions";
async function generateCommitMessage2(model, apiKey, systemPrompt, diff) {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({
    role: "user",
    content: `Generate a commit message for the following git diff:

\`\`\`diff
${diff}
\`\`\``
  });
  const body = JSON.stringify({
    model,
    messages,
    temperature: 0.2,
    max_tokens: 150
  });
  return new Promise((resolve, reject) => {
    const req = https2.request({
      hostname: API_HOST2,
      path: API_PATH2,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
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
          reject(new Error("Rate limited by Mistral API. Please wait a moment and try again."));
          return;
        }
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`Mistral API error (${res.statusCode}): ${data.slice(0, 500)}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (!parsed.choices || parsed.choices.length === 0) {
            reject(new Error(`No commit message generated. Raw response: ${data.slice(0, 300)}`));
            return;
          }
          const choice = parsed.choices[0];
          const message = choice.message?.content;
          if (!message || message.trim().length === 0) {
            reject(new Error(`AI returned empty text. finishReason: ${choice.finish_reason}. Raw: ${data.slice(0, 300)}`));
            return;
          }
          resolve(message.trim());
        } catch {
          reject(new Error(`Failed to parse Mistral API response. Raw: ${data.slice(0, 300)}`));
        }
      });
    });
    req.on("error", (err) => {
      const nodeErr = err;
      if (nodeErr.code === "ECONNREFUSED") {
        reject(new Error("Cannot reach Mistral API (connection refused). Check your internet connection."));
      } else if (nodeErr.code === "ENOTFOUND" || nodeErr.code === "EAI_AGAIN") {
        reject(new Error("Cannot resolve Mistral API host (DNS error). Check your internet connection."));
      } else if (nodeErr.code === "ETIMEDOUT" || nodeErr.code === "ECONNRESET") {
        reject(new Error("API request timed out. Check your internet connection."));
      } else if (nodeErr.code === "CERT_HAS_EXPIRED" || nodeErr.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
        reject(new Error("SSL certificate error connecting to Mistral API. Your system clock may be wrong."));
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

// src/ai/providers.ts
var vscode = __toESM(require("vscode"));
var GOOGLE_PROVIDER = {
  id: "google",
  name: "Google (Gemini)",
  apiKeyLabel: "Google AI API Key",
  apiKeyPlaceholder: "Paste your API key from Google AI Studio",
  apiKeyUrl: "https://aistudio.google.com/apikey",
  models: [
    { id: "gemma-4-31b-it", name: "gemma-4-31b-it" },
    { id: "gemma-4-26b-a4b-it", name: "gemma-4-26b-a4b-it" }
  ]
};
var MISTRAL_PROVIDER = {
  id: "mistral",
  name: "Mistral (Codestral)",
  apiKeyLabel: "Mistral API Key",
  apiKeyPlaceholder: "Paste your API key from Mistral Console",
  apiKeyUrl: "https://console.mistral.ai/codestral",
  models: [
    { id: "codestral-latest", name: "Codestral (Latest)" },
    { id: "codestral-2505", name: "Codestral 2505" }
  ]
};
var PROVIDERS = [GOOGLE_PROVIDER, MISTRAL_PROVIDER];
function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id);
}
async function getConfiguredProvider() {
  const config = vscode.workspace.getConfiguration("aiCommit");
  const providerId = config.get("provider", "google");
  return getProvider(providerId) ?? GOOGLE_PROVIDER;
}
async function setProvider(providerId) {
  const config = vscode.workspace.getConfiguration("aiCommit");
  await config.update("provider", providerId, vscode.ConfigurationTarget.Global);
}

// src/ui/apiKeyPrompt.ts
var vscode2 = __toESM(require("vscode"));
var SECRET_KEY_PREFIX = "aiCommit.apiKey";
function getSecretKey(providerId) {
  return `${SECRET_KEY_PREFIX}.${providerId}`;
}
async function getApiKey(context, providerId) {
  const secretKey = getSecretKey(providerId);
  const fromSecrets = await context.secrets.get(secretKey);
  if (fromSecrets) {
    return fromSecrets;
  }
  const fromConfig = vscode2.workspace.getConfiguration("aiCommit").get(`apiKey${providerId.charAt(0).toUpperCase() + providerId.slice(1)}`);
  if (fromConfig) {
    await context.secrets.store(secretKey, fromConfig);
    return fromConfig;
  }
  return;
}
async function promptForApiKey(context, providerId) {
  const provider = providerId ? getProvider(providerId) : await getCurrentProviderWithKey(context);
  if (!provider) {
    vscode2.window.showErrorMessage("No provider selected.");
    return;
  }
  const secretKey = getSecretKey(provider.id);
  const existingKey = await context.secrets.get(secretKey);
  return new Promise((resolve) => {
    const inputBox = vscode2.window.createInputBox();
    inputBox.title = `AI Commit: Enter ${provider.name} API Key`;
    inputBox.placeholder = provider.apiKeyPlaceholder;
    inputBox.prompt = `Get a free API key at ${provider.apiKeyUrl}`;
    inputBox.password = true;
    inputBox.ignoreFocusOut = true;
    inputBox.value = existingKey || "";
    inputBox.buttons = [
      {
        iconPath: new vscode2.ThemeIcon("link-external"),
        tooltip: `Get API Key from ${provider.name}`
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
      if (button.tooltip === `Get API Key from ${provider.name}`) {
        vscode2.env.openExternal(vscode2.Uri.parse(provider.apiKeyUrl));
      } else if (button.tooltip === "How is my key stored?") {
        vscode2.window.showInformationMessage("Your API key is stored securely using VSCode's SecretStorage. It's encrypted and never shared.", "OK");
      }
    });
    inputBox.onDidAccept(async () => {
      const value = inputBox.value.trim();
      if (value.length > 0) {
        await context.secrets.store(secretKey, value);
        vscode2.window.showInformationMessage(`✅ ${provider.name} API key saved securely!`);
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
async function getCurrentProviderWithKey(context) {
  const config = vscode2.workspace.getConfiguration("aiCommit");
  const providerId = config.get("provider", "google");
  const provider = getProvider(providerId);
  if (!provider) {
    return;
  }
  const apiKey = await getApiKey(context, provider.id);
  if (apiKey) {
    return provider;
  }
  for (const p of PROVIDERS) {
    const key = await getApiKey(context, p.id);
    if (key) {
      return p;
    }
  }
  return;
}

// src/git/operations.ts
var vscode3 = __toESM(require("vscode"));
var gitApiCache;
async function getGitAPI() {
  if (gitApiCache) {
    return gitApiCache;
  }
  const ext = vscode3.extensions.getExtension("vscode.git");
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

// src/commands.ts
function registerCommands(context) {
  context.subscriptions.push(vscode4.commands.registerCommand("aiCommit.generateCommit", () => handleGenerateCommit(context)), vscode4.commands.registerCommand("aiCommit.selectProvider", () => handleSelectProvider()), vscode4.commands.registerCommand("aiCommit.selectModel", () => handleSelectModel()), vscode4.commands.registerCommand("aiCommit.setApiKey", () => handleSetApiKey(context)), vscode4.commands.registerCommand("aiCommit.diagnose", () => handleDiagnose(context)));
}
async function handleGenerateCommit(context) {
  try {
    const git = await getGitAPI();
    if (!git) {
      vscode4.window.showErrorMessage("Git extension not found.");
      return;
    }
    const repo = getRepository(git);
    if (!repo) {
      vscode4.window.showWarningMessage("No git repository found. Open a folder with a git repository.");
      return;
    }
    if (!hasAnyChanges(repo)) {
      vscode4.window.showWarningMessage("No changes to commit.");
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
    const config = vscode4.workspace.getConfiguration("aiCommit");
    const model = config.get(`model${provider.id.charAt(0).toUpperCase() + provider.id.slice(1)}`, provider.models[0]?.id || "");
    const systemPrompt = config.get("systemPrompt", "");
    const stagedCount = repo.state.indexChanges.length;
    const unstagedCount = repo.state.workingTreeChanges.length;
    await vscode4.window.withProgress({
      location: vscode4.ProgressLocation.SourceControl,
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
      progress.report({ message: `Calling ${provider.name} API...` });
      let message;
      if (provider.id === "google") {
        message = await generateCommitMessage(model, apiKey, systemPrompt, diff);
      } else if (provider.id === "mistral") {
        message = await generateCommitMessage2(model, apiKey, systemPrompt, diff);
      } else {
        throw new Error(`Unsupported provider: ${provider.id}`);
      }
      progress.report({ message: "Committing..." });
      repo.inputBox.value = message;
      await commit(repo, message);
      vscode4.window.showInformationMessage("Commit Generated Successfully");
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode4.window.showErrorMessage(`AI Commit failed: ${message}`);
  }
}
async function handleSelectProvider() {
  const currentProvider = await getConfiguredProvider();
  const items = PROVIDERS.map((p) => ({
    label: p.name,
    description: `${p.models.length} models available`,
    detail: currentProvider.id === p.id ? "Currently selected" : undefined
  }));
  const picked = await vscode4.window.showQuickPick(items, {
    title: "AI Commit: Select Provider",
    placeHolder: "Choose the AI provider for commit generation"
  });
  if (picked) {
    const selectedProvider = PROVIDERS.find((p) => p.name === picked.label);
    if (selectedProvider) {
      await setProvider(selectedProvider.id);
      const config = vscode4.workspace.getConfiguration("aiCommit");
      const modelKey = `model${selectedProvider.id.charAt(0).toUpperCase() + selectedProvider.id.slice(1)}`;
      const currentModel = config.get(modelKey);
      if (!currentModel || !selectedProvider.models.some((m) => m.id === currentModel)) {
        await config.update(modelKey, selectedProvider.models[0]?.id, vscode4.ConfigurationTarget.Global);
      }
      vscode4.window.showInformationMessage(`AI Commit provider set to: ${selectedProvider.name}`);
    }
  }
}
async function handleSelectModel() {
  const provider = await getConfiguredProvider();
  const config = vscode4.workspace.getConfiguration("aiCommit");
  const modelKey = `model${provider.id.charAt(0).toUpperCase() + provider.id.slice(1)}`;
  const current = config.get(modelKey, provider.models[0]?.id || "");
  const items = provider.models.map((m) => ({
    label: m.name,
    detail: current === m.id ? "Currently selected" : undefined
  }));
  const picked = await vscode4.window.showQuickPick(items, {
    title: `AI Commit: Select Model (${provider.name})`,
    placeHolder: `Choose the model for ${provider.name}`
  });
  if (picked) {
    await config.update(modelKey, picked.label, vscode4.ConfigurationTarget.Global);
    vscode4.window.showInformationMessage(`AI Commit model set to: ${picked.label}`);
  }
}
async function handleSetApiKey(context) {
  const provider = await getConfiguredProvider();
  await promptForApiKey(context, provider.id);
}
async function handleDiagnose(context) {
  const provider = await getConfiguredProvider();
  const apiKey = await getApiKey(context, provider.id);
  if (!apiKey) {
    const prompted = await promptForApiKey(context, provider.id);
    if (!prompted) {
      return;
    }
  }
  const key = await getApiKey(context, provider.id);
  const output = vscode4.window.createOutputChannel("AI Commit: Diagnose");
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
  const config = vscode4.workspace.getConfiguration("aiCommit");
  const currentModel = config.get(modelKey, provider.models[0]?.id || "");
  output.appendLine(`Testing '${currentModel}'...`);
  try {
    if (provider.id === "google") {
      await generateCommitMessage(currentModel, key, "test", "test diff");
    } else if (provider.id === "mistral") {
      await generateCommitMessage2(currentModel, key, "test", "test diff");
    }
    output.appendLine(`   ✓ ${currentModel}: OK`);
  } catch (e) {
    output.appendLine(`   ✗ ${currentModel}: ${e instanceof Error ? e.message : String(e)}`);
  }
  output.appendLine("");
  output.appendLine("=== Diagnosis complete ===");
}

// src/extension.ts
function activate(context) {
  registerCommands(context);
}
function deactivate() {}

//# debugId=E10E33D7C6C18A0C64756E2164756E21
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2NvbW1hbmRzLnRzIiwgInNyYy9haS9nZW1pbmkudHMiLCAic3JjL2FpL21pc3RyYWwudHMiLCAic3JjL2FpL3Byb3ZpZGVycy50cyIsICJzcmMvdWkvYXBpS2V5UHJvbXB0LnRzIiwgInNyYy9naXQvb3BlcmF0aW9ucy50cyIsICJzcmMvZXh0ZW5zaW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWwogICAgImltcG9ydCAqIGFzIHZzY29kZSBmcm9tIFwidnNjb2RlXCI7XG5pbXBvcnQgeyBnZW5lcmF0ZUNvbW1pdE1lc3NhZ2UgYXMgZ2VtaW5pR2VuZXJhdGVDb21taXQgfSBmcm9tIFwiLi9haS9nZW1pbmlcIjtcbmltcG9ydCB7IGdlbmVyYXRlQ29tbWl0TWVzc2FnZSBhcyBtaXN0cmFsR2VuZXJhdGVDb21taXQgfSBmcm9tIFwiLi9haS9taXN0cmFsXCI7XG5pbXBvcnQge1xuICBQcm92aWRlcixcbiAgUHJvdmlkZXJJZCxcbiAgUFJPVklERVJTLFxuICBnZXRQcm92aWRlcixcbiAgZ2V0Q29uZmlndXJlZFByb3ZpZGVyLFxuICBzZXRQcm92aWRlcixcbn0gZnJvbSBcIi4vYWkvcHJvdmlkZXJzXCI7XG5pbXBvcnQge1xuICBnZXRBcGlLZXksXG4gIHByb21wdEZvckFwaUtleSxcbiAgZ2V0T3JQcm9tcHRBcGlLZXksXG59IGZyb20gXCIuL3VpL2FwaUtleVByb21wdFwiO1xuaW1wb3J0IHtcbiAgZ2V0R2l0QVBJLFxuICBnZXRSZXBvc2l0b3J5LFxuICBzdGFnZUFsbENoYW5nZXMsXG4gIGhhc0FueUNoYW5nZXMsXG4gIGdldFN0YWdlZERpZmYsXG4gIGNvbW1pdCxcbn0gZnJvbSBcIi4vZ2l0L29wZXJhdGlvbnNcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29tbWFuZHMoY29udGV4dDogdnNjb2RlLkV4dGVuc2lvbkNvbnRleHQpOiB2b2lkIHtcbiAgY29udGV4dC5zdWJzY3JpcHRpb25zLnB1c2goXG4gICAgdnNjb2RlLmNvbW1hbmRzLnJlZ2lzdGVyQ29tbWFuZChcbiAgICAgIFwiYWlDb21taXQuZ2VuZXJhdGVDb21taXRcIixcbiAgICAgICgpID0+IGhhbmRsZUdlbmVyYXRlQ29tbWl0KGNvbnRleHQpXG4gICAgKSxcbiAgICB2c2NvZGUuY29tbWFuZHMucmVnaXN0ZXJDb21tYW5kKFxuICAgICAgXCJhaUNvbW1pdC5zZWxlY3RQcm92aWRlclwiLFxuICAgICAgKCkgPT4gaGFuZGxlU2VsZWN0UHJvdmlkZXIoKVxuICAgICksXG4gICAgdnNjb2RlLmNvbW1hbmRzLnJlZ2lzdGVyQ29tbWFuZChcbiAgICAgIFwiYWlDb21taXQuc2VsZWN0TW9kZWxcIixcbiAgICAgICgpID0+IGhhbmRsZVNlbGVjdE1vZGVsKClcbiAgICApLFxuICAgIHZzY29kZS5jb21tYW5kcy5yZWdpc3RlckNvbW1hbmQoXG4gICAgICBcImFpQ29tbWl0LnNldEFwaUtleVwiLFxuICAgICAgKCkgPT4gaGFuZGxlU2V0QXBpS2V5KGNvbnRleHQpXG4gICAgKSxcbiAgICB2c2NvZGUuY29tbWFuZHMucmVnaXN0ZXJDb21tYW5kKFxuICAgICAgXCJhaUNvbW1pdC5kaWFnbm9zZVwiLFxuICAgICAgKCkgPT4gaGFuZGxlRGlhZ25vc2UoY29udGV4dClcbiAgICApXG4gICk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUdlbmVyYXRlQ29tbWl0KFxuICBjb250ZXh0OiB2c2NvZGUuRXh0ZW5zaW9uQ29udGV4dFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgZ2l0ID0gYXdhaXQgZ2V0R2l0QVBJKCk7XG4gICAgaWYgKCFnaXQpIHtcbiAgICAgIHZzY29kZS53aW5kb3cuc2hvd0Vycm9yTWVzc2FnZShcIkdpdCBleHRlbnNpb24gbm90IGZvdW5kLlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCByZXBvID0gZ2V0UmVwb3NpdG9yeShnaXQpO1xuICAgIGlmICghcmVwbykge1xuICAgICAgdnNjb2RlLndpbmRvdy5zaG93V2FybmluZ01lc3NhZ2UoXG4gICAgICAgIFwiTm8gZ2l0IHJlcG9zaXRvcnkgZm91bmQuIE9wZW4gYSBmb2xkZXIgd2l0aCBhIGdpdCByZXBvc2l0b3J5LlwiXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghaGFzQW55Q2hhbmdlcyhyZXBvKSkge1xuICAgICAgdnNjb2RlLndpbmRvdy5zaG93V2FybmluZ01lc3NhZ2UoXCJObyBjaGFuZ2VzIHRvIGNvbW1pdC5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgcHJvdmlkZXIgPSBhd2FpdCBnZXRDb25maWd1cmVkUHJvdmlkZXIoKTtcbiAgICBsZXQgYXBpS2V5ID0gYXdhaXQgZ2V0QXBpS2V5KGNvbnRleHQsIHByb3ZpZGVyLmlkKTtcblxuICAgIGlmICghYXBpS2V5KSB7XG4gICAgICBhcGlLZXkgPSBhd2FpdCBwcm9tcHRGb3JBcGlLZXkoY29udGV4dCwgcHJvdmlkZXIuaWQpO1xuICAgICAgaWYgKCFhcGlLZXkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGNvbmZpZyA9IHZzY29kZS53b3Jrc3BhY2UuZ2V0Q29uZmlndXJhdGlvbihcImFpQ29tbWl0XCIpO1xuICAgIGNvbnN0IG1vZGVsID0gY29uZmlnLmdldDxzdHJpbmc+KGBtb2RlbCR7cHJvdmlkZXIuaWQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBwcm92aWRlci5pZC5zbGljZSgxKX1gLCBwcm92aWRlci5tb2RlbHNbMF0/LmlkIHx8IFwiXCIpO1xuICAgIGNvbnN0IHN5c3RlbVByb21wdCA9IGNvbmZpZy5nZXQ8c3RyaW5nPihcInN5c3RlbVByb21wdFwiLCBcIlwiKTtcblxuICAgIGNvbnN0IHN0YWdlZENvdW50ID0gcmVwby5zdGF0ZS5pbmRleENoYW5nZXMubGVuZ3RoO1xuICAgIGNvbnN0IHVuc3RhZ2VkQ291bnQgPSByZXBvLnN0YXRlLndvcmtpbmdUcmVlQ2hhbmdlcy5sZW5ndGg7XG5cbiAgICBhd2FpdCB2c2NvZGUud2luZG93LndpdGhQcm9ncmVzcyhcbiAgICAgIHtcbiAgICAgICAgbG9jYXRpb246IHZzY29kZS5Qcm9ncmVzc0xvY2F0aW9uLlNvdXJjZUNvbnRyb2wsXG4gICAgICAgIHRpdGxlOiBcIkdlbmVyYXRpbmcgQUkgY29tbWl0IG1lc3NhZ2UuLi5cIixcbiAgICAgIH0sXG4gICAgICBhc3luYyAocHJvZ3Jlc3MpID0+IHtcbiAgICAgICAgcHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogXCJTdGFnaW5nIGNoYW5nZXMuLi5cIiB9KTtcblxuICAgICAgICBpZiAodW5zdGFnZWRDb3VudCA+IDApIHtcbiAgICAgICAgICBhd2FpdCBzdGFnZUFsbENoYW5nZXMocmVwbyk7XG4gICAgICAgIH1cblxuICAgICAgICBwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBcIkdldHRpbmcgZGlmZi4uLlwiIH0pO1xuICAgICAgICBjb25zdCBkaWZmID0gYXdhaXQgZ2V0U3RhZ2VkRGlmZihyZXBvKTtcblxuICAgICAgICBpZiAoIWRpZmYpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyBkaWZmIGF2YWlsYWJsZSBhZnRlciBzdGFnaW5nLlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IGBDYWxsaW5nICR7cHJvdmlkZXIubmFtZX0gQVBJLi4uYCB9KTtcblxuICAgICAgICBsZXQgbWVzc2FnZTogc3RyaW5nO1xuICAgICAgICBpZiAocHJvdmlkZXIuaWQgPT09IFwiZ29vZ2xlXCIpIHtcbiAgICAgICAgICBtZXNzYWdlID0gYXdhaXQgZ2VtaW5pR2VuZXJhdGVDb21taXQobW9kZWwsIGFwaUtleSEsIHN5c3RlbVByb21wdCwgZGlmZik7XG4gICAgICAgIH0gZWxzZSBpZiAocHJvdmlkZXIuaWQgPT09IFwibWlzdHJhbFwiKSB7XG4gICAgICAgICAgbWVzc2FnZSA9IGF3YWl0IG1pc3RyYWxHZW5lcmF0ZUNvbW1pdChtb2RlbCwgYXBpS2V5ISwgc3lzdGVtUHJvbXB0LCBkaWZmKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIHByb3ZpZGVyOiAke3Byb3ZpZGVyLmlkfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgcHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogXCJDb21taXR0aW5nLi4uXCIgfSk7XG4gICAgICAgIHJlcG8uaW5wdXRCb3gudmFsdWUgPSBtZXNzYWdlO1xuICAgICAgICBhd2FpdCBjb21taXQocmVwbywgbWVzc2FnZSk7XG5cbiAgICAgICAgdnNjb2RlLndpbmRvdy5zaG93SW5mb3JtYXRpb25NZXNzYWdlKFwiQ29tbWl0IEdlbmVyYXRlZCBTdWNjZXNzZnVsbHlcIik7XG4gICAgICB9XG4gICAgKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIlVua25vd24gZXJyb3JcIjtcbiAgICB2c2NvZGUud2luZG93LnNob3dFcnJvck1lc3NhZ2UoYEFJIENvbW1pdCBmYWlsZWQ6ICR7bWVzc2FnZX1gKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTZWxlY3RQcm92aWRlcigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgY3VycmVudFByb3ZpZGVyID0gYXdhaXQgZ2V0Q29uZmlndXJlZFByb3ZpZGVyKCk7XG5cbiAgY29uc3QgaXRlbXM6IHZzY29kZS5RdWlja1BpY2tJdGVtW10gPSBQUk9WSURFUlMubWFwKChwKSA9PiAoe1xuICAgIGxhYmVsOiBwLm5hbWUsXG4gICAgZGVzY3JpcHRpb246IGAke3AubW9kZWxzLmxlbmd0aH0gbW9kZWxzIGF2YWlsYWJsZWAsXG4gICAgZGV0YWlsOiBjdXJyZW50UHJvdmlkZXIuaWQgPT09IHAuaWQgPyBcIkN1cnJlbnRseSBzZWxlY3RlZFwiIDogdW5kZWZpbmVkLFxuICB9KSk7XG5cbiAgY29uc3QgcGlja2VkID0gYXdhaXQgdnNjb2RlLndpbmRvdy5zaG93UXVpY2tQaWNrKGl0ZW1zLCB7XG4gICAgdGl0bGU6IFwiQUkgQ29tbWl0OiBTZWxlY3QgUHJvdmlkZXJcIixcbiAgICBwbGFjZUhvbGRlcjogXCJDaG9vc2UgdGhlIEFJIHByb3ZpZGVyIGZvciBjb21taXQgZ2VuZXJhdGlvblwiLFxuICB9KTtcblxuICBpZiAocGlja2VkKSB7XG4gICAgY29uc3Qgc2VsZWN0ZWRQcm92aWRlciA9IFBST1ZJREVSUy5maW5kKChwKSA9PiBwLm5hbWUgPT09IHBpY2tlZC5sYWJlbCk7XG4gICAgaWYgKHNlbGVjdGVkUHJvdmlkZXIpIHtcbiAgICAgIGF3YWl0IHNldFByb3ZpZGVyKHNlbGVjdGVkUHJvdmlkZXIuaWQpO1xuXG4gICAgICBjb25zdCBjb25maWcgPSB2c2NvZGUud29ya3NwYWNlLmdldENvbmZpZ3VyYXRpb24oXCJhaUNvbW1pdFwiKTtcbiAgICAgIGNvbnN0IG1vZGVsS2V5ID0gYG1vZGVsJHtzZWxlY3RlZFByb3ZpZGVyLmlkLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgc2VsZWN0ZWRQcm92aWRlci5pZC5zbGljZSgxKX1gO1xuICAgICAgY29uc3QgY3VycmVudE1vZGVsID0gY29uZmlnLmdldDxzdHJpbmc+KG1vZGVsS2V5KTtcblxuICAgICAgaWYgKCFjdXJyZW50TW9kZWwgfHwgIXNlbGVjdGVkUHJvdmlkZXIubW9kZWxzLnNvbWUoKG0pID0+IG0uaWQgPT09IGN1cnJlbnRNb2RlbCkpIHtcbiAgICAgICAgYXdhaXQgY29uZmlnLnVwZGF0ZShcbiAgICAgICAgICBtb2RlbEtleSxcbiAgICAgICAgICBzZWxlY3RlZFByb3ZpZGVyLm1vZGVsc1swXT8uaWQsXG4gICAgICAgICAgdnNjb2RlLkNvbmZpZ3VyYXRpb25UYXJnZXQuR2xvYmFsXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHZzY29kZS53aW5kb3cuc2hvd0luZm9ybWF0aW9uTWVzc2FnZShcbiAgICAgICAgYEFJIENvbW1pdCBwcm92aWRlciBzZXQgdG86ICR7c2VsZWN0ZWRQcm92aWRlci5uYW1lfWBcbiAgICAgICk7XG4gICAgfVxuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVNlbGVjdE1vZGVsKCk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBwcm92aWRlciA9IGF3YWl0IGdldENvbmZpZ3VyZWRQcm92aWRlcigpO1xuICBjb25zdCBjb25maWcgPSB2c2NvZGUud29ya3NwYWNlLmdldENvbmZpZ3VyYXRpb24oXCJhaUNvbW1pdFwiKTtcbiAgY29uc3QgbW9kZWxLZXkgPSBgbW9kZWwke3Byb3ZpZGVyLmlkLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgcHJvdmlkZXIuaWQuc2xpY2UoMSl9YDtcbiAgY29uc3QgY3VycmVudCA9IGNvbmZpZy5nZXQ8c3RyaW5nPihtb2RlbEtleSwgcHJvdmlkZXIubW9kZWxzWzBdPy5pZCB8fCBcIlwiKTtcblxuICBjb25zdCBpdGVtczogdnNjb2RlLlF1aWNrUGlja0l0ZW1bXSA9IHByb3ZpZGVyLm1vZGVscy5tYXAoKG0pID0+ICh7XG4gICAgbGFiZWw6IG0ubmFtZSxcbiAgICBkZXRhaWw6IGN1cnJlbnQgPT09IG0uaWQgPyBcIkN1cnJlbnRseSBzZWxlY3RlZFwiIDogdW5kZWZpbmVkLFxuICB9KSk7XG5cbiAgY29uc3QgcGlja2VkID0gYXdhaXQgdnNjb2RlLndpbmRvdy5zaG93UXVpY2tQaWNrKGl0ZW1zLCB7XG4gICAgdGl0bGU6IGBBSSBDb21taXQ6IFNlbGVjdCBNb2RlbCAoJHtwcm92aWRlci5uYW1lfSlgLFxuICAgIHBsYWNlSG9sZGVyOiBgQ2hvb3NlIHRoZSBtb2RlbCBmb3IgJHtwcm92aWRlci5uYW1lfWAsXG4gIH0pO1xuXG4gIGlmIChwaWNrZWQpIHtcbiAgICBhd2FpdCBjb25maWcudXBkYXRlKFxuICAgICAgbW9kZWxLZXksXG4gICAgICBwaWNrZWQubGFiZWwsXG4gICAgICB2c2NvZGUuQ29uZmlndXJhdGlvblRhcmdldC5HbG9iYWxcbiAgICApO1xuICAgIHZzY29kZS53aW5kb3cuc2hvd0luZm9ybWF0aW9uTWVzc2FnZShcbiAgICAgIGBBSSBDb21taXQgbW9kZWwgc2V0IHRvOiAke3BpY2tlZC5sYWJlbH1gXG4gICAgKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTZXRBcGlLZXkoY29udGV4dDogdnNjb2RlLkV4dGVuc2lvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgcHJvdmlkZXIgPSBhd2FpdCBnZXRDb25maWd1cmVkUHJvdmlkZXIoKTtcbiAgYXdhaXQgcHJvbXB0Rm9yQXBpS2V5KGNvbnRleHQsIHByb3ZpZGVyLmlkKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlRGlhZ25vc2UoXG4gIGNvbnRleHQ6IHZzY29kZS5FeHRlbnNpb25Db250ZXh0XG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgcHJvdmlkZXIgPSBhd2FpdCBnZXRDb25maWd1cmVkUHJvdmlkZXIoKTtcbiAgY29uc3QgYXBpS2V5ID0gYXdhaXQgZ2V0QXBpS2V5KGNvbnRleHQsIHByb3ZpZGVyLmlkKTtcblxuICBpZiAoIWFwaUtleSkge1xuICAgIGNvbnN0IHByb21wdGVkID0gYXdhaXQgcHJvbXB0Rm9yQXBpS2V5KGNvbnRleHQsIHByb3ZpZGVyLmlkKTtcbiAgICBpZiAoIXByb21wdGVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9XG5cbiAgY29uc3Qga2V5ID0gKGF3YWl0IGdldEFwaUtleShjb250ZXh0LCBwcm92aWRlci5pZCkpITtcblxuICBjb25zdCBvdXRwdXQgPSB2c2NvZGUud2luZG93LmNyZWF0ZU91dHB1dENoYW5uZWwoXCJBSSBDb21taXQ6IERpYWdub3NlXCIpO1xuICBvdXRwdXQuc2hvdygpO1xuXG4gIG91dHB1dC5hcHBlbmRMaW5lKFwiPT09IEFJIENvbW1pdCBEaWFnbm9zaXMgPT09XCIpO1xuICBvdXRwdXQuYXBwZW5kTGluZShcIlwiKTtcbiAgb3V0cHV0LmFwcGVuZExpbmUoYFByb3ZpZGVyOiAke3Byb3ZpZGVyLm5hbWV9YCk7XG4gIG91dHB1dC5hcHBlbmRMaW5lKFwiXCIpO1xuXG4gIG91dHB1dC5hcHBlbmRMaW5lKGBBdmFpbGFibGUgbW9kZWxzIGZvciAke3Byb3ZpZGVyLm5hbWV9OmApO1xuXG4gIGZvciAoY29uc3QgbSBvZiBwcm92aWRlci5tb2RlbHMpIHtcbiAgICBvdXRwdXQuYXBwZW5kTGluZShgICAgLSAke20ubmFtZX1gKTtcbiAgfVxuXG4gIG91dHB1dC5hcHBlbmRMaW5lKFwiXCIpO1xuXG4gIGNvbnN0IG1vZGVsS2V5ID0gYG1vZGVsJHtwcm92aWRlci5pZC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHByb3ZpZGVyLmlkLnNsaWNlKDEpfWA7XG4gIGNvbnN0IGNvbmZpZyA9IHZzY29kZS53b3Jrc3BhY2UuZ2V0Q29uZmlndXJhdGlvbihcImFpQ29tbWl0XCIpO1xuICBjb25zdCBjdXJyZW50TW9kZWwgPSBjb25maWcuZ2V0PHN0cmluZz4obW9kZWxLZXksIHByb3ZpZGVyLm1vZGVsc1swXT8uaWQgfHwgXCJcIik7XG5cbiAgb3V0cHV0LmFwcGVuZExpbmUoYFRlc3RpbmcgJyR7Y3VycmVudE1vZGVsfScuLi5gKTtcbiAgdHJ5IHtcbiAgICBpZiAocHJvdmlkZXIuaWQgPT09IFwiZ29vZ2xlXCIpIHtcbiAgICAgIGF3YWl0IGdlbWluaUdlbmVyYXRlQ29tbWl0KGN1cnJlbnRNb2RlbCwga2V5LCBcInRlc3RcIiwgXCJ0ZXN0IGRpZmZcIik7XG4gICAgfSBlbHNlIGlmIChwcm92aWRlci5pZCA9PT0gXCJtaXN0cmFsXCIpIHtcbiAgICAgIGF3YWl0IG1pc3RyYWxHZW5lcmF0ZUNvbW1pdChjdXJyZW50TW9kZWwsIGtleSwgXCJ0ZXN0XCIsIFwidGVzdCBkaWZmXCIpO1xuICAgIH1cbiAgICBvdXRwdXQuYXBwZW5kTGluZShgICAg4pyTICR7Y3VycmVudE1vZGVsfTogT0tgKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIG91dHB1dC5hcHBlbmRMaW5lKFxuICAgICAgYCAgIOKclyAke2N1cnJlbnRNb2RlbH06ICR7ZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpfWBcbiAgICApO1xuICB9XG5cbiAgb3V0cHV0LmFwcGVuZExpbmUoXCJcIik7XG4gIG91dHB1dC5hcHBlbmRMaW5lKFwiPT09IERpYWdub3NpcyBjb21wbGV0ZSA9PT1cIik7XG59XG4iLAogICAgImltcG9ydCAqIGFzIGh0dHBzIGZyb20gXCJub2RlOmh0dHBzXCI7XG5cbmNvbnN0IEFQSV9IT1NUID0gXCJnZW5lcmF0aXZlbGFuZ3VhZ2UuZ29vZ2xlYXBpcy5jb21cIjtcbmNvbnN0IEFQSV9QQVRIID0gXCIvdjFiZXRhL21vZGVscy9cIjtcblxuaW50ZXJmYWNlIE1vZGVsSW5mbyB7XG4gIG5hbWU6IHN0cmluZztcbiAgZGlzcGxheU5hbWU6IHN0cmluZztcbiAgc3VwcG9ydGVkR2VuZXJhdGlvbk1ldGhvZHM6IHN0cmluZ1tdO1xufVxuXG5pbnRlcmZhY2UgTGlzdE1vZGVsc1Jlc3BvbnNlIHtcbiAgbW9kZWxzOiBNb2RlbEluZm9bXTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxpc3RBdmFpbGFibGVNb2RlbHMoXG4gIGFwaUtleTogc3RyaW5nXG4pOiBQcm9taXNlPE1vZGVsSW5mb1tdPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcmVxID0gaHR0cHMucmVxdWVzdChcbiAgICAgIHtcbiAgICAgICAgaG9zdG5hbWU6IEFQSV9IT1NULFxuICAgICAgICBwYXRoOiBcIi92MWJldGEvbW9kZWxzXCIsXG4gICAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIFwieC1nb29nLWFwaS1rZXlcIjogYXBpS2V5LFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiAxMDAwMCxcbiAgICAgIH0sXG4gICAgICAocmVzKSA9PiB7XG4gICAgICAgIGxldCBkYXRhID0gXCJcIjtcbiAgICAgICAgcmVzLm9uKFwiZGF0YVwiLCAoY2h1bmspID0+IChkYXRhICs9IGNodW5rKSk7XG4gICAgICAgIHJlcy5vbihcImVuZFwiLCAoKSA9PiB7XG4gICAgICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSAyMDApIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoZGF0YSkgYXMgTGlzdE1vZGVsc1Jlc3BvbnNlO1xuICAgICAgICAgICAgICByZXNvbHZlKHBhcnNlZC5tb2RlbHMgfHwgW10pO1xuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoXCJGYWlsZWQgdG8gcGFyc2UgbW9kZWwgbGlzdC5cIikpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICBgRmFpbGVkIHRvIGxpc3QgbW9kZWxzICgke3Jlcy5zdGF0dXNDb2RlfSk6ICR7ZGF0YX1gXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgcmVxLm9uKFwiZXJyb3JcIiwgKGVycjogTm9kZUpTLkVycm5vRXhjZXB0aW9uKSA9PiB7XG4gICAgICByZWplY3QobmV3IEVycm9yKGBOZXR3b3JrIGVycm9yOiAke2Vyci5tZXNzYWdlfWApKTtcbiAgICB9KTtcblxuICAgIHJlcS5vbihcInRpbWVvdXRcIiwgKCkgPT4ge1xuICAgICAgcmVxLmRlc3Ryb3koKTtcbiAgICAgIHJlamVjdChuZXcgRXJyb3IoXCJSZXF1ZXN0IHRpbWVkIG91dC5cIikpO1xuICAgIH0pO1xuXG4gICAgcmVxLmVuZCgpO1xuICB9KTtcbn1cblxuaW50ZXJmYWNlIEdlbWluaVJlc3BvbnNlIHtcbiAgY2FuZGlkYXRlcz86IHtcbiAgICBjb250ZW50OiB7XG4gICAgICByb2xlOiBzdHJpbmc7XG4gICAgICBwYXJ0czogeyB0ZXh0OiBzdHJpbmc7IHRob3VnaHQ/OiBib29sZWFuIH1bXTtcbiAgICB9O1xuICAgIGZpbmlzaFJlYXNvbjogc3RyaW5nO1xuICB9W107XG4gIHByb21wdEZlZWRiYWNrPzoge1xuICAgIGJsb2NrUmVhc29uOiBzdHJpbmc7XG4gIH07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZUNvbW1pdE1lc3NhZ2UoXG4gIG1vZGVsOiBzdHJpbmcsXG4gIGFwaUtleTogc3RyaW5nLFxuICBzeXN0ZW1Qcm9tcHQ6IHN0cmluZyxcbiAgZGlmZjogc3RyaW5nXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCBib2R5ID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgIHN5c3RlbUluc3RydWN0aW9uOiB7XG4gICAgICBwYXJ0czogW3sgdGV4dDogc3lzdGVtUHJvbXB0IH1dLFxuICAgIH0sXG4gICAgY29udGVudHM6IFtcbiAgICAgIHtcbiAgICAgICAgcm9sZTogXCJ1c2VyXCIsXG4gICAgICAgIHBhcnRzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgdGV4dDogYEdlbmVyYXRlIGEgY29tbWl0IG1lc3NhZ2UgZm9yIHRoZSBmb2xsb3dpbmcgZ2l0IGRpZmY6XFxuXFxuXFxgXFxgXFxgZGlmZlxcbiR7ZGlmZn1cXG5cXGBcXGBcXGBgLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgIF0sXG4gICAgZ2VuZXJhdGlvbkNvbmZpZzoge1xuICAgICAgdGVtcGVyYXR1cmU6IDAuMixcbiAgICAgIG1heE91dHB1dFRva2VuczogMTUwLFxuICAgICAgdG9wUDogMC45NSxcbiAgICB9LFxuICB9KTtcblxuICByZXR1cm4gbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcmVxID0gaHR0cHMucmVxdWVzdChcbiAgICAgIHtcbiAgICAgICAgaG9zdG5hbWU6IEFQSV9IT1NULFxuICAgICAgICBwYXRoOiBgJHtBUElfUEFUSH0ke21vZGVsfTpnZW5lcmF0ZUNvbnRlbnRgLFxuICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgICAgICAgXCJ4LWdvb2ctYXBpLWtleVwiOiBhcGlLZXksXG4gICAgICAgICAgXCJDb250ZW50LUxlbmd0aFwiOiBCdWZmZXIuYnl0ZUxlbmd0aChib2R5KS50b1N0cmluZygpLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiAxNTAwMCxcbiAgICAgIH0sXG4gICAgICAocmVzKSA9PiB7XG4gICAgICAgIGxldCBkYXRhID0gXCJcIjtcblxuICAgICAgICByZXMub24oXCJkYXRhXCIsIChjaHVuaykgPT4ge1xuICAgICAgICAgIGRhdGEgKz0gY2h1bms7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJlcy5vbihcImVuZFwiLCAoKSA9PiB7XG4gICAgICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSA0MDEpIHtcbiAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgIFwiSW52YWxpZCBBUEkga2V5LiBVc2UgJ0FJIENvbW1pdDogU2V0IEFQSSBLZXknIHRvIHVwZGF0ZSBpdC5cIlxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gNDI5KSB7XG4gICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICBcIlJhdGUgbGltaXRlZCBieSBHZW1pbmkgQVBJLiBQbGVhc2Ugd2FpdCBhIG1vbWVudCBhbmQgdHJ5IGFnYWluLlwiXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCFyZXMuc3RhdHVzQ29kZSB8fCByZXMuc3RhdHVzQ29kZSA+PSA0MDApIHtcbiAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgIGBHZW1pbmkgQVBJIGVycm9yICgke3Jlcy5zdGF0dXNDb2RlfSk6ICR7ZGF0YS5zbGljZSgwLCA1MDApfWBcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShkYXRhKSBhcyBHZW1pbmlSZXNwb25zZTtcblxuICAgICAgICAgICAgaWYgKCFwYXJzZWQuY2FuZGlkYXRlcyB8fCBwYXJzZWQuY2FuZGlkYXRlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgaWYgKHBhcnNlZC5wcm9tcHRGZWVkYmFjaz8uYmxvY2tSZWFzb24pIHtcbiAgICAgICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIGBDb250ZW50IGJsb2NrZWQ6ICR7cGFyc2VkLnByb21wdEZlZWRiYWNrLmJsb2NrUmVhc29ufWBcbiAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICAgICAgYE5vIGNvbW1pdCBtZXNzYWdlIGdlbmVyYXRlZC4gUmF3IHJlc3BvbnNlOiAke2RhdGEuc2xpY2UoMCwgMzAwKX1gXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZSA9IHBhcnNlZC5jYW5kaWRhdGVzWzBdO1xuICAgICAgICAgICAgY29uc3QgcGFydHMgPSBjYW5kaWRhdGUuY29udGVudD8ucGFydHM7XG4gICAgICAgICAgICBpZiAoIXBhcnRzIHx8IHBhcnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgICAgYEFJIHJldHVybmVkIG5vIHBhcnRzLiBmaW5pc2hSZWFzb246ICR7Y2FuZGlkYXRlLmZpbmlzaFJlYXNvbn0uIFJhdzogJHtkYXRhLnNsaWNlKDAsIDMwMCl9YFxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBHZW1tYSBtb2RlbHMgcmV0dXJuIGEgXCJ0aG91Z2h0XCIgcGFydCBmaXJzdCwgdGhlbiB0aGUgYWN0dWFsIHJlc3BvbnNlLlxuICAgICAgICAgICAgLy8gRmluZCB0aGUgZmlyc3Qgbm9uLXRob3VnaHQgcGFydCB3aXRoIHRleHQuXG4gICAgICAgICAgICBjb25zdCB0ZXh0UGFydCA9IHBhcnRzLmZpbmQoKHApID0+ICFwLnRob3VnaHQgJiYgcC50ZXh0Py50cmltKCkpO1xuICAgICAgICAgICAgY29uc3QgdGV4dCA9IHRleHRQYXJ0Py50ZXh0ID8/IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdPy50ZXh0O1xuXG4gICAgICAgICAgICBpZiAoIXRleHQgfHwgdGV4dC50cmltKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgICBgQUkgcmV0dXJuZWQgZW1wdHkgdGV4dC4gZmluaXNoUmVhc29uOiAke2NhbmRpZGF0ZS5maW5pc2hSZWFzb259LiBSYXc6ICR7ZGF0YS5zbGljZSgwLCAzMDApfWBcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVzb2x2ZSh0ZXh0LnRyaW0oKSk7XG4gICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgIG5ldyBFcnJvcihgRmFpbGVkIHRvIHBhcnNlIEdlbWluaSBBUEkgcmVzcG9uc2UuIFJhdzogJHtkYXRhLnNsaWNlKDAsIDMwMCl9YClcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgcmVxLm9uKFwiZXJyb3JcIiwgKGVycikgPT4ge1xuICAgICAgY29uc3Qgbm9kZUVyciA9IGVyciBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb247XG4gICAgICBpZiAobm9kZUVyci5jb2RlID09PSBcIkVDT05OUkVGVVNFRFwiKSB7XG4gICAgICAgIHJlamVjdChcbiAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICBcIkNhbm5vdCByZWFjaCBHb29nbGUgQVBJIChjb25uZWN0aW9uIHJlZnVzZWQpLiBDaGVjayB5b3VyIGludGVybmV0IGNvbm5lY3Rpb24uXCJcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKG5vZGVFcnIuY29kZSA9PT0gXCJFTk9URk9VTkRcIiB8fCBub2RlRXJyLmNvZGUgPT09IFwiRUFJX0FHQUlOXCIpIHtcbiAgICAgICAgcmVqZWN0KFxuICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgIFwiQ2Fubm90IHJlc29sdmUgR29vZ2xlIEFQSSBob3N0IChETlMgZXJyb3IpLiBDaGVjayB5b3VyIGludGVybmV0IGNvbm5lY3Rpb24uXCJcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKG5vZGVFcnIuY29kZSA9PT0gXCJFVElNRURPVVRcIiB8fCBub2RlRXJyLmNvZGUgPT09IFwiRUNPTk5SRVNFVFwiKSB7XG4gICAgICAgIHJlamVjdChcbiAgICAgICAgICBuZXcgRXJyb3IoXCJBUEkgcmVxdWVzdCB0aW1lZCBvdXQuIENoZWNrIHlvdXIgaW50ZXJuZXQgY29ubmVjdGlvbi5cIilcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAobm9kZUVyci5jb2RlID09PSBcIkNFUlRfSEFTX0VYUElSRURcIiB8fCBub2RlRXJyLmNvZGUgPT09IFwiVU5BQkxFX1RPX1ZFUklGWV9MRUFGX1NJR05BVFVSRVwiKSB7XG4gICAgICAgIHJlamVjdChcbiAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICBcIlNTTCBjZXJ0aWZpY2F0ZSBlcnJvciBjb25uZWN0aW5nIHRvIEdvb2dsZSBBUEkuIFlvdXIgc3lzdGVtIGNsb2NrIG1heSBiZSB3cm9uZy5cIlxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlamVjdChcbiAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICBgTmV0d29yayBlcnJvcjogJHtub2RlRXJyLm1lc3NhZ2V9IChjb2RlOiAke25vZGVFcnIuY29kZSB8fCBcIm5vbmVcIn0pYFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJlcS5vbihcInRpbWVvdXRcIiwgKCkgPT4ge1xuICAgICAgcmVxLmRlc3Ryb3koKTtcbiAgICAgIHJlamVjdChuZXcgRXJyb3IoXCJBUEkgcmVxdWVzdCB0aW1lZCBvdXQuIENoZWNrIHlvdXIgaW50ZXJuZXQgY29ubmVjdGlvbi5cIikpO1xuICAgIH0pO1xuXG4gICAgcmVxLndyaXRlKGJvZHkpO1xuICAgIHJlcS5lbmQoKTtcbiAgfSk7XG59XG4iLAogICAgImltcG9ydCAqIGFzIGh0dHBzIGZyb20gXCJub2RlOmh0dHBzXCI7XG5cbmNvbnN0IEFQSV9IT1NUID0gXCJjb2Rlc3RyYWwubWlzdHJhbC5haVwiO1xuY29uc3QgQVBJX1BBVEggPSBcIi92MS9jaGF0L2NvbXBsZXRpb25zXCI7XG5cbmludGVyZmFjZSBNaXN0cmFsTWVzc2FnZSB7XG4gIHJvbGU6IFwic3lzdGVtXCIgfCBcInVzZXJcIiB8IFwiYXNzaXN0YW50XCI7XG4gIGNvbnRlbnQ6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIE1pc3RyYWxSZXNwb25zZSB7XG4gIGlkOiBzdHJpbmc7XG4gIG9iamVjdDogc3RyaW5nO1xuICBjcmVhdGVkOiBudW1iZXI7XG4gIG1vZGVsOiBzdHJpbmc7XG4gIGNob2ljZXM6IHtcbiAgICBpbmRleDogbnVtYmVyO1xuICAgIG1lc3NhZ2U6IHtcbiAgICAgIHJvbGU6IHN0cmluZztcbiAgICAgIGNvbnRlbnQ6IHN0cmluZztcbiAgICB9O1xuICAgIGZpbmlzaF9yZWFzb246IHN0cmluZztcbiAgfVtdO1xuICB1c2FnZT86IHtcbiAgICBwcm9tcHRfdG9rZW5zOiBudW1iZXI7XG4gICAgY29tcGxldGlvbl90b2tlbnM6IG51bWJlcjtcbiAgICB0b3RhbF90b2tlbnM6IG51bWJlcjtcbiAgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlQ29tbWl0TWVzc2FnZShcbiAgbW9kZWw6IHN0cmluZyxcbiAgYXBpS2V5OiBzdHJpbmcsXG4gIHN5c3RlbVByb21wdDogc3RyaW5nLFxuICBkaWZmOiBzdHJpbmdcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IG1lc3NhZ2VzOiBNaXN0cmFsTWVzc2FnZVtdID0gW107XG5cbiAgaWYgKHN5c3RlbVByb21wdCkge1xuICAgIG1lc3NhZ2VzLnB1c2goeyByb2xlOiBcInN5c3RlbVwiLCBjb250ZW50OiBzeXN0ZW1Qcm9tcHQgfSk7XG4gIH1cblxuICBtZXNzYWdlcy5wdXNoKHtcbiAgICByb2xlOiBcInVzZXJcIixcbiAgICBjb250ZW50OiBgR2VuZXJhdGUgYSBjb21taXQgbWVzc2FnZSBmb3IgdGhlIGZvbGxvd2luZyBnaXQgZGlmZjpcXG5cXG5cXGBcXGBcXGBkaWZmXFxuJHtkaWZmfVxcblxcYFxcYFxcYGAsXG4gIH0pO1xuXG4gIGNvbnN0IGJvZHkgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgbW9kZWwsXG4gICAgbWVzc2FnZXMsXG4gICAgdGVtcGVyYXR1cmU6IDAuMixcbiAgICBtYXhfdG9rZW5zOiAxNTAsXG4gIH0pO1xuXG4gIHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCByZXEgPSBodHRwcy5yZXF1ZXN0KFxuICAgICAge1xuICAgICAgICBob3N0bmFtZTogQVBJX0hPU1QsXG4gICAgICAgIHBhdGg6IEFQSV9QQVRILFxuICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke2FwaUtleX1gLFxuICAgICAgICAgIFwiQ29udGVudC1MZW5ndGhcIjogQnVmZmVyLmJ5dGVMZW5ndGgoYm9keSkudG9TdHJpbmcoKSxcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogMTUwMDAsXG4gICAgICB9LFxuICAgICAgKHJlcykgPT4ge1xuICAgICAgICBsZXQgZGF0YSA9IFwiXCI7XG5cbiAgICAgICAgcmVzLm9uKFwiZGF0YVwiLCAoY2h1bmspID0+IHtcbiAgICAgICAgICBkYXRhICs9IGNodW5rO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXMub24oXCJlbmRcIiwgKCkgPT4ge1xuICAgICAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gNDAxKSB7XG4gICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICBcIkludmFsaWQgQVBJIGtleS4gVXNlICdBSSBDb21taXQ6IFNldCBBUEkgS2V5JyB0byB1cGRhdGUgaXQuXCJcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocmVzLnN0YXR1c0NvZGUgPT09IDQyOSkge1xuICAgICAgICAgICAgcmVqZWN0KFxuICAgICAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgXCJSYXRlIGxpbWl0ZWQgYnkgTWlzdHJhbCBBUEkuIFBsZWFzZSB3YWl0IGEgbW9tZW50IGFuZCB0cnkgYWdhaW4uXCJcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoIXJlcy5zdGF0dXNDb2RlIHx8IHJlcy5zdGF0dXNDb2RlID49IDQwMCkge1xuICAgICAgICAgICAgcmVqZWN0KFxuICAgICAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgYE1pc3RyYWwgQVBJIGVycm9yICgke3Jlcy5zdGF0dXNDb2RlfSk6ICR7ZGF0YS5zbGljZSgwLCA1MDApfWBcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShkYXRhKSBhcyBNaXN0cmFsUmVzcG9uc2U7XG5cbiAgICAgICAgICAgIGlmICghcGFyc2VkLmNob2ljZXMgfHwgcGFyc2VkLmNob2ljZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgICBgTm8gY29tbWl0IG1lc3NhZ2UgZ2VuZXJhdGVkLiBSYXcgcmVzcG9uc2U6ICR7ZGF0YS5zbGljZSgwLCAzMDApfWBcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY2hvaWNlID0gcGFyc2VkLmNob2ljZXNbMF07XG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gY2hvaWNlLm1lc3NhZ2U/LmNvbnRlbnQ7XG5cbiAgICAgICAgICAgIGlmICghbWVzc2FnZSB8fCBtZXNzYWdlLnRyaW0oKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgcmVqZWN0KFxuICAgICAgICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICAgIGBBSSByZXR1cm5lZCBlbXB0eSB0ZXh0LiBmaW5pc2hSZWFzb246ICR7Y2hvaWNlLmZpbmlzaF9yZWFzb259LiBSYXc6ICR7ZGF0YS5zbGljZSgwLCAzMDApfWBcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVzb2x2ZShtZXNzYWdlLnRyaW0oKSk7XG4gICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICBgRmFpbGVkIHRvIHBhcnNlIE1pc3RyYWwgQVBJIHJlc3BvbnNlLiBSYXc6ICR7ZGF0YS5zbGljZSgwLCAzMDApfWBcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICk7XG5cbiAgICByZXEub24oXCJlcnJvclwiLCAoZXJyKSA9PiB7XG4gICAgICBjb25zdCBub2RlRXJyID0gZXJyIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcbiAgICAgIGlmIChub2RlRXJyLmNvZGUgPT09IFwiRUNPTk5SRUZVU0VEXCIpIHtcbiAgICAgICAgcmVqZWN0KFxuICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgIFwiQ2Fubm90IHJlYWNoIE1pc3RyYWwgQVBJIChjb25uZWN0aW9uIHJlZnVzZWQpLiBDaGVjayB5b3VyIGludGVybmV0IGNvbm5lY3Rpb24uXCJcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKG5vZGVFcnIuY29kZSA9PT0gXCJFTk9URk9VTkRcIiB8fCBub2RlRXJyLmNvZGUgPT09IFwiRUFJX0FHQUlOXCIpIHtcbiAgICAgICAgcmVqZWN0KFxuICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgIFwiQ2Fubm90IHJlc29sdmUgTWlzdHJhbCBBUEkgaG9zdCAoRE5TIGVycm9yKS4gQ2hlY2sgeW91ciBpbnRlcm5ldCBjb25uZWN0aW9uLlwiXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChub2RlRXJyLmNvZGUgPT09IFwiRVRJTUVET1VUXCIgfHwgbm9kZUVyci5jb2RlID09PSBcIkVDT05OUkVTRVRcIikge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKFwiQVBJIHJlcXVlc3QgdGltZWQgb3V0LiBDaGVjayB5b3VyIGludGVybmV0IGNvbm5lY3Rpb24uXCIpKTtcbiAgICAgIH0gZWxzZSBpZiAobm9kZUVyci5jb2RlID09PSBcIkNFUlRfSEFTX0VYUElSRURcIiB8fCBub2RlRXJyLmNvZGUgPT09IFwiVU5BQkxFX1RPX1ZFUklGWV9MRUFGX1NJR05BVFVSRVwiKSB7XG4gICAgICAgIHJlamVjdChcbiAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICBcIlNTTCBjZXJ0aWZpY2F0ZSBlcnJvciBjb25uZWN0aW5nIHRvIE1pc3RyYWwgQVBJLiBZb3VyIHN5c3RlbSBjbG9jayBtYXkgYmUgd3JvbmcuXCJcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZWplY3QoXG4gICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgYE5ldHdvcmsgZXJyb3I6ICR7bm9kZUVyci5tZXNzYWdlfSAoY29kZTogJHtub2RlRXJyLmNvZGUgfHwgXCJub25lXCJ9KWBcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXEub24oXCJ0aW1lb3V0XCIsICgpID0+IHtcbiAgICAgIHJlcS5kZXN0cm95KCk7XG4gICAgICByZWplY3QobmV3IEVycm9yKFwiQVBJIHJlcXVlc3QgdGltZWQgb3V0LiBDaGVjayB5b3VyIGludGVybmV0IGNvbm5lY3Rpb24uXCIpKTtcbiAgICB9KTtcblxuICAgIHJlcS53cml0ZShib2R5KTtcbiAgICByZXEuZW5kKCk7XG4gIH0pO1xufVxuIiwKICAgICJpbXBvcnQgKiBhcyB2c2NvZGUgZnJvbSBcInZzY29kZVwiO1xuXG5leHBvcnQgdHlwZSBQcm92aWRlcklkID0gXCJnb29nbGVcIiB8IFwibWlzdHJhbFwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFByb3ZpZGVyIHtcbiAgaWQ6IFByb3ZpZGVySWQ7XG4gIG5hbWU6IHN0cmluZztcbiAgYXBpS2V5TGFiZWw6IHN0cmluZztcbiAgYXBpS2V5UGxhY2Vob2xkZXI6IHN0cmluZztcbiAgYXBpS2V5VXJsOiBzdHJpbmc7XG4gIG1vZGVsczogTW9kZWxJbmZvW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTW9kZWxJbmZvIHtcbiAgaWQ6IHN0cmluZztcbiAgbmFtZTogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgR09PR0xFX1BST1ZJREVSOiBQcm92aWRlciA9IHtcbiAgaWQ6IFwiZ29vZ2xlXCIsXG4gIG5hbWU6IFwiR29vZ2xlIChHZW1pbmkpXCIsXG4gIGFwaUtleUxhYmVsOiBcIkdvb2dsZSBBSSBBUEkgS2V5XCIsXG4gIGFwaUtleVBsYWNlaG9sZGVyOiBcIlBhc3RlIHlvdXIgQVBJIGtleSBmcm9tIEdvb2dsZSBBSSBTdHVkaW9cIixcbiAgYXBpS2V5VXJsOiBcImh0dHBzOi8vYWlzdHVkaW8uZ29vZ2xlLmNvbS9hcGlrZXlcIixcbiAgbW9kZWxzOiBbXG4gICAgeyBpZDogXCJnZW1tYS00LTMxYi1pdFwiLCBuYW1lOiBcImdlbW1hLTQtMzFiLWl0XCIgfSxcbiAgICB7IGlkOiBcImdlbW1hLTQtMjZiLWE0Yi1pdFwiLCBuYW1lOiBcImdlbW1hLTQtMjZiLWE0Yi1pdFwiIH0sXG4gIF0sXG59O1xuXG5leHBvcnQgY29uc3QgTUlTVFJBTF9QUk9WSURFUjogUHJvdmlkZXIgPSB7XG4gIGlkOiBcIm1pc3RyYWxcIixcbiAgbmFtZTogXCJNaXN0cmFsIChDb2Rlc3RyYWwpXCIsXG4gIGFwaUtleUxhYmVsOiBcIk1pc3RyYWwgQVBJIEtleVwiLFxuICBhcGlLZXlQbGFjZWhvbGRlcjogXCJQYXN0ZSB5b3VyIEFQSSBrZXkgZnJvbSBNaXN0cmFsIENvbnNvbGVcIixcbiAgYXBpS2V5VXJsOiBcImh0dHBzOi8vY29uc29sZS5taXN0cmFsLmFpL2NvZGVzdHJhbFwiLFxuICBtb2RlbHM6IFtcbiAgICB7IGlkOiBcImNvZGVzdHJhbC1sYXRlc3RcIiwgbmFtZTogXCJDb2Rlc3RyYWwgKExhdGVzdClcIiB9LFxuICAgIHsgaWQ6IFwiY29kZXN0cmFsLTI1MDVcIiwgbmFtZTogXCJDb2Rlc3RyYWwgMjUwNVwiIH0sXG4gIF0sXG59O1xuXG5leHBvcnQgY29uc3QgUFJPVklERVJTOiBQcm92aWRlcltdID0gW0dPT0dMRV9QUk9WSURFUiwgTUlTVFJBTF9QUk9WSURFUl07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRQcm92aWRlcihpZDogUHJvdmlkZXJJZCk6IFByb3ZpZGVyIHwgdW5kZWZpbmVkIHtcbiAgcmV0dXJuIFBST1ZJREVSUy5maW5kKChwKSA9PiBwLmlkID09PSBpZCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRDb25maWd1cmVkUHJvdmlkZXIoKTogUHJvbWlzZTxQcm92aWRlcj4ge1xuICBjb25zdCBjb25maWcgPSB2c2NvZGUud29ya3NwYWNlLmdldENvbmZpZ3VyYXRpb24oXCJhaUNvbW1pdFwiKTtcbiAgY29uc3QgcHJvdmlkZXJJZCA9IGNvbmZpZy5nZXQ8UHJvdmlkZXJJZD4oXCJwcm92aWRlclwiLCBcImdvb2dsZVwiKTtcbiAgcmV0dXJuIGdldFByb3ZpZGVyKHByb3ZpZGVySWQhKSA/PyBHT09HTEVfUFJPVklERVI7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRQcm92aWRlcihwcm92aWRlcklkOiBQcm92aWRlcklkKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IGNvbmZpZyA9IHZzY29kZS53b3Jrc3BhY2UuZ2V0Q29uZmlndXJhdGlvbihcImFpQ29tbWl0XCIpO1xuICBhd2FpdCBjb25maWcudXBkYXRlKFwicHJvdmlkZXJcIiwgcHJvdmlkZXJJZCwgdnNjb2RlLkNvbmZpZ3VyYXRpb25UYXJnZXQuR2xvYmFsKTtcbn1cbiIsCiAgICAiaW1wb3J0ICogYXMgdnNjb2RlIGZyb20gXCJ2c2NvZGVcIjtcbmltcG9ydCB7IFByb3ZpZGVySWQsIGdldFByb3ZpZGVyLCBQUk9WSURFUlMgfSBmcm9tIFwiLi4vYWkvcHJvdmlkZXJzXCI7XG5cbmNvbnN0IFNFQ1JFVF9LRVlfUFJFRklYID0gXCJhaUNvbW1pdC5hcGlLZXlcIjtcblxuZnVuY3Rpb24gZ2V0U2VjcmV0S2V5KHByb3ZpZGVySWQ6IFByb3ZpZGVySWQpOiBzdHJpbmcge1xuICByZXR1cm4gYCR7U0VDUkVUX0tFWV9QUkVGSVh9LiR7cHJvdmlkZXJJZH1gO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0QXBpS2V5KFxuICBjb250ZXh0OiB2c2NvZGUuRXh0ZW5zaW9uQ29udGV4dCxcbiAgcHJvdmlkZXJJZDogUHJvdmlkZXJJZFxuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcbiAgY29uc3Qgc2VjcmV0S2V5ID0gZ2V0U2VjcmV0S2V5KHByb3ZpZGVySWQpO1xuICBjb25zdCBmcm9tU2VjcmV0cyA9IGF3YWl0IGNvbnRleHQuc2VjcmV0cy5nZXQoc2VjcmV0S2V5KTtcbiAgaWYgKGZyb21TZWNyZXRzKSB7XG4gICAgcmV0dXJuIGZyb21TZWNyZXRzO1xuICB9XG4gIGNvbnN0IGZyb21Db25maWcgPSB2c2NvZGUud29ya3NwYWNlXG4gICAgLmdldENvbmZpZ3VyYXRpb24oXCJhaUNvbW1pdFwiKVxuICAgIC5nZXQ8c3RyaW5nPihgYXBpS2V5JHtwcm92aWRlcklkLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgcHJvdmlkZXJJZC5zbGljZSgxKX1gKTtcbiAgaWYgKGZyb21Db25maWcpIHtcbiAgICBhd2FpdCBjb250ZXh0LnNlY3JldHMuc3RvcmUoc2VjcmV0S2V5LCBmcm9tQ29uZmlnKTtcbiAgICByZXR1cm4gZnJvbUNvbmZpZztcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvbXB0Rm9yQXBpS2V5KFxuICBjb250ZXh0OiB2c2NvZGUuRXh0ZW5zaW9uQ29udGV4dCxcbiAgcHJvdmlkZXJJZD86IFByb3ZpZGVySWRcbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG4gIGNvbnN0IHByb3ZpZGVyID0gcHJvdmlkZXJJZFxuICAgID8gZ2V0UHJvdmlkZXIocHJvdmlkZXJJZClcbiAgICA6IGF3YWl0IGdldEN1cnJlbnRQcm92aWRlcldpdGhLZXkoY29udGV4dCk7XG5cbiAgaWYgKCFwcm92aWRlcikge1xuICAgIHZzY29kZS53aW5kb3cuc2hvd0Vycm9yTWVzc2FnZShcIk5vIHByb3ZpZGVyIHNlbGVjdGVkLlwiKTtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG5cbiAgY29uc3Qgc2VjcmV0S2V5ID0gZ2V0U2VjcmV0S2V5KHByb3ZpZGVyLmlkKTtcbiAgY29uc3QgZXhpc3RpbmdLZXkgPSBhd2FpdCBjb250ZXh0LnNlY3JldHMuZ2V0KHNlY3JldEtleSk7XG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4oKHJlc29sdmUpID0+IHtcbiAgICBjb25zdCBpbnB1dEJveCA9IHZzY29kZS53aW5kb3cuY3JlYXRlSW5wdXRCb3goKTtcbiAgICBpbnB1dEJveC50aXRsZSA9IGBBSSBDb21taXQ6IEVudGVyICR7cHJvdmlkZXIhLm5hbWV9IEFQSSBLZXlgO1xuICAgIGlucHV0Qm94LnBsYWNlaG9sZGVyID0gcHJvdmlkZXIhLmFwaUtleVBsYWNlaG9sZGVyO1xuICAgIGlucHV0Qm94LnByb21wdCA9IGBHZXQgYSBmcmVlIEFQSSBrZXkgYXQgJHtwcm92aWRlciEuYXBpS2V5VXJsfWA7XG4gICAgaW5wdXRCb3gucGFzc3dvcmQgPSB0cnVlO1xuICAgIGlucHV0Qm94Lmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcbiAgICBpbnB1dEJveC52YWx1ZSA9IGV4aXN0aW5nS2V5IHx8IFwiXCI7XG5cbiAgICBpbnB1dEJveC5idXR0b25zID0gW1xuICAgICAge1xuICAgICAgICBpY29uUGF0aDogbmV3IHZzY29kZS5UaGVtZUljb24oXCJsaW5rLWV4dGVybmFsXCIpLFxuICAgICAgICB0b29sdGlwOiBgR2V0IEFQSSBLZXkgZnJvbSAke3Byb3ZpZGVyIS5uYW1lfWAsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBpY29uUGF0aDogbmV3IHZzY29kZS5UaGVtZUljb24oXCJpbmZvXCIpLFxuICAgICAgICB0b29sdGlwOiBcIkhvdyBpcyBteSBrZXkgc3RvcmVkP1wiLFxuICAgICAgfSxcbiAgICBdO1xuXG4gICAgaW5wdXRCb3gub25EaWRDaGFuZ2VWYWx1ZSgodmFsdWUpID0+IHtcbiAgICAgIGlmICh2YWx1ZS50cmltKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIGlucHV0Qm94LnZhbGlkYXRpb25NZXNzYWdlID0gXCJBUEkga2V5IGNhbm5vdCBiZSBlbXB0eVwiO1xuICAgICAgfSBlbHNlIGlmICh2YWx1ZS50cmltKCkubGVuZ3RoIDwgMTApIHtcbiAgICAgICAgaW5wdXRCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSBcIkFQSSBrZXkgc2VlbXMgdG9vIHNob3J0XCI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbnB1dEJveC52YWxpZGF0aW9uTWVzc2FnZSA9IHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlucHV0Qm94Lm9uRGlkVHJpZ2dlckJ1dHRvbigoYnV0dG9uKSA9PiB7XG4gICAgICBpZiAoYnV0dG9uLnRvb2x0aXAgPT09IGBHZXQgQVBJIEtleSBmcm9tICR7cHJvdmlkZXIhLm5hbWV9YCkge1xuICAgICAgICB2c2NvZGUuZW52Lm9wZW5FeHRlcm5hbCh2c2NvZGUuVXJpLnBhcnNlKHByb3ZpZGVyIS5hcGlLZXlVcmwpKTtcbiAgICAgIH0gZWxzZSBpZiAoYnV0dG9uLnRvb2x0aXAgPT09IFwiSG93IGlzIG15IGtleSBzdG9yZWQ/XCIpIHtcbiAgICAgICAgdnNjb2RlLndpbmRvdy5zaG93SW5mb3JtYXRpb25NZXNzYWdlKFxuICAgICAgICAgIFwiWW91ciBBUEkga2V5IGlzIHN0b3JlZCBzZWN1cmVseSB1c2luZyBWU0NvZGUncyBTZWNyZXRTdG9yYWdlLiBJdCdzIGVuY3J5cHRlZCBhbmQgbmV2ZXIgc2hhcmVkLlwiLFxuICAgICAgICAgIFwiT0tcIlxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaW5wdXRCb3gub25EaWRBY2NlcHQoYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBpbnB1dEJveC52YWx1ZS50cmltKCk7XG4gICAgICBpZiAodmFsdWUubGVuZ3RoID4gMCkge1xuICAgICAgICBhd2FpdCBjb250ZXh0LnNlY3JldHMuc3RvcmUoc2VjcmV0S2V5LCB2YWx1ZSk7XG4gICAgICAgIHZzY29kZS53aW5kb3cuc2hvd0luZm9ybWF0aW9uTWVzc2FnZShcbiAgICAgICAgICBg4pyFICR7cHJvdmlkZXIhLm5hbWV9IEFQSSBrZXkgc2F2ZWQgc2VjdXJlbHkhYFxuICAgICAgICApO1xuICAgICAgICBpbnB1dEJveC5oaWRlKCk7XG4gICAgICAgIHJlc29sdmUodmFsdWUpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaW5wdXRCb3gub25EaWRIaWRlKCgpID0+IHtcbiAgICAgIGlucHV0Qm94LmRpc3Bvc2UoKTtcbiAgICAgIHJlc29sdmUodW5kZWZpbmVkKTtcbiAgICB9KTtcblxuICAgIGlucHV0Qm94LnNob3coKTtcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEN1cnJlbnRQcm92aWRlcldpdGhLZXkoXG4gIGNvbnRleHQ6IHZzY29kZS5FeHRlbnNpb25Db250ZXh0XG4pOiBQcm9taXNlPHR5cGVvZiBQUk9WSURFUlNbbnVtYmVyXSB8IHVuZGVmaW5lZD4ge1xuICBjb25zdCBjb25maWcgPSB2c2NvZGUud29ya3NwYWNlLmdldENvbmZpZ3VyYXRpb24oXCJhaUNvbW1pdFwiKTtcbiAgY29uc3QgcHJvdmlkZXJJZCA9IGNvbmZpZy5nZXQ8UHJvdmlkZXJJZD4oXCJwcm92aWRlclwiLCBcImdvb2dsZVwiKTtcblxuICBjb25zdCBwcm92aWRlciA9IGdldFByb3ZpZGVyKHByb3ZpZGVySWQhKTtcbiAgaWYgKCFwcm92aWRlcikge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cblxuICBjb25zdCBhcGlLZXkgPSBhd2FpdCBnZXRBcGlLZXkoY29udGV4dCwgcHJvdmlkZXIuaWQpO1xuICBpZiAoYXBpS2V5KSB7XG4gICAgcmV0dXJuIHByb3ZpZGVyO1xuICB9XG5cbiAgZm9yIChjb25zdCBwIG9mIFBST1ZJREVSUykge1xuICAgIGNvbnN0IGtleSA9IGF3YWl0IGdldEFwaUtleShjb250ZXh0LCBwLmlkKTtcbiAgICBpZiAoa2V5KSB7XG4gICAgICByZXR1cm4gcDtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0T3JQcm9tcHRBcGlLZXkoXG4gIGNvbnRleHQ6IHZzY29kZS5FeHRlbnNpb25Db250ZXh0LFxuICBwcm92aWRlcklkOiBQcm92aWRlcklkXG4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuICBsZXQgYXBpS2V5ID0gYXdhaXQgZ2V0QXBpS2V5KGNvbnRleHQsIHByb3ZpZGVySWQpO1xuICBpZiAoIWFwaUtleSkge1xuICAgIGFwaUtleSA9IGF3YWl0IHByb21wdEZvckFwaUtleShjb250ZXh0LCBwcm92aWRlcklkKTtcbiAgfVxuICByZXR1cm4gYXBpS2V5O1xufVxuIiwKICAgICJpbXBvcnQgKiBhcyB2c2NvZGUgZnJvbSBcInZzY29kZVwiO1xuXG5pbnRlcmZhY2UgR2l0QVBJIHtcbiAgcmVwb3NpdG9yaWVzOiBSZXBvc2l0b3J5W107XG59XG5cbmludGVyZmFjZSBSZXBvc2l0b3J5IHtcbiAgcm9vdFVyaTogdnNjb2RlLlVyaTtcbiAgaW5wdXRCb3g6IHsgdmFsdWU6IHN0cmluZyB9O1xuICBzdGF0ZTogUmVwb3NpdG9yeVN0YXRlO1xuICBhZGQocGF0aHM6IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPjtcbiAgY29tbWl0KG1lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG4gIGRpZmYoY2FjaGVkPzogYm9vbGVhbik6IFByb21pc2U8c3RyaW5nPjtcbn1cblxuaW50ZXJmYWNlIFJlcG9zaXRvcnlTdGF0ZSB7XG4gIGluZGV4Q2hhbmdlczogQ2hhbmdlW107XG4gIHdvcmtpbmdUcmVlQ2hhbmdlczogQ2hhbmdlW107XG59XG5cbmludGVyZmFjZSBDaGFuZ2Uge1xuICB1cmk6IHZzY29kZS5Vcmk7XG4gIHN0YXR1czogbnVtYmVyO1xufVxuXG5sZXQgZ2l0QXBpQ2FjaGU6IEdpdEFQSSB8IHVuZGVmaW5lZDtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEdpdEFQSSgpOiBQcm9taXNlPEdpdEFQSSB8IHVuZGVmaW5lZD4ge1xuICBpZiAoZ2l0QXBpQ2FjaGUpIHtcbiAgICByZXR1cm4gZ2l0QXBpQ2FjaGU7XG4gIH1cbiAgY29uc3QgZXh0ID0gdnNjb2RlLmV4dGVuc2lvbnMuZ2V0RXh0ZW5zaW9uKFwidnNjb2RlLmdpdFwiKTtcbiAgaWYgKCFleHQpIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG4gIGlmICghZXh0LmlzQWN0aXZlKSB7XG4gICAgYXdhaXQgZXh0LmFjdGl2YXRlKCk7XG4gIH1cbiAgZ2l0QXBpQ2FjaGUgPSBleHQuZXhwb3J0cy5nZXRBUEkoMSk7XG4gIHJldHVybiBnaXRBcGlDYWNoZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcG9zaXRvcnkoZ2l0OiBHaXRBUEkpOiBSZXBvc2l0b3J5IHwgdW5kZWZpbmVkIHtcbiAgaWYgKGdpdC5yZXBvc2l0b3JpZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gZ2l0LnJlcG9zaXRvcmllc1swXTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHN0YWdlQWxsQ2hhbmdlcyhyZXBvOiBSZXBvc2l0b3J5KTogUHJvbWlzZTxudW1iZXI+IHtcbiAgY29uc3QgdW5zdGFnZWQgPSByZXBvLnN0YXRlLndvcmtpbmdUcmVlQ2hhbmdlcztcbiAgaWYgKHVuc3RhZ2VkLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiAwO1xuICB9XG4gIGNvbnN0IHBhdGhzID0gdW5zdGFnZWQubWFwKChjaGFuZ2UpID0+IGNoYW5nZS51cmkuZnNQYXRoKTtcbiAgYXdhaXQgcmVwby5hZGQocGF0aHMpO1xuICByZXR1cm4gcGF0aHMubGVuZ3RoO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzQW55Q2hhbmdlcyhyZXBvOiBSZXBvc2l0b3J5KTogYm9vbGVhbiB7XG4gIHJldHVybiAoXG4gICAgcmVwby5zdGF0ZS5pbmRleENoYW5nZXMubGVuZ3RoID4gMCB8fFxuICAgIHJlcG8uc3RhdGUud29ya2luZ1RyZWVDaGFuZ2VzLmxlbmd0aCA+IDBcbiAgKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFN0YWdlZERpZmYocmVwbzogUmVwb3NpdG9yeSk6IFByb21pc2U8c3RyaW5nPiB7XG4gIHJldHVybiByZXBvLmRpZmYodHJ1ZSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21taXQocmVwbzogUmVwb3NpdG9yeSwgbWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gIGF3YWl0IHJlcG8uY29tbWl0KG1lc3NhZ2UpO1xufVxuIiwKICAgICJpbXBvcnQgKiBhcyB2c2NvZGUgZnJvbSBcInZzY29kZVwiO1xuaW1wb3J0IHsgcmVnaXN0ZXJDb21tYW5kcyB9IGZyb20gXCIuL2NvbW1hbmRzXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBhY3RpdmF0ZShjb250ZXh0OiB2c2NvZGUuRXh0ZW5zaW9uQ29udGV4dCkge1xuICByZWdpc3RlckNvbW1hbmRzKGNvbnRleHQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVhY3RpdmF0ZSgpIHt9XG4iCiAgXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUF3QixJQUF4Qjs7O0FDQXVCLElBQXZCO0FBRUEsSUFBTSxXQUFXO0FBQ2pCLElBQU0sV0FBVztBQTBFakIsZUFBc0IscUJBQXFCLENBQ3pDLE9BQ0EsUUFDQSxjQUNBLE1BQ2lCO0FBQUEsRUFDakIsTUFBTSxPQUFPLEtBQUssVUFBVTtBQUFBLElBQzFCLG1CQUFtQjtBQUFBLE1BQ2pCLE9BQU8sQ0FBQyxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBQUEsSUFDaEM7QUFBQSxJQUNBLFVBQVU7QUFBQSxNQUNSO0FBQUEsUUFDRSxNQUFNO0FBQUEsUUFDTixPQUFPO0FBQUEsVUFDTDtBQUFBLFlBQ0UsTUFBTTtBQUFBO0FBQUE7QUFBQSxFQUF3RTtBQUFBO0FBQUEsVUFDaEY7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxJQUNBLGtCQUFrQjtBQUFBLE1BQ2hCLGFBQWE7QUFBQSxNQUNiLGlCQUFpQjtBQUFBLE1BQ2pC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RUFFQSxPQUFPLFdBQVcsRUFBRTtBQUFBLEVBRXBCLE1BQU0sV0FBVyxRQUFRLFNBQVMsR0FBRyxPQUFPLENBQUMsRUFBRSxZQUFZLElBQUksU0FBUyxHQUFHLE1BQU0sQ0FBQztBQUFBLEVBQ2xGLE1BQU0sU0FBZ0Isa0JBQVUsaUJBQWlCLFVBQVU7QUFBQSxFQUMzRCxNQUFNLGVBQWUsT0FBTyxJQUFZLFVBQVUsU0FBUyxPQUFPLElBQUksTUFBTSxFQUFFO0FBQUEsRUFFOUUsT0FBTyxXQUFXLFlBQVksa0JBQWtCO0FBQUEsRUFDaEQsSUFBSTtBQUFBLElBQ0YsSUFBSSxTQUFTLE9BQU8sVUFBVTtBQUFBLE1BQzVCLE1BQU0sc0JBQXFCLGNBQWMsS0FBSyxRQUFRLFdBQVc7QUFBQSxJQUNuRSxFQUFPLFNBQUksU0FBUyxPQUFPLFdBQVc7QUFBQSxNQUNwQyxNQUFNLHVCQUFzQixjQUFjLEtBQUssUUFBUSxXQUFXO0FBQUEsSUFDcEU7QUFBQSxJQUNBLE9BQU8sV0FBVyxRQUFPLGtCQUFrQjtBQUFBLElBQzNDLE9BQU8sR0FBRztBQUFBLElBQ1YsT0FBTyxXQUNMLFFBQU8saUJBQWlCLGFBQWEsUUFBUSxFQUFFLFVBQVUsT0FBTyxDQUFDLEdBQ25FO0FBQUE7QUFBQSxFQUdGLE9BQU8sV0FBVyxFQUFFO0FBQUEsRUFDcEIsT0FBTyxXQUFXLDRCQUE0QjtBQUFBOzs7QU0zUHpDLFNBQVMsUUFBUSxDQUFDLFNBQWtDO0FBQUEsRUFDekQsaUJBQWlCLE9BQU87QUFBQTtBQUduQixTQUFTLFVBQVUsR0FBRzsiLAogICJkZWJ1Z0lkIjogIkUxMEUzM0Q3QzZDMThBMEM2NDc1NkUyMTY0NzU2RTIxIiwKICAibmFtZXMiOiBbXQp9
