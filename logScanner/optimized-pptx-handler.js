var MAX_CANVAS_DIMENSION = 16384; // Most browsers support up to 16384 pixels for canvas dimensions

function PptxHandler(canvas) {
    var self = this;
    self.DPI = 96; // Default DPI for PPTX files
    var pptxHtmlContent = null;
    var slideCount = 0;

    // Initialize the handler and load pptxjs library
    this.init = function (onCompletion) {
        console.log("Initializing PptxHandler...");
        
        // Add a simple style fix for proper rendering
        var style = document.createElement('style');
        style.textContent = `
            .slide {
                background-color: white !important;
                border: none !important;
                border-radius: 0 !important;
                overflow: visible !important;
            }
            #canvasContainer {
                margin: 0 auto;
            }
            #documentCanvas {
                margin: 0 auto;
            }
            .pptx-render-container .slide {
                overflow: visible !important;
                border: none !important;
                background-color: white !important;
            }
            /* Special class for rendering slides */
            .rendering-slide {
                height: auto !important;
                min-height: 690px !important;
                width: auto !important;
                min-width: 920px !important;
                overflow: visible !important;
                background-color: white !important;
                padding: 20px !important;
            }
            .rendering-slide * {
                overflow: visible !important;
                max-width: none !important;
            }
            /* Fix SVG rendering */
            svg {
                overflow: visible !important;
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

    // loadDocument method with improved slide detection and SVG handling
    this.loadDocument = async function (documentUrl, onCompletion, onError) {
        try {
            console.log("Start loading PPTX document from URL:", documentUrl);
            benchmark.time("PPTX Document loaded");
            
            // Make sure the temporary modal exists with proper styling
            if (!document.getElementById('myModal')) {
                var tmpDiv = document.createElement('div');
                tmpDiv.id = 'myModal';
                tmpDiv.style.display = 'none'; // Hide it
                // Add these styles to ensure proper rendering
                tmpDiv.style.position = 'absolute';
                tmpDiv.style.left = '0';
                tmpDiv.style.top = '0';
                tmpDiv.style.width = '100%';
                tmpDiv.style.height = '100%';
                tmpDiv.style.overflow = 'hidden';
                tmpDiv.style.zIndex = '-1';
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
                        
                        // Give a longer delay to ensure all content is fully rendered
                        setTimeout(() => {
                            observer.disconnect();
                            console.log("Observer disconnected after slide detection");
                            
                            // Handle SVG rendering issues by fixing attributes
                            const svgElements = targetElement.querySelectorAll('svg');
                            if (svgElements.length > 0) {
                                console.log(`Found ${svgElements.length} SVG elements that need fixing`);
                                svgElements.forEach((svg, idx) => {
                                    try {
                                        // Ensure SVG has proper dimensions
                                        if (!svg.getAttribute('width') && !svg.style.width) {
                                            svg.setAttribute('width', '100%');
                                        }
                                        if (!svg.getAttribute('height') && !svg.style.height) {
                                            svg.setAttribute('height', '100%');
                                        }
                                        
                                        // Ensure SVG has proper viewBox
                                        if (!svg.getAttribute('viewBox')) {
                                            svg.setAttribute('viewBox', '0 0 100 100');
                                        }
                                        
                                        // Add preserveAspectRatio attribute
                                        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                                        
                                        console.log(`Fixed SVG #${idx} attributes`);
                                    } catch (e) {
                                        console.error(`Error processing SVG #${idx}:`, e);
                                    }
                                });
                            }
                            
                            // Collect all slide HTML contents
                            const slideContents = [];
                            slides.forEach((slide, index) => {
                                // Apply specific slide dimensions from pptxjs logs if needed
                                if (!slide.style.width || slide.offsetWidth < 100) {
                                    slide.style.width = '1280px';  // Use observed size from logs
                                }
                                if (!slide.style.height || slide.offsetHeight < 100) {
                                    slide.style.height = '720px';  // Use observed size from logs
                                }
                                
                                const slideHTML = slide.outerHTML;
                                slideContents.push(slideHTML);
                                console.log(`Slide ${index+1} captured`);
                            });
                            
                            // Get presentation dimensions from the first slide
                            const firstSlide = slides[0];
                            
                            // Use fixed dimensions if detection fails
                            let slideWidth = firstSlide.offsetWidth;
                            let slideHeight = firstSlide.offsetHeight;
                            
                            if (slideWidth < 100 || slideHeight < 100) {
                                console.log("Detected slide dimensions too small, using standard dimensions");
                                slideWidth = 1280;  // Standard PowerPoint dimensions
                                slideHeight = 720;
                            }
                            
                            const presentationSize = {
                                width: slideWidth,
                                height: slideHeight
                            };
                            console.log("Presentation size detected:", presentationSize);
                            
                            // Create result object
                            pptxHtmlContent = {
                                slides: slideContents,
                                presentationSize: presentationSize
                            };
                            
                            slideCount = slideContents.length;
                            console.log("Total slides in document: ", slideCount);
                            
                            // Resolve the promise
                            resolve();
                        }, 1500); // 1.5 second delay to ensure everything is rendered
                    }
                });
                
                // Start observing the target element
                observer.observe(targetElement, {
                    childList: true,
                    subtree: true,
                    attributes: true,  // Track attribute changes
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
                console.log("Calling pptxToHtml on myModal...");
                try {
                    $("#myModal").pptxToHtml({
                        pptxFileUrl: documentUrl,
                        slidesScale: 1,
                        slideMode: false,
                        mediaProcess: true,
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
                pptxHtmlContent.presentationSize = { width: 1280, height: 720 };
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
        
        // Ensure canvas container is centered
        var canvasContainer = document.getElementById('canvasContainer');
        if (canvasContainer) {
            canvasContainer.style.margin = "0 auto";
        }
        
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
        return 1280; // Use PowerPoint standard width
    };

    // Get the original height based on detected presentation size
    this.originalHeight = function () {
        if (pptxHtmlContent && pptxHtmlContent.presentationSize && pptxHtmlContent.presentationSize.height) {
            console.log("Returning actual presentation height:", pptxHtmlContent.presentationSize.height);
            return pptxHtmlContent.presentationSize.height;
        }
        console.log("Returning default height: 720");
        return 720; // Use PowerPoint standard height
    };

    // Optimized redraw method for rendering a slide with full content
    this.redraw = function (scale, rotation, pageIndex, onCompletion) {
        console.log("Redrawing slide at index:", pageIndex);
        
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
        
        // Create a temporary div to hold the HTML content with special rendering class
        var tempDiv = document.createElement("div");
        tempDiv.classList.add('pptx-render-container');
        tempDiv.innerHTML = slideHtml;
        
        // Set generous dimensions to ensure all content is captured
        tempDiv.style.position = "absolute";
        tempDiv.style.left = "-9999px";
        tempDiv.style.top = "-9999px";
        tempDiv.style.width = "2000px"; // Generous width for content
        tempDiv.style.height = "2000px"; // Generous height for content
        
        document.body.appendChild(tempDiv);
        
        // Get slide element and apply rendering class
        var slideElement = tempDiv.querySelector('.slide');
        if (slideElement) {
            slideElement.classList.add('rendering-slide');
            
            // Remove fixed height and set overflow to visible
            slideElement.style.height = "auto";
            slideElement.style.minHeight = "720px"; // Match PowerPoint standard
            slideElement.style.width = "auto";
            slideElement.style.minWidth = "1280px"; // Match PowerPoint standard
            slideElement.style.overflow = "visible";
            slideElement.style.backgroundColor = "white";
            
            // Process all elements to ensure they're visible
            var allElements = slideElement.querySelectorAll('*');
            allElements.forEach(function(el) {
                if (el.style) {
                    el.style.overflow = "visible";
                }
            });
            
            // Fix any SVG elements
            var svgElements = slideElement.querySelectorAll('svg');
            if (svgElements.length > 0) {
                console.log(`Found ${svgElements.length} SVG elements in slide`);
                svgElements.forEach(function(svg, idx) {
                    try {
                        // Add a white background rect to SVGs if needed
                        if (svg.firstChild && !svg.querySelector('rect[fill="white"]')) {
                            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                            rect.setAttribute("width", "100%");
                            rect.setAttribute("height", "100%");
                            rect.setAttribute("fill", "white");
                            svg.insertBefore(rect, svg.firstChild);
                            console.log(`Added background rect to SVG #${idx}`);
                        }
                    } catch (e) {
                        console.error(`Error fixing SVG #${idx}:`, e);
                    }
                });
            }
        }
        
        // Use a short timeout to ensure DOM updates
        setTimeout(function() {
            // Measure the actual content size
            var slideRect = slideElement ? slideElement.getBoundingClientRect() : tempDiv.getBoundingClientRect();
            
            // Add extra buffer for safety
            var bufferFactor = 1.2; // 20% extra space
            var contentWidth = Math.ceil(slideRect.width * bufferFactor);
            var contentHeight = Math.ceil(slideRect.height * bufferFactor);
            
            console.log("Content dimensions:", contentWidth, "x", contentHeight);
            
            // Check if dimensions exceed canvas limits and scale down if needed
            var canvasScaleFactor = 1;
            if (contentWidth > MAX_CANVAS_DIMENSION || contentHeight > MAX_CANVAS_DIMENSION) {
                canvasScaleFactor = Math.min(
                    MAX_CANVAS_DIMENSION / contentWidth,
                    MAX_CANVAS_DIMENSION / contentHeight
                );
                console.log("Canvas size exceeds limits, scaling down by:", canvasScaleFactor);
            }
            
            // Set dimensions for html2canvas rendering
            var renderWidth = Math.min(contentWidth, MAX_CANVAS_DIMENSION);
            var renderHeight = Math.min(contentHeight, MAX_CANVAS_DIMENSION);
            
            // Use html2canvas with optimized settings
            html2canvas(tempDiv, {
                scale: 1, // Will apply scaling later
                allowTaint: true,
                useCORS: true,
                backgroundColor: "white",
                logging: true,
                width: renderWidth,
                height: renderHeight,
                windowWidth: renderWidth,
                windowHeight: renderHeight,
                onclone: function(clonedDoc) {
                    // Ensure cloned document has proper styling
                    var clonedSlide = clonedDoc.querySelector('.slide');
                    if (clonedSlide) {
                        clonedSlide.classList.add('rendering-slide');
                        clonedSlide.style.backgroundColor = "white";
                    }
                    console.log("DOM cloned for rendering");
                }
            }).then(function (renderedCanvas) {
                console.log("Slide rendered successfully to canvas sized:", renderedCanvas.width, "x", renderedCanvas.height);
                
                // Calculate final dimensions with user's scale factor
                var finalScale = scale * canvasScaleFactor;
                
                // Check if rotation requires swapping dimensions
                var needSwapDimensions = (rotation === 90 || rotation === 270);
                
                // Set canvas size (account for rotation)
                if (needSwapDimensions) {
                    canvas.width = renderedCanvas.height * finalScale;
                    canvas.height = renderedCanvas.width * finalScale;
                } else {
                    canvas.width = renderedCanvas.width * finalScale;
                    canvas.height = renderedCanvas.height * finalScale;
                }
                
                console.log("Final canvas size:", canvas.width, "x", canvas.height);
                
                // Get the 2D context and prepare for drawing
                var ctx = canvas.getContext("2d");
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                // Fill background with white first
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Draw based on rotation
                ctx.save();
                
                if (rotation !== 0) {
                    // For rotated content, we need to translate to center
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    ctx.rotate(rotation * Math.PI / 180);
                    
                    if (needSwapDimensions) {
                        // For 90/270 degrees (swap dimensions)
                        ctx.drawImage(
                            renderedCanvas,
                            -canvas.height / 2,
                            -canvas.width / 2,
                            canvas.height,
                            canvas.width
                        );
                    } else {
                        // For 0/180 degrees
                        ctx.drawImage(
                            renderedCanvas,
                            -canvas.width / 2,
                            -canvas.height / 2,
                            canvas.width,
                            canvas.height
                        );
                    }
                } else {
                    // No rotation, straightforward drawing
                    ctx.drawImage(renderedCanvas, 0, 0, canvas.width, canvas.height);
                }
                
                ctx.restore();
                
                // Clean up
                document.body.removeChild(tempDiv);
                
                if (onCompletion) {
                    console.log("Calling onCompletion callback after redrawing.");
                    onCompletion();
                }
            }).catch(function (error) {
                console.error("Error rendering slide to canvas:", error);
                
                // Fallback rendering for error case
                canvas.width = 1280 * scale;
                canvas.height = 720 * scale;
                
                var ctx = canvas.getContext("2d");
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                ctx.fillStyle = "black";
                ctx.font = "20px Arial";
                ctx.textAlign = "center";
                ctx.fillText("Error rendering slide", canvas.width/2, canvas.height/2 - 20);
                ctx.fillText("Please try again", canvas.width/2, canvas.height/2 + 20);
                
                if (document.body.contains(tempDiv)) {
                    document.body.removeChild(tempDiv);
                }
                
                if (onCompletion) {
                    console.log("Calling onCompletion callback from redraw (error).");
                    onCompletion();
                }
            });
        }, 100); // Short timeout to ensure DOM updates
    };

    // Helper function to create canvases for all slides
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

            // Create a temporary div with improved styling
            const tempDiv = document.createElement('div');
            tempDiv.classList.add('pptx-render-container');
            tempDiv.innerHTML = slideHtml;
            tempDiv.style.position = "absolute";
            tempDiv.style.left = "-9999px";
            tempDiv.style.top = "-9999px";
            tempDiv.style.width = "2000px";
            tempDiv.style.height = "2000px";
            
            // Apply custom class to slide
            var slideElement = tempDiv.querySelector('.slide');
            if (slideElement) {
                slideElement.classList.add('rendering-slide');
            }
            
            document.body.appendChild(tempDiv);
            
            // Wait for DOM update
            setTimeout(function(index, tempDivElement) {
                var slideRect = slideElement ? slideElement.getBoundingClientRect() : tempDivElement.getBoundingClientRect();
                
                // Add buffer space
                var bufferFactor = 1.2;
                var contentWidth = Math.min(Math.ceil(slideRect.width * bufferFactor), MAX_CANVAS_DIMENSION);
                var contentHeight = Math.min(Math.ceil(slideRect.height * bufferFactor), MAX_CANVAS_DIMENSION);
                
                // Use html2canvas with improved settings
                html2canvas(tempDivElement, {
                    scale: 1,
                    allowTaint: true,
                    useCORS: true,
                    backgroundColor: "white",
                    width: contentWidth,
                    height: contentHeight
                }).then(function (renderedCanvas) {
                    console.log(`Slide ${index} rendered successfully.`);
                    canvases[index - fromPage] = {
                        canvas: renderedCanvas,
                        originalDocumentDpi: self.DPI
                    };
                    
                    // Clean up
                    document.body.removeChild(tempDivElement);
                    
                    processedCount++;
                    checkCompletion();
                }).catch(function (error) {
                    console.error(`Error rendering slide ${index} to canvas:`, error);
                    if (document.body.contains(tempDivElement)) {
                        document.body.removeChild(tempDivElement);
                    }
                    
                    processedCount++;
                    checkCompletion();
                });
            }.bind(null, i, tempDiv), 100);
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
        });
    };
}
