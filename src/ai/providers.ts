import * as vscode from "vscode";

export type ProviderId = "google" | "mistral";

export interface Provider {
  id: ProviderId;
  name: string;
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  apiKeyUrl: string;
  models: ModelInfo[];
}

export interface ModelInfo {
  id: string;
  name: string;
}

export const GOOGLE_PROVIDER: Provider = {
  id: "google",
  name: "Google (Gemini)",
  apiKeyLabel: "Google AI API Key",
  apiKeyPlaceholder: "Paste your API key from Google AI Studio",
  apiKeyUrl: "https://aistudio.google.com/apikey",
  models: [
    { id: "gemma-4-31b-it", name: "gemma-4-31b-it" },
    { id: "gemma-4-26b-a4b-it", name: "gemma-4-26b-a4b-it" },
  ],
};

export const MISTRAL_PROVIDER: Provider = {
  id: "mistral",
  name: "Mistral (Codestral)",
  apiKeyLabel: "Mistral API Key",
  apiKeyPlaceholder: "Paste your API key from Mistral Console",
  apiKeyUrl: "https://console.mistral.ai/codestral",
  models: [
    { id: "codestral-latest", name: "Codestral (Latest)" },
    { id: "codestral-2505", name: "Codestral 2505" },
  ],
};

export const PROVIDERS: Provider[] = [GOOGLE_PROVIDER, MISTRAL_PROVIDER];

export function getProvider(id: ProviderId): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export async function getConfiguredProvider(): Promise<Provider> {
  const config = vscode.workspace.getConfiguration("aiCommit");
  const providerId = config.get<ProviderId>("provider", "google");
  return getProvider(providerId!) ?? GOOGLE_PROVIDER;
}

export async function setProvider(providerId: ProviderId): Promise<void> {
  const config = vscode.workspace.getConfiguration("aiCommit");
  await config.update("provider", providerId, vscode.ConfigurationTarget.Global);
}
