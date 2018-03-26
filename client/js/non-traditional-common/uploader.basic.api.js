/*globals qq*/
/**
 * Defines the public API for non-traditional FineUploaderBasic mode.
 */
(function() {
    "use strict";

    qq.nonTraditionalBasePublicApi = {
        setUploadSuccessParams: function(params, id) {
            this._uploadSuccessParamsStore.set(params, id);
        },
        setUploadSuccessEndpoint: function(endpoint, id) {
            this._uploadSuccessEndpointStore.set(endpoint, id);
        }
    };

    qq.nonTraditionalBasePrivateApi = {
        /**
         * When the upload has completed, if it is successful, send a request to the `successEndpoint` (if defined).
         * This will hold up the call to the `onComplete` callback until we have determined success of the upload
         * according to the local server, if a `successEndpoint` has been defined by the integrator.
         *
         * @param id ID of the completed upload
         * @param name Name of the associated item
         * @param result Object created from the server's parsed JSON response.
         * @param xhr Associated XmlHttpRequest, if this was used to send the request.
         * @returns {boolean || Promise} true/false if success can be determined immediately, otherwise a `Promise`
         * if we need to ask the server.
         * @private
         */
        _onComplete: function(id, name, result, xhr) {
            var success = result.success ? true : false,
                self = this,
                onCompleteArgs = arguments,
                successEndpoint = this._uploadSuccessEndpointStore.get(id),
                successCustomHeaders = this._options.uploadSuccess.customHeaders,
                successMethod = this._options.uploadSuccess.method,
                cors = this._options.cors,
                uploadSuccessParams = this._uploadSuccessParamsStore.get(id),
                fileParams = this._paramsStore.get(id),
                submitSuccessRequest,
                successAjaxRequester;

            // Ask the local server if the file sent is ok.
            if (success && successEndpoint) {
                successAjaxRequester = new qq.UploadSuccessAjaxRequester({
                    endpoint: successEndpoint,
                    method: successMethod,
                    customHeaders: successCustomHeaders,
                    cors: cors,
                    log: qq.bind(this.log, this)
                });

                // combine custom params and default params
                qq.extend(uploadSuccessParams, self._getEndpointSpecificParams(id, result, xhr), true);

                // include any params associated with the file
                fileParams && qq.extend(uploadSuccessParams, fileParams, true);

                return new Promise(function(resolve, reject) {
                    submitSuccessRequest = qq.bind(function() {
                        successAjaxRequester.sendSuccessRequest(id, uploadSuccessParams)
                            .then(
                                // If we are waiting for confirmation from the local server, and have received it,
                                // include properties from the local server response in the `response` parameter
                                // sent to the `onComplete` callback, delegate to the parent `_onComplete`, and
                                // resolve the associated promise.
                                function(successRequestResult) {
                                    delete self._failedSuccessRequestCallbacks[id];
                                    qq.extend(result, successRequestResult);
                                    qq.FineUploaderBasic.prototype._onComplete.apply(self, onCompleteArgs);
                                    resolve(successRequestResult);
                                },
                                // If the upload success request fails, attempt to re-send the success request (via the core retry code).
                                // The entire upload may be restarted if the server returns a "reset" property with a value of true as well.
                                function(successRequestResult) {
                                    var callback = submitSuccessRequest,
                                        error;

                                    qq.extend(result, successRequestResult);

                                    if (result && result.reset) {
                                        callback = null;
                                    }

                                    if (!callback) {
                                        delete self._failedSuccessRequestCallbacks[id];
                                    }
                                    else {
                                        self._failedSuccessRequestCallbacks[id] = callback;
                                    }

                                    if (!self._onAutoRetry(id, name, result, xhr, callback)) {
                                        qq.FineUploaderBasic.prototype._onComplete.apply(self, onCompleteArgs);
                                        error = new Error("Success request failed");
                                        error.response = successRequestResult;
                                        reject(error);
                                    }
                                }
                            );
                    }, self);

                    submitSuccessRequest();
                });
            }

            // If we are not asking the local server about the file, just delegate to the parent `_onComplete`.
            return qq.FineUploaderBasic.prototype._onComplete.apply(this, arguments);
        },

        // If the failure occurred on an upload success request (and a reset was not ordered), try to resend that instead.
        _manualRetry: function(id) {
            var successRequestCallback = this._failedSuccessRequestCallbacks[id];

            return qq.FineUploaderBasic.prototype._manualRetry.call(this, id, successRequestCallback);
        }
    };
}());
