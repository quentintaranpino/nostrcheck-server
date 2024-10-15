// Example plugin that logs the input and globals to the console

function plugin() {
    return {
        order: 0,
        enabled: false,
        name: 'ExamplePlugin',
        execute: async (input, globals) => {
            globals.logger.debug(`ExamplePlugin input: ${JSON.stringify(input)}`);
            globals.logger.debug(`ExamplePlugin globals: ${JSON.stringify(globals)}`);
            return true;
        }
    };
}

export default plugin;