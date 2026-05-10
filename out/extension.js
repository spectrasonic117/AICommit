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
          const cleanedText = text.trim().replace(/^```\w*\n?|```$/g, "").trim();
          resolve(cleanedText);
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
          const cleanedMessage = message.trim().replace(/^```\w*\n?|```$/g, "").trim();
          resolve(cleanedMessage);
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

//# debugId=945B49392FC069B764756E2164756E21
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2NvbW1hbmRzLnRzIiwgInNyYy9haS9nZW1pbmkudHMiLCAic3JjL2FpL21pc3RyYWwudHMiLCAic3JjL2FpL3Byb3ZpZGVycy50cyIsICJzcmMvdWkvYXBpS2V5UHJvbXB0LnRzIiwgInNyYy9naXQvb3BlcmF0aW9ucy50cyIsICJzcmMvZXh0ZW5zaW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWwogICAgImltcG9ydCAqIGFzIHZzY29kZSBmcm9tIFwidnNjb2RlXCI7XG5pbXBvcnQgeyBnZW5lcmF0ZUNvbW1pdE1lc3NhZ2UgYXMgZ2VtaW5pR2VuZXJhdGVDb21taXQgfSBmcm9tIFwiLi9haS9nZW1pbmlcIjtcbmltcG9ydCB7IGdlbmVyYXRlQ29tbWl0TWVzc2FnZSBhcyBtaXN0cmFsR2VuZXJhdGVDb21taXQgfSBmcm9tIFwiLi9haS9taXN0cmFsXCI7XG5pbXBvcnQge1xuICBQcm92aWRlcixcbiAgUHJvdmlkZXJJZCxcbiAgUFJPVklERVJTLFxuICBnZXRQcm92aWRlcixcbiAgZ2V0Q29uZmlndXJlZFByb3ZpZGVyLFxuICBzZXRQcm92aWRlcixcbn0gZnJvbSBcIi4vYWkvcHJvdmlkZXJzXCI7XG5pbXBvcnQge1xuICBnZXRBcGlLZXksXG4gIHByb21wdEZvckFwaUtleSxcbiAgZ2V0T3JQcm9tcHRBcGlLZXksXG59IGZyb20gXCIuL3VpL2FwaUtleVByb21wdFwiO1xuaW1wb3J0IHtcbiAgZ2V0R2l0QVBJLFxuICBnZXRSZXBvc2l0b3J5LFxuICBzdGFnZUFsbENoYW5nZXMsXG4gIGhhc0FueUNoYW5nZXMsXG4gIGdldFN0YWdlZERpZmYsXG4gIGNvbW1pdCxcbn0gZnJvbSBcIi4vZ2l0L29wZXJhdGlvbnNcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29tbWFuZHMoY29udGV4dDogdnNjb2RlLkV4dGVuc2lvbkNvbnRleHQpOiB2b2lkIHtcbiAgY29udGV4dC5zdWJzY3JpcHRpb25zLnB1c2goXG4gICAgdnNjb2RlLmNvbW1hbmRzLnJlZ2lzdGVyQ29tbWFuZChcbiAgICAgIFwiYWlDb21taXQuZ2VuZXJhdGVDb21taXRcIixcbiAgICAgICgpID0+IGhhbmRsZUdlbmVyYXRlQ29tbWl0KGNvbnRleHQpXG4gICAgKSxcbiAgICB2c2NvZGUuY29tbWFuZHMucmVnaXN0ZXJDb21tYW5kKFxuICAgICAgXCJhaUNvbW1pdC5zZWxlY3RQcm92aWRlclwiLFxuICAgICAgKCkgPT4gaGFuZGxlU2VsZWN0UHJvdmlkZXIoKVxuICAgICksXG4gICAgdnNjb2RlLmNvbW1hbmRzLnJlZ2lzdGVyQ29tbWFuZChcbiAgICAgIFwiYWlDb21taXQuc2VsZWN0TW9kZWxcIixcbiAgICAgICgpID0+IGhhbmRsZVNlbGVjdE1vZGVsKClcbiAgICApLFxuICAgIHZzY29kZS5jb21tYW5kcy5yZWdpc3RlckNvbW1hbmQoXG4gICAgICBcImFpQ29tbWl0LnNldEFwaUtleVwiLFxuICAgICAgKCkgPT4gaGFuZGxlU2V0QXBpS2V5KGNvbnRleHQpXG4gICAgKSxcbiAgICB2c2NvZGUuY29tbWFuZHMucmVnaXN0ZXJDb21tYW5kKFxuICAgICAgXCJhaUNvbW1pdC5kaWFnbm9zZVwiLFxuICAgICAgKCkgPT4gaGFuZGxlRGlhZ25vc2UoY29udGV4dClcbiAgICApXG4gICk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUdlbmVyYXRlQ29tbWl0KFxuICBjb250ZXh0OiB2c2NvZGUuRXh0ZW5zaW9uQ29udGV4dFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgZ2l0ID0gYXdhaXQgZ2V0R2l0QVBJKCk7XG4gICAgaWYgKCFnaXQpIHtcbiAgICAgIHZzY29kZS53aW5kb3cuc2hvd0Vycm9yTWVzc2FnZShcIkdpdCBleHRlbnNpb24gbm90IGZvdW5kLlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCByZXBvID0gZ2V0UmVwb3NpdG9yeShnaXQpO1xuICAgIGlmICghcmVwbykge1xuICAgICAgdnNjb2RlLndpbmRvdy5zaG93V2FybmluZ01lc3NhZ2UoXG4gICAgICAgIFwiTm8gZ2l0IHJlcG9zaXRvcnkgZm91bmQuIE9wZW4gYSBmb2xkZXIgd2l0aCBhIGdpdCByZXBvc2l0b3J5LlwiXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghaGFzQW55Q2hhbmdlcyhyZXBvKSkge1xuICAgICAgdnNjb2RlLndpbmRvdy5zaG93V2FybmluZ01lc3NhZ2UoXCJObyBjaGFuZ2VzIHRvIGNvbW1pdC5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgcHJvdmlkZXIgPSBhd2FpdCBnZXRDb25maWd1cmVkUHJvdmlkZXIoKTtcbiAgICBsZXQgYXBpS2V5ID0gYXdhaXQgZ2V0QXBpS2V5KGNvbnRleHQsIHByb3ZpZGVyLmlkKTtcblxuICAgIGlmICghYXBpS2V5KSB7XG4gICAgICBhcGlLZXkgPSBhd2FpdCBwcm9tcHRGb3JBcGlLZXkoY29udGV4dCwgcHJvdmlkZXIuaWQpO1xuICAgICAgaWYgKCFhcGlLZXkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGNvbmZpZyA9IHZzY29kZS53b3Jrc3BhY2UuZ2V0Q29uZmlndXJhdGlvbihcImFpQ29tbWl0XCIpO1xuICAgIGNvbnN0IG1vZGVsID0gY29uZmlnLmdldDxzdHJpbmc+KGBtb2RlbCR7cHJvdmlkZXIuaWQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBwcm92aWRlci5pZC5zbGljZSgxKX1gLCBwcm92aWRlci5tb2RlbHNbMF0/LmlkIHx8IFwiXCIpO1xuICAgIGNvbnN0IHN5c3RlbVByb21wdCA9IGNvbmZpZy5nZXQ8c3RyaW5nPihcInN5c3RlbVByb21wdFwiLCBcIlwiKTtcblxuICAgIGNvbnN0IHN0YWdlZENvdW50ID0gcmVwby5zdGF0ZS5pbmRleENoYW5nZXMubGVuZ3RoO1xuICAgIGNvbnN0IHVuc3RhZ2VkQ291bnQgPSByZXBvLnN0YXRlLndvcmtpbmdUcmVlQ2hhbmdlcy5sZW5ndGg7XG5cbiAgICBhd2FpdCB2c2NvZGUud2luZG93LndpdGhQcm9ncmVzcyhcbiAgICAgIHtcbiAgICAgICAgbG9jYXRpb246IHZzY29kZS5Qcm9ncmVzc0xvY2F0aW9uLlNvdXJjZUNvbnRyb2wsXG4gICAgICAgIHRpdGxlOiBcIkdlbmVyYXRpbmcgQUkgY29tbWl0IG1lc3NhZ2UuLi5cIixcbiAgICAgIH0sXG4gICAgICBhc3luYyAocHJvZ3Jlc3MpID0+IHtcbiAgICAgICAgcHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogXCJTdGFnaW5nIGNoYW5nZXMuLi5cIiB9KTtcblxuICAgICAgICBpZiAodW5zdGFnZWRDb3VudCA+IDApIHtcbiAgICAgICAgICBhd2FpdCBzdGFnZUFsbENoYW5nZXMocmVwbyk7XG4gICAgICAgIH1cblxuICAgICAgICBwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBcIkdldHRpbmcgZGlmZi4uLlwiIH0pO1xuICAgICAgICBjb25zdCBkaWZmID0gYXdhaXQgZ2V0U3RhZ2VkRGlmZihyZXBvKTtcblxuICAgICAgICBpZiAoIWRpZmYpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyBkaWZmIGF2YWlsYWJsZSBhZnRlciBzdGFnaW5nLlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IGBDYWxsaW5nICR7cHJvdmlkZXIubmFtZX0gQVBJLi4uYCB9KTtcblxuICAgICAgICBsZXQgbWVzc2FnZTogc3RyaW5nO1xuICAgICAgICBpZiAocHJvdmlkZXIuaWQgPT09IFwiZ29vZ2xlXCIpIHtcbiAgICAgICAgICBtZXNzYWdlID0gYXdhaXQgZ2VtaW5pR2VuZXJhdGVDb21taXQobW9kZWwsIGFwaUtleSEsIHN5c3RlbVByb21wdCwgZGlmZik7XG4gICAgICAgIH0gZWxzZSBpZiAocHJvdmlkZXIuaWQgPT09IFwibWlzdHJhbFwiKSB7XG4gICAgICAgICAgbWVzc2FnZSA9IGF3YWl0IG1pc3RyYWxHZW5lcmF0ZUNvbW1pdChtb2RlbCwgYXBpS2V5ISwgc3lzdGVtUHJvbXB0LCBkaWZmKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIHByb3ZpZGVyOiAke3Byb3ZpZGVyLmlkfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgcHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogXCJDb21taXR0aW5nLi4uXCIgfSk7XG4gICAgICAgIHJlcG8uaW5wdXRCb3gudmFsdWUgPSBtZXNzYWdlO1xuICAgICAgICBhd2FpdCBjb21taXQocmVwbywgbWVzc2FnZSk7XG5cbiAgICAgICAgdnNjb2RlLndpbmRvdy5zaG93SW5mb3JtYXRpb25NZXNzYWdlKFwiQ29tbWl0IEdlbmVyYXRlZCBTdWNjZXNzZnVsbHlcIik7XG4gICAgICB9XG4gICAgKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIlVua25vd24gZXJyb3JcIjtcbiAgICB2c2NvZGUud2luZG93LnNob3dFcnJvck1lc3NhZ2UoYEFJIENvbW1pdCBmYWlsZWQ6ICR7bWVzc2FnZX1gKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTZWxlY3RQcm92aWRlcigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgY3VycmVudFByb3ZpZGVyID0gYXdhaXQgZ2V0Q29uZmlndXJlZFByb3ZpZGVyKCk7XG5cbiAgY29uc3QgaXRlbXM6IHZzY29kZS5RdWlja1BpY2tJdGVtW10gPSBQUk9WSURFUlMubWFwKChwKSA9PiAoe1xuICAgIGxhYmVsOiBwLm5hbWUsXG4gICAgZGVzY3JpcHRpb246IGAke3AubW9kZWxzLmxlbmd0aH0gbW9kZWxzIGF2YWlsYWJsZWAsXG4gICAgZGV0YWlsOiBjdXJyZW50UHJvdmlkZXIuaWQgPT09IHAuaWQgPyBcIkN1cnJlbnRseSBzZWxlY3RlZFwiIDogdW5kZWZpbmVkLFxuICB9KSk7XG5cbiAgY29uc3QgcGlja2VkID0gYXdhaXQgdnNjb2RlLndpbmRvdy5zaG93UXVpY2tQaWNrKGl0ZW1zLCB7XG4gICAgdGl0bGU6IFwiQUkgQ29tbWl0OiBTZWxlY3QgUHJvdmlkZXJcIixcbiAgICBwbGFjZUhvbGRlcjogXCJDaG9vc2UgdGhlIEFJIHByb3ZpZGVyIGZvciBjb21taXQgZ2VuZXJhdGlvblwiLFxuICB9KTtcblxuICBpZiAocGlja2VkKSB7XG4gICAgY29uc3Qgc2VsZWN0ZWRQcm92aWRlciA9IFBST1ZJREVSUy5maW5kKChwKSA9PiBwLm5hbWUgPT09IHBpY2tlZC5sYWJlbCk7XG4gICAgaWYgKHNlbGVjdGVkUHJvdmlkZXIpIHtcbiAgICAgIGF3YWl0IHNldFByb3ZpZGVyKHNlbGVjdGVkUHJvdmlkZXIuaWQpO1xuXG4gICAgICBjb25zdCBjb25maWcgPSB2c2NvZGUud29ya3NwYWNlLmdldENvbmZpZ3VyYXRpb24oXCJhaUNvbW1pdFwiKTtcbiAgICAgIGNvbnN0IG1vZGVsS2V5ID0gYG1vZGVsJHtzZWxlY3RlZFByb3ZpZGVyLmlkLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgc2VsZWN0ZWRQcm92aWRlci5pZC5zbGljZSgxKX1gO1xuICAgICAgY29uc3QgY3VycmVudE1vZGVsID0gY29uZmlnLmdldDxzdHJpbmc+KG1vZGVsS2V5KTtcblxuICAgICAgaWYgKCFjdXJyZW50TW9kZWwgfHwgIXNlbGVjdGVkUHJvdmlkZXIubW9kZWxzLnNvbWUoKG0pID0+IG0uaWQgPT09IGN1cnJlbnRNb2RlbCkpIHtcbiAgICAgICAgYXdhaXQgY29uZmlnLnVwZGF0ZShcbiAgICAgICAgICBtb2RlbEtleSxcbiAgICAgICAgICBzZWxlY3RlZFByb3ZpZGVyLm1vZGVsc1swXT8uaWQsXG4gICAgICAgICAgdnNjb2RlLkNvbmZpZ3VyYXRpb25UYXJnZXQuR2xvYmFsXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHZzY29kZS53aW5kb3cuc2hvd0luZm9ybWF0aW9uTWVzc2FnZShcbiAgICAgICAgYEFJIENvbW1pdCBwcm92aWRlciBzZXQgdG86ICR7c2VsZWN0ZWRQcm92aWRlci5uYW1lfWBcbiAgICAgICk7XG4gICAgfVxuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVNlbGVjdE1vZGVsKCk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBwcm92aWRlciA9IGF3YWl0IGdldENvbmZpZ3VyZWRQcm92aWRlcigpO1xuICBjb25zdCBjb25maWcgPSB2c2NvZGUud29ya3NwYWNlLmdldENvbmZpZ3VyYXRpb24oXCJhaUNvbW1pdFwiKTtcbiAgY29uc3QgbW9kZWxLZXkgPSBgbW9kZWwke3Byb3ZpZGVyLmlkLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgcHJvdmlkZXIuaWQuc2xpY2UoMSl9YDtcbiAgY29uc3QgY3VycmVudCA9IGNvbmZpZy5nZXQ8c3RyaW5nPihtb2RlbEtleSwgcHJvdmlkZXIubW9kZWxzWzBdPy5pZCB8fCBcIlwiKTtcblxuICBjb25zdCBpdGVtczogdnNjb2RlLlF1aWNrUGlja0l0ZW1bXSA9IHByb3ZpZGVyLm1vZGVscy5tYXAoKG0pID0+ICh7XG4gICAgbGFiZWw6IG0ubmFtZSxcbiAgICBkZXRhaWw6IGN1cnJlbnQgPT09IG0uaWQgPyBcIkN1cnJlbnRseSBzZWxlY3RlZFwiIDogdW5kZWZpbmVkLFxuICB9KSk7XG5cbiAgY29uc3QgcGlja2VkID0gYXdhaXQgdnNjb2RlLndpbmRvdy5zaG93UXVpY2tQaWNrKGl0ZW1zLCB7XG4gICAgdGl0bGU6IGBBSSBDb21taXQ6IFNlbGVjdCBNb2RlbCAoJHtwcm92aWRlci5uYW1lfSlgLFxuICAgIHBsYWNlSG9sZGVyOiBgQ2hvb3NlIHRoZSBtb2RlbCBmb3IgJHtwcm92aWRlci5uYW1lfWAsXG4gIH0pO1xuXG4gIGlmIChwaWNrZWQpIHtcbiAgICBhd2FpdCBjb25maWcudXBkYXRlKFxuICAgICAgbW9kZWxLZXksXG4gICAgICBwaWNrZWQubGFiZWwsXG4gICAgICB2c2NvZGUuQ29uZmlndXJhdGlvblRhcmdldC5HbG9iYWxcbiAgICApO1xuICAgIHZzY29kZS53aW5kb3cuc2hvd0luZm9ybWF0aW9uTWVzc2FnZShcbiAgICAgIGBBSSBDb21taXQgbW9kZWwgc2V0IHRvOiAke3BpY2tlZC5sYWJlbH1gXG4gICAgKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTZXRBcGlLZXkoY29udGV4dDogdnNjb2RlLkV4dGVuc2lvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgcHJvdmlkZXIgPSBhd2FpdCBnZXRDb25maWd1cmVkUHJvdmlkZXIoKTtcbiAgYXdhaXQgcHJvbXB0Rm9yQXBpS2V5KGNvbnRleHQsIHByb3ZpZGVyLmlkKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlRGlhZ25vc2UoXG4gIGNvbnRleHQ6IHZzY29kZS5FeHRlbnNpb25Db250ZXh0XG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgcHJvdmlkZXIgPSBhd2FpdCBnZXRDb25maWd1cmVkUHJvdmlkZXIoKTtcbiAgY29uc3QgYXBpS2V5ID0gYXdhaXQgZ2V0QXBpS2V5KGNvbnRleHQsIHByb3ZpZGVyLmlkKTtcblxuICBpZiAoIWFwaUtleSkge1xuICAgIGNvbnN0IHByb21wdGVkID0gYXdhaXQgcHJvbXB0Rm9yQXBpS2V5KGNvbnRleHQsIHByb3ZpZGVyLmlkKTtcbiAgICBpZiAoIXByb21wdGVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9XG5cbiAgY29uc3Qga2V5ID0gKGF3YWl0IGdldEFwaUtleShjb250ZXh0LCBwcm92aWRlci5pZCkpITtcblxuICBjb25zdCBvdXRwdXQgPSB2c2NvZGUud2luZG93LmNyZWF0ZU91dHB1dENoYW5uZWwoXCJBSSBDb21taXQ6IERpYWdub3NlXCIpO1xuICBvdXRwdXQuc2hvdygpO1xuXG4gIG91dHB1dC5hcHBlbmRMaW5lKFwiPT09IEFJIENvbW1pdCBEaWFnbm9zaXMgPT09XCIpO1xuICBvdXRwdXQuYXBwZW5kTGluZShcIlwiKTtcbiAgb3V0cHV0LmFwcGVuZExpbmUoYFByb3ZpZGVyOiAke3Byb3ZpZGVyLm5hbWV9YCk7XG4gIG91dHB1dC5hcHBlbmRMaW5lKFwiXCIpO1xuXG4gIG91dHB1dC5hcHBlbmRMaW5lKGBBdmFpbGFibGUgbW9kZWxzIGZvciAke3Byb3ZpZGVyLm5hbWV9OmApO1xuXG4gIGZvciAoY29uc3QgbSBvZiBwcm92aWRlci5tb2RlbHMpIHtcbiAgICBvdXRwdXQuYXBwZW5kTGluZShgICAgLSAke20ubmFtZX1gKTtcbiAgfVxuXG4gIG91dHB1dC5hcHBlbmRMaW5lKFwiXCIpO1xuXG4gIGNvbnN0IG1vZGVsS2V5ID0gYG1vZGVsJHtwcm92aWRlci5pZC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHByb3ZpZGVyLmlkLnNsaWNlKDEpfWA7XG4gIGNvbnN0IGNvbmZpZyA9IHZzY29kZS53b3Jrc3BhY2UuZ2V0Q29uZmlndXJhdGlvbihcImFpQ29tbWl0XCIpO1xuICBjb25zdCBjdXJyZW50TW9kZWwgPSBjb25maWcuZ2V0PHN0cmluZz4obW9kZWxLZXksIHByb3ZpZGVyLm1vZGVsc1swXT8uaWQgfHwgXCJcIik7XG5cbiAgb3V0cHV0LmFwcGVuZExpbmUoYFRlc3RpbmcgJyR7Y3VycmVudE1vZGVsfScuLi5gKTtcbiAgdHJ5IHtcbiAgICBpZiAocHJvdmlkZXIuaWQgPT09IFwiZ29vZ2xlXCIpIHtcbiAgICAgIGF3YWl0IGdlbWluaUdlbmVyYXRlQ29tbWl0KGN1cnJlbnRNb2RlbCwga2V5LCBcInRlc3RcIiwgXCJ0ZXN0IGRpZmZcIik7XG4gICAgfSBlbHNlIGlmIChwcm92aWRlci5pZCA9PT0gXCJtaXN0cmFsXCIpIHtcbiAgICAgIGF3YWl0IG1pc3RyYWxHZW5lcmF0ZUNvbW1pdChjdXJyZW50TW9kZWwsIGtleSwgXCJ0ZXN0XCIsIFwidGVzdCBkaWZmXCIpO1xuICAgIH1cbiAgICBvdXRwdXQuYXBwZW5kTGluZShgICAg4pyTICR7Y3VycmVudE1vZGVsfTogT0tgKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIG91dHB1dC5hcHBlbmRMaW5lKFxuICAgICAgYCAgIOKclyAke2N1cnJlbnRNb2RlbH06ICR7ZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpfWBcbiAgICApO1xuICB9XG5cbiAgb3V0cHV0LmFwcGVuZExpbmUoXCJcIik7XG4gIG91dHB1dC5hcHBlbmRMaW5lKFwiPT09IERpYWdub3NpcyBjb21wbGV0ZSA9PT1cIik7XG59XG4iLAogICAgImltcG9ydCAqIGFzIGh0dHBzIGZyb20gXCJub2RlOmh0dHBzXCI7XG5cbmNvbnN0IEFQSV9IT1NUID0gXCJnZW5lcmF0aXZlbGFuZ3VhZ2UuZ29vZ2xlYXBpcy5jb21cIjtcbmNvbnN0IEFQSV9QQVRIID0gXCIvdjFiZXRhL21vZGVscy9cIjtcblxuaW50ZXJmYWNlIE1vZGVsSW5mbyB7XG4gIG5hbWU6IHN0cmluZztcbiAgZGlzcGxheU5hbWU6IHN0cmluZztcbiAgc3VwcG9ydGVkR2VuZXJhdGlvbk1ldGhvZHM6IHN0cmluZ1tdO1xufVxuXG5pbnRlcmZhY2UgTGlzdE1vZGVsc1Jlc3BvbnNlIHtcbiAgbW9kZWxzOiBNb2RlbEluZm9bXTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxpc3RBdmFpbGFibGVNb2RlbHMoXG4gIGFwaUtleTogc3RyaW5nXG4pOiBQcm9taXNlPE1vZGVsSW5mb1tdPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcmVxID0gaHR0cHMucmVxdWVzdChcbiAgICAgIHtcbiAgICAgICAgaG9zdG5hbWU6IEFQSV9IT1NULFxuICAgICAgICBwYXRoOiBcIi92MWJldGEvbW9kZWxzXCIsXG4gICAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIFwieC1nb29nLWFwaS1rZXlcIjogYXBpS2V5LFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiAxMDAwMCxcbiAgICAgIH0sXG4gICAgICAocmVzKSA9PiB7XG4gICAgICAgIGxldCBkYXRhID0gXCJcIjtcbiAgICAgICAgcmVzLm9uKFwiZGF0YVwiLCAoY2h1bmspID0+IChkYXRhICs9IGNodW5rKSk7XG4gICAgICAgIHJlcy5vbihcImVuZFwiLCAoKSA9PiB7XG4gICAgICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSAyMDApIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoZGF0YSkgYXMgTGlzdE1vZGVsc1Jlc3BvbnNlO1xuICAgICAgICAgICAgICByZXNvbHZlKHBhcnNlZC5tb2RlbHMgfHwgW10pO1xuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoXCJGYWlsZWQgdG8gcGFyc2UgbW9kZWwgbGlzdC5cIikpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICBgRmFpbGVkIHRvIGxpc3QgbW9kZWxzICgke3Jlcy5zdGF0dXNDb2RlfSk6ICR7ZGF0YX1gXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgcmVxLm9uKFwiZXJyb3JcIiwgKGVycjogTm9kZUpTLkVycm5vRXhjZXB0aW9uKSA9PiB7XG4gICAgICByZWplY3QobmV3IEVycm9yKGBOZXR3b3JrIGVycm9yOiAke2Vyci5tZXNzYWdlfWApKTtcbiAgICB9KTtcblxuICAgIHJlcS5vbihcInRpbWVvdXRcIiwgKCkgPT4ge1xuICAgICAgcmVxLmRlc3Ryb3koKTtcbiAgICAgIHJlamVjdChuZXcgRXJyb3IoXCJSZXF1ZXN0IHRpbWVkIG91dC5cIikpO1xuICAgIH0pO1xuXG4gICAgcmVxLmVuZCgpO1xuICB9KTtcbn1cblxuaW50ZXJmYWNlIEdlbWluaVJlc3BvbnNlIHtcbiAgY2FuZGlkYXRlcz86IHtcbiAgICBjb250ZW50OiB7XG4gICAgICByb2xlOiBzdHJpbmc7XG4gICAgICBwYXJ0czogeyB0ZXh0OiBzdHJpbmc7IHRob3VnaHQ/OiBib29sZWFuIH1bXTtcbiAgICB9O1xuICAgIGZpbmlzaFJlYXNvbjogc3RyaW5nO1xuICB9W107XG4gIHByb21wdEZlZWRiYWNrPzoge1xuICAgIGJsb2NrUmVhc29uOiBzdHJpbmc7XG4gIH07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZUNvbW1pdE1lc3NhZ2UoXG4gIG1vZGVsOiBzdHJpbmcsXG4gIGFwaUtleTogc3RyaW5nLFxuICBzeXN0ZW1Qcm9tcHQ6IHN0cmluZyxcbiAgZGlmZjogc3RyaW5nXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCBib2R5ID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgIHN5c3RlbUluc3RydWN0aW9uOiB7XG4gICAgICBwYXJ0czogW3sgdGV4dDogc3lzdGVtUHJvbXB0IH1dLFxuICAgIH0sXG4gICAgY29udGVudHM6IFtcbiAgICAgIHtcbiAgICAgICAgcm9sZTogXCJ1c2VyXCIsXG4gICAgICAgIHBhcnRzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgdGV4dDogYEdlbmVyYXRlIGEgY29tbWl0IG1lc3NhZ2UgZm9yIHRoZSBmb2xsb3dpbmcgZ2l0IGRpZmY6XFxuXFxuXFxgXFxgXFxgZGlmZlxcbiR7ZGlmZn1cXG5cXGBcXGBcXGBgLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgIF0sXG4gICAgZ2VuZXJhdGlvbkNvbmZpZzoge1xuICAgICAgdGVtcGVyYXR1cmU6IDAuMixcbiAgICAgIG1heE91dHB1dFRva2VuczogMTUwLFxuICAgICAgdG9wUDogMC45NSxcbiAgICB9LFxuICB9KTtcblxuICByZXR1cm4gbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcmVxID0gaHR0cHMucmVxdWVzdChcbiAgICAgIHtcbiAgICAgICAgaG9zdG5hbWU6IEFQSV9IT1NULFxuICAgICAgICBwYXRoOiBgJHtBUElfUEFUSH0ke21vZGVsfTpnZW5lcmF0ZUNvbnRlbnRgLFxuICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgICAgICAgXCJ4LWdvb2ctYXBpLWtleVwiOiBhcGlLZXksXG4gICAgICAgICAgXCJDb250ZW50LUxlbmd0aFwiOiBCdWZmZXIuYnl0ZUxlbmd0aChib2R5KS50b1N0cmluZygpLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiAxNTAwMCxcbiAgICAgIH0sXG4gICAgICAocmVzKSA9PiB7XG4gICAgICAgIGxldCBkYXRhID0gXCJcIjtcblxuICAgICAgICByZXMub24oXCJkYXRhXCIsIChjaHVuaykgPT4ge1xuICAgICAgICAgIGRhdGEgKz0gY2h1bms7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJlcy5vbihcImVuZFwiLCAoKSA9PiB7XG4gICAgICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSA0MDEpIHtcbiAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgIFwiSW52YWxpZCBBUEkga2V5LiBVc2UgJ0FJIENvbW1pdDogU2V0IEFQSSBLZXknIHRvIHVwZGF0ZSBpdC5cIlxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gNDI5KSB7XG4gICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICBcIlJhdGUgbGltaXRlZCBieSBHZW1pbmkgQVBJLiBQbGVhc2Ugd2FpdCBhIG1vbWVudCBhbmQgdHJ5IGFnYWluLlwiXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCFyZXMuc3RhdHVzQ29kZSB8fCByZXMuc3RhdHVzQ29kZSA+PSA0MDApIHtcbiAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgIGBHZW1pbmkgQVBJIGVycm9yICgke3Jlcy5zdGF0dXNDb2RlfSk6ICR7ZGF0YS5zbGljZSgwLCA1MDApfWBcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShkYXRhKSBhcyBHZW1pbmlSZXNwb25zZTtcblxuICAgICAgICAgICAgaWYgKCFwYXJzZWQuY2FuZGlkYXRlcyB8fCBwYXJzZWQuY2FuZGlkYXRlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgaWYgKHBhcnNlZC5wcm9tcHRGZWVkYmFjaz8uYmxvY2tSZWFzb24pIHtcbiAgICAgICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIGBDb250ZW50IGJsb2NrZWQ6ICR7cGFyc2VkLnByb21wdEZlZWRiYWNrLmJsb2NrUmVhc29ufWBcbiAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICAgICAgYE5vIGNvbW1pdCBtZXNzYWdlIGdlbmVyYXRlZC4gUmF3IHJlc3BvbnNlOiAke2RhdGEuc2xpY2UoMCwgMzAwKX1gXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZSA9IHBhcnNlZC5jYW5kaWRhdGVzWzBdO1xuICAgICAgICAgICAgY29uc3QgcGFydHMgPSBjYW5kaWRhdGUuY29udGVudD8ucGFydHM7XG4gICAgICAgICAgICBpZiAoIXBhcnRzIHx8IHBhcnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgICAgYEFJIHJldHVybmVkIG5vIHBhcnRzLiBmaW5pc2hSZWFzb246ICR7Y2FuZGlkYXRlLmZpbmlzaFJlYXNvbn0uIFJhdzogJHtkYXRhLnNsaWNlKDAsIDMwMCl9YFxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBHZW1tYSBtb2RlbHMgcmV0dXJuIGEgXCJ0aG91Z2h0XCIgcGFydCBmaXJzdCwgdGhlbiB0aGUgYWN0dWFsIHJlc3BvbnNlLlxuICAgICAgICAgICAgLy8gRmluZCB0aGUgZmlyc3Qgbm9uLXRob3VnaHQgcGFydCB3aXRoIHRleHQuXG4gICAgICAgICAgICBjb25zdCB0ZXh0UGFydCA9IHBhcnRzLmZpbmQoKHApID0+ICFwLnRob3VnaHQgJiYgcC50ZXh0Py50cmltKCkpO1xuICAgICAgICAgICAgY29uc3QgdGV4dCA9IHRleHRQYXJ0Py50ZXh0ID8/IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdPy50ZXh0O1xuXG4gICAgICAgICAgICBpZiAoIXRleHQgfHwgdGV4dC50cmltKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgICBgQUkgcmV0dXJuZWQgZW1wdHkgdGV4dC4gZmluaXNoUmVhc29uOiAke2NhbmRpZGF0ZS5maW5pc2hSZWFzb259LiBSYXc6ICR7ZGF0YS5zbGljZSgwLCAzMDApfWBcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY2xlYW5lZFRleHQgPSB0ZXh0LnRyaW0oKS5yZXBsYWNlKC9eYGBgXFx3Klxcbj98YGBgJC9nLCBcIlwiKS50cmltKCk7XG4gICAgICAgICAgICByZXNvbHZlKGNsZWFuZWRUZXh0KTtcbiAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgbmV3IEVycm9yKGBGYWlsZWQgdG8gcGFyc2UgR2VtaW5pIEFQSSByZXNwb25zZS4gUmF3OiAke2RhdGEuc2xpY2UoMCwgMzAwKX1gKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICk7XG5cbiAgICByZXEub24oXCJlcnJvclwiLCAoZXJyKSA9PiB7XG4gICAgICBjb25zdCBub2RlRXJyID0gZXJyIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcbiAgICAgIGlmIChub2RlRXJyLmNvZGUgPT09IFwiRUNPTk5SRUZVU0VEXCIpIHtcbiAgICAgICAgcmVqZWN0KFxuICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgIFwiQ2Fubm90IHJlYWNoIEdvb2dsZSBBUEkgKGNvbm5lY3Rpb24gcmVmdXNlZCkuIENoZWNrIHlvdXIgaW50ZXJuZXQgY29ubmVjdGlvbi5cIlxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAobm9kZUVyci5jb2RlID09PSBcIkVOT1RGT1VORFwiIHx8IG5vZGVFcnIuY29kZSA9PT0gXCJFQUlfQUdBSU5cIikge1xuICAgICAgICByZWplY3QoXG4gICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgXCJDYW5ub3QgcmVzb2x2ZSBHb29nbGUgQVBJIGhvc3QgKEROUyBlcnJvcikuIENoZWNrIHlvdXIgaW50ZXJuZXQgY29ubmVjdGlvbi5cIlxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAobm9kZUVyci5jb2RlID09PSBcIkVUSU1FRE9VVFwiIHx8IG5vZGVFcnIuY29kZSA9PT0gXCJFQ09OTlJFU0VUXCIpIHtcbiAgICAgICAgcmVqZWN0KFxuICAgICAgICAgIG5ldyBFcnJvcihcIkFQSSByZXF1ZXN0IHRpbWVkIG91dC4gQ2hlY2sgeW91ciBpbnRlcm5ldCBjb25uZWN0aW9uLlwiKVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChub2RlRXJyLmNvZGUgPT09IFwiQ0VSVF9IQVNfRVhQSVJFRFwiIHx8IG5vZGVFcnIuY29kZSA9PT0gXCJVTkFCTEVfVE9fVkVSSUZZX0xFQUZfU0lHTkFUVVJFXCIpIHtcbiAgICAgICAgcmVqZWN0KFxuICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgIFwiU1NMIGNlcnRpZmljYXRlIGVycm9yIGNvbm5lY3RpbmcgdG8gR29vZ2xlIEFQSS4gWW91ciBzeXN0ZW0gY2xvY2sgbWF5IGJlIHdyb25nLlwiXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVqZWN0KFxuICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgIGBOZXR3b3JrIGVycm9yOiAke25vZGVFcnIubWVzc2FnZX0gKGNvZGU6ICR7bm9kZUVyci5jb2RlIHx8IFwibm9uZVwifSlgXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmVxLm9uKFwidGltZW91dFwiLCAoKSA9PiB7XG4gICAgICByZXEuZGVzdHJveSgpO1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcihcIkFQSSByZXF1ZXN0IHRpbWVkIG91dC4gQ2hlY2sgeW91ciBpbnRlcm5ldCBjb25uZWN0aW9uLlwiKSk7XG4gICAgfSk7XG5cbiAgICByZXEud3JpdGUoYm9keSk7XG4gICAgcmVxLmVuZCgpO1xuICB9KTtcbn1cbiIsCiAgICAiaW1wb3J0ICogYXMgaHR0cHMgZnJvbSBcIm5vZGU6aHR0cHNcIjtcblxuY29uc3QgQVBJX0hPU1QgPSBcImNvZGVzdHJhbC5taXN0cmFsLmFpXCI7XG5jb25zdCBBUElfUEFUSCA9IFwiL3YxL2NoYXQvY29tcGxldGlvbnNcIjtcblxuaW50ZXJmYWNlIE1pc3RyYWxNZXNzYWdlIHtcbiAgcm9sZTogXCJzeXN0ZW1cIiB8IFwidXNlclwiIHwgXCJhc3Npc3RhbnRcIjtcbiAgY29udGVudDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgTWlzdHJhbFJlc3BvbnNlIHtcbiAgaWQ6IHN0cmluZztcbiAgb2JqZWN0OiBzdHJpbmc7XG4gIGNyZWF0ZWQ6IG51bWJlcjtcbiAgbW9kZWw6IHN0cmluZztcbiAgY2hvaWNlczoge1xuICAgIGluZGV4OiBudW1iZXI7XG4gICAgbWVzc2FnZToge1xuICAgICAgcm9sZTogc3RyaW5nO1xuICAgICAgY29udGVudDogc3RyaW5nO1xuICAgIH07XG4gICAgZmluaXNoX3JlYXNvbjogc3RyaW5nO1xuICB9W107XG4gIHVzYWdlPzoge1xuICAgIHByb21wdF90b2tlbnM6IG51bWJlcjtcbiAgICBjb21wbGV0aW9uX3Rva2VuczogbnVtYmVyO1xuICAgIHRvdGFsX3Rva2VuczogbnVtYmVyO1xuICB9O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVDb21taXRNZXNzYWdlKFxuICBtb2RlbDogc3RyaW5nLFxuICBhcGlLZXk6IHN0cmluZyxcbiAgc3lzdGVtUHJvbXB0OiBzdHJpbmcsXG4gIGRpZmY6IHN0cmluZ1xuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgY29uc3QgbWVzc2FnZXM6IE1pc3RyYWxNZXNzYWdlW10gPSBbXTtcblxuICBpZiAoc3lzdGVtUHJvbXB0KSB7XG4gICAgbWVzc2FnZXMucHVzaCh7IHJvbGU6IFwic3lzdGVtXCIsIGNvbnRlbnQ6IHN5c3RlbVByb21wdCB9KTtcbiAgfVxuXG4gIG1lc3NhZ2VzLnB1c2goe1xuICAgIHJvbGU6IFwidXNlclwiLFxuICAgIGNvbnRlbnQ6IGBHZW5lcmF0ZSBhIGNvbW1pdCBtZXNzYWdlIGZvciB0aGUgZm9sbG93aW5nIGdpdCBkaWZmOlxcblxcblxcYFxcYFxcYGRpZmZcXG4ke2RpZmZ9XFxuXFxgXFxgXFxgYCxcbiAgfSk7XG5cbiAgY29uc3QgYm9keSA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICBtb2RlbCxcbiAgICBtZXNzYWdlcyxcbiAgICB0ZW1wZXJhdHVyZTogMC4yLFxuICAgIG1heF90b2tlbnM6IDE1MCxcbiAgfSk7XG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZz4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHJlcSA9IGh0dHBzLnJlcXVlc3QoXG4gICAgICB7XG4gICAgICAgIGhvc3RuYW1lOiBBUElfSE9TVCxcbiAgICAgICAgcGF0aDogQVBJX1BBVEgsXG4gICAgICAgIG1ldGhvZDogXCJQT1NUXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7YXBpS2V5fWAsXG4gICAgICAgICAgXCJDb250ZW50LUxlbmd0aFwiOiBCdWZmZXIuYnl0ZUxlbmd0aChib2R5KS50b1N0cmluZygpLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiAxNTAwMCxcbiAgICAgIH0sXG4gICAgICAocmVzKSA9PiB7XG4gICAgICAgIGxldCBkYXRhID0gXCJcIjtcblxuICAgICAgICByZXMub24oXCJkYXRhXCIsIChjaHVuaykgPT4ge1xuICAgICAgICAgIGRhdGEgKz0gY2h1bms7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJlcy5vbihcImVuZFwiLCAoKSA9PiB7XG4gICAgICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSA0MDEpIHtcbiAgICAgICAgICAgIHJlamVjdChcbiAgICAgICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgIFwiSW52YWxpZCBBUEkga2V5LiBVc2UgJ0FJIENvbW1pdDogU2V0IEFQSSBLZXknIHRvIHVwZGF0ZSBpdC5cIlxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gNDI5KSB7XG4gICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICBcIlJhdGUgbGltaXRlZCBieSBNaXN0cmFsIEFQSS4gUGxlYXNlIHdhaXQgYSBtb21lbnQgYW5kIHRyeSBhZ2Fpbi5cIlxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICghcmVzLnN0YXR1c0NvZGUgfHwgcmVzLnN0YXR1c0NvZGUgPj0gNDAwKSB7XG4gICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICBgTWlzdHJhbCBBUEkgZXJyb3IgKCR7cmVzLnN0YXR1c0NvZGV9KTogJHtkYXRhLnNsaWNlKDAsIDUwMCl9YFxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGRhdGEpIGFzIE1pc3RyYWxSZXNwb25zZTtcblxuICAgICAgICAgICAgaWYgKCFwYXJzZWQuY2hvaWNlcyB8fCBwYXJzZWQuY2hvaWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgcmVqZWN0KFxuICAgICAgICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICAgIGBObyBjb21taXQgbWVzc2FnZSBnZW5lcmF0ZWQuIFJhdyByZXNwb25zZTogJHtkYXRhLnNsaWNlKDAsIDMwMCl9YFxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBjaG9pY2UgPSBwYXJzZWQuY2hvaWNlc1swXTtcbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBjaG9pY2UubWVzc2FnZT8uY29udGVudDtcblxuICAgICAgICAgICAgaWYgKCFtZXNzYWdlIHx8IG1lc3NhZ2UudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICByZWplY3QoXG4gICAgICAgICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgICAgYEFJIHJldHVybmVkIGVtcHR5IHRleHQuIGZpbmlzaFJlYXNvbjogJHtjaG9pY2UuZmluaXNoX3JlYXNvbn0uIFJhdzogJHtkYXRhLnNsaWNlKDAsIDMwMCl9YFxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBjbGVhbmVkTWVzc2FnZSA9IG1lc3NhZ2UudHJpbSgpLnJlcGxhY2UoL15gYGBcXHcqXFxuP3xgYGAkL2csIFwiXCIpLnRyaW0oKTtcbiAgICAgICAgICAgIHJlc29sdmUoY2xlYW5lZE1lc3NhZ2UpO1xuICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgcmVqZWN0KFxuICAgICAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgYEZhaWxlZCB0byBwYXJzZSBNaXN0cmFsIEFQSSByZXNwb25zZS4gUmF3OiAke2RhdGEuc2xpY2UoMCwgMzAwKX1gXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgcmVxLm9uKFwiZXJyb3JcIiwgKGVycikgPT4ge1xuICAgICAgY29uc3Qgbm9kZUVyciA9IGVyciBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb247XG4gICAgICBpZiAobm9kZUVyci5jb2RlID09PSBcIkVDT05OUkVGVVNFRFwiKSB7XG4gICAgICAgIHJlamVjdChcbiAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICBcIkNhbm5vdCByZWFjaCBNaXN0cmFsIEFQSSAoY29ubmVjdGlvbiByZWZ1c2VkKS4gQ2hlY2sgeW91ciBpbnRlcm5ldCBjb25uZWN0aW9uLlwiXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChub2RlRXJyLmNvZGUgPT09IFwiRU5PVEZPVU5EXCIgfHwgbm9kZUVyci5jb2RlID09PSBcIkVBSV9BR0FJTlwiKSB7XG4gICAgICAgIHJlamVjdChcbiAgICAgICAgICBuZXcgRXJyb3IoXG4gICAgICAgICAgICBcIkNhbm5vdCByZXNvbHZlIE1pc3RyYWwgQVBJIGhvc3QgKEROUyBlcnJvcikuIENoZWNrIHlvdXIgaW50ZXJuZXQgY29ubmVjdGlvbi5cIlxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAobm9kZUVyci5jb2RlID09PSBcIkVUSU1FRE9VVFwiIHx8IG5vZGVFcnIuY29kZSA9PT0gXCJFQ09OTlJFU0VUXCIpIHtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihcIkFQSSByZXF1ZXN0IHRpbWVkIG91dC4gQ2hlY2sgeW91ciBpbnRlcm5ldCBjb25uZWN0aW9uLlwiKSk7XG4gICAgICB9IGVsc2UgaWYgKG5vZGVFcnIuY29kZSA9PT0gXCJDRVJUX0hBU19FWFBJUkVEXCIgfHwgbm9kZUVyci5jb2RlID09PSBcIlVOQUJMRV9UT19WRVJJRllfTEVBRl9TSUdOQVRVUkVcIikge1xuICAgICAgICByZWplY3QoXG4gICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgXCJTU0wgY2VydGlmaWNhdGUgZXJyb3IgY29ubmVjdGluZyB0byBNaXN0cmFsIEFQSS4gWW91ciBzeXN0ZW0gY2xvY2sgbWF5IGJlIHdyb25nLlwiXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVqZWN0KFxuICAgICAgICAgIG5ldyBFcnJvcihcbiAgICAgICAgICAgIGBOZXR3b3JrIGVycm9yOiAke25vZGVFcnIubWVzc2FnZX0gKGNvZGU6ICR7bm9kZUVyci5jb2RlIHx8IFwibm9uZVwifSlgXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmVxLm9uKFwidGltZW91dFwiLCAoKSA9PiB7XG4gICAgICByZXEuZGVzdHJveSgpO1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcihcIkFQSSByZXF1ZXN0IHRpbWVkIG91dC4gQ2hlY2sgeW91ciBpbnRlcm5ldCBjb25uZWN0aW9uLlwiKSk7XG4gICAgfSk7XG5cbiAgICByZXEud3JpdGUoYm9keSk7XG4gICAgcmVxLmVuZCgpO1xuICB9KTtcbn1cbiIsCiAgICAiaW1wb3J0ICogYXMgdnNjb2RlIGZyb20gXCJ2c2NvZGVcIjtcblxuZXhwb3J0IHR5cGUgUHJvdmlkZXJJZCA9IFwiZ29vZ2xlXCIgfCBcIm1pc3RyYWxcIjtcblxuZXhwb3J0IGludGVyZmFjZSBQcm92aWRlciB7XG4gIGlkOiBQcm92aWRlcklkO1xuICBuYW1lOiBzdHJpbmc7XG4gIGFwaUtleUxhYmVsOiBzdHJpbmc7XG4gIGFwaUtleVBsYWNlaG9sZGVyOiBzdHJpbmc7XG4gIGFwaUtleVVybDogc3RyaW5nO1xuICBtb2RlbHM6IE1vZGVsSW5mb1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1vZGVsSW5mbyB7XG4gIGlkOiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IEdPT0dMRV9QUk9WSURFUjogUHJvdmlkZXIgPSB7XG4gIGlkOiBcImdvb2dsZVwiLFxuICBuYW1lOiBcIkdvb2dsZSAoR2VtaW5pKVwiLFxuICBhcGlLZXlMYWJlbDogXCJHb29nbGUgQUkgQVBJIEtleVwiLFxuICBhcGlLZXlQbGFjZWhvbGRlcjogXCJQYXN0ZSB5b3VyIEFQSSBrZXkgZnJvbSBHb29nbGUgQUkgU3R1ZGlvXCIsXG4gIGFwaUtleVVybDogXCJodHRwczovL2Fpc3R1ZGlvLmdvb2dsZS5jb20vYXBpa2V5XCIsXG4gIG1vZGVsczogW1xuICAgIHsgaWQ6IFwiZ2VtbWEtNC0zMWItaXRcIiwgbmFtZTogXCJnZW1tYS00LTMxYi1pdFwiIH0sXG4gICAgeyBpZDogXCJnZW1tYS00LTI2Yi1hNGItaXRcIiwgbmFtZTogXCJnZW1tYS00LTI2Yi1hNGItaXRcIiB9LFxuICBdLFxufTtcblxuZXhwb3J0IGNvbnN0IE1JU1RSQUxfUFJPVklERVI6IFByb3ZpZGVyID0ge1xuICBpZDogXCJtaXN0cmFsXCIsXG4gIG5hbWU6IFwiTWlzdHJhbCAoQ29kZXN0cmFsKVwiLFxuICBhcGlLZXlMYWJlbDogXCJNaXN0cmFsIEFQSSBLZXlcIixcbiAgYXBpS2V5UGxhY2Vob2xkZXI6IFwiUGFzdGUgeW91ciBBUEkga2V5IGZyb20gTWlzdHJhbCBDb25zb2xlXCIsXG4gIGFwaUtleVVybDogXCJodHRwczovL2NvbnNvbGUubWlzdHJhbC5haS9jb2Rlc3RyYWxcIixcbiAgbW9kZWxzOiBbXG4gICAgeyBpZDogXCJjb2Rlc3RyYWwtbGF0ZXN0XCIsIG5hbWU6IFwiQ29kZXN0cmFsIChMYXRlc3QpXCIgfSxcbiAgICB7IGlkOiBcImNvZGVzdHJhbC0yNTA1XCIsIG5hbWU6IFwiQ29kZXN0cmFsIDI1MDVcIiB9LFxuICBdLFxufTtcblxuZXhwb3J0IGNvbnN0IFBST1ZJREVSUzogUHJvdmlkZXJbXSA9IFtHT09HTEVfUFJPVklERVIsIE1JU1RSQUxfUFJPVklERVJdO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UHJvdmlkZXIoaWQ6IFByb3ZpZGVySWQpOiBQcm92aWRlciB8IHVuZGVmaW5lZCB7XG4gIHJldHVybiBQUk9WSURFUlMuZmluZCgocCkgPT4gcC5pZCA9PT0gaWQpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Q29uZmlndXJlZFByb3ZpZGVyKCk6IFByb21pc2U8UHJvdmlkZXI+IHtcbiAgY29uc3QgY29uZmlnID0gdnNjb2RlLndvcmtzcGFjZS5nZXRDb25maWd1cmF0aW9uKFwiYWlDb21taXRcIik7XG4gIGNvbnN0IHByb3ZpZGVySWQgPSBjb25maWcuZ2V0PFByb3ZpZGVySWQ+KFwicHJvdmlkZXJcIiwgXCJnb29nbGVcIik7XG4gIHJldHVybiBnZXRQcm92aWRlcihwcm92aWRlcklkISkgPz8gR09PR0xFX1BST1ZJREVSO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0UHJvdmlkZXIocHJvdmlkZXJJZDogUHJvdmlkZXJJZCk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBjb25maWcgPSB2c2NvZGUud29ya3NwYWNlLmdldENvbmZpZ3VyYXRpb24oXCJhaUNvbW1pdFwiKTtcbiAgYXdhaXQgY29uZmlnLnVwZGF0ZShcInByb3ZpZGVyXCIsIHByb3ZpZGVySWQsIHZzY29kZS5Db25maWd1cmF0aW9uVGFyZ2V0Lkdsb2JhbCk7XG59XG4iLAogICAgImltcG9ydCAqIGFzIHZzY29kZSBmcm9tIFwidnNjb2RlXCI7XG5pbXBvcnQgeyBQcm92aWRlcklkLCBnZXRQcm92aWRlciwgUFJPVklERVJTIH0gZnJvbSBcIi4uL2FpL3Byb3ZpZGVyc1wiO1xuXG5jb25zdCBTRUNSRVRfS0VZX1BSRUZJWCA9IFwiYWlDb21taXQuYXBpS2V5XCI7XG5cbmZ1bmN0aW9uIGdldFNlY3JldEtleShwcm92aWRlcklkOiBQcm92aWRlcklkKTogc3RyaW5nIHtcbiAgcmV0dXJuIGAke1NFQ1JFVF9LRVlfUFJFRklYfS4ke3Byb3ZpZGVySWR9YDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEFwaUtleShcbiAgY29udGV4dDogdnNjb2RlLkV4dGVuc2lvbkNvbnRleHQsXG4gIHByb3ZpZGVySWQ6IFByb3ZpZGVySWRcbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG4gIGNvbnN0IHNlY3JldEtleSA9IGdldFNlY3JldEtleShwcm92aWRlcklkKTtcbiAgY29uc3QgZnJvbVNlY3JldHMgPSBhd2FpdCBjb250ZXh0LnNlY3JldHMuZ2V0KHNlY3JldEtleSk7XG4gIGlmIChmcm9tU2VjcmV0cykge1xuICAgIHJldHVybiBmcm9tU2VjcmV0cztcbiAgfVxuICBjb25zdCBmcm9tQ29uZmlnID0gdnNjb2RlLndvcmtzcGFjZVxuICAgIC5nZXRDb25maWd1cmF0aW9uKFwiYWlDb21taXRcIilcbiAgICAuZ2V0PHN0cmluZz4oYGFwaUtleSR7cHJvdmlkZXJJZC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHByb3ZpZGVySWQuc2xpY2UoMSl9YCk7XG4gIGlmIChmcm9tQ29uZmlnKSB7XG4gICAgYXdhaXQgY29udGV4dC5zZWNyZXRzLnN0b3JlKHNlY3JldEtleSwgZnJvbUNvbmZpZyk7XG4gICAgcmV0dXJuIGZyb21Db25maWc7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHByb21wdEZvckFwaUtleShcbiAgY29udGV4dDogdnNjb2RlLkV4dGVuc2lvbkNvbnRleHQsXG4gIHByb3ZpZGVySWQ/OiBQcm92aWRlcklkXG4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuICBjb25zdCBwcm92aWRlciA9IHByb3ZpZGVySWRcbiAgICA/IGdldFByb3ZpZGVyKHByb3ZpZGVySWQpXG4gICAgOiBhd2FpdCBnZXRDdXJyZW50UHJvdmlkZXJXaXRoS2V5KGNvbnRleHQpO1xuXG4gIGlmICghcHJvdmlkZXIpIHtcbiAgICB2c2NvZGUud2luZG93LnNob3dFcnJvck1lc3NhZ2UoXCJObyBwcm92aWRlciBzZWxlY3RlZC5cIik7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuXG4gIGNvbnN0IHNlY3JldEtleSA9IGdldFNlY3JldEtleShwcm92aWRlci5pZCk7XG4gIGNvbnN0IGV4aXN0aW5nS2V5ID0gYXdhaXQgY29udGV4dC5zZWNyZXRzLmdldChzZWNyZXRLZXkpO1xuXG4gIHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+KChyZXNvbHZlKSA9PiB7XG4gICAgY29uc3QgaW5wdXRCb3ggPSB2c2NvZGUud2luZG93LmNyZWF0ZUlucHV0Qm94KCk7XG4gICAgaW5wdXRCb3gudGl0bGUgPSBgQUkgQ29tbWl0OiBFbnRlciAke3Byb3ZpZGVyIS5uYW1lfSBBUEkgS2V5YDtcbiAgICBpbnB1dEJveC5wbGFjZWhvbGRlciA9IHByb3ZpZGVyIS5hcGlLZXlQbGFjZWhvbGRlcjtcbiAgICBpbnB1dEJveC5wcm9tcHQgPSBgR2V0IGEgZnJlZSBBUEkga2V5IGF0ICR7cHJvdmlkZXIhLmFwaUtleVVybH1gO1xuICAgIGlucHV0Qm94LnBhc3N3b3JkID0gdHJ1ZTtcbiAgICBpbnB1dEJveC5pZ25vcmVGb2N1c091dCA9IHRydWU7XG4gICAgaW5wdXRCb3gudmFsdWUgPSBleGlzdGluZ0tleSB8fCBcIlwiO1xuXG4gICAgaW5wdXRCb3guYnV0dG9ucyA9IFtcbiAgICAgIHtcbiAgICAgICAgaWNvblBhdGg6IG5ldyB2c2NvZGUuVGhlbWVJY29uKFwibGluay1leHRlcm5hbFwiKSxcbiAgICAgICAgdG9vbHRpcDogYEdldCBBUEkgS2V5IGZyb20gJHtwcm92aWRlciEubmFtZX1gLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgaWNvblBhdGg6IG5ldyB2c2NvZGUuVGhlbWVJY29uKFwiaW5mb1wiKSxcbiAgICAgICAgdG9vbHRpcDogXCJIb3cgaXMgbXkga2V5IHN0b3JlZD9cIixcbiAgICAgIH0sXG4gICAgXTtcblxuICAgIGlucHV0Qm94Lm9uRGlkQ2hhbmdlVmFsdWUoKHZhbHVlKSA9PiB7XG4gICAgICBpZiAodmFsdWUudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBpbnB1dEJveC52YWxpZGF0aW9uTWVzc2FnZSA9IFwiQVBJIGtleSBjYW5ub3QgYmUgZW1wdHlcIjtcbiAgICAgIH0gZWxzZSBpZiAodmFsdWUudHJpbSgpLmxlbmd0aCA8IDEwKSB7XG4gICAgICAgIGlucHV0Qm94LnZhbGlkYXRpb25NZXNzYWdlID0gXCJBUEkga2V5IHNlZW1zIHRvbyBzaG9ydFwiO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW5wdXRCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpbnB1dEJveC5vbkRpZFRyaWdnZXJCdXR0b24oKGJ1dHRvbikgPT4ge1xuICAgICAgaWYgKGJ1dHRvbi50b29sdGlwID09PSBgR2V0IEFQSSBLZXkgZnJvbSAke3Byb3ZpZGVyIS5uYW1lfWApIHtcbiAgICAgICAgdnNjb2RlLmVudi5vcGVuRXh0ZXJuYWwodnNjb2RlLlVyaS5wYXJzZShwcm92aWRlciEuYXBpS2V5VXJsKSk7XG4gICAgICB9IGVsc2UgaWYgKGJ1dHRvbi50b29sdGlwID09PSBcIkhvdyBpcyBteSBrZXkgc3RvcmVkP1wiKSB7XG4gICAgICAgIHZzY29kZS53aW5kb3cuc2hvd0luZm9ybWF0aW9uTWVzc2FnZShcbiAgICAgICAgICBcIllvdXIgQVBJIGtleSBpcyBzdG9yZWQgc2VjdXJlbHkgdXNpbmcgVlNDb2RlJ3MgU2VjcmV0U3RvcmFnZS4gSXQncyBlbmNyeXB0ZWQgYW5kIG5ldmVyIHNoYXJlZC5cIixcbiAgICAgICAgICBcIk9LXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlucHV0Qm94Lm9uRGlkQWNjZXB0KGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gaW5wdXRCb3gudmFsdWUudHJpbSgpO1xuICAgICAgaWYgKHZhbHVlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgYXdhaXQgY29udGV4dC5zZWNyZXRzLnN0b3JlKHNlY3JldEtleSwgdmFsdWUpO1xuICAgICAgICB2c2NvZGUud2luZG93LnNob3dJbmZvcm1hdGlvbk1lc3NhZ2UoXG4gICAgICAgICAgYOKchSAke3Byb3ZpZGVyIS5uYW1lfSBBUEkga2V5IHNhdmVkIHNlY3VyZWx5IWBcbiAgICAgICAgKTtcbiAgICAgICAgaW5wdXRCb3guaGlkZSgpO1xuICAgICAgICByZXNvbHZlKHZhbHVlKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlucHV0Qm94Lm9uRGlkSGlkZSgoKSA9PiB7XG4gICAgICBpbnB1dEJveC5kaXNwb3NlKCk7XG4gICAgICByZXNvbHZlKHVuZGVmaW5lZCk7XG4gICAgfSk7XG5cbiAgICBpbnB1dEJveC5zaG93KCk7XG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRDdXJyZW50UHJvdmlkZXJXaXRoS2V5KFxuICBjb250ZXh0OiB2c2NvZGUuRXh0ZW5zaW9uQ29udGV4dFxuKTogUHJvbWlzZTx0eXBlb2YgUFJPVklERVJTW251bWJlcl0gfCB1bmRlZmluZWQ+IHtcbiAgY29uc3QgY29uZmlnID0gdnNjb2RlLndvcmtzcGFjZS5nZXRDb25maWd1cmF0aW9uKFwiYWlDb21taXRcIik7XG4gIGNvbnN0IHByb3ZpZGVySWQgPSBjb25maWcuZ2V0PFByb3ZpZGVySWQ+KFwicHJvdmlkZXJcIiwgXCJnb29nbGVcIik7XG5cbiAgY29uc3QgcHJvdmlkZXIgPSBnZXRQcm92aWRlcihwcm92aWRlcklkISk7XG4gIGlmICghcHJvdmlkZXIpIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG5cbiAgY29uc3QgYXBpS2V5ID0gYXdhaXQgZ2V0QXBpS2V5KGNvbnRleHQsIHByb3ZpZGVyLmlkKTtcbiAgaWYgKGFwaUtleSkge1xuICAgIHJldHVybiBwcm92aWRlcjtcbiAgfVxuXG4gIGZvciAoY29uc3QgcCBvZiBQUk9WSURFUlMpIHtcbiAgICBjb25zdCBrZXkgPSBhd2FpdCBnZXRBcGlLZXkoY29udGV4dCwgcC5pZCk7XG4gICAgaWYgKGtleSkge1xuICAgICAgcmV0dXJuIHA7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldE9yUHJvbXB0QXBpS2V5KFxuICBjb250ZXh0OiB2c2NvZGUuRXh0ZW5zaW9uQ29udGV4dCxcbiAgcHJvdmlkZXJJZDogUHJvdmlkZXJJZFxuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcbiAgbGV0IGFwaUtleSA9IGF3YWl0IGdldEFwaUtleShjb250ZXh0LCBwcm92aWRlcklkKTtcbiAgaWYgKCFhcGlLZXkpIHtcbiAgICBhcGlLZXkgPSBhd2FpdCBwcm9tcHRGb3JBcGlLZXkoY29udGV4dCwgcHJvdmlkZXJJZCk7XG4gIH1cbiAgcmV0dXJuIGFwaUtleTtcbn1cbiIsCiAgICAiaW1wb3J0ICogYXMgdnNjb2RlIGZyb20gXCJ2c2NvZGVcIjtcblxuaW50ZXJmYWNlIEdpdEFQSSB7XG4gIHJlcG9zaXRvcmllczogUmVwb3NpdG9yeVtdO1xufVxuXG5pbnRlcmZhY2UgUmVwb3NpdG9yeSB7XG4gIHJvb3RVcmk6IHZzY29kZS5Vcmk7XG4gIGlucHV0Qm94OiB7IHZhbHVlOiBzdHJpbmcgfTtcbiAgc3RhdGU6IFJlcG9zaXRvcnlTdGF0ZTtcbiAgYWRkKHBhdGhzOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD47XG4gIGNvbW1pdChtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuICBkaWZmKGNhY2hlZD86IGJvb2xlYW4pOiBQcm9taXNlPHN0cmluZz47XG59XG5cbmludGVyZmFjZSBSZXBvc2l0b3J5U3RhdGUge1xuICBpbmRleENoYW5nZXM6IENoYW5nZVtdO1xuICB3b3JraW5nVHJlZUNoYW5nZXM6IENoYW5nZVtdO1xufVxuXG5pbnRlcmZhY2UgQ2hhbmdlIHtcbiAgdXJpOiB2c2NvZGUuVXJpO1xuICBzdGF0dXM6IG51bWJlcjtcbn1cblxubGV0IGdpdEFwaUNhY2hlOiBHaXRBUEkgfCB1bmRlZmluZWQ7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRHaXRBUEkoKTogUHJvbWlzZTxHaXRBUEkgfCB1bmRlZmluZWQ+IHtcbiAgaWYgKGdpdEFwaUNhY2hlKSB7XG4gICAgcmV0dXJuIGdpdEFwaUNhY2hlO1xuICB9XG4gIGNvbnN0IGV4dCA9IHZzY29kZS5leHRlbnNpb25zLmdldEV4dGVuc2lvbihcInZzY29kZS5naXRcIik7XG4gIGlmICghZXh0KSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuICBpZiAoIWV4dC5pc0FjdGl2ZSkge1xuICAgIGF3YWl0IGV4dC5hY3RpdmF0ZSgpO1xuICB9XG4gIGdpdEFwaUNhY2hlID0gZXh0LmV4cG9ydHMuZ2V0QVBJKDEpO1xuICByZXR1cm4gZ2l0QXBpQ2FjaGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXBvc2l0b3J5KGdpdDogR2l0QVBJKTogUmVwb3NpdG9yeSB8IHVuZGVmaW5lZCB7XG4gIGlmIChnaXQucmVwb3NpdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIGdpdC5yZXBvc2l0b3JpZXNbMF07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdGFnZUFsbENoYW5nZXMocmVwbzogUmVwb3NpdG9yeSk6IFByb21pc2U8bnVtYmVyPiB7XG4gIGNvbnN0IHVuc3RhZ2VkID0gcmVwby5zdGF0ZS53b3JraW5nVHJlZUNoYW5nZXM7XG4gIGlmICh1bnN0YWdlZC5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gMDtcbiAgfVxuICBjb25zdCBwYXRocyA9IHVuc3RhZ2VkLm1hcCgoY2hhbmdlKSA9PiBjaGFuZ2UudXJpLmZzUGF0aCk7XG4gIGF3YWl0IHJlcG8uYWRkKHBhdGhzKTtcbiAgcmV0dXJuIHBhdGhzLmxlbmd0aDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc0FueUNoYW5nZXMocmVwbzogUmVwb3NpdG9yeSk6IGJvb2xlYW4ge1xuICByZXR1cm4gKFxuICAgIHJlcG8uc3RhdGUuaW5kZXhDaGFuZ2VzLmxlbmd0aCA+IDAgfHxcbiAgICByZXBvLnN0YXRlLndvcmtpbmdUcmVlQ2hhbmdlcy5sZW5ndGggPiAwXG4gICk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRTdGFnZWREaWZmKHJlcG86IFJlcG9zaXRvcnkpOiBQcm9taXNlPHN0cmluZz4ge1xuICByZXR1cm4gcmVwby5kaWZmKHRydWUpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tbWl0KHJlcG86IFJlcG9zaXRvcnksIG1lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBhd2FpdCByZXBvLmNvbW1pdChtZXNzYWdlKTtcbn1cbiIsCiAgICAiaW1wb3J0ICogYXMgdnNjb2RlIGZyb20gXCJ2c2NvZGVcIjtcbmltcG9ydCB7IHJlZ2lzdGVyQ29tbWFuZHMgfSBmcm9tIFwiLi9jb21tYW5kc1wiO1xuXG5leHBvcnQgZnVuY3Rpb24gYWN0aXZhdGUoY29udGV4dDogdnNjb2RlLkV4dGVuc2lvbkNvbnRleHQpIHtcbiAgcmVnaXN0ZXJDb21tYW5kcyhjb250ZXh0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlYWN0aXZhdGUoKSB7fVxuIgogIF0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBd0IsSUFBeEI7OztBQ0F1QixJQUF2QjtBQUVBLElBQU0sV0FBVztBQUNqQixJQUFNLFdBQVc7QUEwRWpCLGVBQXNCLHFCQUFxQixDQUN6QyxPQUNBLFFBQ0EsY0FDQSxNQUNpQjtBQUFBLEVBQ2pCLE1BQU0sT0FBTyxLQUFLLFVBQVU7QUFBQSxJQUMxQixtQkFBbUI7QUFBQSxNQUNqQixPQUFPLENBQUMsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUFBLElBQ2hDO0FBQUEsSUFDQSxVQUFVO0FBQUEsTUFD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
