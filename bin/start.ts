#! /usr/bin/env node
/*
 * Copyright © 2020 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// tslint:disable-next-line:no-import-side-effect
import "source-map-support/register";

import * as yargs from "yargs";
import { error } from "../lib/log";

// tslint:disable-next-line:no-unused-expression
yargs
    .command(
        "run",
        "Start container skill",
        args => args.options({
            skill: { type: "string", description: "Name of skill to load", demandOption: false },
        }),
        async argv => {
            return (await import("../lib/skill_run")).runSkill(argv.skill);
        },
    )
    .command(
        [ "generate", "gen" ],
        "Generate skill metadata",
        args => args.option({
            cwd: { type: "string", description: "Set working directory", default: process.cwd(), demandOption: false },
        }),
        async argv => {
            try {
                await (await import("../lib/skill_input")).generateSkill(argv.cwd);
                return 0;
            } catch (e) {
                error(e.message);
                process.exit(1);
            }
        },
    )
    .command(
        [ "bundle" ],
        "Bundle skill and dependencies",
        args => args.option({
            cwd: { type: "string", description: "Set working directory", default: process.cwd(), demandOption: false },
            minify: { type: "boolean", description: "Minify bundled sources", default: true, demandOption: false },
            sourceMap: { type: "boolean", description: "Create source map", default: true, demandOption: false },
        }),
        async argv => {
            try {
                await (await import("../lib/skill_bundle")).bundleSkill(argv.cwd, argv.minify, argv.sourceMap);
                return 0;
            } catch (e) {
                error(e.message);
                process.exit(1);
            }
        },
    )
    .command(
        [ "package", "pkg" ],
        "Package skill archive",
        args => args.option({
            cwd: { type: "string", description: "Set working directory", default: process.cwd(), demandOption: false },
        }),
        async argv => {
            try {
                await (await import("../lib/skill_package")).packageSkill(argv.cwd);
                return 0;
            } catch (e) {
                error(e.message);
                process.exit(1);
            }
        },
    )
    .strict()
    .help()
    .argv;
