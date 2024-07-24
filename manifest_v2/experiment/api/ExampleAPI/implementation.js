/* eslint-disable object-shorthand */

"use strict";

// Using a closure to not leak anything but the API to the outside world.
(function (exports) {

  // A helpful class for listening to windows opening and closing.
  var { ExtensionSupport } = ChromeUtils.importESModule(
    "resource:///modules/ExtensionSupport.sys.mjs"
  );

  /**
   * This object is just what we're using to listen for toolbar clicks. The implementation
   * isn't what this example is about, but you might be interested as it's a common pattern.
   * We count the number of callbacks waiting for events so that we're only listening if we
   * need to be.
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
   *   Emit a custom emitter, all provided parameters will be forwarded to the registered callbacks.
   */

  let windowListener;

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


  // This is the important part. It implements the functions and events defined
  // in the schema.json. The name must match what you've been using so far,
  // "ExampleAPI" in this case.
  class ExampleAPI extends ExtensionCommon.ExtensionAPI {
    // An alternative to defining a constructor here, is to use the onStartup
    // event. However, this causes the API to be instantiated directly after the
    // add-on has been loaded, not when the API is first used. Depends on what is
    // desired.
    constructor(extension) {
      super(extension);
      windowListener = new WindowListener(extension);
    }

    getAPI(context) {
      return {
        // This key must match the class name.
        ExampleAPI: {

          // A function.
          sayHello: async function (name) {
            Services.wm.getMostRecentWindow("mail:3pane").alert(name);
          },

          // An event. Most of this is boilerplate you don't need to worry about, just copy it.
          onToolbarClick: new ExtensionCommon.EventManager({
            context,
            name: "ExampleAPI.onToolbarClick",
            // In this function we add listeners for any events we want to listen to, and return a
            // function that removes those listeners. To have the event fire in your extension,
            // call fire.async.
            register(fire) {
              function callback(event, x, y) {
                return fire.async(x, y);
              }

              windowListener.add(callback);
              return function () {
                windowListener.remove(callback);
              };
            },
          }).api(),

        },
      };
    }

    onShutdown(isAppShutdown) {
      // This function is called if the extension is disabled or removed, or Thunderbird closes.
      // We usually do not have to do any cleanup, if Thunderbird is shutting down entirely
      if (isAppShutdown) {
        return;
      }

      console.log("Goodbye world!");
    }
  };

  // Export the api by assigning in to the exports parameter of the anonymous closure
  // function, which is the global this.
  exports.ExampleAPI = ExampleAPI;

})(this)
