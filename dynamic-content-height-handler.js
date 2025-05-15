function PptxHandler(canvas) {
    var self = this;
    self.DPI = 96; // Default DPI for PPTX files
    var pptxHtmlContent = null;
    var slideCount = 0;

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
                        
                        // Give a longer delay to ensure all content is fully rendered
                        setTimeout(() => {
                            observer.disconnect();
                            console.log("Observer disconnected after slide detection");
                            
                            // Collect all slide HTML contents
                            // Add extra padding to ensure all content is visible
                            const slideContents = [];
                            slides.forEach((slide, index) => {
                                // Add a wrapper div with extra padding to ensure all content is visible
                                slide.style.paddingBottom = "100px"; // Add 100px padding to bottom
                                slide.style.height = "auto"; // Let height adjust to content
                                slide.style.minHeight = "720px"; // Minimum height
                                
                                const slideHTML = slide.outerHTML;
                                slideContents.push(slideHTML);
                                console.log(`Slide ${index+1} captured`);
                            });
                            
                            // Get presentation dimensions from the first slide
                            const firstSlide = slides[0];
                            
                            // Calculate actual content height by measuring all child elements
                            let maxBottom = 0;
                            const elements = firstSlide.querySelectorAll('*');
                            
                            elements.forEach(element => {
                                const rect = element.getBoundingClientRect();
                                // Get the bottom position relative to the slide
                                const bottom = rect.bottom;
                                if (bottom > maxBottom) {
                                    maxBottom = bottom;
                                }
                            });
                            
                            // Get the top of the slide for calculating height
                            const slideTop = firstSlide.getBoundingClientRect().top;
                            // Calculate the total height needed
                            const contentHeight = Math.max(maxBottom - slideTop + 100, 720); // Add 100px buffer
                            
                            const presentationSize = {
                                width: firstSlide.offsetWidth || 1280,
                                height: contentHeight // Use calculated height or 720px
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
                pptxHtmlContent.presentationSize = { width: 1280, height: 800 }; // Increased height
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

    // UPDATED: Get the original width based on detected presentation size
    this.originalWidth = function () {
        if (pptxHtmlContent && pptxHtmlContent.presentationSize && pptxHtmlContent.presentationSize.width) {
            console.log("Returning actual presentation width:", pptxHtmlContent.presentationSize.width);
            return pptxHtmlContent.presentationSize.width;
        }
        console.log("Returning default width: 1280");
        return 1280; // Updated default width
    };

    // UPDATED: Get the original height based on detected presentation size
    this.originalHeight = function () {
        if (pptxHtmlContent && pptxHtmlContent.presentationSize && pptxHtmlContent.presentationSize.height) {
            console.log("Returning actual presentation height:", pptxHtmlContent.presentationSize.height);
            return pptxHtmlContent.presentationSize.height;
        }
        console.log("Returning default height: 800");
        return 800; // Updated default height
    };

    // Improved redraw method to capture all content
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

        // Create a temporary div to hold the HTML content
        var tempDiv = document.createElement("div");
        tempDiv.innerHTML = slideHtml;
        
        // Find the slide element
        var slideElement = tempDiv.querySelector('.slide');
        if (slideElement) {
            // Ensure slide has auto height to display all content
            slideElement.style.height = "auto";
            slideElement.style.minHeight = "720px";
            slideElement.style.paddingBottom = "100px"; // Extra padding at bottom
        }
        
        // Add visibility to content
        const allElements = tempDiv.querySelectorAll('*');
        allElements.forEach(el => {
            if (el.style) {
                el.style.overflow = "visible";
            }
        });
        
        // Position for off-screen rendering
        tempDiv.style.position = "absolute";
        tempDiv.style.left = "-9999px";
        tempDiv.style.top = "-9999px";
        tempDiv.style.width = this.originalWidth() + "px";
        tempDiv.style.height = "auto"; // Allow height to adjust to content
        
        document.body.appendChild(tempDiv);
        console.log("Temporary div created and added to body.");
        
        // Calculate visible content height dynamically
        let maxBottom = 0;
        let minTop = Number.MAX_SAFE_INTEGER;
        
        // Find the lowest element in the DOM to determine total height
        const contentElements = tempDiv.querySelectorAll('div, span, p, li, text, svg');
        contentElements.forEach(el => {
            try {
                const rect = el.getBoundingClientRect();
                if (rect.bottom > maxBottom) maxBottom = rect.bottom;
                if (rect.top < minTop) minTop = rect.top;
            } catch (e) {
                // Ignore errors from getBoundingClientRect
            }
        });
        
        // Calculate content height with padding
        const contentHeight = maxBottom - minTop + 100; // Add 100px padding
        console.log(`Calculated content height: ${contentHeight}px`);
        
        // Use html2canvas with appropriate settings
        html2canvas(tempDiv, {
            scale: 1,
            allowTaint: true,
            useCORS: true,
            backgroundColor: "white", // Use white background
            logging: true,
            height: Math.max(contentHeight, 720), // Use at least 720px or the content height
            width: this.originalWidth(),
            windowHeight: Math.max(contentHeight, 720), // Same for window height
            windowWidth: this.originalWidth(),
            onclone: function(clonedDoc) {
                var clonedSlide = clonedDoc.querySelector('.slide');
                if (clonedSlide) {
                    clonedSlide.style.height = "auto";
                    clonedSlide.style.minHeight = "720px";
                    clonedSlide.style.paddingBottom = "100px";
                }
                
                // Ensure all elements are visible
                const clonedElements = clonedDoc.querySelectorAll('*');
                clonedElements.forEach(el => {
                    if (el.style) {
                        el.style.overflow = "visible";
                    }
                });
            }
        }).then(function (renderedCanvas) {
            console.log("Slide rendered successfully to canvas with dimensions:", 
                       renderedCanvas.width, "x", renderedCanvas.height);
            
            // Calculate final dimensions with scale
            var imageWidth = renderedCanvas.width;
            var imageHeight = renderedCanvas.height;
            
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
            
            // Set canvas dimensions
            canvas.width = finalWidth;
            canvas.height = finalHeight;
            
            console.log(`Canvas resized to: ${canvas.width} x ${canvas.height}`);
            
            // Get 2D context and prepare for drawing
            var ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Fill with white background
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
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
                // No rotation
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
            canvas.height = 800 * scale;
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

    // Updated helper function to create canvases for all slides with dynamic height
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
            
            // Ensure slide has auto height
            var slideElement = tempDiv.querySelector('.slide');
            if (slideElement) {
                slideElement.style.height = "auto";
                slideElement.style.minHeight = "720px";
                slideElement.style.paddingBottom = "100px";
            }
            
            // Position off-screen
            tempDiv.style.position = "absolute";
            tempDiv.style.left = "-9999px";
            tempDiv.style.top = "-9999px";
            
            document.body.appendChild(tempDiv);

            // Use html2canvas with auto height
            html2canvas(tempDiv, {
                scale: 1,
                allowTaint: true,
                useCORS: true,
                backgroundColor: "white",
                height: tempDiv.scrollHeight // Use actual content height
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
