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

import {
    render,
    SlackMessage,
} from "@atomist/slack-messages";
import { Action as SlackAction } from "@atomist/slack-messages/lib/SlackMessages";
import { PubSub } from "@google-cloud/pubsub";
import { GraphQLClient } from "./graphql";
import {
    CommandContext,
    EventContext,
    HandlerStatus,
} from "./handler";
import {
    debug,
    error,
} from "./log";
import {
    CommandIncoming,
    EventIncoming,
    isCommandIncoming,
    isEventIncoming,
    Skill,
    Source,
} from "./payload";
import {
    replacer,
    toArray,
} from "./util";
import cloneDeep = require("lodash.clonedeep");

/* eslint-disable @typescript-eslint/camelcase */

export interface Destinations {
    users: string | string[];
    channels: string | string[];
}

export interface MessageClient {
    send(msg: any,
         destinations: Destinations,
         options?: MessageOptions): Promise<any>;

    delete?(destinations: Destinations,
            options: RequiredMessageOptions): Promise<void>;
}

export interface CommandMessageClient extends MessageClient {
    respond(msg: any,
            options?: MessageOptions): Promise<any>;
}

export type RequiredMessageOptions = Pick<MessageOptions, "id" | "thread"> & { id: string };

/**
 * Options for sending messages using the MessageClient.
 */
export interface MessageOptions extends Record<string, any> {

    /**
     * Unique message id per channel and team. This is required
     * if you wish to re-write a message at a later time.
     */
    id?: string;

    /**
     * Time to live for a posted message. If ts + ttl of the
     * existing message with ts is < as a new incoming message
     * with the same id, the message will be re-written.
     */
    ttl?: number;

    /**
     * Timestamp of the message. The timestamp needs to be
     * sortable lexicographically. Should be in milliseconds and
     * defaults to Date.now().
     *
     * This is only applicable if id is set too.
     */
    ts?: number;

    /**
     * If update_only is given, this message will only be posted
     * if a previous message with the same id exists.
     */
    post?: "update_only" | "always";

    /**
     * Optional thread identifier to send this message to or true to send
     * this to the message that triggered this command.
     */
    thread?: string | boolean;
}

/** Valid MessageClient types. */
export const MessageMimeTypes = {
    SLACK_JSON: "application/x-atomist-slack+json",
    SLACK_FILE_JSON: "application/x-atomist-slack-file+json",
    PLAIN_TEXT: "text/plain",
    APPLICATION_JSON: "application/json",
};

export abstract class MessageClientSupport implements MessageClient, CommandMessageClient {

    public respond(msg: any,
                   options?: MessageOptions): Promise<any> {
        return this.doSend(msg, { users: [], channels: [] }, options);
    }

    public send(msg: any,
                destinations: Destinations,
                options?: MessageOptions): Promise<any> {
        return this.doSend(msg, destinations, options);
    }

    public abstract delete(destinations: Destinations,
                           options: RequiredMessageOptions): Promise<void>;

    protected abstract doSend(msg: any,
                              destinations: Destinations,
                              options?: MessageOptions): Promise<any>;

}

export abstract class AbstractMessageClient extends MessageClientSupport {

    constructor(protected readonly request: CommandIncoming | EventIncoming,
                protected readonly correlationId: string,
                protected readonly team: { id: string; name?: string },
                protected readonly source: Source,
                protected readonly graphClient: GraphQLClient) {
        super();
    }

    public async delete(destinations: Destinations,
                        options: RequiredMessageOptions): Promise<void> {
        return this.doSend(undefined, destinations, { ...options, delete: true });
    }

    // tslint:disable-next-line:cyclomatic-complexity
    protected async doSend(msg: any,
                           destinations: Destinations,
                           options: MessageOptions = {}): Promise<any> {
        if (!!msg && (msg as HandlerResponse).content_type === "application/x-atomist-continuation+json") {
            return this.sendResponse(msg).then(() => msg);
        }

        const ts = this.ts(options);

        const responseDestinations = [];

        let threadTs;
        if (options.thread === true && !!this.source) {
            threadTs = (this.source?.slack as any)?.message.ts;
        } else if (typeof options.thread === "string") {
            threadTs = options.thread;
        }
        const teamId = await this.getTeamId(this.source?.slack?.team?.id, this.graphClient);

        toArray(destinations.users || []).forEach(d => {
            responseDestinations.push({
                user_agent: "slack",
                slack: {
                    team: {
                        id: teamId,
                    },
                    user: {
                        name: d,
                    },
                    thread_ts: threadTs,
                },
            });
        });

        toArray(destinations.channels || []).forEach(d => {
            responseDestinations.push({
                user_agent: "slack",
                slack: {
                    team: {
                        id: teamId,
                    },
                    channel: {
                        name: d,
                    },
                    thread_ts: threadTs,
                },
            });
        });

        if (responseDestinations.length === 0 && this.source) {
            const responseDestination = cloneDeep(this.source);
            if (responseDestination.slack) {
                delete responseDestination.slack.user;
                if (threadTs) {
                    responseDestination.slack.thread_ts = threadTs;
                }
            }
            responseDestinations.push(responseDestination);
        }

        const response: HandlerResponse = {
            api_version: "1",
            correlation_id: this.correlationId,
            team: this.team,
            source: this.source ? this.source : undefined,
            command: isCommandIncoming(this.request) ? this.request.command : undefined,
            event: isEventIncoming(this.request) ? this.request.extensions.operationName : undefined,
            destinations: responseDestinations,
            id: options.id ? options.id : undefined,
            timestamp: ts,
            ttl: ts && options.ttl ? options.ttl : undefined,
            post_mode: options.post === "update_only" ? "update_only" : (options.post === "always" ? "always" : "ttl"),
            skill: this.request.skill,
        };

        if (isSlackMessage(msg)) {
            const msgClone = cloneDeep(msg);
            const actions = mapActions(msgClone);
            response.content_type = MessageMimeTypes.SLACK_JSON;
            response.body = render(msgClone, false);
            response.actions = actions;
        } else if (isFileMessage(msg)) {
            response.content_type = MessageMimeTypes.SLACK_FILE_JSON;
            response.body = JSON.stringify({
                content: msg.content,
                filename: msg.fileName,
                filetype: msg.fileType,
                title: msg.title,
                initial_comment: msg.comment,
            });
        } else if (typeof msg === "string") {
            response.content_type = MessageMimeTypes.PLAIN_TEXT;
            response.body = msg;
        } else if (options.delete) {
            response.content_type = "application/x-atomist-delete";
            response.body = undefined;
        }
        return this.sendResponse(response).then(() => response);
    }

    protected abstract sendResponse(response: any): Promise<void>;

    private ts(options: MessageOptions): number {
        if (options.id) {
            if (options.ts) {
                return options.ts;
            } else {
                return Date.now();
            }
        } else {
            return undefined;
        }
    }

    private async getTeamId(teamId: string,
                            graphClient: GraphQLClient): Promise<string> {
        if (teamId) {
            return teamId;
        } else {
            const query = `query ChatTeam { ChatTeam { id } }`;
            const result = await graphClient.query<{ ChatTeam: Array<{ id: string }> }>(query);
            return result?.ChatTeam[0]?.id;
        }
    }
}

export interface CommandReferencingAction extends SlackAction {

    command: CommandReference;
}

/**
 * Information about a command handler used to connect message actions
 * to a command.
 */
export interface CommandReference {

    /**
     * The id of the action as referenced in the markup.
     */
    id: string;

    /**
     * The name of the command the button or menu should invoke
     * when selected.
     */
    name: string;

    /**
     *  List of parameters to be passed to the command.
     */
    parameters?: { [key: string]: any };

    /**
     * Name of the parameter that should be used to pass the values
     * of the menu drop-down.
     */
    parameterName?: string;
}

export function mapActions(msg: SlackMessage): Action[] {
    const actions: Action[] = [];

    let counter = 0;

    if (msg.attachments) {
        msg.attachments.filter(attachment => attachment.actions).forEach(attachment => {
            attachment.actions.forEach(a => {
                if (!!a && !!(a as CommandReferencingAction).command) {
                    const cra = a as CommandReferencingAction;

                    const id = counter++;
                    cra.command.id = `${cra.command.id}-${id}`;
                    a.name = `${a.name}-${id}`;

                    const action: Action = {
                        id: cra.command.id,
                        parameter_name: cra.command.parameterName,
                        command: cra.command.name,
                        parameters: mapParameters(cra.command.parameters),
                    };

                    actions.push(action);
                    // Lastly we need to delete our extension from the slack action
                    cra.command = undefined;
                }
            });
        });
    }
    return actions;
}

function mapParameters(data: {}): Parameter[] {
    const parameters: Parameter[] = [];
    for (const key in data) {
        const value = data[key];
        if (value) {
            parameters.push({
                name: key,
                value: value.toString(),
            });
        } else {
            // logger.debug(`Parameter value for '${key}' is null`);
        }
    }
    return parameters;
}

export interface HandlerResponse {
    api_version: "1";

    correlation_id: any;

    team: {
        id: string;
        name?: string;
    };

    command?: string;
    event?: string;

    status?: {
        visibility?: "hidden";
        code?: number;
        reason: string;
    };

    source?: Source;

    destinations?: any[];

    content_type?: string;

    body?: string;

    // Updatable messages
    id?: string;
    timestamp?: number;
    ttl?: number;
    post_mode?: "ttl" | "always" | "update_only";

    actions?: Action[];

    skill: Skill;
}

export interface Action {
    id: string;
    parameter_name?: string;
    command: string;
    parameters: Parameter[];
}

export interface Parameter {
    name: string;
    value: string;
}

export function isSlackMessage(object: any): object is SlackMessage {
    return !!object && (object.text || object.attachments || object.blocks) && !object.content;
}

/**
 * Message to create a Snippet in Slack
 */
export interface SlackFileMessage {
    content: string;
    title?: string;
    fileName?: string;
    // https://api.slack.com/types/file#file_types
    fileType?: string;
    comment?: string;

}

export function isFileMessage(object: any): object is SlackFileMessage {
    return !!object && !object.length && object.content;
}

export interface StatusPublisher {
    publish(status: HandlerResponse["status"]): Promise<void>;
}

abstract class AbstractPubSubMessageClient extends AbstractMessageClient {

    private readonly pubsub: PubSub;

    constructor(protected readonly request: CommandIncoming | EventIncoming,
                protected readonly correlationId: string,
                protected readonly team: { id: string; name?: string },
                protected readonly source: Source,
                protected readonly graphClient: GraphQLClient) {
        super(request, correlationId, team, source, graphClient);
        this.pubsub = new PubSub();

    }

    public async sendResponse(message: any): Promise<void> {
        const topicName = process.env.ATOMIST_TOPIC || process.env.TOPIC;
        try {
            debug(`Sending message: ${JSON.stringify(message, replacer)}`);
            if (topicName) {
                const topic = this.pubsub.topic(topicName);
                const messageBuffer = Buffer.from(JSON.stringify(message), "utf8");
                await topic.publish(messageBuffer);
            }
        } catch (err) {
            error(`Error occurred sending message: ${err.message}`);
        }
    }
}

export class PubSubCommandMessageClient extends AbstractPubSubMessageClient implements StatusPublisher {

    constructor(protected readonly request: CommandIncoming,
                protected readonly graphClient: GraphQLClient) {
        super(request, request.correlation_id, request.team, request.source, graphClient);
    }

    protected async doSend(msg: string | SlackMessage,
                           destinations: Destinations,
                           options: MessageOptions = {}): Promise<any> {
        return super.doSend(msg, destinations, options);
    }

    public async publish(status: HandlerResponse["status"]): Promise<void> {
        const source = cloneDeep(this.request.source);
        if (source && source.slack) {
            delete source.slack.user;
        }
        const response: HandlerResponse = {
            api_version: "1",
            correlation_id: this.request.correlation_id,
            team: this.request.team,
            command: this.request.command,
            source: this.request.source,
            destinations: [source],
            status,
            skill: this.request.skill,
        };
        return this.sendResponse(response);
    }
}

export class PubSubEventMessageClient extends AbstractPubSubMessageClient implements StatusPublisher {

    constructor(protected readonly request: EventIncoming,
                protected readonly graphClient: GraphQLClient) {
        super(request, request.extensions.correlation_id,
            { id: request.extensions.team_id, name: request.extensions.team_name }, undefined, graphClient);
    }

    protected async doSend(msg: string | SlackMessage,
                           destinations: Destinations,
                           options: MessageOptions = {}): Promise<any> {
        return super.doSend(msg, destinations, options);
    }

    public async publish(status: HandlerResponse["status"]): Promise<void> {
        const response: HandlerResponse = {
            api_version: "1",
            correlation_id: this.request.extensions.correlation_id,
            team: {
                id: this.request.extensions.team_id,
                name: this.request.extensions.team_name,
            },
            event: this.request.extensions.operationName,
            status,
            skill: this.request.skill,
        };
        return this.sendResponse(response);
    }
}

export function prepareStatus(status: HandlerStatus | Error, context: EventContext | CommandContext): HandlerResponse["status"] {
    if (status instanceof Error) {
        return {
            code: 1,
            reason: `Error invoking ${context.skill.namespace}/${context.skill.name}`,
        };
    } else {
        const reason = `${status?.code === 0 ? "Successfully" : "Unsuccessfully"} invoked ${context.skill.namespace}/${context.skill.name}`;
        return {
            visibility: status?.visibility,
            code: status?.code || 0,
            reason: status?.reason || reason,
        };
    }
}
