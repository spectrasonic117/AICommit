import * as https from "node:https";

const API_HOST = "codestral.mistral.ai";
const API_PATH = "/v1/chat/completions";

interface MistralMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface MistralResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function generateCommitMessage(
  model: string,
  apiKey: string,
  systemPrompt: string,
  diff: string
): Promise<string> {
  const messages: MistralMessage[] = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  messages.push({
    role: "user",
    content: `Generate a commit message for the following git diff:\n\n\`\`\`diff\n${diff}\n\`\`\``,
  });

  const body = JSON.stringify({
    model,
    messages,
    temperature: 0.2,
    max_tokens: 150,
  });

  return new Promise<string>((resolve, reject) => {
    const req = https.request(
      {
        hostname: API_HOST,
        path: API_PATH,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
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
                "Rate limited by Mistral API. Please wait a moment and try again."
              )
            );
            return;
          }

          if (!res.statusCode || res.statusCode >= 400) {
            reject(
              new Error(
                `Mistral API error (${res.statusCode}): ${data.slice(0, 500)}`
              )
            );
            return;
          }

          try {
            const parsed = JSON.parse(data) as MistralResponse;

            if (!parsed.choices || parsed.choices.length === 0) {
              reject(
                new Error(
                  `No commit message generated. Raw response: ${data.slice(0, 300)}`
                )
              );
              return;
            }

            const choice = parsed.choices[0];
            const message = choice.message?.content;

            if (!message || message.trim().length === 0) {
              reject(
                new Error(
                  `AI returned empty text. finishReason: ${choice.finish_reason}. Raw: ${data.slice(0, 300)}`
                )
              );
              return;
            }

            resolve(message.trim());
          } catch {
            reject(
              new Error(
                `Failed to parse Mistral API response. Raw: ${data.slice(0, 300)}`
              )
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
            "Cannot reach Mistral API (connection refused). Check your internet connection."
          )
        );
      } else if (nodeErr.code === "ENOTFOUND" || nodeErr.code === "EAI_AGAIN") {
        reject(
          new Error(
            "Cannot resolve Mistral API host (DNS error). Check your internet connection."
          )
        );
      } else if (nodeErr.code === "ETIMEDOUT" || nodeErr.code === "ECONNRESET") {
        reject(new Error("API request timed out. Check your internet connection."));
      } else if (nodeErr.code === "CERT_HAS_EXPIRED" || nodeErr.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
        reject(
          new Error(
            "SSL certificate error connecting to Mistral API. Your system clock may be wrong."
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
