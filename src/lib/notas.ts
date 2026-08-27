import os from "os";
import path from "path";

/**
 * Links into notas (`~/development/notas`), a local markdown reader served at
 * http://notas/. Every finished video is already mirrored as a markdown file,
 * so the mirror can be handed to a reader built for long-form markdown instead
 * of being read through this app.
 */

// The hostname is an /etc/hosts alias on the machine notas runs on, so the
// link only resolves there — set this when tubeReader is reached from
// elsewhere (over the tailnet, say) and notas is published under another name.
function notasBase(): string {
  return (process.env.TUBEREADER_NOTAS_URL || "http://notas").replace(
    /\/+$/,
    ""
  );
}

/**
 * Reader URL for a markdown file, or null when notas cannot serve it.
 *
 * Notas addresses a file as `#/p/<project>/<path inside that project>`. The
 * markdown mirrors live outside every configured project, so they go through
 * the built-in `~` project, whose root is $HOME — which also means a file
 * outside $HOME has no URL at all. The reader splits the hash on "/" and
 * decodes each segment, so every segment is encoded on the way out.
 */
export function notasUrl(filePath: string): string | null {
  const rel = path.relative(os.homedir(), path.resolve(filePath));
  if (!rel || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    return null;
  }
  const segments = rel.split(path.sep).map(encodeURIComponent).join("/");
  return `${notasBase()}/#/p/~/${segments}`;
}
