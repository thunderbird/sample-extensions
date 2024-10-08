## Inline Attachment Preview

This extension uses the `listAttachments()` and `getAttachmentFile()` functions of the `messages`API to extract attached PDFs and images. The `messageDisplayScript` API is used to generate inline previews.

The PDF Icon is taken from [freeicons.io](https://freeicons.io/logos/pdf-icon-2304) and is released under Creative Commons (Attribution 3.0 unported).

### Differences from the version for Manifest V2

The `messageDisplayScripts` API has been replaced by the `scripting.messageDisplay` API:

```javascript
browser.scripting.messageDisplay.registerScripts([{
  id: "message-display-script-example-2",
  js: ["initial.js"],
}]);
```

The `messagesModify` permission is no longer needed. The `scripting` permission is now required to inject message display scripts, together with the `messagesRead` permission.