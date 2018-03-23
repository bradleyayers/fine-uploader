/* globals qq */
/**
 * Common upload handler functions.
 *
 * @constructor
 */
qq.UploadHandler = function(spec) {
    "use strict";

    var proxy = spec.proxy,
        fileState = {},
        onCancel = proxy.onCancel,
        getName = proxy.getName;

    qq.extend(this, {
        add: function(id, fileItem) {
            fileState[id] = fileItem;
            fileState[id].temp = {};
        },

        cancel: function(id) {
            var self = this,
                _resolve,
                onCancelRetVal = onCancel(id, getName(id), new Promise(function(resolve) {
                    _resolve = resolve;
                }));

            onCancelRetVal.then(function() {
                if (self.isValid(id)) {
                    fileState[id].canceled = true;
                    self.expunge(id);
                }
                _resolve();
            });
        },

        expunge: function(id) {
            delete fileState[id];
        },

        getThirdPartyFileId: function(id) {
            return fileState[id].key;
        },

        isValid: function(id) {
            return fileState[id] !== undefined;
        },

        reset: function() {
            fileState = {};
        },

        _getFileState: function(id) {
            return fileState[id];
        },

        _setThirdPartyFileId: function(id, thirdPartyFileId) {
            fileState[id].key = thirdPartyFileId;
        },

        _wasCanceled: function(id) {
            return !!fileState[id].canceled;
        }
    });
};
