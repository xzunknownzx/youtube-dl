const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",
    
    fg: {
        black: "\x1b[30m",
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        magenta: "\x1b[35m",
        cyan: "\x1b[36m",
        white: "\x1b[37m",
        crimson: "\x1b[38m"
    },
    bg: {
        black: "\x1b[40m",
        red: "\x1b[41m",
        green: "\x1b[42m",
        yellow: "\x1b[43m",
        blue: "\x1b[44m",
        magenta: "\x1b[45m",
        cyan: "\x1b[46m",
        white: "\x1b[47m",
        crimson: "\x1b[48m"
    }
};

function colorLog(action, username, details = '') {
    const timestamp = new Date().toLocaleTimeString();
    let coloredAction;

    switch (action) {
        case 'CALLBACK':
            coloredAction = `${colors.fg.yellow}${action}${colors.reset}`;
            break;
        case 'MESSAGE':
            coloredAction = `${colors.fg.green}${action}${colors.reset}`;
            break;
        case 'STATE':
            coloredAction = `${colors.fg.cyan}${action}${colors.reset}`;
            break;
        case 'ERROR':
            coloredAction = `${colors.fg.red}${action}${colors.reset}`;
            break;
        default:
            coloredAction = `${colors.fg.white}${action}${colors.reset}`;
    }

    // Ensure username is a string and use a fallback if it's not provided
    const safeUsername = typeof username === 'string' ? username : 'Unknown';

    console.log(`${timestamp} ${coloredAction} ${colors.fg.magenta}${safeUsername}${colors.reset} ${details}`);
}

module.exports = { colorLog, colors };