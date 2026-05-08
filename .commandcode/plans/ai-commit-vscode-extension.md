# AICommit VSCode Extension — Implementation Plan

## Overview

VSCode extension que usa la API de Google Generative Language para generar mensajes de commit mediante IA. Un botón en el panel de Source Control stagea archivos, genera el mensaje con IA y hace commit (sin push).

## Tech Stack

- **Runtime de la extensión**: Node.js (Electron Extension Host — obligatorio)
- **Runtime de desarrollo**: Bun (build, install, watch, type-check)
- **Lenguaje**: TypeScript strict mode
- **Build**: `bun build --target node --format cjs --external vscode`
- **Package manager**: Bun

## Estructura del Proyecto

```
AICommit/
├── .vscode/
│   ├── launch.json              # Debug config para F5
│   └── tasks.json               # Build task
├── src/
│   ├── extension.ts             # activate() / deactivate()
│   ├── commands.ts              # Registro de comandos
│   ├── ai/
│   │   └── gemini.ts            # Cliente API Gemini (fetch)
│   ├── git/
│   │   └── operations.ts        # Stage, diff, commit via Git API
│   └── ui/
│       └── apiKeyPrompt.ts      # InputBox para API key
├── package.json                 # Manifest (commands, menus, configuration)
├── tsconfig.json                # Solo para type-checking (tsc --noEmit)
├── .vscodeignore                # Excluir src, node_modules, etc. del .vsix
└── README.md
```

## API de Gemini

- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent`
- **Auth**: Header `x-goog-api-key` o query param `?key=`
- **System prompt**: Campo `systemInstruction.parts[].text` (nativo de Gemini)
- **User content**: `contents[].parts[].text` con el diff
- **Modelos**: `gemma-4-31b`, `gemma-4-26b`
- **Response**: `candidates[0].content.parts[0].text`

```typescript
// Request body
{
  systemInstruction: {
    parts: [{ text: "You are a commit message generator..." }]
  },
  contents: [{
    role: "user",
    parts: [{ text: "Generate a commit for:\n" + diff }]
  }],
  generationConfig: {
    temperature: 0.2,
    maxOutputTokens: 150,
    stopSequences: ["\n\n"]
  }
}
```

## package.json — Manifest

### activationEvents
- `"onStartupFinished"` — para restaurar API key y escuchar eventos

### commands
1. `aiCommit.generateCommit` — Stage + generar + commit
2. `aiCommit.selectModel` — QuickPick entre los dos modelos
3. `aiCommit.setApiKey` — Cambiar API key

### menus
- `"scm/title"` → Botón principal "🤖 AI Commit" con `when: scmProvider == git`
- `"commandPalette"` → Todos los comandos visibles

### configuration
| Property                | Type   | Default                 | Description                                    |
| ----------------------- | ------ | ----------------------- | ---------------------------------------------- |
| `aiCommit.model`        | string | `"gemma-4-31b"`         | Modelo a usar (enum: gemma-4-31b, gemma-4-26b) |
| `aiCommit.systemPrompt` | string | placeholder por defecto | System prompt personalizado                    |
| `aiCommit.apiKey`       | string | `""`                    | API key (también se guarda en Secrets)         |

### System prompt por defecto (placeholder)
```
You are an expert developer that generates concise, conventional commit messages following the Conventional Commits specification. Rules:
- Format: type(scope): description
- Types: feat, fix, refactor, docs, test, chore, style, perf
- Keep the first line under 72 characters
- Be specific about WHAT changed, not HOW
- Return ONLY the commit message, no explanations, no markdown fences.
```

## Flujo del Botón "AI Commit"

1. **Obtener repositorio Git** → `vscode.extensions.getExtension('vscode.git')?.exports.getAPI(1)`
2. **Validar cambios** → Si no hay cambios (staged + unstaged), mostrar warning
3. **Verificar API key** → Leer de `context.secrets`. Si no existe, mostrar `apiKeyPrompt` y esperar
4. **Stagear todos los cambios** → `repo.add(unstagedFiles.map(f => f.uri.fsPath))`
5. **Obtener diff** → `repo.diff(true)` (staged changes)
6. **Llamar a Gemini** → Enviar system prompt + diff, recibir mensaje
7. **Mostrar mensaje** → `repo.inputBox.value = generatedMessage` (el usuario lo ve y puede editarlo)
8. **Commit automático** → `repo.commit(generatedMessage)` (sin push, sin `--all`)
9. **Notificar** → `vscode.window.showInformationMessage('✅ Committed: ' + message)`

## Archivos Clave a Implementar

### 1. `src/ai/gemini.ts`
Función `generateCommitMessage(model, apiKey, systemPrompt, diff): Promise<string>`:
- Construir request body con systemInstruction + contents
- POST al endpoint con header `x-goog-api-key`
- Parsear `candidates[0].content.parts[0].text`
- Manejar errores (401, 429, bloqueos de seguridad, respuesta vacía)
- Timeout de 15 segundos

### 2. `src/git/operations.ts`
- `getGitRepo()` — obtiene el primer repositorio git activo
- `stageAllChanges(repo)` — stagea todos los working tree changes
- `getStagedDiff(repo)` — obtiene diff de cambios staged
- `commit(repo, message)` — hace commit

### 3. `src/ui/apiKeyPrompt.ts`
- Función `promptForApiKey(context): Promise<string | undefined>`
- Usa `vscode.window.createInputBox()` con `password: true`
- Validación mínima (no vacío, longitud > 10)
- Guarda en `context.secrets.store('aiCommit.apiKey', value)`
- Botones: link a Google AI Studio para obtener key, botón info

### 4. `src/commands.ts`
- `registerCommands(context)` registra todos los comandos
- `handleGenerateCommit(context)` — orquesta el flujo completo
- `handleSelectModel(context)` — `vscode.window.showQuickPick` con los dos modelos
- `handleSetApiKey(context)` — llama a `promptForApiKey`

### 5. `src/extension.ts`
- `activate(context)` — registra comandos, verifica si hay API key guardada
- `deactivate()` — cleanup

## Configuración de Bun

### `package.json` scripts
```json
{
  "scripts": {
    "vscode:prepublish": "bun run compile",
    "compile": "bun build ./src/extension.ts --outfile ./out/extension.js --target node --format cjs --external vscode --sourcemap=inline",
    "watch": "bun build ./src/extension.ts --outfile ./out/extension.js --target node --format cjs --external vscode --sourcemap=inline --watch",
    "typecheck": "tsc --noEmit",
    "package": "vsce package --no-yarn"
  }
}
```

### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "out",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "out"]
}
```

### Dependencies
```json
{
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@vscode/vsce": "latest",
    "typescript": "^5.4.0"
  },
  "engines": {
    "vscode": "^1.85.0"
  }
}
```
(Solo `devDependencies` — `vscode` API es runtime-provided, y usamos `fetch` nativo de Node 18+ para la API)

## Manejo de Errores

| Error            | Manejo                                                                         |
| ---------------- | ------------------------------------------------------------------------------ |
| No git repo      | `window.showWarningMessage('No git repository found')`                         |
| No changes       | `window.showWarningMessage('No changes to commit')`                            |
| No API key       | Mostrar `promptForApiKey`, reintentar                                          |
| 401 Unauthorized | `showErrorMessage('Invalid API key. Use "AI Commit: Set API Key" to update.')` |
| 429 Rate limited | Esperar Retry-After header, reintentar una vez                                 |
| Empty response   | `showErrorMessage('AI returned no message. Try with fewer changes.')`          |
| Network error    | `showErrorMessage('Failed to reach API. Check your connection.')`              |

## Verificación

Para probar la extensión:
1. `bun install` — instalar dependencias
2. `bun run compile` — build inicial
3. F5 en VSCode → abre Extension Development Host
4. Abrir carpeta con repo git y cambios sin commit
5. Presionar botón "🤖 AI Commit" en SCM
6. Verificar que: stagea archivos → genera mensaje → hace commit
7. Probar comando "AI Commit: Select Model" para cambiar modelo
8. Probar comando "AI Commit: Set API Key" para cambiar key
9. Verificar que NO hace push

## Orden de Implementación

1. Inicializar proyecto: `package.json`, `tsconfig.json`, `.vscode/`
2. `src/ai/gemini.ts` — cliente API
3. `src/git/operations.ts` — wrapper de Git API
4. `src/ui/apiKeyPrompt.ts` — prompt de API key
5. `src/commands.ts` — registro de comandos + handlers
6. `src/extension.ts` — entry point
7. Probar, ajustar, empaquetar
