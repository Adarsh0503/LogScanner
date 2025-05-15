function PptxHandler(canvas) {
    var self = this;
    self.DPI = 96; // Default DPI for PPTX files
    var pptxHtmlContent = null;
    var slideCount = 0;

    // Initialize the handler and load pptxjs library
    this.init = function (onCompletion) {
        console.log("Initializing PptxHandler...");
        
        // Add a minimal style for making sure slides have white background
        var style = document.createElement('style');
        style.textContent = `
            .slide-bg-fixed {
                background-color: white !important;
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

    // UPDATED: loadDocument method with MutationObserver to detect slide loading and HTML modification
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
                            
                            // Directly modify slides to force white backgrounds before capturing HTML
                            slides.forEach((slide, index) => {
                                // Add our background fixing class
                                slide.classList.add('slide-bg-fixed');
                                
                                // Set white background explicitly
                                slide.style.backgroundColor = 'white';
                                
                                // Force white background on all container divs inside slide
                                const divs = slide.querySelectorAll('div');
                                divs.forEach(div => {
                                    // Check if it has a transparent or no background color
                                    if (!div.style.backgroundColor || 
                                        div.style.backgroundColor === 'transparent' || 
                                        div.style.backgroundColor === 'rgba(0, 0, 0, 0)') {
                                        // Set white background
                                        div.style.backgroundColor = 'white';
                                    }
                                });
                                
                                // Handle SVG elements if present
                                const svgElements = slide.querySelectorAll('svg');
                                svgElements.forEach(svg => {
                                    try {
                                        // Add white background rect to SVG if it doesn't have one
                                        if (svg.firstChild && !svg.querySelector('rect[fill="white"]')) {
                                            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                                            rect.setAttribute("width", "100%");
                                            rect.setAttribute("height", "100%");
                                            rect.setAttribute("fill", "white");
                                            svg.insertBefore(rect, svg.firstChild);
                                        }
                                    } catch (e) {
                                        console.error("Error adding SVG background:", e);
                                    }
                                });
                                
                                // Additional: Fix slide height to show all content
                                slide.style.height = 'auto';
                                slide.style.minHeight = '720px';
                                slide.style.paddingBottom = '50px';
                            });
                            
                            // Now collect slide HTML content with our modifications
                            const slideContents = [];
                            slides.forEach((slide, index) => {
                                const slideHTML = slide.outerHTML;
                                slideContents.push(slideHTML);
                                console.log(`Slide ${index+1} captured`);
                            });
                            
                            // Get presentation dimensions from the first slide
                            const firstSlide = slides[0];
                            const presentationSize = {
                                width: firstSlide.offsetWidth || 1280,
                                height: firstSlide.offsetHeight || 720
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
                pptxHtmlContent.presentationSize = { width: 1280, height: 720 }; // Updated default size
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
        console.log("Returning default height: 720");
        return 720; // Updated default height
    };

    // Redraw method with direct white background handling
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
        
        // Apply explicit styling to ensure white background
        tempDiv.style.backgroundColor = "white";
        
        // For all slide elements, ensure white background
        var slideElements = tempDiv.querySelectorAll('.slide');
        slideElements.forEach(function(element) {
            element.style.backgroundColor = "white";
            element.classList.add('slide-bg-fixed');
        });
        
        // Add explicit dimensions and padding to ensure all content is visible
        var padding = 20; // 20px padding
        tempDiv.style.padding = padding + "px";
        tempDiv.style.position = "absolute";
        tempDiv.style.overflow = "visible"; // Critical - don't clip content
        tempDiv.style.left = "-9999px";
        tempDiv.style.top = "-9999px";
        
        document.body.appendChild(tempDiv);
        console.log("Temporary div created and added to body.");

        // Create a white background canvas first
        var bgCanvas = document.createElement('canvas');
        var bgCtx = bgCanvas.getContext('2d');
        
        // Use html2canvas with improved settings
        html2canvas(tempDiv, {
            scale: 1,
            allowTaint: true,
            useCORS: true,
            backgroundColor: "white", // Force white background
            logging: true,
            // These options are critical for capturing all content
            windowWidth: tempDiv.scrollWidth + (padding * 2),
            windowHeight: tempDiv.scrollHeight + (padding * 2),
            // Add extra room for content
            width: tempDiv.scrollWidth + (padding * 2),
            height: tempDiv.scrollHeight + (padding * 2),
            // Process the clone before rendering
            onclone: function(clonedDoc) {
                // Ensure all elements have white background in the clone
                var allElements = clonedDoc.querySelectorAll('*');
                allElements.forEach(function(el) {
                    if (el.style) {
                        el.style.overflow = 'visible';
                        // Add white background to container elements
                        if (el.tagName === 'DIV' && 
                            (!el.style.backgroundColor || 
                             el.style.backgroundColor === 'transparent' || 
                             el.style.backgroundColor === 'rgba(0, 0, 0, 0)')) {
                            el.style.backgroundColor = 'white';
                        }
                    }
                });
            }
        }).then(function (renderedCanvas) {
            console.log("Slide rendered successfully to canvas.");

            // Apply buffer factor to scale to ensure we capture everything
            var bufferFactor = 1.1; // 10% extra space
            
            // Ensure canvas size is set correctly with buffer
            canvas.width = renderedCanvas.width * scale * bufferFactor;
            canvas.height = renderedCanvas.height * scale * bufferFactor;

            console.log(`Canvas resized to: ${canvas.width} x ${canvas.height}`);

            // Set up background canvas to match our main canvas size
            bgCanvas.width = canvas.width;
            bgCanvas.height = canvas.height;
            bgCtx.fillStyle = "white";
            bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

            // Get the 2D context of the canvas
            var ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear any existing content
            console.log("Canvas cleared.");
            
            // First draw white background
            ctx.drawImage(bgCanvas, 0, 0);

            // Apply rotation and scaling to the canvas context
            ctx.save();
            console.log("Canvas context saved.");
            
            // Center the content with buffer space
            var centerX = canvas.width / 2;
            var centerY = canvas.height / 2;
            
            ctx.translate(centerX, centerY); // Translate to center
            ctx.rotate(rotation * Math.PI / 180); // Apply rotation
            
            // Scale with buffer
            var scaleWithBuffer = scale * bufferFactor;
            
            // Draw centered
            ctx.drawImage(
                renderedCanvas, 
                -renderedCanvas.width * scale / 2,  // Center horizontally
                -renderedCanvas.height * scale / 2, // Center vertically
                renderedCanvas.width * scale,
                renderedCanvas.height * scale
            );
            
            ctx.restore();
            console.log("Canvas context restored.");

            // Cleanup the temporary div
            document.body.removeChild(tempDiv);
            console.log("Temporary div removed from body.");

            if (onCompletion) {
                console.log("Calling onCompletion callback after redrawing.");
                onCompletion();
            }
        }).catch(function (error) {
            console.error("Error rendering slide to canvas:", error);
            
            // Create a fallback white canvas with error message
            canvas.width = 1280 * scale;
            canvas.height = 720 * scale;
            var ctx = canvas.getContext("2d");
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Add error message
            ctx.fillStyle = "black";
            ctx.font = "20px Arial";
            ctx.textAlign = "center";
            ctx.fillText("Error rendering slide", canvas.width/2, canvas.height/2 - 20);
            ctx.fillText("Please try again", canvas.width/2, canvas.height/2 + 20);
            
            if (document.body.contains(tempDiv)) {
                document.body.removeChild(tempDiv);
            }
            console.log("Temporary div removed from body due to error.");
            
            if (onCompletion) {
                console.log("Calling onCompletion callback from redraw (error).");
                onCompletion();
            }
        });
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

            // Create a temporary div for the slide with white background
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = slideHtml;
            tempDiv.style.backgroundColor = "white";
            
            // Force white background on slide elements
            var slideElements = tempDiv.querySelectorAll('.slide');
            slideElements.forEach(function(element) {
                element.style.backgroundColor = "white";
                element.classList.add('slide-bg-fixed');
            });
            
            // Position off-screen
            tempDiv.style.position = "absolute";
            tempDiv.style.left = "-9999px";
            tempDiv.style.top = "-9999px";
            
            document.body.appendChild(tempDiv);
            console.log(`Temporary div created and added for slide ${i}`);

            // Use html2canvas with white background
            html2canvas(tempDiv, {
                scale: 1,
                allowTaint: true,
                useCORS: true,
                backgroundColor: "white" // Force white background
            }).then(function (renderedCanvas) {
                console.log(`Slide ${i} rendered successfully.`);
                canvases[i - fromPage] = {
                    canvas: renderedCanvas,
                    originalDocumentDpi: self.DPI
                };

                document.body.removeChild(tempDiv);
                console.log(`Temporary div removed for slide ${i}`);

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

    // ADDED: Cleanup method to remove temporary resources
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
