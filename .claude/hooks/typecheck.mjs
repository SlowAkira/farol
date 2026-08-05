import { execSync } from "node:child_process";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    process.exit(0);
  }

  const filePath =
    input.tool_input?.file_path ?? input.tool_response?.filePath ?? "";

  if (!/\.tsx?$/.test(filePath)) {
    process.exit(0);
  }

  try {
    execSync("npx tsc --noEmit", { encoding: "utf8", stdio: "pipe" });
    process.exit(0);
  } catch (err) {
    const output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    const firstLines = output.split(/\r?\n/).slice(0, 20).join("\n");
    console.log(firstLines);
    process.exit(1);
  }
});
