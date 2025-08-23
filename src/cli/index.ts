import { Command } from "commander";
import { readFile } from "node:fs/promises";

const program = new Command();

program
  .name("gbf-cli")
  .description("CLI for GBF game engine")
  .version("0.1.0")
  .argument("<file>", "path to a JSON file")  
  .action(async (file: string) => {
    try {
      const dsl_content = await readFile(file, "utf8");
      console.log(`Reading file: ${file}`);
      const dsl = JSON.parse(dsl_content);
      console.log(dsl);
    } catch (err: any) {
      // 给点可读的错误信息
      if (err?.code === "ENOENT") {
        console.error(`File not found: ${file}`);
      } else {
        console.error(`Failed to read/parse file: ${err?.message ?? err}`);
      }
      process.exitCode = 1;
    }
  });

// ESM 下可以用顶层 await；CJS 下可以用 void 包一层（见下）
await program.parseAsync(process.argv);
