import { unlinkSync, existsSync } from "fs";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { VOCABULARIES, isVocabularyName } from "../vocabulary";
import { transcribeWithStt } from "./stt";

export async function transcribeAudio(
  videoId: number,
  audioPath: string
): Promise<void> {
  const video = db
    .select()
    .from(schema.videos)
    .where(eq(schema.videos.id, videoId))
    .get();

  if (!video) throw new Error(`Video ${videoId} not found`);

  db.update(schema.videos)
    .set({ status: "transcribing" })
    .where(eq(schema.videos.id, videoId))
    .run();

  try {
    // stt picks the provider and holds its key; see ./stt for what it is
    // asked for and how its failures come back.
    const { text, utterances } = await transcribeWithStt(audioPath, {
      duration: video.duration,
      vocabulary: isVocabularyName(video.vocabulary)
        ? VOCABULARIES[video.vocabulary]
        : null,
    });

    db.update(schema.videos)
      .set({
        transcript: text,
        utterances: JSON.stringify(utterances),
      })
      .where(eq(schema.videos.id, videoId))
      .run();
  } finally {
    // Release the downloaded audio regardless of success or failure so temp
    // files can't accumulate on the error paths. A retry re-downloads it.
    if (existsSync(audioPath)) unlinkSync(audioPath);
  }
}
