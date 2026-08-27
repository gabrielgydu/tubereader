import { Suspense } from "react";
import { ShareIngest } from "./share-ingest";

export const metadata = { title: "Add to tubeReader" };

/**
 * Landing page for shared links.
 *
 * Reached two ways: the manifest's `share_target` on Android/Chrome, and — on
 * iOS, which has no Web Share Target support — an iOS Shortcut that opens
 * `<origin>/share?url=<shared link>` (see README).
 */
export default function SharePage() {
  return (
    <div className="mx-auto max-w-xl space-y-6 p-4 md:p-6">
      <h1 className="text-xl font-bold md:text-2xl">Add to tubeReader</h1>
      {/* useSearchParams needs a Suspense boundary to keep the rest of the
          route statically renderable. */}
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Reading link…</p>}
      >
        <ShareIngest />
      </Suspense>
    </div>
  );
}
