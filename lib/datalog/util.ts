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
import { guid, hash, toArray } from "../util";

export type EntityKeyword = { _key: string };

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
	| { add: string[] }
	| EntityKeyword;

export type Entity = {
	"schema/entity-type": EntityKeyword;
	"schema/entity": string;
} & Record<string, EntityType>;

/**
 * Helper to create a Datalog entity of given type and attributes with
 * certain attributes making up the id attribute
 */
export function entityWithId<
	E extends Record<string, EntityType> = Record<string, EntityType>,
>(
	idAttributes: string | string[],
	additionalIdAttributes: Record<string, any> = {},
): (type: string, nameOrAttributes: string | E, attributes?: E) => Entity {
	return (type, nameOrAttributes, attributes) => {
		const ent = entity(type, nameOrAttributes, attributes);
		const idValues = {};
		const prefix = type.replace(/\//g, ".");

		Object.keys(additionalIdAttributes)
			.sort()
			.forEach(
				a =>
					(idValues[attributeName(a, prefix)] =
						additionalIdAttributes[a]),
			);

		toArray(idAttributes)
			.sort()
			.forEach(a => {
				Object.keys(ent).forEach(attribute => {
					if (attribute === attributeName(a, prefix)) {
						idValues[attribute] = ent[attribute];
					}
				});
			});
		const id = hash(idValues);
		ent[`${prefix}/id`] = id;
		return ent;
	};
}

/**
 * Helper to create a Datalog entity of given type and attributes
 */
export function entity<
	E extends Record<string, EntityType> = Record<string, EntityType>,
>(type: string, nameOrAttributes: string | E, attributes?: E): Entity {
	const e = {
		"schema/entity-type": asKeyword(type),
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
			e[attributeName(attribute, prefix)] = value;
		}
	}
	return e as any;
}

function attributeName(attribute: string, prefix: string): string {
	if (attribute.includes("/")) {
		return attribute;
	} else {
		return `${prefix}/${kebabcase(attribute)}`;
	}
}

/**
 * Helper to extract entity references from a list of provided entities
 * optionally filtered by schema/entity-type
 */
export function entityRefs(entities: Entity[], type?: string): string[] {
	return entities
		.filter(e => !type || e["schema/entity-type"]?._key === type)
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

/**
 * Helper to create an EDN keyword in an object value
 */
export function asKeyword(value: string): EntityKeyword {
	if (value?.startsWith(":")) {
		return { _key: value.slice(1) };
	}
	return { _key: value };
}
