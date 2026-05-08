import * as vscode from "vscode";

const SECRET_KEY = "aiCommit.apiKey";

export async function getApiKey(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  const fromSecrets = await context.secrets.get(SECRET_KEY);
  if (fromSecrets) {
    return fromSecrets;
  }
  const fromConfig = vscode.workspace
    .getConfiguration("aiCommit")
    .get<string>("apiKey");
  if (fromConfig) {
    await context.secrets.store(SECRET_KEY, fromConfig);
    return fromConfig;
  }
  return undefined;
}

export async function promptForApiKey(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  const existingKey = await context.secrets.get(SECRET_KEY);

  return new Promise<string | undefined>((resolve) => {
    const inputBox = vscode.window.createInputBox();
    inputBox.title = "AI Commit: Enter Gemini API Key";
    inputBox.placeholder = "Paste your API key from Google AI Studio";
    inputBox.prompt =
      "Get a free API key at https://aistudio.google.com/apikey";
    inputBox.password = true;
    inputBox.ignoreFocusOut = true;
    inputBox.value = existingKey || "";

    inputBox.buttons = [
      {
        iconPath: new vscode.ThemeIcon("link-external"),
        tooltip: "Get API Key from Google AI Studio",
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
      if (button.tooltip === "Get API Key from Google AI Studio") {
        vscode.env.openExternal(
          vscode.Uri.parse("https://aistudio.google.com/apikey")
        );
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
        await context.secrets.store(SECRET_KEY, value);
        vscode.window.showInformationMessage(
          "✅ Gemini API key saved securely!"
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
