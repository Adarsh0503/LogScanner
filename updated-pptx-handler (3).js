function PptxHandler(canvas) {
    var self = this;
    self.DPI = 96; // Default DPI for PPTX files
    var pptxHtmlContent = null;
    var slideCount = 0;
    var lastRenderedPageIndex = -1;
    var lastRenderedScale = 1;
    var lastRenderedRotation = 0;
    var isFirstRender = true;

    // Clone method required by InteractionController
    this.clone = function() {
        return new PptxHandler(document.createElement('canvas'));
    };

    // Initialize the handler and load pptxjs library
    this.init = function (onCompletion) {
        console.log("Initializing PptxHandler...");
        
        // Add styling specifically to fix PPTXjs rendering issues
        var style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = `
            /* Fix for PPTXjs slide rendering - ensure top content is visible */
            .slide {
                padding-top: 150px !important;
                margin-top: 50px !important;
                overflow: visible !important;
                background-color: white !important;
                border: none !important;
                border-radius: 0 !important;
            }
            
            /* Fix containing elements that might clip content */
            .slide-content-container, .pptx-div-container {
                overflow: visible !important;
                padding-top: 50px !important;
            }
            
            /* Fix for PPTXjs divs2slides renderer */
            .divs2slidesjs-slide {
                padding-top: 100px !important;
                overflow: visible !important;
            }
            
            /* Fix for slide block content */
            .slide .block {
                padding-top: 50px !important;
                overflow: visible !important;
            }
            
            /* Ensure content div has padding */
            .slide div.content {
                padding-top: 50px !important;
                overflow: visible !important;
            }
            
            /* Center content within canvas */
            #documentCanvas {
                margin: 0 auto;
                display: block;
            }
            
            /* Ensure viewer panel properly centers content */
            #viewerPanel {
                display: flex !important;
                justify-content: center;
                align-items: center;
                padding-top: 50px !important;
            }
            
            /* Force full slide visibility */
            .rendering-slide {
                margin: 0 auto !important;
                overflow: visible !important;
                background-color: white !important;
            }
            
            /* Add space to canvas container */
            #canvasContainer {
                display: flex;
                justify-content: center;
                align-items: center;
                padding-top: 50px !important;
                margin-top: 30px !important;
            }
        `;
        document.head.appendChild(style);
        
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

    // Fix positioning of PPTXjs slides to ensure top content is visible
    function fixPptxjsSlideContentPositioning(slides) {
        console.log("Fixing slide content positioning for", slides.length, "slides");
        
        slides.forEach((slide, index) => {
            // Get all absolutely positioned elements in this slide
            const positionedElements = slide.querySelectorAll('*[style*="position: absolute"], *[style*="position:absolute"]');
            
            positionedElements.forEach(element => {
                const style = element.style;
                
                // If element has a top position, adjust it to avoid being cut off
                if (style.top && style.top.includes('px')) {
                    const topPos = parseInt(style.top);
                    if (topPos < 50) {
                        // Add at least 100px to top positioned elements that are near the top
                        const newTop = topPos + 100;
                        element.style.top = newTop + 'px';
                        console.log(`Adjusted element top position from ${topPos}px to ${newTop}px in slide ${index+1}`);
                    }
                }
            });
            
            // Ensure slide has adequate height
            slide.style.minHeight = "720px";
            slide.style.height = "auto";
            slide.style.paddingTop = "150px";
            slide.style.marginTop = "50px";
            slide.style.overflow = "visible";
        });
    }

    // Helper function to find the real content height and top offset of a slide
    function calculateSlideContentHeight(slideElement) {
        let maxBottom = 0;
        let minTop = 0;
        
        // First, check direct style properties for top content
        // PPTXjs often positions elements with direct style attributes
        const allElements = slideElement.querySelectorAll('*[style]');
        
        allElements.forEach(element => {
            // Skip elements with no style
            if (!element.style) return;
            
            // If element has a top position in its style
            if (element.style.top && element.style.top.includes('px')) {
                const topPos = parseInt(element.style.top);
                if (topPos < minTop) {
                    minTop = topPos;
                    console.log(`Found element with top style: ${topPos}px`);
                }
            }
            
            // Check for transforms that might move content up
            if (element.style.transform && element.style.transform.includes('translate')) {
                const match = element.style.transform.match(/translateY\((-?\d+)px\)/);
                if (match && match[1]) {
                    const translateY = parseInt(match[1]);
                    if (translateY < 0 && translateY < minTop) {
                        minTop = translateY;
                        console.log(`Found element with translateY: ${translateY}px`);
                    }
                }
            }
        });
        
        // Get all elements for height calculation
        const elements = slideElement.querySelectorAll('*');
        elements.forEach(element => {
            if (!element.getBoundingClientRect) return;
            
            const offsetTop = element.offsetTop || 0;
            const offsetHeight = element.offsetHeight || 0;
            const computedStyle = window.getComputedStyle(element);
            const marginBottom = parseInt(computedStyle.marginBottom) || 0;
            
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
                const offsetTop = parent.offsetTop || 0;
                const offsetHeight = parent.offsetHeight || 0;
                
                const bottom = offsetTop + offsetHeight;
                if (bottom > maxBottom) {
                    maxBottom = bottom;
                }
            }
        });
        
        // Check for absolutely positioned elements that might be outside normal flow
        const positionedElements = slideElement.querySelectorAll(
            '*[style*="position: absolute"], *[style*="position:absolute"], ' +
            '*[style*="position: fixed"], *[style*="position:fixed"]'
        );

        positionedElements.forEach(element => {
            const style = window.getComputedStyle(element);
            const top = parseInt(style.top) || 0;
            
            if (top < minTop) {
                minTop = top;
                console.log(`Found positioned element with top: ${top}px`);
            }
            
            const height = element.offsetHeight || parseInt(style.height) || 0;
            const bottom = top + height;
            
            if (bottom > maxBottom) {
                maxBottom = bottom;
            }
        });
        
        // Make minTop negative or zero (we want to know how far up content goes)
        minTop = Math.min(0, minTop);
        
        // Calculate total height and add padding
        const totalHeight = Math.max(maxBottom - minTop, 720) + 100;
        console.log(`Calculated slide dimensions - minTop: ${minTop}px, maxBottom: ${maxBottom}px, totalHeight: ${totalHeight}px`);
        
        return {
            minTop: minTop,
            totalHeight: totalHeight
        };
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
                            
                            // Fix slide content positioning to prevent top content cutoff
                            fixPptxjsSlideContentPositioning(slides);
                            
                            // Collect all slide HTML contents
                            const slideContents = [];
                            slides.forEach((slide, index) => {
                                // Find the deepest content to calculate true height
                                const slideMetrics = calculateSlideContentHeight(slide);
                                console.log(`Slide ${index+1} metrics - minTop: ${slideMetrics.minTop}px, height: ${slideMetrics.totalHeight}px`);
                                
                                // Ensure slide has enough height and account for content above the top
                                slide.style.minHeight = slideMetrics.totalHeight + "px";
                                
                                // Add padding at the top to account for elements with negative top positions
                                if (slideMetrics.minTop < 0) {
                                    slide.style.paddingTop = Math.abs(slideMetrics.minTop) + 150 + "px";
                                    console.log(`Adding ${Math.abs(slideMetrics.minTop) + 150}px top padding to capture top content`);
                                } else {
                                    slide.style.paddingTop = "150px"; // Default padding
                                }
                                
                                const slideHTML = slide.outerHTML;
                                slideContents.push(slideHTML);
                                console.log(`Slide ${index+1} captured with adjusted metrics`);
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
                
                // Initialize PPTXjs with better settings for capturing top content
                try {
                    $("#myModal").pptxToHtml({
                        pptxFileUrl: documentUrl,
                        slidesScale: 1,
                        slideMode: false,
                        keyBoardShortCut: false,
                        mediaProcess: false,
                        jsZipV2: false
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
            
            // Special handling for first render
            if (isFirstRender) {
                // For first render, add even more padding at the top
                slideElement.style.paddingTop = "300px";  // Extra padding for first render
                slideElement.style.marginTop = "150px";   // Extra margin for first render
                isFirstRender = false;
            } else {
                // Normal padding for subsequent renders
                slideElement.style.paddingTop = "200px";
                slideElement.style.marginTop = "100px";
            }
            
            // Add padding on all sides
            slideElement.style.paddingBottom = "250px"; // Add extra bottom padding
            slideElement.style.paddingLeft = "50px";    // Add padding on sides too
            slideElement.style.paddingRight = "50px";
        }
        
        document.body.appendChild(tempDiv);
        console.log("Temporary div created and added to body.");

        // Calculate slide metrics to ensure we capture all content
        var slideMetrics = calculateSlideContentHeight(slideElement);
        
        // Add extra space for safety
        var renderHeight = slideMetrics.totalHeight + 150; // Extra safety margin
        console.log(`Using render height of ${renderHeight}px to ensure all content is captured`);

        // Prepare html2canvas options with settings to capture top content
        var html2canvasOptions = {
            scale: 1.5,                // Higher scale for better quality
            allowTaint: true,
            useCORS: true,
            backgroundColor: "white", 
            logging: false,
            height: renderHeight,
            windowHeight: renderHeight,
            y: Math.min(-200, slideMetrics.minTop), // Start capture at least 200px above or at minTop if lower
            scrollY: Math.min(-200, slideMetrics.minTop),
            x: 0,
            y: 0
        };

        // Use html2canvas with appropriate settings
        html2canvas(tempDiv, html2canvasOptions).then(function (renderedCanvas) {
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
                
                // Adjust offsetY to show more top content
                offsetY = Math.max(0, offsetY - 30);
                
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
            
            // Fix viewport to show top content
            self.fixTopContentVisibility();
            
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
            
            // Ensure slide has auto height and padding
            var slideElement = tempDiv.querySelector('.slide');
            if (slideElement) {
                slideElement.style.height = "auto";
                slideElement.style.minHeight = "720px";
                slideElement.style.paddingTop = "150px";
                slideElement.style.marginTop = "50px";
                slideElement.style.paddingBottom = "100px";
            }
            
            document.body.appendChild(tempDiv);
            
            // Calculate slide metrics
            var slideMetrics = calculateSlideContentHeight(slideElement || tempDiv);
            var renderHeight = slideMetrics.totalHeight;

            // Use html2canvas to render
            html2canvas(tempDiv, {
                scale: 2,
                allowTaint: true,
                useCORS: true,
                backgroundColor: "white",
                height: renderHeight,
                windowHeight: renderHeight,
                y: Math.min(-150, slideMetrics.minTop),
                scrollY: Math.min(-150, slideMetrics.minTop)
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
    
    // Handle zooming with content preservation
    this.zoomToScale = function(scale, rotation, pageIndex, onCompletion) {
        console.log("Zooming to scale:", scale);
        
        // Get viewer panel for scroll position calculations
        var viewerPanel = document.getElementById('viewerPanel');
        if (!viewerPanel) {
            self.redraw(scale, rotation, pageIndex, onCompletion);
            return;
        }
        
        // Capture the current center point of the viewport relative to the document
        var viewportWidth = viewerPanel.clientWidth;
        var viewportHeight = viewerPanel.clientHeight;
        var currentScale = lastRenderedScale || 1;
        
        // Calculate the center point in document coordinates
        var scrollLeft = viewerPanel.scrollLeft;
        var scrollTop = viewerPanel.scrollTop;
        var centerX = (scrollLeft + viewportWidth / 2) / currentScale;
        var centerY = (scrollTop + viewportHeight / 2) / currentScale;
        
        console.log("Current center point:", centerX, centerY);
        
        // Redraw with the new scale
        self.redraw(scale, rotation, pageIndex, function() {
            // After redrawing, recalculate the scroll position to keep the same center point
            var newScrollLeft = (centerX * scale) - (viewportWidth / 2);
            var newScrollTop = (centerY * scale) - (viewportHeight / 2);
            
            console.log("New scroll position:", newScrollLeft, newScrollTop);
            
            // Set the new scroll position
            viewerPanel.scrollLeft = newScrollLeft;
            viewerPanel.scrollTop = newScrollTop;
            
            // Ensure bounds are respected
            self.adjustViewport();
            
            if (onCompletion) {
                onCompletion();
            }
        });
    };

    // Initialize scaling to 100% of original size
    this.initializeScaling = function() {
        var scale = 1.0; // Start at 100%
        
        // Draw the document at the initial scale
        this.redraw(scale, 0, 0, function() {
            console.log("Document initialized at 100% scale");
            
            // After a short delay, check if content is fully visible
            setTimeout(function() {
                var viewerPanel = document.getElementById('viewerPanel');
                if (viewerPanel) {
                    // If document is too large for viewport, auto-fit
                    if (canvas.width > viewerPanel.clientWidth || 
                        canvas.height > viewerPanel.clientHeight) {
                        self.fitToViewport();
                        console.log("Auto-fitted to viewport due to large content");
                    }
                }
            }, 100);
        });
    };

    // Function to fix top content visibility
    this.fixTopContentVisibility = function() {
        var viewerPanel = document.getElementById('viewerPanel');
        if (!viewerPanel) return;
        
        // Force scroll position to include top of the content
        viewerPanel.scrollTop = 0;
        
        // Set a timeout to ensure top is visible after any other calculations
        setTimeout(function() {
            viewerPanel.scrollTop = 0;
        }, 200);
    };
}