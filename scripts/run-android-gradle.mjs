import { spawn } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANDROID_DIR = path.join(ROOT, "android");
const task = process.argv[2];
const javaExecutable = process.platform === "win32" ? "java.exe" : "java";
const javaHomes = [
  process.platform === "win32" ? "C:\\Users\\dipuc\\.jdks\\jbr-21.0.11" : undefined,
  process.env.JAVA_HOME,
  process.platform === "win32" ? "C:\\Program Files\\Android\\Android Studio\\jbr" : undefined,
].filter(Boolean);
const javaHome = javaHomes.find((candidate) =>
  existsSync(path.join(candidate, "bin", javaExecutable)),
);

function renameDebugApk() {
  if (task !== "assembleDebug") return;

  const outputDir = path.join(ANDROID_DIR, "app", "build", "outputs", "apk", "debug");
  const generatedApk = path.join(outputDir, "app-debug.apk");
  const namedApk = path.join(outputDir, "hazri.apk");

  if (!existsSync(generatedApk)) {
    throw new Error(`Expected debug APK was not created: ${generatedApk}`);
  }

  rmSync(namedApk, { force: true });
  renameSync(generatedApk, namedApk);
  console.log(`[android-build] Named debug APK: ${namedApk}`);
}

if (!task) {
  console.error("Usage: bun scripts/run-android-gradle.mjs <Gradle task>");
  process.exitCode = 1;
} else if (!javaHome) {
  console.error("No JDK found. Set JAVA_HOME or install Android Studio with its bundled JDK.");
  process.exitCode = 1;
} else {
  const gradleWrapper = path.join(
    ANDROID_DIR,
    process.platform === "win32" ? "gradlew.bat" : "gradlew",
  );
  const gradleArgs = task === "--stop" ? [task] : [task, "--no-daemon"];
  const child = spawn(gradleWrapper, gradleArgs, {
    cwd: ANDROID_DIR,
    env: { ...process.env, JAVA_HOME: javaHome },
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
  child.on("close", (code) => {
    if (code !== 0) {
      process.exitCode = code ?? 1;
      return;
    }

    try {
      renameDebugApk();
      process.exitCode = 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });
}
