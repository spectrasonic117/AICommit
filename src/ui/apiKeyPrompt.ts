import * as vscode from "vscode";
import { ProviderId, getProvider, PROVIDERS } from "../ai/providers";

const SECRET_KEY_PREFIX = "aiCommit.apiKey";

function getSecretKey(providerId: ProviderId): string {
  return `${SECRET_KEY_PREFIX}.${providerId}`;
}

export async function getApiKey(
  context: vscode.ExtensionContext,
  providerId: ProviderId
): Promise<string | undefined> {
  const secretKey = getSecretKey(providerId);
  const fromSecrets = await context.secrets.get(secretKey);
  if (fromSecrets) {
    return fromSecrets;
  }
  const fromConfig = vscode.workspace
    .getConfiguration("aiCommit")
    .get<string>(`apiKey${providerId.charAt(0).toUpperCase() + providerId.slice(1)}`);
  if (fromConfig) {
    await context.secrets.store(secretKey, fromConfig);
    return fromConfig;
  }
  return undefined;
}

export async function promptForApiKey(
  context: vscode.ExtensionContext,
  providerId?: ProviderId
): Promise<string | undefined> {
  const provider = providerId
    ? getProvider(providerId)
    : await getCurrentProviderWithKey(context);

  if (!provider) {
    vscode.window.showErrorMessage("No provider selected.");
    return undefined;
  }

  const secretKey = getSecretKey(provider.id);
  const existingKey = await context.secrets.get(secretKey);

  return new Promise<string | undefined>((resolve) => {
    const inputBox = vscode.window.createInputBox();
    inputBox.title = `AI Commit: Enter ${provider!.name} API Key`;
    inputBox.placeholder = provider!.apiKeyPlaceholder;
    inputBox.prompt = `Get a free API key at ${provider!.apiKeyUrl}`;
    inputBox.password = true;
    inputBox.ignoreFocusOut = true;
    inputBox.value = existingKey || "";

    inputBox.buttons = [
      {
        iconPath: new vscode.ThemeIcon("link-external"),
        tooltip: `Get API Key from ${provider!.name}`,
      },
      {
        iconPath: new vscode.ThemeIcon("info"),
        tooltip: "How is my key stored?",
      },
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
      if (button.tooltip === `Get API Key from ${provider!.name}`) {
        vscode.env.openExternal(vscode.Uri.parse(provider!.apiKeyUrl));
      } else if (button.tooltip === "How is my key stored?") {
        vscode.window.showInformationMessage(
          "Your API key is stored securely using VSCode's SecretStorage. It's encrypted and never shared.",
          "OK"
        );
      }
    });

    inputBox.onDidAccept(async () => {
      const value = inputBox.value.trim();
      if (value.length > 0) {
        await context.secrets.store(secretKey, value);
        vscode.window.showInformationMessage(
          `✅ ${provider!.name} API key saved securely!`
        );
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

async function getCurrentProviderWithKey(
  context: vscode.ExtensionContext
): Promise<typeof PROVIDERS[number] | undefined> {
  const config = vscode.workspace.getConfiguration("aiCommit");
  const providerId = config.get<ProviderId>("provider", "google");

  const provider = getProvider(providerId!);
  if (!provider) {
    return undefined;
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

  return undefined;
}

export async function getOrPromptApiKey(
  context: vscode.ExtensionContext,
  providerId: ProviderId
): Promise<string | undefined> {
  let apiKey = await getApiKey(context, providerId);
  if (!apiKey) {
    apiKey = await promptForApiKey(context, providerId);
  }
  return apiKey;
}
