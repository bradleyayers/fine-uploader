/*globals qq*/
/**
 * Ajax requester used to send a POST to a traditional endpoint once all chunks for a specific file have uploaded
 * successfully.
 *
 * @param o Options from the caller - will override the defaults.
 * @constructor
 */
qq.traditional.AllChunksDoneAjaxRequester = function(o) {
    "use strict";

    var requester,
        options = {
            cors: {
                allowXdr: false,
                expected: false,
                sendCredentials: false
            },
            endpoint: null,
            log: function(str, level) {},
            method: "POST"
        },
        promises = {},
        endpointHandler = {
            get: function(id) {
                if (qq.isFunction(options.endpoint)) {
                    return options.endpoint(id);
                }

                return options.endpoint;
            }
        };

    qq.extend(options, o);

    requester = qq.extend(this, new qq.AjaxRequester({
        acceptHeader: "application/json",
        contentType: options.jsonPayload ? "application/json" : "application/x-www-form-urlencoded",
        validMethods: [options.method],
        method: options.method,
        endpointStore: endpointHandler,
        allowXRequestedWithAndCacheControl: false,
        cors: options.cors,
        log: options.log,
        onComplete: function(id, xhr, isError) {
            var promise = promises[id],
                error;

            delete promises[id];

            if (isError) {
                error = new Error("Failed to request all chunks done.");
                error.xhr = xhr;
                promise.reject(error);
            }
            else {
                promise.resolve(xhr);
            }
        }
    }));

    qq.extend(this, {
        complete: function(id, xhr, params, headers) {
            return new Promise(function(resolve, reject) {
                options.log("Submitting All Chunks Done request for " + id);

                promises[id] = {resolve: resolve, reject: reject};

                requester.initTransport(id)
                    .withParams(options.params(id) || params)
                    .withHeaders(options.headers(id) || headers)
                    .send(xhr);
            });
        }
    });
};
