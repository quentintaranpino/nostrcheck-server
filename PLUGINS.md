# Plugin System Overview

The server uses a flexible plugin system to extend and customize functionality. Plugins are JavaScript functions that can be enabled or disabled, prioritized through an `order` property, and execute specific logic based on the server's input and global context.

## Plugin Structure

Each plugin is an object with the following properties:

- **`order`**: Determines the execution priority of the plugin. Plugins with lower `order` values are executed first.
- **`enabled`**: A boolean flag to enable or disable the plugin.
- **`name`**: A unique name for the plugin.
- **`module`**: The server module that affects the plugin. This is used to group plugins based on server functionality.
- **`execute`**: The core function of the plugin, which contains the logic to be executed. This function is asynchronous and receives two parameters:
  - **`input`**: Contains the input data for the plugin to process.
  - **`globals`**: Contains global variables and utilities accessible by the server, such as Redis, Nostr, logging, and configuration settings.

## Example Plugin

Here is a typical structure of a plugin:

```javascript
function plugin() {
    return {
        order: 1,
        enabled: true,
        name: 'examplePlugin',
        module: 'relay',
        execute: async (input, globals) => {
            try {
                // Perform some logic using input and globals
                const result = await globals.someUtility.performAction(input.data);
                
                // Return the result of the plugin's execution
                return result;
            } catch (error) {
                globals.logger.error('Error executing examplePlugin', error);
                return false;
            }
        }
    };
}

export default plugin;
```

## Redis integration

To optimize performance, many plugins use Redis for caching frequently requested data. This avoids redundant API calls or computations by storing results in Redis with an expiration time.

Here’s an example of how Redis is used in a plugin:

```javascript

 let result = JSON.parse(await globals.redis.get(`pluginName-${key}`));

if (!result) {
    result = await globals.someUtility.action(key);
    await globals.redis.set(`pluginName-${key}`, JSON.stringify(result), { EX: 3600 });
}

return result.includes(key);

```

## Error Handling

Every plugin should handle errors gracefully to prevent the server from crashing. The `execute` function should catch any exceptions and log them using the provided `globals.logger` object. The plugin should return `false` to indicate that an error occurred during execution.

```javascript
try {
    // Plugin logic
} catch (error) {
    globals.logger.error('Error executing pluginName', error);
    return false;
}
```


### Input Structure

The `input` object passed to each plugin contains important data that the plugin can process. Typically, this object includes fields related to the request or action being processed. Below are the commonly used properties in the `input` object:

- **`input.pubkey`**: This property contains the public key of the user or entity associated with the action being processed. For instance, in plugins that deal with Nostr pubkeys, this value is used to look up information like followers, following, or metadata.
  
- **`input.filename`**: This represents the hashed name of a file that may be involved in the operation, such as an uploaded file. Plugins can use this information to validate, log, or perform actions based on the file's name.

- **`input.ip`**: The IP address of the the request. This can be used for logging purposes, security checks, or other functionalities where identifying the origin of the request is necessary.

- **`input.event`**: This property contains a nostr event object that may be used to extract information about the event, such as the event type, timestamp, or other relevant data.

## Common globals

The following global variables are available to plugins:

- **`globals.logger`**: Used for logging any relevant information or errors during plugin execution.
- **`globals.redis`**: Provides access to Redis for caching or storing data
- **`globals.nostr`**: Allows interaction with the Nostr protocol for fetching pubkey information, followers, and metadata.
- **`globals.app`**: Accesses server configurations or settings like pubkey or other server-specific data.
