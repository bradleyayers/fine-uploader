/*globals qq*/

if (typeof Promise === "undefined") {
    throw new Error("FileUploader requires a native promise implementation.");
}

// Is the passed object a promise instance?
qq.isGenericPromise = function(maybePromise) {
    "use strict";
    return !!(maybePromise && maybePromise.then && qq.isFunction(maybePromise.then));
};
