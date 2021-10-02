import * as chalk from 'chalk';
import _ from 'lodash';
import formatDate from 'date-fns/format';
import { Writable } from 'stream';

import { defaults } from './defaults';

export interface LoggerParams {
    outputStream: Writable,
    hide?: (string | number)[],
    raw?: boolean,
    prefixFormat?: string,
    prefixLength?: number,
    timestampFormat?: string,
}

export class Logger {
    private readonly outputStream: Writable;
    private readonly hide: string[];
    private readonly raw?: boolean;
    private readonly prefixFormat?: string;
    private readonly prefixLength?: number;
    private readonly timestampFormat?: string;
    private lastChar?: string;

    constructor({ hide, outputStream, prefixFormat, prefixLength, raw, timestampFormat }: LoggerParams) {
        // To avoid empty strings from hiding the output of commands that don't have a name,
        // keep in the list of commands to hide only strings with some length.
        // This might happen through the CLI when no `--hide` argument is specified, for example.
        this.hide = _.castArray(hide).filter(name => name || name === 0).map(String);
        this.raw = raw;
        this.outputStream = outputStream;
        this.prefixFormat = prefixFormat;
        this.prefixLength = prefixLength || defaults.prefixLength;
        this.timestampFormat = timestampFormat || defaults.timestampFormat;
    }

    private shortenText(text) {
        if (!text || text.length <= this.prefixLength) {
            return text;
        }

        const ellipsis = '..';
        const prefixLength = this.prefixLength - ellipsis.length;
        const endLength = Math.floor(prefixLength / 2);
        const beginningLength = prefixLength - endLength;

        const beginnning = text.substring(0, beginningLength);
        const end = text.substring(text.length - endLength, text.length);
        return beginnning + ellipsis + end;
    }

    private getPrefixesFor(command) {
        return {
            none: '',
            pid: command.pid,
            index: command.index,
            name: command.name,
            command: this.shortenText(command.command),
            time: formatDate(Date.now(), this.timestampFormat)
        };
    }

    private getPrefix(command) {
        const prefix = this.prefixFormat || (command.name ? 'name' : 'index');
        if (prefix === 'none') {
            return '';
        }

        const prefixes = this.getPrefixesFor(command);
        if (Object.keys(prefixes).includes(prefix)) {
            return `[${prefixes[prefix]}]`;
        }

        return _.reduce(prefixes, (prev, val, key) => {
            const keyRegex = new RegExp(_.escapeRegExp(`{${key}}`), 'g');
            return prev.replace(keyRegex, val);
        }, prefix);
    }

    private colorText(command, text) {
        let color;
        if (command.prefixColor && command.prefixColor.startsWith('#')) {
            color = chalk.hex(command.prefixColor);
        } else {
            const defaultColor = _.get(chalk, defaults.prefixColors, chalk.reset);
            color = _.get(chalk, command.prefixColor, defaultColor);
        }
        return color(text);
    }

    logCommandEvent(text, command) {
        if (this.raw) {
            return;
        }

        this.logCommandText(chalk.reset(text) + '\n', command);
    }

    logCommandText(text, command) {
        if (this.hide.includes(String(command.index)) || this.hide.includes(command.name)) {
            return;
        }

        const prefix = this.colorText(command, this.getPrefix(command));
        return this.log(prefix + (prefix ? ' ' : ''), text);
    }

    logGlobalEvent(text) {
        if (this.raw) {
            return;
        }

        this.log(chalk.reset('-->') + ' ', chalk.reset(text) + '\n');
    }

    log(prefix, text) {
        if (this.raw) {
            return this.outputStream.write(text);
        }

        // #70 - replace some ANSI code that would impact clearing lines
        text = text.replace(/\u2026/g, '...');

        const lines = text.split('\n').map((line, index, lines) => {
            // First line will write prefix only if we finished the last write with a LF.
            // Last line won't write prefix because it should be empty.
            if (index === 0 || index === lines.length - 1) {
                return line;
            }
            return prefix + line;
        });

        if (!this.lastChar || this.lastChar === '\n') {
            this.outputStream.write(prefix);
        }

        this.lastChar = text[text.length - 1];
        this.outputStream.write(lines.join('\n'));
    }
};
