/**
 * Tests for src/lib/pipeline/stt.ts: the pure parts, then the spawn path
 * against the real `stt` with a throwaway config naming the fake provider (no
 * key, no network), and a fake executable for what the fake provider cannot
 * do (hang, garbage, a given exit status).
 *
 *   npm test
 *
 * The real stt is `stt` from PATH, or TUBEREADER_STT_BIN.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  durationProblem,
  failureMessage,
  parseCheck,
  parseTranscript,
  readableDuration,
  sttMessage,
  transcribeArgs,
  transcribeWithStt,
  worthRetrying,
  writeVocabularyFiles,
  writtenTranscript,
} from "../src/lib/pipeline/stt.ts";

const REAL_STT = process.env.TUBEREADER_STT_BIN || "stt";

const work = mkdtempSync(path.join(os.tmpdir(), "tubereader-test-"));
after(() => rmSync(work, { recursive: true, force: true }));
// Vocabulary files land in os.tmpdir(), which follows TMPDIR: a folder of our
// own, so the tests can see that nothing is left behind.
const tmp = path.join(work, "tmp");
mkdirSync(tmp);
process.env.TMPDIR = tmp;

const audio = path.join(work, "audio clip.mp3");
writeFileSync(audio, Buffer.alloc(2048, 7));

let configCount = 0;
/** Point stt at a fresh config; never the real ~/.config/stt/config. */
function sttConfig(...lines) {
  const file = path.join(work, `stt-${++configCount}.conf`);
  writeFileSync(file, lines.join("\n") + "\n");
  process.env.STT_CONFIG = file;
}
sttConfig("provider = fake");

// The real stt behind a wrapper that logs "<pid> <subcommand>" and then execs
// it, keeping the pid, so a test can count runs and see the process is gone.
const wrapper = path.join(work, "wrap-stt");
writeFileSync(wrapper, '#!/bin/sh\necho "$$ $1" >> "$WRAP_LOG"\nexec "$REAL_STT" "$@"\n');
chmodSync(wrapper, 0o755);

let logCount = 0;
function wrapperLog() {
  const log = path.join(work, `wrap-${++logCount}.log`);
  process.env.WRAP_LOG = log;
  process.env.REAL_STT = REAL_STT;
  return () =>
    readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const [pid, sub] = line.split(" ");
        return { pid: Number(pid), sub };
      });
}

// A stand-in for stt: logs each run, answers `check` with FAKE_STT_CHECK, and
// behaves per FAKE_STT_MODES, one mode per `transcribe` run (the last repeats).
function fakeStt() {
  const fs = process.getBuiltinModule("fs");
  const path = process.getBuiltinModule("path");
  const args = process.argv.slice(2);
  const log = process.env.FAKE_STT_LOG;
  fs.appendFileSync(log, JSON.stringify({ pid: process.pid, args }) + "\n");
  if (args[0] === "check") {
    process.stdout.write(process.env.FAKE_STT_CHECK + "\n");
    return;
  }
  const runs = fs.readFileSync(log, "utf8").split("\n").filter((l) => l.includes('"transcribe"')).length;
  const modes = process.env.FAKE_STT_MODES.split(",");
  const mode = modes[Math.min(runs, modes.length) - 1];
  const flag = (name) => args[args.indexOf(name) + 1];
  const octal = (p) => (fs.statSync(p).mode & 0o777).toString(8);
  if (mode === "ok") {
    process.stdout.write(process.env.FAKE_STT_OUTPUT + "\n");
  } else if (mode === "transient") {
    process.stderr.write("Uploading audio...\nstt: HTTP 503 Service Unavailable: fake outage\n");
    process.exitCode = 5;
  } else if (mode === "garbage") {
    process.stdout.write("this is not json\n");
  } else if (mode === "crash") {
    process.stderr.write("Traceback (most recent call last):\nboom\n");
    process.exitCode = 1;
  } else if (mode === "hang") {
    process.on("SIGTERM", () => {});
    setInterval(() => {}, 1000);
  } else if (mode === "late" || mode === "late-hang") {
    // The transcript is out; then the provider cleanup, which a SIGTERM lets
    // finish ("late") or which hangs until SIGKILL ("late-hang").
    process.stdout.write(process.env.FAKE_STT_OUTPUT + "\n");
    process.on("SIGTERM", () => {
      if (mode === "late-hang") return;
      process.stderr.write("stt: SIGTERM arrived after the transcript was written\n");
      process.exit(143);
    });
    setInterval(() => {}, 1000);
  } else if (mode === "say") {
    process.stderr.write("Uploading audio...\n" + process.env.FAKE_STT_STDERR + "\n");
    process.exitCode = 5;
  } else if (mode === "vocab") {
    const terms = flag("--terms-file");
    const spellings = flag("--spellings");
    const report = {
      terms: fs.readFileSync(terms, "utf8"),
      spellings: JSON.parse(fs.readFileSync(spellings, "utf8")),
      modes: [octal(path.dirname(terms)), octal(terms), octal(spellings)],
    };
    process.stdout.write(JSON.stringify({ provider: "fake-bin", text: JSON.stringify(report), utterances: [] }) + "\n");
  }
}

const fakeBin = path.join(work, "fake-stt");
writeFileSync(fakeBin, `#!${process.execPath}\n(${fakeStt.toString()})();\n`);
chmodSync(fakeBin, 0o755);

const OK_CHECK = { provider: "fake", config: "x", ok: true, problem: null, max_seconds: 18000, stream: {} };

let fakeCount = 0;
function fakeEnv({ modes = "ok", check = OK_CHECK, output = "", stderr = "" } = {}) {
  const log = path.join(work, `fake-${++fakeCount}.log`);
  process.env.FAKE_STT_LOG = log;
  process.env.FAKE_STT_MODES = modes;
  process.env.FAKE_STT_CHECK = typeof check === "string" ? check : JSON.stringify(check);
  process.env.FAKE_STT_OUTPUT = output;
  process.env.FAKE_STT_STDERR = stderr;
  return () =>
    readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code !== "ESRCH";
  }
}

function leftovers() {
  return readdirSync(tmp).filter((name) => name.startsWith("tubereader-stt-"));
}

const VOCAB = {
  label: "Test",
  keyterms: ["Abba, Pater", "Opus Dei"],
  customSpelling: [{ from: ["fake transcript"], to: "Fäke Transcript" }],
};

// Stands in for a write error such as a full /tmp: the spellings cannot be
// written after terms.txt already was.
const UNWRITABLE = {
  ...VOCAB,
  customSpelling: [{ from: ["x"], to: "y", toJSON() { throw new Error("cannot write the spellings"); } }],
};

// stt's last lines for the transient failures it does not retry itself
// (stt.LeftBehind), worded as its providers word them.
const LEFT_BEHIND_LINES = [
  "stt: POST https://api.soniox.com/v1/transcriptions: sent, but no answer came (TimeoutError: timed out); " +
    "a Soniox transcription may exist that stt cannot see (its file was deleted, so it fails); not retried",
  "stt: HTTP 503 Service Unavailable: busy; Soniox kept the file: HTTP 500 Internal Server Error: oops; " +
    "not retried, so no more uploads pile up",
  "stt: POST https://api.assemblyai.com/v2/transcript: sent, but no answer came (TimeoutError: timed out); " +
    "an AssemblyAI transcript may exist that stt cannot see; not retried",
];

// The real stt's line when Soniox answers the job creation with an nginx 503
// page and then refuses to delete the upload: clipped at about 300 characters,
// before "not retried". A 503 page after stt's own retries reads the same.
const PAGE_503 =
  "<html><head><title>503 Service Temporarily Unavailable</title></head><body>" +
  "<center><h1>503 Service Temporarily Unavailable</h1></center><hr><center>nginx</center></body></html>";
const CLIPPED_LINE = `stt: HTTP 503 Service Unavailable: ${PAGE_503} ${PAGE_503}`.slice(0, 304) + "…";

// ---------------------------------------------------------------- pure parts

test("transcribeArgs without a vocabulary: no hints, no terms, absolute path", () => {
  assert.deepEqual(transcribeArgs("data/audio/-abc.mp3", null), [
    "transcribe", path.resolve("data/audio/-abc.mp3"), "--json", "--timeout", "1800",
    "--languages", "", "--terms", "",
  ]);
});

test("transcribeArgs with vocabulary files", () => {
  const files = { dir: "/t", termsFile: "/t/terms.txt", spellingsFile: "/t/spellings.json" };
  assert.deepEqual(transcribeArgs("/a/x.mp3", files).slice(5), [
    "--languages", "", "--terms-file", "/t/terms.txt", "--spellings", "/t/spellings.json",
  ]);
  assert.deepEqual(transcribeArgs("/a/x.mp3", { ...files, spellingsFile: null }).slice(5), [
    "--languages", "", "--terms-file", "/t/terms.txt",
  ]);
  assert.deepEqual(transcribeArgs("/a/x.mp3", { ...files, termsFile: null }).slice(5), [
    "--languages", "", "--terms", "", "--spellings", "/t/spellings.json",
  ]);
});

test("parseTranscript maps milliseconds to seconds and fills stt's nulls", () => {
  const out = JSON.stringify({
    provider: "soniox",
    text: "Bom dia. Hello.",
    utterances: [
      { text: "Bom dia.", speaker: "A", start_ms: 120, end_ms: 2300, language: "pt" },
      { text: "Hello.", speaker: null, start_ms: null, end_ms: null, language: null },
      { text: "Later.", speaker: "B", start_ms: 4000, end_ms: null, language: "en" },
    ],
  });
  assert.deepEqual(parseTranscript(out), {
    provider: "soniox",
    text: "Bom dia. Hello.",
    utterances: [
      { speaker: "A", text: "Bom dia.", start: 0.12, end: 2.3 },
      { speaker: "A", text: "Hello.", start: 0, end: 0 },
      { speaker: "B", text: "Later.", start: 4, end: 4 },
    ],
  });
  // Silence is a success with an empty transcript.
  assert.deepEqual(parseTranscript('{"provider": "soniox", "text": "", "utterances": []}\n'), {
    provider: "soniox", text: "", utterances: [],
  });
});

test("parseTranscript refuses anything that is not a transcript", () => {
  for (const bad of ["", "not json", "[]", '{"utterances": []}', '{"text": "x", "utterances": {}}']) {
    assert.throws(() => parseTranscript(bad), /stt printed something other than a transcript/, bad);
  }
});

test("parseCheck reads stt check --json", () => {
  assert.deepEqual(parseCheck(JSON.stringify(OK_CHECK)), {
    provider: "fake", ok: true, problem: null, maxSeconds: 18000,
  });
  assert.equal(parseCheck("nope"), null);
  assert.equal(parseCheck('{"provider": "x"}'), null);
});

test("durationProblem only for a known duration over a known limit", () => {
  const check = { provider: "soniox", ok: true, problem: null, maxSeconds: 18000 };
  assert.equal(durationProblem(null, check), null);
  assert.equal(durationProblem(18000, check), null);
  assert.equal(durationProblem(18037, { ...check, maxSeconds: null }), null);
  assert.equal(
    durationProblem(18037, check),
    "The video is 18037 s (5.0 h); soniox accepts at most 18000 s (5.0 h). Nothing was uploaded."
  );
  assert.equal(readableDuration(2100), "35 min");
  assert.equal(readableDuration(12.4), "12 s");
});

test("failure messages: stt's last line, else the stderr tail", () => {
  const base = { code: 4, signal: null, stdout: "", timedOut: false, overflow: false };
  const stderr = "Uploading audio...\nstt: first\nprogress\nstt: HTTP 402 Payment Required: no credit\n";
  assert.equal(sttMessage(stderr), "stt: HTTP 402 Payment Required: no credit");
  assert.equal(sttMessage("no such line\n"), null);
  assert.equal(failureMessage({ ...base, stderr }, 1000), "stt: HTTP 402 Payment Required: no credit");
  assert.equal(failureMessage({ ...base, code: 1, stderr: "Traceback\nboom\n" }, 1000), "stt exited with status 1: Traceback\nboom");
  assert.equal(failureMessage({ ...base, code: null, signal: "SIGKILL", stderr: "" }, 1000), "stt exited with signal SIGKILL");
  assert.equal(
    failureMessage({ ...base, code: 143, timedOut: true, stderr: "stt: cancelled by SIGTERM\n" }, 2_100_000),
    "Transcription did not finish within 35 min, so stt was stopped (stt: cancelled by SIGTERM)"
  );
  const long = "x".repeat(2000);
  assert.equal(failureMessage({ ...base, code: 1, stderr: long }, 1000).length, "stt exited with status 1: ".length + 500);
});

test("worthRetrying: a transient exit, unless stt says something may be left behind", () => {
  const base = { signal: null, stdout: "", timedOut: false, overflow: false };
  const outage = "Uploading audio...\nstt: HTTP 503 Service Unavailable: busy\n";
  assert.equal(worthRetrying({ ...base, code: 5, stderr: outage }), true);
  assert.equal(worthRetrying({ ...base, code: 5, stderr: "" }), true);
  for (const code of [1, 4, 6, 143]) assert.equal(worthRetrying({ ...base, code, stderr: outage }), false, `exit ${code}`);
  for (const line of LEFT_BEHIND_LINES) {
    assert.equal(worthRetrying({ ...base, code: 5, stderr: `Uploading audio...\n${line}\n` }), false, line);
  }
  // stt clips its line at about 300 characters; a lost answer still shows.
  const clipped = LEFT_BEHIND_LINES[0].slice(0, LEFT_BEHIND_LINES[0].indexOf("; not retried")) + "…";
  assert.equal(worthRetrying({ ...base, code: 5, stderr: clipped }), false);
  // An undeletable upload does not, so no clipped line gets a second run.
  assert.equal(worthRetrying({ ...base, code: 5, stderr: `Uploading audio to Soniox...\n${CLIPPED_LINE}\n` }), false);
});

test("writeVocabularyFiles writes only the parts a vocabulary has", () => {
  // Spellings only: no terms file, so stt gets `--terms ""` and the config's
  // key terms stay out.
  const spellingsOnly = writeVocabularyFiles({ ...VOCAB, keyterms: [] });
  const termsOnly = writeVocabularyFiles({ ...VOCAB, customSpelling: [] });
  try {
    assert.equal(spellingsOnly.termsFile, null);
    assert.deepEqual(JSON.parse(readFileSync(spellingsOnly.spellingsFile, "utf8")), VOCAB.customSpelling);
    assert.deepEqual(transcribeArgs("/a/x.mp3", spellingsOnly).slice(5), [
      "--languages", "", "--terms", "", "--spellings", spellingsOnly.spellingsFile,
    ]);
    assert.equal(termsOnly.spellingsFile, null);
    assert.equal(readFileSync(termsOnly.termsFile, "utf8"), "Abba, Pater\nOpus Dei\n");
    assert.equal((statSync(termsOnly.dir).mode & 0o777).toString(8), "700");
  } finally {
    rmSync(spellingsOnly.dir, { recursive: true, force: true });
    rmSync(termsOnly.dir, { recursive: true, force: true });
  }
  assert.deepEqual(leftovers(), []);
});

test("writtenTranscript: only a whole transcript, only from a run the deadline stopped", () => {
  const out = JSON.stringify({
    provider: "soniox",
    text: "hi",
    utterances: [{ text: "hi", speaker: "A", start_ms: 0, end_ms: 500, language: "en" }],
  }) + "\n";
  const base = {
    code: 143, signal: null, stdout: out, timedOut: true, overflow: false,
    stderr: "stt: SIGTERM arrived after the transcript was written\n",
  };
  assert.deepEqual(writtenTranscript(base), {
    provider: "soniox", text: "hi", utterances: [{ speaker: "A", text: "hi", start: 0, end: 0.5 }],
  });
  assert.equal(writtenTranscript({ ...base, code: null, signal: "SIGKILL", stderr: "" })?.text, "hi");
  assert.equal(writtenTranscript({ ...base, stdout: out.slice(0, 40) }), null);
  assert.equal(writtenTranscript({ ...base, stdout: "" }), null);
  assert.equal(writtenTranscript({ ...base, overflow: true }), null);
  assert.equal(writtenTranscript({ ...base, timedOut: false }), null);
});

// --------------------------------------------- the real stt, fake provider

test("real stt: transcript with speaker A, one check and one transcribe", async () => {
  sttConfig("provider = fake");
  const runs = wrapperLog();
  const result = await transcribeWithStt(audio, { duration: 10, vocabulary: null }, { bin: wrapper });
  assert.deepEqual(result, {
    provider: "fake",
    text: "fake transcript of audio clip.mp3 (2048 bytes)",
    utterances: [{ speaker: "A", text: "fake transcript of audio clip.mp3 (2048 bytes)", start: 0, end: 0 }],
  });
  assert.deepEqual(runs().map((r) => r.sub), ["check", "transcribe"]);
});

test("real stt: vocabulary terms and spellings reach stt; temp files removed", async () => {
  sttConfig("provider = fake");
  const result = await transcribeWithStt(audio, { duration: null, vocabulary: VOCAB }, { bin: REAL_STT });
  assert.equal(result.text, "Fäke Transcript of audio clip.mp3 (2048 bytes)");
  assert.equal(result.utterances[0].text, "Fäke Transcript of audio clip.mp3 (2048 bytes)");
  assert.deepEqual(leftovers(), []);
});

test("real stt: a refusal (exit 4) fails at once with stt's message", async () => {
  sttConfig("provider = fake", "fake_fail = submit:credit");
  const runs = wrapperLog();
  await assert.rejects(
    transcribeWithStt(audio, { duration: 10, vocabulary: VOCAB }, { bin: wrapper, retryPauseMs: 50 }),
    { message: "stt: HTTP 402 Payment Required: fake credit failure" }
  );
  assert.deepEqual(runs().map((r) => r.sub), ["check", "transcribe"]);
  assert.deepEqual(leftovers(), []);
});

test("real stt: a transient failure (exit 5) is run once more, then reported", async (t) => {
  sttConfig("provider = fake", "fake_fail = submit:server");
  const runs = wrapperLog();
  const logged = t.mock.method(console, "error", () => {});
  await assert.rejects(
    transcribeWithStt(audio, { duration: 10, vocabulary: null }, { bin: wrapper, retryPauseMs: 50 }),
    { message: "stt: HTTP 503 Service Unavailable: fake server failure (after one retry)" }
  );
  assert.deepEqual(runs().map((r) => r.sub), ["check", "transcribe", "transcribe"]);
  assert.equal(logged.mock.callCount(), 1);
  assert.match(logged.mock.calls[0].arguments[0], /^\[pipeline\] stt: HTTP 503 .*; running stt once more in 0\.05s$/);
});

test("real stt: a video over the provider's limit is refused before transcribing", async () => {
  sttConfig("provider = fake");
  const runs = wrapperLog();
  await assert.rejects(
    transcribeWithStt(audio, { duration: 18037, vocabulary: VOCAB }, { bin: wrapper }),
    { message: "The video is 18037 s (5.0 h); fake accepts at most 18000 s (5.0 h). Nothing was uploaded." }
  );
  assert.deepEqual(runs().map((r) => r.sub), ["check"]);
  assert.deepEqual(leftovers(), []);
});

test("real stt: a vocabulary that cannot be written fails before transcribing, leaving nothing", async () => {
  sttConfig("provider = fake");
  const runs = wrapperLog();
  await assert.rejects(
    transcribeWithStt(audio, { duration: 10, vocabulary: UNWRITABLE }, { bin: wrapper }),
    { message: "cannot write the spellings" }
  );
  assert.deepEqual(runs().map((r) => r.sub), ["check"]);
  assert.deepEqual(leftovers(), []);
});

test("real stt: a config problem is reported before transcribing", async () => {
  sttConfig("provider = nope");
  const runs = wrapperLog();
  await assert.rejects(
    transcribeWithStt(audio, { duration: 10, vocabulary: null }, { bin: wrapper }),
    /^Error: stt cannot transcribe: .*nope/
  );
  assert.deepEqual(runs().map((r) => r.sub), ["check"]);
});

test("real stt: past the deadline stt gets SIGTERM, deletes its job and exits", { timeout: 20_000 }, async () => {
  sttConfig("provider = fake", "fake_fail = slow:30");
  const runs = wrapperLog();
  const started = Date.now();
  await assert.rejects(
    transcribeWithStt(audio, { duration: 10, vocabulary: null }, { bin: wrapper, deadlineMs: 2000, killGraceMs: 10_000 }),
    { message: "Transcription did not finish within 2 s, so stt was stopped (stt: cancelled by SIGTERM)" }
  );
  // Well before the SIGKILL grace: stt exited on SIGTERM by itself.
  assert.ok(Date.now() - started < 8000, `took ${Date.now() - started} ms`);
  const transcribe = runs().find((r) => r.sub === "transcribe");
  assert.equal(isAlive(transcribe.pid), false);
});

// ------------------------------------------------------ a fake stt executable

test("fake stt: a transient failure then a transcript succeeds on the second run", async (t) => {
  const calls = fakeEnv({
    modes: "transient,ok",
    output: JSON.stringify({
      provider: "soniox",
      text: "hello there",
      utterances: [
        { text: "hello", speaker: null, start_ms: 1500, end_ms: null, language: "pt" },
        { text: "there", speaker: "B", start_ms: null, end_ms: 3000, language: null },
      ],
    }),
  });
  t.mock.method(console, "error", () => {});
  const result = await transcribeWithStt(audio, { duration: 10, vocabulary: null }, { bin: fakeBin, retryPauseMs: 50 });
  assert.deepEqual(result.utterances, [
    { speaker: "A", text: "hello", start: 1.5, end: 1.5 },
    { speaker: "B", text: "there", start: 0, end: 3 },
  ]);
  assert.deepEqual(calls().map((c) => c.args[0]), ["check", "transcribe", "transcribe"]);
});

test("fake stt: vocabulary files are private, exact, and removed afterwards", async () => {
  fakeEnv({ modes: "vocab" });
  const result = await transcribeWithStt(audio, { duration: 10, vocabulary: VOCAB }, { bin: fakeBin });
  const report = JSON.parse(result.text);
  assert.equal(report.terms, "Abba, Pater\nOpus Dei\n");
  assert.deepEqual(report.spellings, VOCAB.customSpelling);
  assert.deepEqual(report.modes, ["700", "600", "600"]);
  assert.deepEqual(leftovers(), []);
});

test("fake stt: one that ignores SIGTERM is killed after the grace period", { timeout: 10_000 }, async () => {
  const calls = fakeEnv({ modes: "hang" });
  const started = Date.now();
  await assert.rejects(
    transcribeWithStt(audio, { duration: 10, vocabulary: VOCAB }, { bin: fakeBin, deadlineMs: 1000, killGraceMs: 300 }),
    { message: "Transcription did not finish within 1 s, so stt was stopped" }
  );
  assert.ok(Date.now() - started < 5000, `took ${Date.now() - started} ms`);
  const transcribe = calls().find((c) => c.args[0] === "transcribe");
  assert.equal(isAlive(transcribe.pid), false);
  assert.deepEqual(leftovers(), []);
});

test("fake stt: a transcript written before the deadline stopped stt is kept", { timeout: 10_000 }, async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const output = JSON.stringify({
    provider: "soniox",
    text: "late but whole",
    utterances: [{ text: "late but whole", speaker: "A", start_ms: 0, end_ms: 900, language: "en" }],
  });
  const expected = {
    provider: "soniox",
    text: "late but whole",
    utterances: [{ speaker: "A", text: "late but whole", start: 0, end: 0.9 }],
  };

  // The SIGTERM lands during stt's cleanup, which it finishes before exiting 143.
  let calls = fakeEnv({ modes: "late", output });
  assert.deepEqual(
    await transcribeWithStt(audio, { duration: 10, vocabulary: VOCAB }, { bin: fakeBin, deadlineMs: 1500, killGraceMs: 3000 }),
    expected
  );
  assert.deepEqual(calls().map((c) => c.args[0]), ["check", "transcribe"]);
  assert.equal(
    logged.mock.calls[0].arguments[0],
    "[pipeline] The deadline stopped stt after it wrote the transcript, which is kept " +
      "(stt: SIGTERM arrived after the transcript was written)"
  );

  // A cleanup that hangs until SIGKILL: the transcript was out all the same.
  calls = fakeEnv({ modes: "late-hang", output });
  assert.deepEqual(
    await transcribeWithStt(audio, { duration: 10, vocabulary: null }, { bin: fakeBin, deadlineMs: 1500, killGraceMs: 300 }),
    expected
  );
  assert.match(logged.mock.calls[1].arguments[0], /, which is kept \(signal SIGKILL\)$/);
  assert.equal(isAlive(calls().find((c) => c.args[0] === "transcribe").pid), false);
  assert.equal(logged.mock.callCount(), 2);
  assert.deepEqual(leftovers(), []);
});

test("fake stt: a transient failure that may have left something at the provider is not run again", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  for (const line of [...LEFT_BEHIND_LINES, CLIPPED_LINE]) {
    const calls = fakeEnv({ modes: "say", stderr: line });
    await assert.rejects(
      transcribeWithStt(audio, { duration: 10, vocabulary: null }, { bin: fakeBin, retryPauseMs: 50 }),
      { message: line }
    );
    assert.deepEqual(calls().map((c) => c.args[0]), ["check", "transcribe"], line);
  }
  assert.equal(logged.mock.callCount(), 0);
});

test("fake stt: garbage on stdout with exit 0 is an error, not a transcript", async () => {
  fakeEnv({ modes: "garbage" });
  await assert.rejects(
    transcribeWithStt(audio, { duration: 10, vocabulary: null }, { bin: fakeBin }),
    /stt printed something other than a transcript/
  );
});

test("fake stt: a failure without an stt line reports the stderr tail", async () => {
  fakeEnv({ modes: "crash" });
  await assert.rejects(
    transcribeWithStt(audio, { duration: 10, vocabulary: null }, { bin: fakeBin }),
    { message: "stt exited with status 1: Traceback (most recent call last):\nboom" }
  );
});

test("fake stt: unreadable check output fails before transcribing", async () => {
  const calls = fakeEnv({ check: "not json" });
  await assert.rejects(
    transcribeWithStt(audio, { duration: 10, vocabulary: null }, { bin: fakeBin }),
    /^Error: stt check failed: /
  );
  assert.deepEqual(calls().map((c) => c.args[0]), ["check"]);
});

test("a missing stt executable says how to install it", async () => {
  await assert.rejects(
    transcribeWithStt(audio, { duration: 10, vocabulary: null }, { bin: path.join(work, "no-such-stt") }),
    /no-such-stt not found: run ~\/development\/stt\/install\.sh/
  );
});
