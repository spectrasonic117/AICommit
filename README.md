# AI Commit

Generate git commit messages using Google Gemini AI. Stage, generate, and commit with one click.

## Features

- **One-click commit**: Button in Source Control panel stages all changes, generates a commit message via AI, and commits
- **Conventional Commits**: Messages follow the Conventional Commits specification (feat, fix, refactor, etc.)
- **Customizable**: Set your own system prompt to control how messages are generated
- **Multiple models**: Supports gemma-4-31b and gemma-4-26b
- **Secure**: API key stored in VSCode SecretStorage
- **No push**: Only commits locally — never pushes to remote

## Setup

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
3. Run **"AI Commit: Set API Key"** and paste your key
4. _(Optional)_ Customize the system prompt in Settings → AI Commit → System Prompt

## Usage

Open a git repository with changes, then either:

- Click the **🤖 AI Commit** button in the Source Control panel title bar
- Or run **"Generate AI Commit"** from the Command Palette

The extension will:
1. Stage all unstaged changes
2. Send the diff to Gemini AI
3. Generate a conventional commit message
4. Commit with that message

## Commands

| Command | Description |
|---|---|
| `AI Commit: Set API Key` | Set or update your Gemini API key |
| `AI Commit: Select Model` | Choose between gemma-4-31b and gemma-4-26b |
| `Generate AI Commit` | Stage, generate message, and commit (also available as SCM button) |

## Settings

| Setting | Default | Description |
|---|---|---|
| `aiCommit.model` | `gemma-4-31b` | Model to use for generation |
| `aiCommit.systemPrompt` | Conventional Commits prompt | Custom system prompt for the AI |
| `aiCommit.apiKey` | _(empty)_ | API key (set via command for secure storage) |
