/*
 * Copyright © 2021 Atomist, Inc.
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

import * as fs from "fs-extra";
import * as path from "path";

export function namedDatalog(name: string): string {
	const segments = name.split("/");
	let module;
	let file;
	if (segments[0].startsWith("@")) {
		module = segments.slice(0, 2).join("/");
		file = segments.slice(2).join("/");
	} else {
		module = segments[0];
		file = segments.slice(1).join("/");
	}
	const root = __dirname.includes("node_modules")
		? path.join(__dirname.split("node_modules")[0], "node_modules", module)
		: process.cwd();
	const filePath = path.join(root, "datalog", "subscription", `${file}.edn`);

	return fs.readFileSync(filePath).toString();
}
