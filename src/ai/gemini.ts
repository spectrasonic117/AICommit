import * as https from "node:https";

const API_HOST = "generativelanguage.googleapis.com";
const API_PATH = "/v1beta/models/";

interface ModelInfo {
  name: string;
  displayName: string;
  supportedGenerationMethods: string[];
}

interface ListModelsResponse {
  models: ModelInfo[];
}

export async function listAvailableModels(
  apiKey: string
): Promise<ModelInfo[]> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: API_HOST,
        path: "/v1beta/models",
        method: "GET",
        headers: {
          "x-goog-api-key": apiKey,
        },
        timeout: 10000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data) as ListModelsResponse;
              resolve(parsed.models || []);
            } catch {
              reject(new Error("Failed to parse model list."));
            }
          } else {
            reject(
              new Error(
                `Failed to list models (${res.statusCode}): ${data}`
              )
            );
          }
        });
      }
    );

    req.on("error", (err: NodeJS.ErrnoException) => {
      reject(new Error(`Network error: ${err.message}`));
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out."));
    });

    req.end();
  });
}

interface GeminiResponse {
  candidates?: {
    content: {
      role: string;
      parts: { text: string; thought?: boolean }[];
    };
    finishReason: string;
  }[];
  promptFeedback?: {
    blockReason: string;
  };
}

export async function generateCommitMessage(
  model: string,
  apiKey: string,
  systemPrompt: string,
  diff: string
): Promise<string> {
  const body = JSON.stringify({
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Generate a commit message for the following git diff:\n\n\`\`\`diff\n${diff}\n\`\`\``,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 150,
      topP: 0.95,
    },
  });

  return new Promise<string>((resolve, reject) => {
    const req = https.request(
      {
        hostname: API_HOST,
        path: `${API_PATH}${model}:generateContent`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
          "Content-Length": Buffer.byteLength(body).toString(),
        },
        timeout: 15000,
      },
      (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode === 401) {
            reject(
              new Error(
                "Invalid API key. Use 'AI Commit: Set API Key' to update it."
              )
            );
            return;
          }

          if (res.statusCode === 429) {
            reject(
              new Error(
                "Rate limited by Gemini API. Please wait a moment and try again."
              )
            );
            return;
          }

          if (!res.statusCode || res.statusCode >= 400) {
            reject(
              new Error(
                `Gemini API error (${res.statusCode}): ${data.slice(0, 500)}`
              )
            );
            return;
          }

          try {
            const parsed = JSON.parse(data) as GeminiResponse;

            if (!parsed.candidates || parsed.candidates.length === 0) {
              if (parsed.promptFeedback?.blockReason) {
                reject(
                  new Error(
                    `Content blocked: ${parsed.promptFeedback.blockReason}`
                  )
                );
              } else {
                reject(
                  new Error(
                    `No commit message generated. Raw response: ${data.slice(0, 300)}`
                  )
                );
              }
              return;
            }

            const candidate = parsed.candidates[0];
            const parts = candidate.content?.parts;
            if (!parts || parts.length === 0) {
              reject(
                new Error(
                  `AI returned no parts. finishReason: ${candidate.finishReason}. Raw: ${data.slice(0, 300)}`
                )
              );
              return;
            }

            // Gemma models return a "thought" part first, then the actual response.
            // Find the first non-thought part with text.
            const textPart = parts.find((p) => !p.thought && p.text?.trim());
            const text = textPart?.text ?? parts[parts.length - 1]?.text;

            if (!text || text.trim().length === 0) {
              reject(
                new Error(
                  `AI returned empty text. finishReason: ${candidate.finishReason}. Raw: ${data.slice(0, 300)}`
                )
              );
              return;
            }

            resolve(text.trim());
          } catch {
            reject(
              new Error(`Failed to parse Gemini API response. Raw: ${data.slice(0, 300)}`)
            );
          }
        });
      }
    );

    req.on("error", (err) => {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === "ECONNREFUSED") {
        reject(
          new Error(
            "Cannot reach Google API (connection refused). Check your internet connection."
          )
        );
      } else if (nodeErr.code === "ENOTFOUND" || nodeErr.code === "EAI_AGAIN") {
        reject(
          new Error(
            "Cannot resolve Google API host (DNS error). Check your internet connection."
          )
        );
      } else if (nodeErr.code === "ETIMEDOUT" || nodeErr.code === "ECONNRESET") {
        reject(
          new Error("API request timed out. Check your internet connection.")
        );
      } else if (nodeErr.code === "CERT_HAS_EXPIRED" || nodeErr.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
        reject(
          new Error(
            "SSL certificate error connecting to Google API. Your system clock may be wrong."
          )
        );
      } else {
        reject(
          new Error(
            `Network error: ${nodeErr.message} (code: ${nodeErr.code || "none"})`
          )
        );
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
