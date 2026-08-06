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
    // Exit 2 e obrigatorio para o hook bloquear de verdade: so ele faz o
    // Claude Code ler o stderr do hook. Exit 1 e "erro nao bloqueante" e so
    // aparece pro usuario via stderr; escrever em stdout com console.log (como
    // estava) o perdia por completo dos dois lados.
    console.error(firstLines);
    process.exit(2);
  }
});
