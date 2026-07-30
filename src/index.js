import { EnhancedPluginManager } from "./app.js";
import { PluginPageController } from "./controller.js";
import { GraphQLClient } from "./graphql.js";
import { PluginManagerService } from "./service.js";

const GLOBAL_KEY = "__stashPluginManagerEnhanced";

if (!window[GLOBAL_KEY]) {
  const client = new GraphQLClient();
  const service = new PluginManagerService(client);
  const controller = new PluginPageController({
    createApp: () => new EnhancedPluginManager(service),
  });
  window[GLOBAL_KEY] = controller;
  controller.start();
}
