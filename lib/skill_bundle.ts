import * as fs from "fs-extra";
import * as path from "path";
import { spawnPromise } from "./child_process";
import { debug } from "./log";
import { withGlobMatches } from "./project/util";

export async function bundle(cwd: string,
                             minify: boolean,
                             sourceMap: boolean): Promise<void> {

    const events = await withGlobMatches<string>(cwd, ["events/*.js", "lib/events/*.js"], async file => {
        const content = (await fs.readFile(path.join(cwd, file))).toString();
        if (/exports\.handler\s*=/.test(content)) {
            const name = path.basename(file);
            return `registerEvent("${name.replace(/\.js/, "")}", async () => (await import("./${file.replace(/\.js/, "")}")).handler);`;
        }
        return undefined;
    });
    const commands = await withGlobMatches<string>(cwd, ["commands/*.js", "lib/commands/*.js"], async file => {
        const content = (await fs.readFile(path.join(cwd, file))).toString();
        if (/exports\.handler\s*=/.test(content)) {
            const name = path.basename(file);
            return `registerCommand("${name.replace(/\.js/, "")}", async () => (await import("./${file.replace(/\.js/, "")}")).handler);`;
        }
        return undefined;
    });

    const imports = [];
    if (commands.length > 0) {
        imports.push("registerCommand");
    }
    if (events.length > 0) {
        imports.push("registerEvent");
    }

    const skillTs = [
        `import { ${imports.join(", ")} } from "@atomist/skill/lib/bundle";`,
        `export const entryPoint = require("@atomist/skill/lib/bundle").bundle;`,
    ];

    await fs.writeFile(path.join(cwd, "skill.ts"), `${skillTs.join("\n")}
${events.join("\n")}
${commands.join("\n")}`);

    const nccArgs = ["build", "skill.ts", "-o", "dist"];
    if (minify) {
        nccArgs.push("-m");
    }
    if (sourceMap) {
        nccArgs.push("-s");
    }

    // Run ncc
    await spawnPromise(path.join(cwd, "node_modules", ".bin", "ncc"), nccArgs, { cwd, log: { write: msg => debug(msg.trim()) } });

    // Update package.json
    // - rewrite main
    // - remove dependencies
    const pj = await fs.readJson(path.join(cwd, "package.json"));
    delete pj.dependencies;
    delete pj.devDependencies;
    pj.main = "dist/index.js";
    await fs.writeJson(path.join(cwd, "package.json"), pj, { spaces: "  " });
    await fs.remove(path.join(cwd, "package-lock.json"));

}
