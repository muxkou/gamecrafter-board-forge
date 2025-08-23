#!/usr/bin/env node
import { Command } from "commander";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { compile } from "../compiler";
import { initial_state } from "../engine";

/** 生成一个“写入器”：接收字符串和文件名，落到 baseDir 下；若是 JSON 字符串则优雅缩进 */
export function create_folder_writer(baseDir: string, spaces = 2) {
  return async (content: string, filename: string): Promise<string> => {
    const target = join(baseDir, filename);
    await mkdir(dirname(target), { recursive: true });

    // 如果是合法 JSON 字符串 → 统一格式化；否则原样写入；都保证末尾换行
    let text: string;
    try {
      const parsed = JSON.parse(content);
      text = JSON.stringify(parsed, null, spaces);
    } catch {
      text = content;
    }
    if (!text.endsWith("\n")) text += "\n";

    await writeFile(target, text, "utf8");
    return target;
  };
}

type CliOptions = {
  pretty?: string | boolean;
  minify?: boolean;
  out?: string; // 可选：自定义输出文件名，默认 compile.out.json
};

function to_pretty_spaces(opt: CliOptions): number {
  if (opt.minify) return 0;
  if (opt.pretty === false) return 0;
  if (opt.pretty === true || opt.pretty === undefined) return 2;
  const n = Number(opt.pretty);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 2;
}

const program = new Command();

program
  .name("gbf-cli")
  .description("CLI for GBF game engine")
  .version("0.1.0")
  .argument("<folder>", "folder path containing dsl.json")
  .option("--pretty [n]", "pretty-print JSON with n spaces (default: 2)", false)
  .option("--minify", "minify JSON (overrides --pretty)", false)
  .option("-o, --out <file>", "output file name inside the folder (default: compile.out.json)")
  .action(async (folder: string, opts: CliOptions) => {
    const spaces = to_pretty_spaces(opts);
    const baseDir = resolve(folder);
    const dslPath = join(baseDir, "dsl.json");
    // const outFile = opts.out ?? "compile.out.json";
    try {
      const dsl_content = await readFile(dslPath, "utf8");
      console.log(`Reading DSL: ${dslPath}`);
      let dsl: unknown;
      try {
        dsl = JSON.parse(dsl_content);
      } catch (e: any) {
        console.error(`❌ Invalid JSON in ${dslPath}: ${e?.message ?? e}`);
        process.exitCode = 1;
        return;
      }

      /***
       * 步骤: Compile
       * *****
       */
      const compiled = await compile({ dsl });
      if (!compiled.ok || !compiled.compiled_spec) {
        console.error(`❌ Compile failed with ${compiled.errors.length} error(s):`);
        for (const e of compiled.errors) {
          console.error(`  - [${e.code}] ${e.path} : ${e.message}`);
        }
        process.exitCode = 1;
        return;
      }

      // 把编译结果转成字符串（给写入器）；
      // 这里保持一次 stringify，写入器若接到合法 JSON 仍会按需要 reformat
      const compiled_text =
        typeof compiled === "string"
          ? compiled
          : JSON.stringify(compiled, null, spaces);

      const wtf = create_folder_writer(baseDir, spaces);
      await wtf(compiled_text, 'compile.out.json');
      // console.log(`✅ Output written to: ${target}`);

      /***
       * 步骤: Init State
       * *****
       */
      // initial_state
      const compiled_spec = compiled.compiled_spec;
      const init = await initial_state({
        compiled_spec,
        seats: ["A", "B", "C", "D"],
        seed: 42,
        // overrides ?
      });
      const init_text = JSON.stringify(init, null, spaces);

      const init_wtf = create_folder_writer(baseDir, spaces);
      await init_wtf(init_text, 'init.out.json');

    } catch (err: any) {
      if (err?.code === "ENOENT") {
        console.error(`❌ Not found: ${err?.path ?? "dsl.json"}`);
      } else {
        console.error(`💥 Unexpected error: ${err?.message ?? err}`);
      }
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
