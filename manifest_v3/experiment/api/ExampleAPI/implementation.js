/* eslint-disable object-shorthand */

"use strict";

// Using a closure to not leak anything but the API to the outside world.
(function (exports) {

  const { ExtensionSupport } = ChromeUtils.importESModule(
    "resource:///modules/ExtensionSupport.sys.mjs"
  );
  const { ExtensionUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/ExtensionUtils.sys.mjs"
  );
  const { ExtensionError } = ExtensionUtils;

  /**
   * This object is just what we're using to listen for toolbar clicks. The
   * implementation isn't what this example is about, but you might be interested
   * as it's a common pattern. We count the number of callbacks waiting for events
   * so that we're only listening if we need to be.
   * 
   * An EventEmitter has the following basic functions:
   * 
   * EventEmitter.on(emitterName, callback)
   *   Registers a callback for a custom emitter.
   * 
   * EventEmitter.off(emitterName, callback)
   *   Unregisters a callback for a custom emitter.
   * 
   * EventEmitter.emit(emitterName)
   *   Emit a custom emitter, all provided parameters will be forwarded to the
   *   registered callbacks.
   */

  class WindowListener extends ExtensionCommon.EventEmitter {
    constructor(extension) {
      super();
      this.extension = extension;
      this.callbackCount = 0;
    }

    get listenerId() {
      return `experiment_listener_${this.extension.uuid}_${this.extension.instanceId}`;
    }

    handleEvent(event) {
      // Emit "toolbar-clicked" and send event.clientX, event.clientY to
      // the registered callbacks.
      windowListener.emit("toolbar-clicked", event.clientX, event.clientY);
    }

    add(callback) {
      // Registering the callback for "toolbar-clicked".
      this.on("toolbar-clicked", callback);
      this.callbackCount++;

      if (this.callbackCount == 1) {
        ExtensionSupport.registerWindowListener(this.listenerId, {
          chromeURLs: [
            "chrome://messenger/content/messenger.xhtml",
          ],
          onLoadWindow: function (window) {
            let toolbox = window.document.getElementById("unifiedToolbarContainer");
            toolbox.addEventListener("click", windowListener.handleEvent);
          },
        });
      }
    }

    remove(callback) {
      // Un-Registering the callback for "toolbar-clicked".
      this.off("toolbar-clicked", callback);
      this.callbackCount--;

      if (this.callbackCount == 0) {
        for (let window of ExtensionSupport.openWindows) {
          if ([
            "chrome://messenger/content/messenger.xhtml",
          ].includes(window.location.href)) {
            let toolbox = window.document.getElementById("unifiedToolbarContainer");
            toolbox.removeEventListener("click", this.handleEvent);
          }
        }
        ExtensionSupport.unregisterWindowListener(this.listenerId);
      }
    }
  };
  // The variable for our WindowListener instance. Since we need the extension
  // object, we cannot create it here directly.
  let windowListener;


  // A helper to manage custom resource:// urls.
  const resourceUrl = {
    register(customNamespace, extension, folder) {
      const resProto = Cc[
        "@mozilla.org/network/protocol;1?name=resource"
      ].getService(Ci.nsISubstitutingProtocolHandler);

      if (resProto.hasSubstitution(customNamespace)) {
        throw new ExtensionError(`There is already a resource:// url for the namespace "${customNamespace}"`);
      }

      let uri = Services.io.newURI(
        folder || ".",
        null,
        extension.rootURI
      );
      resProto.setSubstitutionWithFlags(
        customNamespace,
        uri,
        resProto.ALLOW_CONTENT_ACCESS
      );
    },

    unloadAllModules(customNamespace) {
      for (let module of Cu.loadedModules) {
        let [schema, , namespace] = module.split("/");
        if (
          schema == "resource:" && 
          customNamespace.toLowerCase() == namespace.toLowerCase()
        ) {
          console.log("Unloading module", module);
          Cu.unload(module);
        }
      }
    },
    
    unregister(customNamespace) {
      const resProto = Cc[
        "@mozilla.org/network/protocol;1?name=resource"
      ].getService(Ci.nsISubstitutingProtocolHandler);
      console.log("Unloading namespace", customNamespace);
      resProto.setSubstitution(customNamespace, null);
    },
  }
  // The variable for our TestModule, which we are going to load once our resource://
  // url has been registered. Since we need the extension object, we cannot do that
  // here directly.
  let TestModule;

  // This is the important part. It implements the functions and events defined
  // in the schema.json. The name must match what you've been using so far,
  // "ExampleAPI" in this case.
  // For Manifest V3, the used class must be ExtensionAPIPersistent(), otherwise
  // its events are not registered as being persistent and will fail to wake up
  // the background. 
  class ExampleAPI extends ExtensionCommon.ExtensionAPIPersistent {
    // An alternative to defining a constructor here, is to use the onStartup
    // event. However, this causes the API to be instantiated directly after the
    // add-on has been loaded, not when the API is first used. Depends on what is
    // desired.
    constructor(extension) {
      super(extension);
      windowListener = new WindowListener(extension);

      // Register a resource:// url which points to the module folder. The name
      // should be unique to avoid conflicts with other add-ons.
      resourceUrl.register("exampleAddon1234", extension, "modules/");
  
      // Load our own TestModule. This should be used as a last resort and only if
      // the code is too complex to be part of the implementation file directly.
      // Since TestModule is not defined here, outer parentheses are required. See
      // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring_assignment#assignment_separate_from_declaration_2
      ({ TestModule } = ChromeUtils.importESModule(
        "resource://exampleAddon1234/TestModule.sys.mjs"
      ));
    }

    PERSISTENT_EVENTS = {
      // For primed persistent events (deactivated background), the context is
      // only available after fire.wakeup() has fulfilled (ensuring the convert()
      // function has been called).

      onToolbarClick({ context, fire }) {
        const { extension } = this;

        // In this function we add listeners for any events we want to listen to,
        // and return a function that removes those listeners. To have the event
        // fire in your extension, call fire.async.
        async function callback(event, x, y) {
          if (fire.wakeup) {
            await fire.wakeup();
          }
          return fire.async(x, y);
        }
        windowListener.add(callback);

        return {
          unregister: () => {
            windowListener.remove(callback);
          },
          convert(newFire, extContext) {
            fire = newFire;
            context = extContext;
          },
        };
      }
    }

    getAPI(context) {
      return {
        // This key must match the class name.
        ExampleAPI: {

          // A function.
          sayHello: async function (name) {
            TestModule.alert(name);
          },

          // A persistent event. Most of this is boilerplate you don't need to
          // worry about, just copy it. The actual implementation is inside the
          // PERSISTENT_EVENTS object.
          onToolbarClick: new ExtensionCommon.EventManager({
            context,
            module: "ExampleAPI",
            event: "onToolbarClick",
            extensionApi: this,
          }).api(),
        },
      };
    }

    onShutdown(isAppShutdown) {
      // This function is called if the extension is disabled or removed, or
      // Thunderbird closes. We usually do not have to do any cleanup, if
      // Thunderbird is shutting down entirely.
      if (isAppShutdown) {
        return;
      }
      
      // Unload all modules which have been loaded with our resource:// url.
      resourceUrl.unloadAllModules("exampleAddon1234");

      // Unregister our resource:// url.
      resourceUrl.unregister("exampleAddon1234");

      // Flush all caches.
      Services.obs.notifyObservers(null, "startupcache-invalidate");

      console.log("Goodbye world!");
    }
  };

  // Export the api by assigning in to the exports parameter of the anonymous
  // closure function, which is the global this.
  exports.ExampleAPI = ExampleAPI;

})(this)
