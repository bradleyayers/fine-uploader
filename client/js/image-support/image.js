/*globals qq */
/**
 * Draws a thumbnail of a Blob/File/URL onto an <img> or <canvas>.
 *
 * @constructor
 */
qq.ImageGenerator = function(log) {
    "use strict";

    function isImg(el) {
        return el.tagName.toLowerCase() === "img";
    }

    function isCanvas(el) {
        return el.tagName.toLowerCase() === "canvas";
    }

    function isImgCorsSupported() {
        return new Image().crossOrigin !== undefined;
    }

    function isCanvasSupported() {
        var canvas = document.createElement("canvas");

        return canvas.getContext && canvas.getContext("2d");
    }

    // This is only meant to determine the MIME type of a renderable image file.
    // It is used to ensure images drawn from a URL that have transparent backgrounds
    // are rendered correctly, among other things.
    function determineMimeOfFileName(nameWithPath) {
        /*jshint -W015 */
        var pathSegments = nameWithPath.split("/"),
            name = pathSegments[pathSegments.length - 1].split("?")[0],
            extension = qq.getExtension(name);

        extension = extension && extension.toLowerCase();

        switch (extension) {
            case "jpeg":
            case "jpg":
                return "image/jpeg";
            case "png":
                return "image/png";
            case "bmp":
                return "image/bmp";
            case "gif":
                return "image/gif";
            case "tiff":
            case "tif":
                return "image/tiff";
        }
    }

    // This will likely not work correctly in IE8 and older.
    // It's only used as part of a formula to determine
    // if a canvas can be used to scale a server-hosted thumbnail.
    // If canvas isn't supported by the UA (IE8 and older)
    // this method should not even be called.
    function isCrossOrigin(url) {
        var targetAnchor = document.createElement("a"),
            targetProtocol, targetHostname, targetPort;

        targetAnchor.href = url;

        targetProtocol = targetAnchor.protocol;
        targetPort = targetAnchor.port;
        targetHostname = targetAnchor.hostname;

        if (targetProtocol.toLowerCase() !== window.location.protocol.toLowerCase()) {
            return true;
        }

        if (targetHostname.toLowerCase() !== window.location.hostname.toLowerCase()) {
            return true;
        }

        // IE doesn't take ports into consideration when determining if two endpoints are same origin.
        if (targetPort !== window.location.port && !qq.ie()) {
            return true;
        }

        return false;
    }

    function registerImgLoadListeners(img) {
        return new Promise(function(resolve, reject) {
            img.onload = function() {
                img.onload = null;
                img.onerror = null;
                resolve(img);
            };

            img.onerror = function() {
                var error = new Error("Problem drawing thumbnail!");
                error.img = img;
                img.onload = null;
                img.onerror = null;
                log("Problem drawing thumbnail!", "error");
                reject(error);
            };
        });
    }

    function registerCanvasDrawImageListener(canvas) {
        return new Promise(function(resolve) {
            // The image is drawn on the canvas by a third-party library,
            // and we want to know when this is completed.  Since the library
            // may invoke drawImage many times in a loop, we need to be called
            // back when the image is fully rendered.  So, we are expecting the
            // code that draws this image to follow a convention that involves a
            // function attached to the canvas instance be invoked when it is done.
            canvas.qqImageRendered = function() {
                resolve(canvas);
            };
        });
    }

    // Fulfills a `Promise` when an image has been drawn onto the target,
    // whether that is a <canvas> or an <img>.  The attempt is considered a
    // failure if the target is not an <img> or a <canvas>, or if the drawing
    // attempt was not successful.
    function registerThumbnailRenderedListener(imgOrCanvas) {
        if (isImg(imgOrCanvas)) {
            return registerImgLoadListeners(imgOrCanvas);
        }
        else if (isCanvas(imgOrCanvas)) {
            return registerCanvasDrawImageListener(imgOrCanvas);
        }
        else {
            log(qq.format("Element container of type {} is not supported!", imgOrCanvas.tagName), "error");
            return null;
        }
    }

    // Draw a preview iff the current UA can natively display it.
    // Also rotate the image if necessary.
    function draw(fileOrBlob, container, options) {
        var identifier = new qq.Identify(fileOrBlob, log),
            maxSize = options.maxSize,
            // jshint eqnull:true
            orient = options.orient == null ? true : options.orient,
            megapixErrorHandler = function() {
                container.onerror = null;
                container.onload = null;
                log("Could not render preview, file may be too large!", "error");
                drawPreview.failure(container, "Browser cannot render image!");
            };

        return identifier.isPreviewable().then(
            function(mime) {
                // If options explicitly specify that Orientation is not desired,
                // replace the orient task with a dummy promise that "succeeds" immediately.
                var dummyExif = {
                        parse: function() {
                            return Promise.resolve();
                        }
                    },
                    exif = orient ? new qq.Exif(fileOrBlob, log) : dummyExif,
                    mpImg = new qq.MegaPixImage(fileOrBlob, megapixErrorHandler),
                    renderDone = registerThumbnailRenderedListener(container);

                if (renderDone === null) {
                    return Promise.reject(container);
                }

                exif.parse().then(
                    function(exif) {
                        var orientation = exif && exif.Orientation;

                        mpImg.render(container, {
                            maxWidth: maxSize,
                            maxHeight: maxSize,
                            orientation: orientation,
                            mime: mime,
                            resize: options.customResizeFunction
                        });
                    },

                    function(failureMsg) {
                        log(qq.format("EXIF data could not be parsed ({}).  Assuming orientation = 1.", failureMsg));

                        mpImg.render(container, {
                            maxWidth: maxSize,
                            maxHeight: maxSize,
                            mime: mime,
                            resize: options.customResizeFunction
                        });
                    }
                );

                return renderDone;
            },

            function() {
                log("Not previewable");

                var error = new Error("Not previewable")
                error.container = container;
                throw error;
            }
        );
    }

    function drawOnCanvasOrImgFromUrl(url, canvasOrImg, maxSize, customResizeFunction) {
        var tempImg = new Image(),
            tempImgRender = registerThumbnailRenderedListener(tempImg);

        if (isCrossOrigin(url)) {
            tempImg.crossOrigin = "anonymous";
        }

        tempImg.src = url;

        return tempImgRender.then(
            function rendered() {
                var renderDone = registerThumbnailRenderedListener(canvasOrImg);

                var mpImg = new qq.MegaPixImage(tempImg);
                mpImg.render(canvasOrImg, {
                    maxWidth: maxSize,
                    maxHeight: maxSize,
                    mime: determineMimeOfFileName(url),
                    resize: customResizeFunction
                });

                return renderDone;
            });
    }

    function drawOnImgFromUrlWithCssScaling(url, img, maxSize) {
        var renderDone = registerThumbnailRenderedListener(img);
        // NOTE: The fact that maxWidth/height is set on the thumbnail for scaled images
        // that must drop back to CSS is known and exploited by the templating module.
        // In this module, we pre-render "waiting" thumbs for all files immediately after they
        // are submitted, and we must be sure to pass any style associated with the "waiting" preview.
        qq(img).css({
            maxWidth: maxSize + "px",
            maxHeight: maxSize + "px"
        });

        img.src = url;

        return renderDone;
    }

    // Draw a (server-hosted) thumbnail given a URL.
    // This will optionally scale the thumbnail as well.
    // It attempts to use <canvas> to scale, but will fall back
    // to max-width and max-height style properties if the UA
    // doesn't support canvas or if the images is cross-domain and
    // the UA doesn't support the crossorigin attribute on img tags,
    // which is required to scale a cross-origin image using <canvas> &
    // then export it back to an <img>.
    function drawFromUrl(url, container, options) {
        var scale = options.scale,
            maxSize = scale ? options.maxSize : null,
            renderDone;

        // container is an img, scaling needed
        if (scale && isImg(container)) {
            // Iff canvas is available in this UA, try to use it for scaling.
            // Otherwise, fall back to CSS scaling
            if (isCanvasSupported()) {
                // Attempt to use <canvas> for image scaling,
                // but we must fall back to scaling via CSS/styles
                // if this is a cross-origin image and the UA doesn't support <img> CORS.
                if (isCrossOrigin(url) && !isImgCorsSupported()) {
                    renderDone = drawOnImgFromUrlWithCssScaling(url, container, maxSize);
                }
                else {
                    renderDone = drawOnCanvasOrImgFromUrl(url, container, maxSize);
                }
            }
            else {
                renderDone = drawOnImgFromUrlWithCssScaling(url, container, maxSize);
            }
        }
        // container is a canvas, scaling optional
        else if (isCanvas(container)) {
            renderDone = drawOnCanvasOrImgFromUrl(url, container, maxSize);
        }
        // container is an img & no scaling: just set the src attr to the passed url
        else {
            renderDone = registerThumbnailRenderedListener(container);
            if (renderDone === null) {
                return Promise.reject(container);
            }
            else {
                container.src = url;
            }
        }

        return renderDone;
    }

    qq.extend(this, {
        /**
         * Generate a thumbnail.  Depending on the arguments, this may either result in
         * a client-side rendering of an image (if a `Blob` is supplied) or a server-generated
         * image that may optionally be scaled client-side using <canvas> or CSS/styles (as a fallback).
         *
         * @param fileBlobOrUrl a `File`, `Blob`, or a URL pointing to the image
         * @param container <img> or <canvas> to contain the preview
         * @param options possible properties include `maxSize` (int), `orient` (bool - default true), resize` (bool - default true), and `customResizeFunction`.
         * @returns Promise fulfilled when the preview has been drawn, or the attempt has failed
         */
        generate: function(fileBlobOrUrl, container, options) {
            if (qq.isString(fileBlobOrUrl)) {
                log("Attempting to update thumbnail based on server response.");
                return drawFromUrl(fileBlobOrUrl, container, options || {});
            }
            else {
                log("Attempting to draw client-side image preview.");
                return draw(fileBlobOrUrl, container, options || {});
            }
        }
    });

    /*<testing>*/
    this._testing = {};
    this._testing.isImg = isImg;
    this._testing.isCanvas = isCanvas;
    this._testing.isCrossOrigin = isCrossOrigin;
    this._testing.determineMimeOfFileName = determineMimeOfFileName;
    /*</testing>*/
};
