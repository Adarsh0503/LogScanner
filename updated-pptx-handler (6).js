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
        
        // Add critical CSS styles to fix rendering issues
        var style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = `
            .slide {
                padding-top: 150px !important;
                margin-top: 50px !important;
                overflow: visible !important;
                background-color: white !important;
                border: none !important;
                border-radius: 0 !important;
            }
            
            #canvasContainer {
                display: flex;
                justify-content: center;
                align-items: center;
            }
            
            #documentCanvas {
                margin: 0 auto;
                display: block;
            }
            
            #viewerPanel {
                display: flex !important;
                justify-content: center;
                align-items: center;
                padding-top: 30px !important;
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
                            
                            // Fix slide positioning to ensure top content is visible
                            slides.forEach((slide, index) => {
                                // Apply substantial top padding to all slides
                                slide.style.paddingTop = "150px";
                                slide.style.marginTop = "50px";
                                slide.style.minHeight = "720px";
                                
                                // Handle absolutely positioned elements near the top
                                const posElements = slide.querySelectorAll('[style*="position: absolute"]');
                                posElements.forEach(el => {
                                    if (el.style.top && parseInt(el.style.top) < 50) {
                                        el.style.top = (parseInt(el.style.top) + 100) + "px";
                                    }
                                });
                            });
                            
                            // Collect all slide HTML contents
                            const slideContents = [];
                            slides.forEach((slide, index) => {
                                const slideHTML = slide.outerHTML;
                                slideContents.push(slideHTML);
                                console.log(`Slide ${index+1} captured`);
                            });
                            
                            // Get presentation dimensions from the first slide
                            const presentationSize = {
                                width: 1280,
                                height: 720
                            };
                            
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
                
                // Initialize PPTXjs with simple settings
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
                    reject(initError);
                }
            });
            
            // Clean up timeouts
            const myModal = document.getElementById('myModal');
            if (myModal && myModal._pptxTimeoutId) {
                clearTimeout(myModal._pptxTimeoutId);
            }
            
            // Ensure we have presentation size
            if (!pptxHtmlContent.presentationSize) {
                pptxHtmlContent.presentationSize = { width: 1280, height: 720 }; // Standard size
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
            return pptxHtmlContent.presentationSize.width;
        }
        return 1280; // Standard width
    };

    // Get the original height based on detected presentation size
    this.originalHeight = function () {
        if (pptxHtmlContent && pptxHtmlContent.presentationSize && pptxHtmlContent.presentationSize.height) {
            return pptxHtmlContent.presentationSize.height;
        }
        return 720; // Standard height
    };

    // Simplified redraw method inspired by the ImageHandler approach
    this.redraw = function (scale, rotation, pageIndex, onCompletion) {
        console.log("Redrawing slide at index:", pageIndex, "with scale:", scale, "and rotation:", rotation);

        // Cache rendering parameters
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

        // Validate slide data
        if (!pptxHtmlContent || !pptxHtmlContent.slides || pptxHtmlContent.slides.length === 0 || !pptxHtmlContent.slides[pageIndex]) {
            console.error("No valid slide data available for rendering.");
            if (onCompletion) onCompletion();
            return;
        }

        // Create a temporary div to hold the HTML content
        var tempDiv = document.createElement("div");
        tempDiv.style.position = "absolute";
        tempDiv.style.left = "-9999px";
        tempDiv.style.top = "-9999px";
        tempDiv.innerHTML = pptxHtmlContent.slides[pageIndex];
        
        // Ensure slide has extra padding for top content
        var slideElement = tempDiv.querySelector('.slide');
        if (slideElement) {
            slideElement.style.paddingTop = "200px";
            slideElement.style.marginTop = "100px";
            slideElement.style.paddingBottom = "100px";
            slideElement.style.overflow = "visible";
        }
        
        document.body.appendChild(tempDiv);

        // Use html2canvas with simple, direct settings
        html2canvas(tempDiv, {
            scale: 1.5,
            allowTaint: true,
            useCORS: true,
            backgroundColor: "white",
            y: -200,
            scrollY: -200
        }).then(function (renderedCanvas) {
            // Calculate dimensions needed for the canvas
            var w = renderedCanvas.width;
            var h = renderedCanvas.height;
            
            // Apply transformations like in ImageHandler
            var drawInfo = calcCanvasCorrections(w * scale, h * scale, rotation);
            canvas.width = drawInfo.cw;
            canvas.height = drawInfo.ch;
            
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            
            // Apply rotation
            if (rotation !== 0) {
                ctx.rotate(rotation * Math.PI / 180);
            }
            
            // Draw the image with proper offset
            ctx.drawImage(renderedCanvas, drawInfo.cx, drawInfo.cy, w * scale, h * scale);
            ctx.restore();
            
            // Clean up
            document.body.removeChild(tempDiv);
            
            // Update annotation canvas dimensions
            var annotationCanvas = document.getElementById('annotationCanvas');
            if (annotationCanvas) {
                annotationCanvas.width = canvas.width;
                annotationCanvas.height = canvas.height;
            }
            
            // Update annotation handler dimensions
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
            
            // Enable scrolling in the viewer panel if content is larger than the viewport
            var viewerPanel = document.getElementById('viewerPanel');
            if (viewerPanel) {
                if (canvas.width > viewerPanel.clientWidth) {
                    viewerPanel.style.overflowX = "scroll";
                } else {
                    viewerPanel.style.overflowX = "auto";
                }
                
                if (canvas.height > viewerPanel.clientHeight) {
                    viewerPanel.style.overflowY = "scroll";
                } else {
                    viewerPanel.style.overflowY = "auto";
                }
            }
            
            if (onCompletion) onCompletion();
        }).catch(function(error) {
            console.error("Error rendering slide:", error);
            
            // Create a basic fallback rendering
            canvas.width = 1280 * scale;
            canvas.height = 720 * scale;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "black";
            ctx.font = "20px Arial";
            ctx.textAlign = "center";
            ctx.fillText("Error rendering slide", canvas.width/2, canvas.height/2);
            
            if (document.body.contains(tempDiv)) {
                document.body.removeChild(tempDiv);
            }
            
            if (onCompletion) onCompletion();
        });
    };
    
    // Helper function for calculating canvas corrections during rotation
    function calcCanvasCorrections(w, h, rotation) {
        // This is the same function from ImageHandler
        var cw = w, ch = h, cx = 0, cy = 0;
        switch (rotation) {
            case 90:
                cw = h;
                ch = w;
                cy = -h;
                break;
            case 180:
                cx = -w;
                cy = -h;
                break;
            case 270:
                cw = h;
                ch = w;
                cx = -w;
                break;
        }
        return {
            cw: cw,
            ch: ch,
            cx: cx,
            cy: cy
        };
    }

    // Create thumbnails for slides
    this.createCanvases = function (callback, fromPage, pageCount) {
        console.log("Creating canvases for slides from page:", fromPage, " to page:", pageCount);
        pageCount = pageCount || self.pageCount();
        const toPage = Math.min(self.pageCount(), fromPage + pageCount - 1);
        const canvases = [];
        let processedCount = 0;

        // Function to process each slide
        function processSlide(index) {
            if (index > toPage) {
                const validCanvases = canvases.filter(canvas => canvas !== undefined);
                console.log(`All slides processed. ${validCanvases.length} valid canvases created.`);
                callback(validCanvases);
                return;
            }
            
            var slideHtml = pptxHtmlContent.slides[index];
            if (!slideHtml) {
                console.warn(`No HTML content found for slide ${index}`);
                canvases[index - fromPage] = createFallbackCanvas(index);
                processedCount++;
                processSlide(index + 1);
                return;
            }

            // Create a temporary div with the slide content
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = slideHtml;
            tempDiv.style.position = "absolute";
            tempDiv.style.left = "-9999px";
            tempDiv.style.top = "-9999px";
            
            // Add padding for top content
            var slideElement = tempDiv.querySelector('.slide');
            if (slideElement) {
                slideElement.style.paddingTop = "150px";
                slideElement.style.paddingBottom = "100px";
            }
            
            document.body.appendChild(tempDiv);
            
            // Use simplified rendering process
            html2canvas(tempDiv, {
                scale: 2,
                allowTaint: true,
                useCORS: true,
                backgroundColor: "white",
                y: -150,
                scrollY: -150
            }).then(function(renderedCanvas) {
                console.log(`Slide ${index} rendered successfully for thumbnail.`);
                canvases[index - fromPage] = {
                    canvas: renderedCanvas,
                    originalDocumentDpi: self.DPI
                };

                document.body.removeChild(tempDiv);
                processSlide(index + 1);
            }).catch(function(error) {
                console.error(`Error rendering slide ${index} to canvas:`, error);
                if (document.body.contains(tempDiv)) {
                    document.body.removeChild(tempDiv);
                }
                
                canvases[index - fromPage] = createFallbackCanvas(index);
                processSlide(index + 1);
            });
        }
        
        // Create a fallback canvas for thumbnails that fail to render
        function createFallbackCanvas(index) {
            var fallbackCanvas = document.createElement('canvas');
            fallbackCanvas.width = 160;
            fallbackCanvas.height = 90;
            var ctx = fallbackCanvas.getContext('2d');
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, 160, 90);
            ctx.fillStyle = "red";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            ctx.fillText(`Error: Slide ${index+1}`, 80, 45);
            
            return {
                canvas: fallbackCanvas,
                originalDocumentDpi: self.DPI
            };
        }
        
        // Start processing slides
        processSlide(fromPage);
    };

    // Adjust viewport to ensure content is visible
    this.adjustViewport = function() {
        var viewerPanel = document.getElementById('viewerPanel');
        if (!viewerPanel) return;
        
        // Make sure top content is visible
        viewerPanel.scrollTop = 0;
        
        // Ensure scroll position is within bounds
        if (viewerPanel.scrollLeft > canvas.width - viewerPanel.clientWidth) {
            viewerPanel.scrollLeft = Math.max(0, canvas.width - viewerPanel.clientWidth);
        }
    };

    // Clean up resources
    this.cleanup = function() {
        const myModal = document.getElementById('myModal');
        if (myModal) {
            if (myModal._pptxTimeoutId) clearTimeout(myModal._pptxTimeoutId);
            document.body.removeChild(myModal);
        }
        
        pptxHtmlContent = null;
        slideCount = 0;
    };
    
    // Fit content to viewport
    this.fitToViewport = function() {
        if (!pptxHtmlContent) return;
        
        var viewerPanel = document.getElementById('viewerPanel');
        if (!viewerPanel) return;
        
        var viewportWidth = viewerPanel.clientWidth - 40;
        var viewportHeight = viewerPanel.clientHeight - 40;
        
        var originalWidth = this.originalWidth();
        var originalHeight = this.originalHeight();
        
        var scaleToFitWidth = viewportWidth / originalWidth;
        var scaleToFitHeight = viewportHeight / originalHeight;
        
        var fitScale = Math.min(scaleToFitWidth, scaleToFitHeight);
        
        self.redraw(fitScale, 0, 0, function() {
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
        
        // Track current scroll position relative to content center
        var viewportWidth = viewerPanel.clientWidth;
        var viewportHeight = viewerPanel.clientHeight;
        var currentScale = lastRenderedScale || 1;
        
        // Calculate viewport center point in current scale
        var scrollLeft = viewerPanel.scrollLeft;
        var scrollTop = viewerPanel.scrollTop;
        
        // If we're at the top, prioritize keeping the top visible
        var isAtTop = scrollTop < 50;
        
        // Calculate the center point or use top-center if at top
        var centerX = scrollLeft + (viewportWidth / 2);
        var centerY = isAtTop ? 0 : (scrollTop + (viewportHeight / 2));
        
        // Convert to normalized coordinates (0-1 scale)
        var normalizedX = centerX / (canvas.width || 1);
        var normalizedY = centerY / (canvas.height || 1);
        
        console.log("Zoom center point:", centerX, centerY, "Normalized:", normalizedX, normalizedY);
        
        // Redraw with the new scale
        self.redraw(scale, rotation, pageIndex, function() {
            // Calculate new scroll position
            var newCenterX = normalizedX * canvas.width;
            var newCenterY = normalizedY * canvas.height;
            
            // Calculate top-left corner from center point
            var newScrollLeft = Math.max(0, newCenterX - (viewportWidth / 2));
            var newScrollTop = isAtTop ? 0 : Math.max(0, newCenterY - (viewportHeight / 2));
            
            console.log("New scroll position:", newScrollLeft, newScrollTop);
            
            // Set the new scroll position
            viewerPanel.scrollLeft = newScrollLeft;
            viewerPanel.scrollTop = newScrollTop;
            
            // If scale is too small to need scrollbars, center content
            if (canvas.width <= viewportWidth && canvas.height <= viewportHeight) {
                // No scrollbars needed, just center the content
                viewerPanel.scrollLeft = 0;
                viewerPanel.scrollTop = 0;
            } else {
                // Force scrollbars to appear if needed
                if (canvas.width > viewportWidth) {
                    viewerPanel.style.overflowX = "scroll";
                } else {
                    viewerPanel.style.overflowX = "auto";
                }
                
                if (canvas.height > viewportHeight) {
                    viewerPanel.style.overflowY = "scroll";
                } else {
                    viewerPanel.style.overflowY = "auto";
                }
            }
            
            if (onCompletion) {
                onCompletion();
            }
        });
    };
}