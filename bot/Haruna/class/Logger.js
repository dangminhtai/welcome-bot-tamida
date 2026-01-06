import chalk from 'chalk';

export default class Logger {
    static info(text) {
        console.log(`${chalk.blue('[INFO]')} ${chalk.gray(new Date().toLocaleTimeString())} : ${text}`);
    }

    static warn(text) {
        console.log(`${chalk.yellow('[WARN]')} ${chalk.gray(new Date().toLocaleTimeString())} : ${text}`);
    }

    static error(text) {
        console.log(`${chalk.red('[ERROR]')} ${chalk.gray(new Date().toLocaleTimeString())} : ${text}`);
    }

    static success(text) {
        console.log(`${chalk.green('[SUCCESS]')} ${chalk.gray(new Date().toLocaleTimeString())} : ${text}`);
    }

    static debug(text) {
        console.log(`${chalk.magenta('[DEBUG]')} ${chalk.gray(new Date().toLocaleTimeString())} : ${text}`);
    }
}
