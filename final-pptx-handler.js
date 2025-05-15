var MAX_CANVAS_DIMENSION = 16384; // Most browsers support up to 16384 pixels for canvas dimensions

function PptxHandler(canvas) {
    var self = this;
    self.DPI = 96; // Default DPI for PPTX files
    var pptxHtmlContent = null;
    var slideCount = 0;

    // Initialize the handler and load pptxjs library
    this.init = function (onCompletion) {
        console.log("Initializing PptxHandler...");
        
        // Add styles for proper rendering
        var style = document.createElement('style');
        style.textContent = `
            /* Base styling for slides */
            .slide {
                background-color: white !important;
                border: none !important;
                border-radius: 0 !important;
                overflow: visible !important;
                width: 1280px !important; /* Standard PowerPoint width */
                height: 720px !important; /* Standard PowerPoint height */
                position: relative !important;
                margin: 0 auto !important;
            }
            
            /* Container styling */
            #canvasContainer {
                margin: 0 auto !important;
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
            }
            
            /* Fix SVG rendering */
            .slide svg.drawing {
                position: absolute !important;
                overflow: visible !important;
                z-index: 1 !important;
            }
            
            /* Special rendering class */
            .rendering-slide {
                background-color: white !important;
                border: none !important;
                width: 1280px !important;
                height: 720px !important;
                overflow: visible !important;
            }
            
            /* Fix for myModal visibility */
            #myModal {
                position: absolute !important;
                left: -9999px !important;
                top: -9999px !important;
                width: 2000px !important;
                height: 2000px !important;
                background: none !important;
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

    // Improved loadDocument method with better slide capture
    this.loadDocument = async function (documentUrl, onCompletion, onError) {
        try {
            console.log("Start loading PPTX document from URL:", documentUrl);
            benchmark.time("PPTX Document loaded");
            
            // Prepare temporary modal with proper styling
            if (!document.getElementById('myModal')) {
                var tmpDiv = document.createElement('div');
                tmpDiv.id = 'myModal';
                tmpDiv.style.position = 'absolute';
                tmpDiv.style.left = '-9999px';
                tmpDiv.style.top = '-9999px';
                tmpDiv.style.width = '2000px';
                tmpDiv.style.height = '2000px';
                tmpDiv.style.display = 'block';
                tmpDiv.style.visibility = 'hidden';
                tmpDiv.style.zIndex = '-9999';
                document.body.appendChild(tmpDiv);
                console.log("Created temporary modal div with proper positioning");
            }
            
            // Create a promise that will be resolved when slides are loaded
            await new Promise((resolve, reject) => {
                // Set up MutationObserver to detect when slides are added
                const targetElement = document.getElementById('myModal');
                const observer = new MutationObserver((mutations) => {
                    // Find slides by class
                    const slides = targetElement.querySelectorAll('.slide');
                    
                    if (slides.length > 0) {
                        console.log(`Detected ${slides.length} slides loaded in the DOM`);
                        
                        // Give more time for rendering to complete
                        setTimeout(() => {
                            observer.disconnect();
                            console.log("Observer disconnected after slide detection");
                            
                            // Fix SVG elements before capturing slides
                            const svgElements = targetElement.querySelectorAll('svg');
                            if (svgElements.length > 0) {
                                console.log(`Found ${svgElements.length} SVG elements to fix`);
                                svgElements.forEach((svg, idx) => {
                                    try {
                                        // Add white background to SVGs
                                        if (svg.firstChild && !svg.querySelector('rect[fill="white"]')) {
                                            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                                            rect.setAttribute("width", "100%");
                                            rect.setAttribute("height", "100%");
                                            rect.setAttribute("fill", "white");
                                            svg.insertBefore(rect, svg.firstChild);
                                        }
                                        
                                        // Fix SVG dimensions and attributes
                                        if (!svg.getAttribute('width')) {
                                            svg.setAttribute('width', '100%');
                                        }
                                        if (!svg.getAttribute('height')) {
                                            svg.setAttribute('height', '100%');
                                        }
                                        if (!svg.getAttribute('viewBox')) {
                                            svg.setAttribute('viewBox', '0 0 100 100');
                                        }
                                        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                                        
                                        console.log(`Fixed SVG #${idx}`);
                                    } catch (e) {
                                        console.error(`Error fixing SVG #${idx}:`, e);
                                    }
                                });
                            }
                            
                            // Add background color to slides
                            slides.forEach((slide) => {
                                slide.style.backgroundColor = "white";
                                slide.style.width = "1280px";
                                slide.style.height = "720px";
                                slide.style.overflow = "visible";
                                
                                // Remove any borders or shadows
                                slide.style.border = "none";
                                slide.style.boxShadow = "none";
                                slide.style.borderRadius = "0";
                                
                                // Ensure all elements inside have visible overflow
                                const allElements = slide.querySelectorAll('*');
                                allElements.forEach(function(el) {
                                    if (el.style) {
                                        el.style.overflow = "visible";
                                    }
                                });
                            });
                            
                            // Collect all slide HTML contents
                            const slideContents = [];
                            slides.forEach((slide, index) => {
                                // Force correct sizing on the slide
                                slide.style.width = "1280px";
                                slide.style.height = "720px";
                                
                                const slideHTML = slide.outerHTML;
                                slideContents.push(slideHTML);
                                console.log(`Slide ${index+1} captured`);
                            });
                            
                            // Create result object
                            pptxHtmlContent = {
                                slides: slideContents,
                                presentationSize: {
                                    width: 1280,  // Standard PowerPoint width
                                    height: 720   // Standard PowerPoint height
                                }
                            };
                            
                            slideCount = slideContents.length;
                            console.log("Total slides in document: ", slideCount);
                            console.log("Using standard presentation size: 1280x720");
                            
                            // Resolve the promise
                            resolve();
                        }, 2000); // Increased delay to ensure rendering completes
                    }
                });
                
                // Start observing the target element
                observer.observe(targetElement, {
                    childList: true,
                    subtree: true,
                    attributes: true
                });
                console.log("MutationObserver started on target element");
                
                // Set timeout for conversion
                const timeoutId = setTimeout(() => {
                    observer.disconnect();
                    console.error("PPTXjs conversion timed out after 30 seconds");
                    reject(new Error("Conversion timed out"));
                }, 30000);
                
                targetElement._pptxTimeoutId = timeoutId;
                
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
                    reject(initError);
                }
            });
            
            // Clean up timeouts
            const myModal = document.getElementById('myModal');
            if (myModal && myModal._pptxTimeoutId) {
                clearTimeout(myModal._pptxTimeoutId);
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

    // Get the original width
    this.originalWidth = function () {
        return 1280; // Standard PowerPoint width
    };

    // Get the original height
    this.originalHeight = function () {
        return 720; // Standard PowerPoint height
    };

    // Optimized redraw method for rendering slides
    this.redraw = function (scale, rotation, pageIndex, onCompletion) {
        console.log("Redrawing slide at index:", pageIndex);
        
        if (!pptxHtmlContent || !pptxHtmlContent.slides || pptxHtmlContent.slides.length === 0) {
            console.error("No slides available for rendering.");
            if (onCompletion) {
                onCompletion();
            }
            return;
        }
        
        // Get the HTML content for the slide
        var slideHtml = pptxHtmlContent.slides[pageIndex];
        if (!slideHtml) {
            console.error(`Slide with index ${pageIndex} not found`);
            if (onCompletion) {
                onCompletion();
            }
            return;
        }
        
        console.log("Rendering slide HTML content at index:", pageIndex);
        
        // Create a temporary div with special rendering class
        var tempDiv = document.createElement("div");
        tempDiv.className = "pptx-render-container";
        tempDiv.innerHTML = slideHtml;
        
        // Position off-screen for rendering
        tempDiv.style.position = "absolute";
        tempDiv.style.left = "-9999px";
        tempDiv.style.top = "-9999px";
        tempDiv.style.width = "2000px";
        tempDiv.style.height = "2000px";
        
        document.body.appendChild(tempDiv);
        
        // Apply rendering class to slide
        var slideElement = tempDiv.querySelector('.slide');
        if (slideElement) {
            slideElement.classList.add('rendering-slide');
            slideElement.style.backgroundColor = "white";
            
            // Process all elements to ensure they're visible
            var allElements = slideElement.querySelectorAll('*');
            allElements.forEach(function(el) {
                if (el.style) {
                    el.style.overflow = "visible";
                }
            });
        }
        
        // Wait for DOM updates before rendering
        setTimeout(function() {
            // Use html2canvas with improved settings
            html2canvas(tempDiv, {
                scale: 1,
                allowTaint: true,
                useCORS: true,
                backgroundColor: "white",
                logging: true,
                width: 1280,
                height: 720,
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
                console.log("Slide rendered successfully to canvas.");
                
                // Calculate final dimensions with scale
                var finalWidth = Math.round(1280 * scale);
                var finalHeight = Math.round(720 * scale);
                
                // Check if rotation requires swapping dimensions
                if (rotation === 90 || rotation === 270) {
                    var temp = finalWidth;
                    finalWidth = finalHeight;
                    finalHeight = temp;
                }
                
                console.log(`Setting canvas size to: ${finalWidth} x ${finalHeight}`);
                
                // Set canvas size
                canvas.width = finalWidth;
                canvas.height = finalHeight;
                
                // Get 2D context and prepare for drawing
                var ctx = canvas.getContext("2d");
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Draw based on rotation
                ctx.save();
                
                if (rotation !== 0) {
                    // For rotated content, translate to center
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    ctx.rotate(rotation * Math.PI / 180);
                    
                    if (rotation === 90 || rotation === 270) {
                        // For 90/270 degrees, swap dimensions
                        ctx.drawImage(
                            renderedCanvas,
                            -finalHeight / 2,
                            -finalWidth / 2,
                            finalHeight,
                            finalWidth
                        );
                    } else {
                        ctx.drawImage(
                            renderedCanvas,
                            -finalWidth / 2,
                            -finalHeight / 2,
                            finalWidth,
                            finalHeight
                        );
                    }
                } else {
                    // No rotation
                    ctx.drawImage(
                        renderedCanvas,
                        0,
                        0,
                        finalWidth,
                        finalHeight
                    );
                }
                
                ctx.restore();
                
                // Clean up
                document.body.removeChild(tempDiv);
                
                if (onCompletion) {
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
                
                ctx.fillStyle = "black";
                ctx.font = "20px Arial";
                ctx.textAlign = "center";
                ctx.fillText("Error rendering slide", canvas.width/2, canvas.height/2 - 20);
                ctx.fillText("Please try again", canvas.width/2, canvas.height/2 + 20);
                
                if (document.body.contains(tempDiv)) {
                    document.body.removeChild(tempDiv);
                }
                
                if (onCompletion) {
                    onCompletion();
                }
            });
        }, 100);
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

            // Create temporary div for rendering
            const tempDiv = document.createElement('div');
            tempDiv.className = "pptx-render-container";
            tempDiv.innerHTML = slideHtml;
            tempDiv.style.position = "absolute";
            tempDiv.style.left = "-9999px";
            tempDiv.style.top = "-9999px";
            tempDiv.style.width = "2000px";
            tempDiv.style.height = "2000px";
            
            // Apply rendering class to slide
            var slideElement = tempDiv.querySelector('.slide');
            if (slideElement) {
                slideElement.classList.add('rendering-slide');
                slideElement.style.backgroundColor = "white";
            }
            
            document.body.appendChild(tempDiv);
            
            // Wait for DOM updates
            setTimeout(function(index, tempDivElement) {
                // Use html2canvas to render the slide
                html2canvas(tempDivElement, {
                    scale: 1,
                    allowTaint: true,
                    useCORS: true,
                    backgroundColor: "white",
                    width: 1280,
                    height: 720
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
        
        // Calculate scale to fit (using fixed dimensions)
        var scaleToFitWidth = viewportWidth / 1280;
        var scaleToFitHeight = viewportHeight / 720;
        
        // Use smaller scale to ensure content fits
        var fitScale = Math.min(scaleToFitWidth, scaleToFitHeight);
        
        // Redraw with the new scale
        self.redraw(fitScale, 0, 0, function() {
            console.log("Content fitted to viewport with scale:", fitScale);
        });
    };
}
