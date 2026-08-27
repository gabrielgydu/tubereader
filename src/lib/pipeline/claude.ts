import { spawn } from "child_process";

/**
 * Run the claude CLI with stdin input and return stdout.
 * Used by the summarize and format pipeline stages.
 */
export function runClaude(opts: {
  systemPrompt: string;
  input: string;
  json?: boolean;
  timeoutMs?: number;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["-p", "-", "--model", "sonnet"];
    if (opts.json) args.push("--output-format", "json");
    args.push("--system-prompt", opts.systemPrompt);

    const proc = spawn("claude", args, { timeout: opts.timeoutMs ?? 300_000 });

    const chunks: Buffer[] = [];
    proc.stdout.on("data", (d) => chunks.push(d));

    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d));

    proc.on("close", (code) => {
      const stdout = Buffer.concat(chunks).toString();
      if (stdout.trim()) resolve(stdout);
      else reject(new Error(`claude exited ${code}: ${stderr.slice(-500)}`));
    });
    proc.on("error", reject);

    proc.stdin.write(opts.input);
    proc.stdin.end();
  });
}
