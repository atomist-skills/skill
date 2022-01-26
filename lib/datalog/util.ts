/*
 * Copyright © 2022 Atomist, Inc.
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

import kebabcase = require("lodash.kebabcase");
import { guid, toArray } from "../util";

export type EntityType =
	| string
	| string[]
	| number
	| number[]
	| boolean
	| boolean[]
	| Date
	| Date[]
	| { set: string[] }
	| { add: string[] };

export type Entity = {
	"schema/entity-type": string;
	"schema/entity": string;
} & Record<string, EntityType>;

/**
 * Helper to create a Datalog entity of given type and attributes
 */
export function entity<
	E extends Record<string, EntityType> = Record<string, EntityType>,
>(type: string, nameOrAttributes: string | E, attributes?: E): Entity {
	const e = {
		"schema/entity-type": `:${type}`,
	};
	if (typeof nameOrAttributes === "string") {
		e["schema/entity"] = nameOrAttributes;
	} else {
		e["schema/entity"] = `$${type.split("/")[1] || type}-${guid()}`;
	}
	const attributesToUse =
		typeof nameOrAttributes === "string"
			? attributes
			: nameOrAttributes || {};
	const prefix = type.replace(/\//g, ".");
	for (const attribute of Object.keys(attributesToUse)) {
		const value = attributesToUse[attribute];
		if (value !== undefined) {
			if (attribute.includes("/")) {
				e[attribute] = value;
			} else {
				e[`${prefix}/${kebabcase(attribute)}`] = value;
			}
		}
	}
	return e as any;
}

/**
 * Helper to extract entity references from a list of provided entities
 * optionally filtered by schema/entity-type
 */
export function entityRefs(entities: Entity[], type?: string): string[] {
	return entities
		.filter(e => !type || e["schema/entity-type"] === `:${type}`)
		.filter(e => e["schema/entity"])
		.map(e => e["schema/entity"]);
}

/**
 * Helper to extract an entity reference from a list of provided entities
 * optionally filtered by schema/entity-type
 */
export function entityRef(entities: Entity | Entity[], type?: string): string {
	const refs = entityRefs(toArray(entities), type);
	if (refs.length > 0) {
		return refs[0];
	}
	return undefined;
}
