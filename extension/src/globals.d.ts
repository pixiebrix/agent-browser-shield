// Build-time defines injected by `build.ts` via Bun's `define:` substitute
// concrete strings for `process.env.X` references in the bundle. Typing them
// via `NodeJS.ProcessEnv` augmentation keeps `process` itself fully typed
// (so `process.argv` / `process.env[name]` in build.ts still work).

declare namespace NodeJS {
  interface ProcessEnv {
    OPENAI_API_KEY: string;
    HAS_BUILT_IN_OPENAI_KEY: string;
    // JSON-stringified Partial<Record<RuleId, boolean>>. Empty `"{}"` when no
    // build-time defaults override file is supplied.
    EXTENSION_DEFAULT_OVERRIDES: string;
    // Build-time default for the floating on-page options button. Literal
    // `"true"` / `"false"` to force a value, or empty string when the
    // defaults file did not set `optionsButton`.
    EXTENSION_OPTIONS_BUTTON_DEFAULT: string;
  }
}
