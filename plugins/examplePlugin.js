// Example plugin that does nothing

function plugin() {
    return {
        order: 0,
        enabled: false,
        name: 'ExamplePlugin',
        execute: async () => {
            return true;
        }
    };
}

export default plugin;