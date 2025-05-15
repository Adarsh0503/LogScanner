function PptxHandler(canvas) {
    var self = this;
    self.DPI = 96; // Default DPI for PPTX files
    var pptxHtmlContent = null;
    var slideCount = 0;
    var currentScale = 1;

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

    // UPDATED: loadDocument method with MutationObserver to detect slide loading
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
                            
                            // IMPROVED: Use standard PowerPoint dimensions 
                            // but calculate actual aspect ratio from slides if possible
                            const presentationSize = detectPresentationSize(slides[0]) || {
                                width: 1280,
                                height: 720
                            };
                            console.log("Detected presentation size:", presentationSize);
                            
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
                        mediaProcess: false,
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

    // NEW: Function to detect presentation size from a slide element
    function detectPresentationSize(slideElement) {
        if (!slideElement) return null;
        
        try {
            // Try to get size from inline styles or computed styles
            const computedStyle = window.getComputedStyle(slideElement);
            const width = parseInt(slideElement.style.width || computedStyle.width);
            const height = parseInt(slideElement.style.height || computedStyle.height);
            
            // Check if we got valid dimensions
            if (width > 0 && height > 0) {
                return { width, height };
            }
            
            // If we can't get dimensions from styles, try checking attributes
            const dataWidth = slideElement.getAttribute('data-width');
            const dataHeight = slideElement.getAttribute('data-height');
            
            if (dataWidth && dataHeight) {
                return { 
                    width: parseInt(dataWidth), 
                    height: parseInt(dataHeight) 
                };
            }
            
            // If we still don't have dimensions, fallback to measuring the element
            const rect = slideElement.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                return { 
                    width: Math.round(rect.width), 
                    height: Math.round(rect.height) 
                };
            }
        } catch (e) {
            console.warn("Error detecting presentation size:", e);
        }
        
        // Return default dimensions if detection fails
        return { width: 1280, height: 720 };
    }

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

    // IMPROVED: Draw the PPTX slide on the canvas with proper scaling
    this.drawDocument = function (scale, rotation, onCompletion) {
        console.log("Drawing PPTX document with scale:", scale, " and rotation:", rotation);
        benchmark.time("PPTX Document drawn");
        currentScale = scale; // Store current scale for later use
        
        // Draw the first slide
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

    // IMPROVED: Redraw method for better canvas rendering
    this.redraw = function (scale, rotation, pageIndex, onCompletion) {
        console.log("Redrawing slide at index:", pageIndex, "with scale:", scale);

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
        
        // IMPROVED: Better slide preparation for rendering
        var slideElement = tempDiv.querySelector('.slide');
        if (slideElement) {
            // Set a specific width/height based on original presentation dimensions
            slideElement.style.width = this.originalWidth() + "px";
            slideElement.style.height = "auto"; // Let height adjust to content
            slideElement.style.minHeight = this.originalHeight() + "px";
            slideElement.style.overflow = "visible"; // Make sure content doesn't get cut off
            slideElement.style.paddingBottom = "100px"; // Add extra padding at bottom
            
            // Make sure slide background is white
            slideElement.style.backgroundColor = "white";
        }
        
        document.body.appendChild(tempDiv);
        console.log("Temporary div created and added to body.");

        // IMPROVED: Measure both content bounds and presentation dimensions
        var originalWidth = this.originalWidth();
        var originalHeight = this.originalHeight();
        var slideContentHeight = calculateSlideContentHeight(slideElement);
        
        // Use the larger of calculated or original height to ensure we capture everything
        var renderHeight = Math.max(slideContentHeight, originalHeight) + 100;
        console.log(`Using render height of ${renderHeight}px to ensure all content is captured`);

        // IMPROVED: html2canvas options for better quality and full rendering
        html2canvas(slideElement, {
            scale: 2, // Double resolution for better quality
            allowTaint: true,
            useCORS: true,
            backgroundColor: "white",
            height: renderHeight,
            windowHeight: renderHeight,
            scrollY: 0,
            scrollX: 0,
            width: originalWidth,
            windowWidth: originalWidth,
            logging: true,
            onclone: function(clonedDoc) {
                // Additional adjustment to the cloned document before rendering
                var clonedSlide = clonedDoc.querySelector('.slide');
                if (clonedSlide) {
                    clonedSlide.style.transform = "none"; // Remove any transforms
                    clonedSlide.style.width = originalWidth + "px";
                    clonedSlide.style.minHeight = renderHeight + "px";
                }
            }
        }).then(function (renderedCanvas) {
            console.log("Slide rendered successfully to canvas.");
            
            // Calculate final dimensions with scale
            var imageWidth = renderedCanvas.width;
            var imageHeight = renderedCanvas.height;
            
            console.log(`Rendered canvas dimensions: ${imageWidth} x ${imageHeight}`);
            
            // Scale based on rotation
            var needSwapDimensions = (rotation === 90 || rotation === 270);
            var finalWidth, finalHeight;
            
            if (needSwapDimensions) {
                finalWidth = imageHeight * scale;
                finalHeight = imageWidth * scale;
            } else {
                finalWidth = imageWidth * scale;
                finalHeight = imageHeight * scale;
            }
            
            // IMPROVED: Make sure we're using integer dimensions to prevent blurry rendering
            finalWidth = Math.round(finalWidth);
            finalHeight = Math.round(finalHeight);
            
            // Set canvas dimensions
            canvas.width = finalWidth;
            canvas.height = finalHeight;
            
            console.log(`Canvas resized to: ${canvas.width} x ${canvas.height}`);
            
            // Get 2D context and prepare for drawing
            var ctx = canvas.getContext("2d");
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // IMPROVED: Better drawing with high-quality interpolation
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            
            // Draw based on rotation
            if (rotation !== 0) {
                ctx.save();
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate(rotation * Math.PI / 180);
                
                if (needSwapDimensions) {
                    // For 90/270 degrees, swap dimensions
                    ctx.drawImage(
                        renderedCanvas, 
                        -canvas.height / 2, 
                        -canvas.width / 2,
                        canvas.height,
                        canvas.width
                    );
                } else {
                    ctx.drawImage(
                        renderedCanvas, 
                        -canvas.width / 2, 
                        -canvas.height / 2,
                        canvas.width,
                        canvas.height
                    );
                }
                ctx.restore();
            } else {
                // No rotation - Draw at full canvas size
                ctx.drawImage(renderedCanvas, 0, 0, canvas.width, canvas.height);
            }
            
            // Cleanup
            document.body.removeChild(tempDiv);
            console.log("Temporary div removed from body.");
            
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
            ctx.fillText(error.message || "Unknown rendering error", canvas.width/2, canvas.height/2 + 20);
            
            if (document.body.contains(tempDiv)) {
                document.body.removeChild(tempDiv);
            }
            
            if (onCompletion) {
                onCompletion();
            }
        });
    };

    // IMPROVED: Helper function to create canvases for all slides
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
            
            // Ensure slide has proper dimensions
            var slideElement = tempDiv.querySelector('.slide');
            if (slideElement) {
                slideElement.style.width = self.originalWidth() + "px";
                slideElement.style.height = "auto";
                slideElement.style.minHeight = self.originalHeight() + "px";
                slideElement.style.overflow = "visible";
                slideElement.style.backgroundColor = "white";
            }
            
            document.body.appendChild(tempDiv);
            
            // Measure the content height
            var renderHeight = Math.max(self.originalHeight(), calculateSlideContentHeight(slideElement));
            renderHeight += 100; // Add padding

            // Use html2canvas to render with improved settings
            html2canvas(slideElement, {
                scale: 2,
                allowTaint: true,
                useCORS: true,
                backgroundColor: "white",
                height: renderHeight,
                windowHeight: renderHeight,
                width: self.originalWidth(),
                windowWidth: self.originalWidth()
            }).then(function (renderedCanvas) {
                console.log(`Slide ${i} rendered successfully.`);
                canvases[i - fromPage] = {
                    canvas: renderedCanvas,
                    originalDocumentDpi: self.DPI
                };

                document.body.removeChild(tempDiv);
                
                processedCount++;
                checkCompletion();
            }).catch(function (error) {
                console.error(`Error rendering slide ${i} to canvas:`, error);
                if (document.body.contains(tempDiv)) {
                    document.body.removeChild(tempDiv);
                }

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
	
    // IMPROVED: Better full screen rendering that fills the entire canvas
	this.fitToFullScreen = function() {
	    if (!pptxHtmlContent) {
            console.error("Cannot fit to full screen - no presentation content loaded");
            return;
        }

	    // Get the full-screen dimensions (the entire browser window)
	    var viewportWidth = window.innerWidth;
	    var viewportHeight = window.innerHeight;

	    // Get the original width and height of the presentation
	    var originalWidth = this.originalWidth();
	    var originalHeight = this.originalHeight();

	    // Calculate scale to fit the screen
	    var scaleToFitWidth = viewportWidth / originalWidth;
	    var scaleToFitHeight = viewportHeight / originalHeight;

	    // IMPROVED: Use the smaller scale to ensure content fits both width and height
	    // But add a small margin for visual comfort (95% of max size)
	    var fitScale = Math.min(scaleToFitWidth, scaleToFitHeight) * 0.95;
        
        console.log("Fitting to full screen with scale:", fitScale);
        console.log("Viewport dimensions:", viewportWidth, "x", viewportHeight);
        console.log("Original presentation dimensions:", originalWidth, "x", originalHeight);

	    // Redraw with the new scale (and no rotation in full screen mode)
	    self.redraw(fitScale, 0, 0, function() {
	        console.log("Content fitted to full screen successfully");
	    });
	};

    // IMPROVED: Better viewport fitting that properly fills the viewer
    this.fitToViewport = function() {
        if (!pptxHtmlContent) {
            console.error("Cannot fit to viewport - no presentation content loaded");
            return;
        }
        
        var viewerPanel = document.getElementById('viewerPanel');
        if (!viewerPanel) {
            console.error("Cannot find viewerPanel element");
            return;
        }
        
        // Get the viewer dimensions with some padding
        var viewportWidth = viewerPanel.clientWidth - 20; // 10px padding each side
        var viewportHeight = viewerPanel.clientHeight - 20;
        
        console.log("Viewer panel dimensions:", viewportWidth, "x", viewportHeight);
        
        var originalWidth = this.originalWidth();
        var originalHeight = this.originalHeight();
        
        // Calculate scale to fit
        var scaleToFitWidth = viewportWidth / originalWidth;
        var scaleToFitHeight = viewportHeight / originalHeight;
        
        // Use smaller scale to ensure content fits, with small margin
        var fitScale = Math.min(scaleToFitWidth, scaleToFitHeight) * 0.95;
        
        console.log("Fitting to viewport with scale:", fitScale);
        
        // Redraw with the new scale
        self.redraw(fitScale, 0, 0, function() {
            console.log("Content fitted to viewport successfully");
            
            // Center the canvas in the viewport
            if (canvas.parentElement) {
                canvas.style.display = "block";
                canvas.style.margin = "0 auto";
            }
        });
    };
    
    // NEW: Method to force rendering at specific dimensions
    this.renderAtExactSize = function(width, height, pageIndex, onCompletion) {
        if (!pptxHtmlContent) {
            console.error("Cannot render - no presentation content loaded");
            if (onCompletion) onCompletion();
            return;
        }
        
        pageIndex = pageIndex || 0;
        console.log(`Rendering slide ${pageIndex} at exact size: ${width}x${height}`);
        
        // Calculate the scale factor based on original dimensions
        var originalWidth = this.originalWidth();
        var originalHeight = this.originalHeight();
        
        var scaleX = width / originalWidth;
        var scaleY = height / originalHeight;
        
        // Use uniform scaling to maintain aspect ratio
        var scale = Math.min(scaleX, scaleY);
        
        // Redraw at this exact scale
        self.redraw(scale, 0, pageIndex, function() {
            console.log(`Slide rendered at exact size successfully`);
            if (onCompletion) onCompletion();
        });
    };
}