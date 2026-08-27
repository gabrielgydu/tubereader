export type VideoStatus =
  | "pending"
  | "metadata"
  | "downloading"
  | "transcribing"
  | "summarizing"
  | "complete"
  | "error";

export interface Video {
  id: number;
  youtube_id: string;
  platform: string;
  source_url: string | null;
  title: string | null;
  channel: string | null;
  channel_id: string | null;
  channel_url: string | null;
  duration: number | null;
  upload_date: string | null;
  thumbnail: string | null;
  description: string | null;
  chapters: string | null;
  categories: string | null;
  tags: string | null;
  view_count: number | null;
  like_count: number | null;
  status: VideoStatus;
  error_message: string | null;
  transcript: string | null;
  utterances: string | null;
  formatted_transcript: string | null;
  verdict: string | null;
  summary: string | null;
  category: string | null;
  key_takeaways: string | null;
  timestamps: string | null;
  created_at: string;
  processed_at: string | null;
  read_at: string | null;
}

export interface Channel {
  id: number;
  channel_id: string;
  platform: string;
  name: string;
  url: string;
  thumbnail: string | null;
  last_checked: string | null;
  created_at: string;
}

export interface Utterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

export interface VideoTimestamp {
  time: number;
  label: string;
  description: string;
}

export interface SummaryResult {
  verdict: string;
  category: string;
  keyTakeaways: string[];
  summary: string;
  timestamps: VideoTimestamp[];
}

export interface PipelineEvent {
  videoId: number;
  youtubeId: string;
  status: VideoStatus;
  error?: string;
  title?: string;
}
