function PptxHandler(canvas) {
    var self = this;
    self.DPI = 96; // Default DPI for PPTX files
    var pptxHtmlContent = null;
    var slideCount = 0;
    var lastRenderedPageIndex = -1;
    var lastRenderedScale = 1;
    var lastRenderedRotation = 0;

    // Clone method required by InteractionController
    this.clone = function() {
        return new PptxHandler(document.createElement('canvas'));
    };

    // Initialize the handler and load pptxjs library
    this.init = function (onCompletion) {
        console.log("Initializing PptxHandler...");
        
        var script = document.createElement("script");
        script.onload = function () {
            console.log("pptxjs library loaded successfully.");
            if (onCompletion) {
                console.log("Calling onCompletion callback after script load.");
                onCompletion();
            }
        };
        script.src = "js/libs/pptxjs.js?v=" + _UV_VERSION;
        document.head.appendChild(script);
        console.log("Script element added to document head.");
    };

    // loadDocument method with MutationObserver to detect slide loading
    this.loadDocument = async function (documentUrl, onCompletion, onError) {
        try {
            console.log("Start loading PPTX document from URL:", documentUrl);
            benchmark.time("PPTX Document loaded");
            
            // Make sure the temporary modal exists
            if (!document.getElementById('myModal')) {
                var tmpDiv = document.createElement('div');
                tmpDiv.id = 'myModal';
                tmpDiv.style.display = 'none'; // Hide it
                document.body.appendChild(tmpDiv);
                console.log("Created temporary modal div");
            }
            
            // Create a promise that will be resolved when the slides are loaded
            await new Promise((resolve, reject) => {
                // Create a MutationObserver to detect when slides are added
                const targetElement = document.getElementById('myModal');
                const observer = new MutationObserver((mutations) => {
                    // Find slides by class - PPTXjs adds .slide class to each slide div
                    const slides = targetElement.querySelectorAll('.slide');
                    
                    if (slides.length > 0) {
                        console.log(`Detected ${slides.length} slides loaded in the DOM`);
                        
                        // Give a slight delay to ensure all content is fully rendered
                        setTimeout(() => {
                            observer.disconnect();
                            console.log("Observer disconnected after slide detection");
                            
                            // Collect all slide HTML contents
                            const slideContents = [];
                            slides.forEach((slide, index) => {
                                // Find the deepest content to calculate true height
                                const slideHeight = calculateSlideContentHeight(slide);
                                console.log(`Slide ${index+1} actual content height: ${slideHeight}px`);
                                
                                // Ensure slide has enough height for all content
                                slide.style.minHeight = Math.max(720, slideHeight + 100) + "px";
                                
                                const slideHTML = slide.outerHTML;
                                slideContents.push(slideHTML);
                                console.log(`Slide ${index+1} captured with adjusted height`);
                            });
                            
                            // Get presentation dimensions from the first slide
                            const firstSlide = slides[0];
                            // Use standard PowerPoint dimensions but allow for taller slides
                            const presentationSize = {
                                width: 1280,
                                height: 720
                            };
                            console.log("Standard presentation size used:", presentationSize);
                            
                            // Create result object
                            pptxHtmlContent = {
                                slides: slideContents,
                                presentationSize: presentationSize
                            };
                            
                            slideCount = slideContents.length;
                            console.log("Total slides in document: ", slideCount);
                            
                            // Resolve the promise
                            resolve();
                        }, 1000); // 1 second delay to ensure everything is rendered
                    }
                });
                
                // Start observing the target element
                observer.observe(targetElement, {
                    childList: true,
                    subtree: true,
                    attributes: false,
                    characterData: false
                });
                console.log("MutationObserver started on target element");
                
                // Set a timeout in case the conversion takes too long
                const timeoutId = setTimeout(() => {
                    observer.disconnect();
                    console.error("PPTXjs conversion timed out after 30 seconds");
                    reject(new Error("Conversion timed out"));
                }, 30000); // 30-second timeout
                
                // Store the timeout ID for potential cancellation
                targetElement._pptxTimeoutId = timeoutId;
                
                // Add an early error detection timeout
                const errorCheckTimeout = setTimeout(() => {
                    const slides = targetElement.querySelectorAll('.slide');
                    if (slides.length === 0) {
                        console.warn("No slides detected after 5 seconds, checking for errors");
                        
                        // Look for error messages that PPTXjs might have added
                        const errorElements = targetElement.querySelectorAll('.error-message, .pptx-error');
                        if (errorElements.length > 0) {
                            observer.disconnect();
                            clearTimeout(timeoutId);
                            reject(new Error(errorElements[0].textContent || "PPTXjs conversion failed"));
                        }
                    }
                }, 5000); // 5-second error check
                
                // Store this timeout too
                targetElement._pptxErrorCheckTimeoutId = errorCheckTimeout;
                
                // Initialize PPTXjs
                console.log("Calling pptxToHtml on tmpModal...");
                try {
                    $("#myModal").pptxToHtml({
                        pptxFileUrl: documentUrl,
                        slidesScale: 1,
                        slideMode: false,
                        mediaProcess: false, // Keep as false since that's what you had
                        jsZipV2: false,
                        keyBoardShortCut: false
                    });
                } catch (initError) {
                    observer.disconnect();
                    clearTimeout(timeoutId);
                    clearTimeout(errorCheckTimeout);
                    reject(initError);
                }
            });
            
            // Clean up timeouts
            const myModal = document.getElementById('myModal');
            if (myModal) {
                if (myModal._pptxTimeoutId) clearTimeout(myModal._pptxTimeoutId);
                if (myModal._pptxErrorCheckTimeoutId) clearTimeout(myModal._pptxErrorCheckTimeoutId);
            }
            
            // Ensure we have presentation size
            if (!pptxHtmlContent.presentationSize) {
                console.warn("Presentation size is undefined. Using default size.");
                pptxHtmlContent.presentationSize = { width: 1280, height: 720 }; // Standard size
            } else {
                console.log("Using Presentation Size: ", pptxHtmlContent.presentationSize);
            }
            
            benchmark.timeEnd("PPTX Document loaded");
            if (onCompletion) {
                console.log("Calling onCompletion callback with pptxHtmlContent.");
                onCompletion(null, pptxHtmlContent);
            }
        } catch (error) {
            console.error("Error in pptxToHtml processing:", error);
            benchmark.timeEnd("PPTX Document loaded");
            if (onError) {
                console.log("Calling onError callback due to error.");
                onError(error);
            }
        }
    };

    // Helper function to find the real content height of a slide
    function calculateSlideContentHeight(slideElement) {
        let maxBottom = 0;
        
        // Get all direct children of the slide
        const children = slideElement.querySelectorAll('*');
        
        children.forEach(element => {
            // Skip elements with no position data
            if (!element.getBoundingClientRect) return;
            
            // Get position data
            const rect = element.getBoundingClientRect();
            const offsetTop = element.offsetTop || 0;
            const offsetHeight = element.offsetHeight || 0;
            const computedStyle = window.getComputedStyle(element);
            const marginBottom = parseInt(computedStyle.marginBottom) || 0;
            
            // Calculate bottom position considering margin
            const bottom = offsetTop + offsetHeight + marginBottom;
            
            if (bottom > maxBottom) {
                maxBottom = bottom;
            }
        });
        
        // Check for text content that might be deeper
        const textNodes = getTextNodesIn(slideElement);
        textNodes.forEach(node => {
            // Find parent element with position
            let parent = node.parentElement;
            while (parent && !parent.getBoundingClientRect) {
                parent = parent.parentElement;
            }
            
            if (parent) {
                const rect = parent.getBoundingClientRect();
                const offsetTop = parent.offsetTop || 0;
                const offsetHeight = parent.offsetHeight || 0;
                
                const bottom = offsetTop + offsetHeight;
                if (bottom > maxBottom) {
                    maxBottom = bottom;
                }
            }
        });
        
        // Ensure we have a minimum height and add padding
        return Math.max(maxBottom, 720) + 50; // Add padding to be safe
    }
    
    // Helper to get all text nodes
    function getTextNodesIn(node) {
        var textNodes = [];
        if (node.nodeType == 3) {
            textNodes.push(node);
        } else {
            var children = node.childNodes;
            for (var i = 0; i < children.length; i++) {
                textNodes.push.apply(textNodes, getTextNodesIn(children[i]));
            }
        }
        return textNodes;
    }

    // Draw the PPTX slide on the canvas
    this.drawDocument = function (scale, rotation, onCompletion) {
        console.log("Drawing PPTX document with scale:", scale, " and rotation:", rotation);
        benchmark.time("PPTX Document drawn");
        self.redraw(scale, rotation, 0, function () {
            console.log("Redraw completed.");
            benchmark.timeEnd("PPTX Document drawn");
            if (onCompletion) {
                console.log("Calling onCompletion callback after drawing document.");
                onCompletion();
            }
        });
    };

    // Apply any drawing to the canvas
    this.applyToCanvas = function (apply) {
        console.log("Applying custom drawing to canvas.");
        apply(canvas);
        console.log("Custom drawing applied to canvas.");
    };

    // Get the number of slides
    this.pageCount = function () {
        console.log("Returning the total number of slides: ", slideCount);
        return slideCount;
    };

    // Get the original width based on detected presentation size
    this.originalWidth = function () {
        if (pptxHtmlContent && pptxHtmlContent.presentationSize && pptxHtmlContent.presentationSize.width) {
            console.log("Returning actual presentation width:", pptxHtmlContent.presentationSize.width);
            return pptxHtmlContent.presentationSize.width;
        }
        console.log("Returning default width: 1280");
        return 1280; // Standard width
    };

    // Get the original height based on detected presentation size
    this.originalHeight = function () {
        if (pptxHtmlContent && pptxHtmlContent.presentationSize && pptxHtmlContent.presentationSize.height) {
            console.log("Returning actual presentation height:", pptxHtmlContent.presentationSize.height);
            return pptxHtmlContent.presentationSize.height;
        }
        console.log("Returning default height: 720");
        return 720; // Standard height
    };

    // ENHANCED: Improved redraw method that prevents content loss during rotation and zooming
    this.redraw = function (scale, rotation, pageIndex, onCompletion) {
        console.log("Enhanced redraw for slide at index:", pageIndex, "with scale:", scale, "and rotation:", rotation);

        // Cache rendering parameters to avoid redundant processing
        const isSameRender = (lastRenderedPageIndex === pageIndex && 
                              lastRenderedScale === scale && 
                              lastRenderedRotation === rotation);
        
        if (isSameRender) {
            console.log("Using cached rendering");
            if (onCompletion) onCompletion();
            return;
        }
        
        // Update cached parameters
        lastRenderedPageIndex = pageIndex;
        lastRenderedScale = scale;
        lastRenderedRotation = rotation;

        if (!pptxHtmlContent || !pptxHtmlContent.slides || pptxHtmlContent.slides.length === 0) {
            console.error("No slides available for rendering.");
            if (onCompletion) {
                console.log("Calling onCompletion callback due to no slides.");
                onCompletion();
            }
            return;
        }

        // Get the HTML content for the slide
        var slideHtml = pptxHtmlContent.slides[pageIndex];
        if (!slideHtml) {
            console.error(`Slide with index ${pageIndex} not found`);
            if (onCompletion) {
                console.log("Calling onCompletion callback due to missing slide.");
                onCompletion();
            }
            return;
        }

        console.log("Rendering slide HTML content at index:", pageIndex);

        // Create a temporary div to hold the HTML content
        var tempDiv = document.createElement("div");
        tempDiv.innerHTML = slideHtml;
        
        // Set position for off-screen rendering
        tempDiv.style.position = "absolute";
        tempDiv.style.left = "-9999px";
        tempDiv.style.top = "-9999px";
        
        // Ensure slide has auto height to capture all content
        var slideElement = tempDiv.querySelector('.slide');
        if (slideElement) {
            slideElement.style.height = "auto";
            slideElement.style.minHeight = "720px";
            
            // Add extra padding to ensure all content is captured, especially important for top of slides
            slideElement.style.paddingTop = "100px";    // Add extra top padding for rotation
            slideElement.style.paddingBottom = "250px"; // Add extra bottom padding
            slideElement.style.paddingLeft = "50px";    // Add padding on sides too
            slideElement.style.paddingRight = "50px";
        }
        
        document.body.appendChild(tempDiv);
        console.log("Temporary div created and added to body.");

        // Measure real content height including the extra padding
        var slideContentHeight = 720; // Default height
        if (slideElement) {
            slideContentHeight = calculateSlideContentHeight(slideElement);
            console.log(`Detected actual content height: ${slideContentHeight}px`);
        }
        
        // Add extra space for safety
        var renderHeight = slideContentHeight + 150; // Extra safety margin
        console.log(`Using render height of ${renderHeight}px to ensure all content is captured`);

        // Use html2canvas with appropriate settings
        html2canvas(tempDiv, {
            scale: 1,
            allowTaint: true,
            useCORS: true,
            backgroundColor: "white", 
            logging: false,
            height: renderHeight,
            windowHeight: renderHeight,
            x: 0,
            y: 0
        }).then(function (renderedCanvas) {
            console.log("Slide rendered successfully to canvas.");
            
            // Calculate final dimensions with scale
            var imageWidth = renderedCanvas.width;
            var imageHeight = renderedCanvas.height;
            
            console.log(`Rendered canvas dimensions: ${imageWidth} x ${imageHeight}`);
            
            // Calculate canvas dimensions that account for rotation
            var canvasWidth, canvasHeight;
            
            if (rotation === 90 || rotation === 270) {
                // For 90/270 degree rotations, we need enough space for the diagonal
                // Calculate diagonal length to ensure all content fits during rotation
                var diagonal = Math.sqrt(
                    Math.pow(imageWidth * scale, 2) + 
                    Math.pow(imageHeight * scale, 2)
                );
                
                // Round up and add a little extra to be safe
                diagonal = Math.ceil(diagonal) + 50;
                
                canvasWidth = diagonal;
                canvasHeight = diagonal;
            } else {
                // For 0/180 degree rotations, normal scaled dimensions
                canvasWidth = imageWidth * scale;
                canvasHeight = imageHeight * scale;
            }
            
            // Set canvas dimensions
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            
            console.log(`Canvas resized to: ${canvas.width} x ${canvas.height}`);
            
            // Get 2D context and prepare for drawing
            var ctx = canvas.getContext("2d");
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw based on rotation
            if (rotation !== 0) {
                ctx.save();
                
                // Center point for rotation
                ctx.translate(canvas.width / 2, canvas.height / 2);
                
                // Apply rotation
                ctx.rotate(rotation * Math.PI / 180);
                
                // Scale the image
                var targetWidth = imageWidth * scale;
                var targetHeight = imageHeight * scale;
                
                if (rotation === 90 || rotation === 270) {
                    // For 90/270 degrees, swap dimensions
                    ctx.drawImage(
                        renderedCanvas, 
                        -targetHeight / 2,  // Swap width and height for rotated content 
                        -targetWidth / 2,
                        targetHeight,
                        targetWidth
                    );
                } else {
                    ctx.drawImage(
                        renderedCanvas, 
                        -targetWidth / 2, 
                        -targetHeight / 2,
                        targetWidth,
                        targetHeight
                    );
                }
                
                ctx.restore();
            } else {
                // For no rotation, center the content
                var offsetX = (canvas.width - imageWidth * scale) / 2;
                var offsetY = (canvas.height - imageHeight * scale) / 2;
                
                ctx.drawImage(
                    renderedCanvas, 
                    offsetX, 
                    offsetY, 
                    imageWidth * scale, 
                    imageHeight * scale
                );
            }
            
            // Cleanup
            document.body.removeChild(tempDiv);
            console.log("Temporary div removed from body.");
            
            // Ensure annotation canvas matches document canvas dimensions
            var annotationCanvas = document.getElementById('annotationCanvas');
            if (annotationCanvas) {
                annotationCanvas.width = canvas.width;
                annotationCanvas.height = canvas.height;
            }
            
            // Update dimensions in annotationHandler if it exists
            if (window.annotationHandler) {
                window.annotationHandler.setDimensionsAndCalcOffset(
                    scale,
                    canvas.width,
                    canvas.height
                );
                
                window.annotationHandler.saveOriginalCanvasSize(
                    self.originalWidth(),
                    self.originalHeight()
                );
            }
            
            if (onCompletion) {
                onCompletion();
            }
        }).catch(function (error) {
            console.error("Error rendering slide to canvas:", error);
            
            // Fallback - show a white canvas with error message
            canvas.width = 1280 * scale;
            canvas.height = 720 * scale;
            var ctx = canvas.getContext("2d");
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.fillStyle = "black";
            ctx.font = "20px Arial";
            ctx.textAlign = "center";
            ctx.fillText("Error rendering slide", canvas.width/2, canvas.height/2 - 20);
            
            if (document.body.contains(tempDiv)) {
                document.body.removeChild(tempDiv);
            }
            
            if (onCompletion) {
                onCompletion();
            }
        });
    };

    // Updated helper function to create canvases for all slides
    this.createCanvases = function (callback, fromPage, pageCount) {
        console.log("Creating canvases for slides from page:", fromPage, " to page:", pageCount);
        pageCount = pageCount || self.pageCount();
        const toPage = Math.min(self.pageCount(), fromPage + pageCount - 1);
        const canvases = [];
        let processedCount = 0;

        for (let i = fromPage; i <= toPage; i++) {
            console.log(`Processing slide at index: ${i}`);
            var slideHtml = pptxHtmlContent.slides[i];
            if (!slideHtml) {
                console.warn(`No HTML content found for slide ${i}`);
                processedCount++;
                checkCompletion();
                continue;
            }

            // Create a temporary div for the slide
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = slideHtml;
            
            // Position off-screen
            tempDiv.style.position = "absolute";
            tempDiv.style.left = "-9999px";
            tempDiv.style.top = "-9999px";
            
            // Ensure slide has auto height
            var slideElement = tempDiv.querySelector('.slide');
            if (slideElement) {
                slideElement.style.height = "auto";
                slideElement.style.minHeight = "720px";
                slideElement.style.paddingTop = "50px";
                slideElement.style.paddingBottom = "100px";
            }
            
            document.body.appendChild(tempDiv);
            
            // Measure the content height
            var renderHeight = 720;
            if (slideElement) {
                renderHeight = calculateSlideContentHeight(slideElement);
            }
            renderHeight += 150; // Add padding for safety

            // Use html2canvas to render
            html2canvas(tempDiv, {
                scale: 2,
                allowTaint: true,
                useCORS: true,
                backgroundColor: "white",
                height: renderHeight,
                windowHeight: renderHeight
            }).then(function(renderedCanvas) {
                console.log(`Slide ${i} rendered successfully for thumbnail.`);
                canvases[i - fromPage] = {
                    canvas: renderedCanvas,
                    originalDocumentDpi: self.DPI
                };

                document.body.removeChild(tempDiv);
                
                processedCount++;
                checkCompletion();
            }).catch(function(error) {
                console.error(`Error rendering slide ${i} to canvas:`, error);
                if (document.body.contains(tempDiv)) {
                    document.body.removeChild(tempDiv);
                }
                
                // Create a fallback canvas for the thumbnail
                var fallbackCanvas = document.createElement('canvas');
                fallbackCanvas.width = 160;
                fallbackCanvas.height = 90;
                var ctx = fallbackCanvas.getContext('2d');
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, 160, 90);
                ctx.fillStyle = "red";
                ctx.font = "12px Arial";
                ctx.textAlign = "center";
                ctx.fillText(`Error: Slide ${i+1}`, 80, 45);
                
                canvases[i - fromPage] = {
                    canvas: fallbackCanvas,
                    originalDocumentDpi: self.DPI
                };

                processedCount++;
                checkCompletion();
            });
        }
        
        function checkCompletion() {
            if (processedCount >= (toPage - fromPage + 1)) {
                // Filter out any undefined entries (from errors)
                const validCanvases = canvases.filter(canvas => canvas !== undefined);
                console.log(`All slides processed. ${validCanvases.length} valid canvases created.`);
                callback(validCanvases);
            }
        }
    };

    // Function to properly adjust the viewport after document operations
    this.adjustViewport = function() {
        var viewerPanel = document.getElementById('viewerPanel');
        if (!viewerPanel) return;
        
        // Get current scroll position
        var scrollLeft = viewerPanel.scrollLeft;
        var scrollTop = viewerPanel.scrollTop;
        
        // Check if scroll position is out of bounds
        var maxScrollLeft = canvas.width - viewerPanel.clientWidth;
        var maxScrollTop = canvas.height - viewerPanel.clientHeight;
        
        // Adjust scroll position if needed
        if (scrollLeft > maxScrollLeft && maxScrollLeft > 0) {
            viewerPanel.scrollLeft = maxScrollLeft;
        }
        
        if (scrollTop > maxScrollTop && maxScrollTop > 0) {
            viewerPanel.scrollTop = maxScrollTop;
        }
    };

    // Cleanup method to remove temporary resources
    this.cleanup = function() {
        // Remove the temporary modal if it exists
        const myModal = document.getElementById('myModal');
        if (myModal) {
            if (myModal._pptxTimeoutId) clearTimeout(myModal._pptxTimeoutId);
            if (myModal._pptxErrorCheckTimeoutId) clearTimeout(myModal._pptxErrorCheckTimeoutId);
            document.body.removeChild(myModal);
            console.log("Temporary modal removed from body");
        }
        
        // Clear references
        pptxHtmlContent = null;
        slideCount = 0;
        console.log("PptxHandler resources cleaned up");
    };
    
    // Helper function to fit content to viewport
    this.fitToViewport = function() {
        if (!pptxHtmlContent) return;
        
        var viewerPanel = document.getElementById('viewerPanel');
        if (!viewerPanel) return;
        
        var viewportWidth = viewerPanel.clientWidth - 40; // 20px padding each side
        var viewportHeight = viewerPanel.clientHeight - 40;
        
        var originalWidth = this.originalWidth();
        var originalHeight = this.originalHeight();
        
        // Calculate scale to fit
        var scaleToFitWidth = viewportWidth / originalWidth;
        var scaleToFitHeight = viewportHeight / originalHeight;
        
        // Use smaller scale to ensure content fits
        var fitScale = Math.min(scaleToFitWidth, scaleToFitHeight);
        
        // Redraw with the new scale
        self.redraw(fitScale, 0, 0, function() {
            console.log("Content fitted to viewport with scale:", fitScale);
            
            // Ensure viewport is properly adjusted
            setTimeout(function() {
                self.adjustViewport();
            }, 100);
        });
    };
}